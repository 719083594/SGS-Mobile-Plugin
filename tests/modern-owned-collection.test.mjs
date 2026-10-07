import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnedCollection,formatOwnedCollection,ownedCollectionPageCommand,MODERN_OWNED_COLLECTION_SOURCE} from '../lib/owned-collection.mjs';

// Synthetic server pages only. No account, API, file, download or public-ID join.
const row=(id,extra={})=>({id,name:'合成武将'+id,url:'https://sjpubicres.sanguosha.cn/release/character_heads/synthetic_'+id+'.png',country:3,country2:0,grade:1,star:1,maxStar:5,score:8,isHave:true,...extra});
function result({kind='ownedGenerals',page=1,countryType=0,have=25,total=30,searchNum=25,extra={}}={}){
  const skin=kind==='ownedSkins';
  return {kind,protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,
    sourceUrl:MODERN_OWNED_COLLECTION_SOURCE,query:{page,pageSize:12,countryType,skin},
    data:{[skin?'skins':'generals']:Array.from({length:Math.min(12,Math.max(0,searchNum-(page-1)*12))},(_,i)=>row((page-1)*12+i+1,skin?{generalId:77,commentNum:0}:{})),have,total,searchNum},...extra};
}
const build=(options={})=>{const collectionResult=result(options);return buildOwnedCollection({collectionResult,kind:collectionResult.kind});};
const fails=(fn,code='SOURCE_CHANGED')=>assert.throws(fn,error=>error.code===code);

test('modern projection keeps server pagination and distinguishes returned, filtered, owned and catalog counts',()=>{
  const input=result({page:2,countryType:3,have:40,total:50,searchNum:25}),before=structuredClone(input);
  const output=buildOwnedCollection({collectionResult:input,kind:'ownedGenerals',page:2});
  assert.equal(output.coverage,'official-own-paginated');assert.equal(output.protocol,'pc-scan-v7');assert.equal(output.sourceUrl,MODERN_OWNED_COLLECTION_SOURCE);
  assert.deepEqual(output.query,{page:2,pageSize:12,countryType:3,skin:false});
  assert.equal(output.data.returnedCount,12);assert.equal(output.data.total,25);assert.equal(output.data.filteredTotal,25);assert.equal(output.data.ownTotal,40);assert.equal(output.data.catalogTotal,50);
  assert.equal(output.data.page,2);assert.equal(output.data.pageSize,12);assert.equal(output.data.pages,3);assert.equal(output.data.countryType,3);assert.equal(output.data.countryLabel,'吴国');
  assert.deepEqual(output.data.items.map(item=>item.id),Array.from({length:12},(_,i)=>13+i));assert.equal(output.data.complete,false);assert.equal(output.gameAuthenticated,false);
  assert.match(output.data.notice,/官方本人拥有列表.*每页12项.*第 2 \/ 3 页/);assert.deepEqual(input,before);
});

test('three independent server pages cover exactly the synthetic matching IDs without local slicing',()=>{
  const pages=[1,2,3].map(page=>build({page}));assert.deepEqual(pages.map(x=>x.data.items.length),[12,12,1]);
  assert.deepEqual(pages.flatMap(x=>x.data.items.map(row=>row.id)),Array.from({length:25},(_,i)=>i+1));
  assert(pages.every(x=>x.data.complete===false&&x.data.ownTotal===25&&x.data.pages===3));
  assert.equal(build({have:12,searchNum:12}).data.complete,true);assert.equal(build({have:0,searchNum:0}).data.complete,true);
  assert.equal(build({page:2,have:13,searchNum:13}).data.complete,false);
});

test('modern counts and owned markers cannot degrade to legacy preview or silently skip malformed rows',()=>{
  for(const mutate of [x=>x.data.generals[0].isHave=false,x=>delete x.data.generals[0].isHave,x=>x.data.generals[0].id=0,
    x=>x.data.generals[1].id=x.data.generals[0].id,x=>x.data.generals.pop(),x=>x.data.searchNum=99,x=>x.data.have='25',x=>x.data.total=1]){
    const input=result();mutate(input);fails(()=>buildOwnedCollection({collectionResult:input,kind:'ownedGenerals'}));
  }
  const legacyLookalike=result({extra:{data:{generalList:[row(1)],skinList:[]}}});fails(()=>buildOwnedCollection({collectionResult:legacyLookalike,kind:'ownedGenerals'}));
  fails(()=>build({page:4}),'INVALID_ARGUMENT');
});

