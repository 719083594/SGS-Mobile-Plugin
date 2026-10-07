import test from 'node:test';
import assert from 'node:assert/strict';
import {CommunityAuthClient,MODERN_OWNED_COLLECTION_SOURCE} from '../lib/community-auth.mjs';

// Entirely synthetic responses. No files, accounts, network or real inventory.
const session={token:'synthetic-modern-token',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityUserId:'847261'};
const row=(id,extra={})=>({id,name:'合成武将'+id,url:'https://sjpubicres.sanguosha.cn/release/character_heads/test_'+id+'.png',country:3,country2:0,grade:1,star:1,maxStar:5,score:8,isHave:true,...extra});
const payload=({page=1,total=30,have=25,searchNum=25,skin=false,extra={}}={})=>({[skin?'skins':'generals']:Array.from({length:Math.min(12,Math.max(0,searchNum-(page-1)*12))},(_,i)=>row((page-1)*12+i+1,skin?{generalId:7,commentNum:0}:{})),have,total,searchNum,...extra});
const response=(data,code=1000)=>new Response(JSON.stringify({code,data}),{status:200});
const clientFor=(data,calls=[])=>new CommunityAuthClient({fetchImpl:async(url,init)=>{calls.push({url,init});return response(data);}});
const rejects=(promise,code='SOURCE_CHANGED')=>assert.rejects(promise,error=>error.code===code);

test('modern owned generals use the proven GET and only the authenticated new identity',async()=>{
  const calls=[],data=payload(),before=structuredClone(data),client=clientFor(data,calls);
  const result=await client.queryOwn('ownedGenerals',session);
  assert.equal(calls.length,1);const url=new URL(calls[0].url);
  assert.equal(url.origin+url.pathname,MODERN_OWNED_COLLECTION_SOURCE);
  assert.deepEqual(Object.fromEntries(url.searchParams),{toUserId:'847261',have:'true',skin:'false',mode:'0',score:'',countryType:'0',gradeType:'0',page:'1',pageSize:'12'});
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers.Authorization,session.token);
  assert.equal(calls[0].init.headers.Cookie,undefined);assert.equal(calls[0].init.body,undefined);
  assert.deepEqual(result.query,{page:1,pageSize:12,countryType:0,skin:false});
  assert.equal(result.kind,'ownedGenerals');assert.equal(result.protocol,'pc-scan-v7');assert.equal(result.gameAuthenticated,false);
  assert.equal(result.sourceUrl,MODERN_OWNED_COLLECTION_SOURCE);assert.equal(result.data.generals.length,12);
  assert.doesNotMatch(JSON.stringify(result),/847261|synthetic-modern-token|communityUserId|toUserId/);assert.deepEqual(data,before);
  assert(client.supportedQueries('pc-scan-v7').includes('ownedGenerals'));assert(client.supportedQueries('pc-scan-v7').includes('ownedSkins'));
});

test('modern owned filter and page metadata preserve the exact request, including dual faction',async()=>{
  const calls=[],data=payload({page:2,total:50,have:40,searchNum:25}),client=clientFor(data,calls);
  data.generals[0].country=1;data.generals[0].country2=3;
  const result=await client.queryOwn('ownedGenerals',session,{page:'2',countryType:'3'});
  assert.deepEqual(result.query,{page:2,pageSize:12,countryType:3,skin:false});
  assert.equal(new URL(calls[0].url).searchParams.get('page'),'2');assert.equal(new URL(calls[0].url).searchParams.get('countryType'),'3');
  assert.equal(result.data.generals[0].country2,3);
});

test('modern skins use skin true and never an unverified faction filter',async()=>{
  const calls=[],result=await clientFor(payload({skin:true}),calls).queryOwn('ownedSkins',session,{page:1,countryType:0});
  assert.deepEqual(result.query,{page:1,pageSize:12,countryType:0,skin:true});
  assert.equal(new URL(calls[0].url).searchParams.get('skin'),'true');assert.equal(result.data.skins[0].generalId,7);
  assert.equal(result.data.skins[0].country,undefined);assert.equal(result.data.skins[0].score,undefined);
  const denied=[];await rejects(clientFor(payload({skin:true}),denied).queryOwn('ownedSkins',session,{countryType:3}),'INVALID_ARGUMENT');assert.equal(denied.length,0);
});