test('modern evidence requires exact authenticated kind, source and safe request metadata',()=>{
  for(const extra of [{kind:'favorites'},{protocol:'app-qr-v1'},{scope:'sanguosha-ol'},{gameVersion:'sanguosha-ol'},{communityAuthenticated:false},
    {sourceUrl:MODERN_OWNED_COLLECTION_SOURCE+'?toUserId=123'},{sourceUrl:'https://hi-gateway.sanguosha.cn/api/game/v2/general/generalSkins'},
    {query:{page:1,pageSize:24,countryType:0,skin:false}},{query:{page:1,pageSize:12,countryType:0,skin:false,toUserId:123}},
    {query:{page:1,pageSize:12,countryType:0,skin:true}}]){
    const input=result({extra});fails(()=>buildOwnedCollection({collectionResult:input,kind:'ownedGenerals'}));
  }
  fails(()=>buildOwnedCollection({collectionResult:result(),kind:'ownedSkins'}));
  fails(()=>buildOwnedCollection({collectionResult:result({page:2}),kind:'ownedGenerals',page:1}));
});

test('explicit requested faction must strictly match the returned modern page metadata',()=>{
  const input=result({countryType:3,have:40,total:50,searchNum:25});
  assert.equal(buildOwnedCollection({collectionResult:input,kind:'ownedGenerals',countryType:3}).data.countryType,3);
  for(const countryType of [0,1,2,4,5,'3',null,true,{},NaN])fails(()=>buildOwnedCollection({collectionResult:input,kind:'ownedGenerals',countryType}));
  assert.equal(buildOwnedCollection({collectionResult:result(),kind:'ownedGenerals',countryType:0}).data.countryType,0);
  assert.equal(buildOwnedCollection({collectionResult:result({kind:'ownedSkins'}),kind:'ownedSkins',countryType:0}).data.countryType,0);
  fails(()=>buildOwnedCollection({collectionResult:result({kind:'ownedSkins'}),kind:'ownedSkins',countryType:3}));
});

test('modern row projection preserves exact variants and native fields without public IDs or unknown metadata',()=>{
  const input=result({have:2,searchNum:2});input.data.generals[0]={...row(1),name:'势合成将',token:'synthetic-secret',userId:12345,generalId:9999,unknown:'synthetic-unknown'};
  input.data.generals[1]={...row(2),name:'界合成将',url:'https://evil.invalid/a.png',iconUrl:'https://sjpubicres.sanguosha.cn/release/synthetic.png'};
  const output=buildOwnedCollection({collectionResult:input,kind:'ownedGenerals'});
  assert.deepEqual(output.data.items.map(x=>x.name),['势合成将','界合成将']);assert.equal(output.data.items[1].url,null);
  assert.equal(output.data.items[0].isHave,true);assert.equal(output.data.items[0].country,3);
  assert.doesNotMatch(JSON.stringify(output),/synthetic-secret|synthetic-unknown|userId|9999|generalId/);
  for(const url of ['https://sjpubicres.sanguosha.cn/a.jpg?secret=x','https://user:pass@sjpubicres.sanguosha.cn/a.jpg','http://sjpubicres.sanguosha.cn/a.jpg']){
    const page=result({have:1,searchNum:1});page.data.generals[0].url=url;assert.equal(buildOwnedCollection({collectionResult:page,kind:'ownedGenerals'}).data.items[0].url,null);
  }
});

test('modern skin projection never uses general faction and retains its own namespace',()=>{
  const output=build({kind:'ownedSkins',have:2,searchNum:2});
  assert.equal(output.kind,'ownedSkins');assert.equal(output.data.items[0].generalId,77);assert.equal(output.data.items[0].commentNum,0);
  assert.equal(output.data.items[0].country,undefined);assert.equal(output.data.countryLabel,'全部');assert.equal(output.data.complete,true);
  fails(()=>build({kind:'ownedSkins',countryType:3}));
});

test('owned navigation and text retain the filter across next and previous server pages',()=>{
  const output=build({countryType:3,have:40,total:50,searchNum:25});
  assert.equal(ownedCollectionPageCommand(output,2),'#sgs我的武将 吴 2');assert.equal(ownedCollectionPageCommand(output,2,{prefix:'#三国'}),'#三国我的武将 吴 2');
  const text=formatOwnedCollection(output);
  for(const expected of ['我的武将 · 吴国','官方拥有：40 项','游戏总数（官方统计）：50 项','当前筛选 25 项','第 1 / 3 页','下一页：#sgs我的武将 吴 2'])assert(text.includes(expected),expected);
  assert.doesNotMatch(text,/https?:|toUserId|countryType|仅返回部分.*8/);
  assert.match(formatOwnedCollection(build({countryType:3,page:3,have:40,total:50,searchNum:25})),/上一页：#sgs我的武将 吴 2/);
  assert.equal(ownedCollectionPageCommand(build(),2),'#sgs我的武将 2');assert.equal(ownedCollectionPageCommand(build({kind:'ownedSkins'}),2),'#sgs我的皮肤 2');
  for(const page of [0,4,1001,'吴',true])fails(()=>ownedCollectionPageCommand(output,page),'INVALID_ARGUMENT');
});