test('caller overrides, invalid numbers and missing verified new identity fail before any request',async()=>{
  const calls=[],client=clientFor(payload(),calls);
  for(const params of [null,[],{toUserId:'123'},{have:false},{skin:true},{pageSize:24},{mode:1},{score:'x'},{gradeType:1},{url:'https://evil.invalid'},
    {page:0},{page:1001},{page:true},{page:'1x'},{page:1.5},{countryType:-1},{countryType:6},{countryType:true},{countryType:'吴'}])await rejects(client.queryOwn('ownedGenerals',session,params),'INVALID_ARGUMENT');
  for(const communityUserId of [undefined,null,0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1x',' 123','123\n',{},true])await rejects(client.queryOwn('ownedGenerals',{...session,communityUserId}),'AUTH_VALIDATION_FAILED');
  await rejects(client.queryOwn('ownedGenerals',{...session,protocol:'app-qr-v1'}),'UNSUPPORTED_PROTOCOL');
  await rejects(client.queryOwn('ownedGenerals',{...session,scope:'sanguosha-ol'}),'AUTH_REQUIRED');
  await rejects(client.queryOwn('ownedGenerals',{...session,expiresAt:1}),'AUTH_EXPIRED');assert.equal(calls.length,0);
});

test('strict owned shape rejects false or absent ownership, duplicate IDs and malformed rows',async()=>{
  const edits=[row=>delete row.isHave,row=>row.isHave=false,row=>row.isHave='true',row=>row.id='1',row=>row.id=0,row=>row.name='',row=>row.name='合成\n武将',
    row=>row.country=6,row=>row.grade='1',row=>row.score='8',row=>row.url='https://synthetic.invalid/\nprivate'];
  for(const edit of edits){const data=payload();edit(data.generals[0]);await rejects(clientFor(data).queryOwn('ownedGenerals',session));}
  const duplicate=payload();duplicate.generals[1].id=duplicate.generals[0].id;await rejects(clientFor(duplicate).queryOwn('ownedGenerals',session));
  const foreign=payload({searchNum:12});foreign.generals[0].country=1;
  await rejects(clientFor(foreign).queryOwn('ownedGenerals',session,{countryType:3}));
});

test('pagination counts and exact page length fail closed, while invalid range is an argument error',async()=>{
  for(const data of [null,[],{},payload({extra:{have:'25'}}),payload({extra:{searchNum:-1}}),payload({total:20}),payload({searchNum:26}),
    payload({searchNum:24}),payload({extra:{generals:[]}}),payload({extra:{generals:{}}})])await rejects(clientFor(data).queryOwn('ownedGenerals',session));
  const short=payload();short.generals.pop();await rejects(clientFor(short).queryOwn('ownedGenerals',session));
  const last=await clientFor(payload({page:3})).queryOwn('ownedGenerals',session,{page:3});assert.equal(last.data.generals.length,1);
  await rejects(clientFor(payload({page:4})).queryOwn('ownedGenerals',session,{page:4}),'INVALID_ARGUMENT');
  const empty=await clientFor(payload({have:0,searchNum:0,total:100})).queryOwn('ownedGenerals',session);assert.deepEqual(empty.data.generals,[]);
});

test('owned results whitelist inventory fields without credentials, unverified joins or identity echo',async()=>{
  const data=payload();Object.assign(data,{userId:'847261',token:'synthetic-hidden',favorites:[row(999)]});
  Object.assign(data.generals[0],{token:'synthetic-row-hidden',userId:'847261',generalId:9999,privateField:'synthetic-private',email:'synthetic@example.invalid'});
  const result=await clientFor(data).queryOwn('ownedGenerals',session);
  assert.doesNotMatch(JSON.stringify(result),/847261|synthetic-hidden|synthetic-row-hidden|synthetic-private|favorites|9999|email|userId/);
  assert.deepEqual(Object.keys(result.data).sort(),['generals','have','searchNum','total']);
  const failed=new CommunityAuthClient({fetchImpl:async()=>response({secret:'synthetic-private'},1003)});
  await rejects(failed.queryOwn('ownedGenerals',session),'AUTH_EXPIRED');
});
