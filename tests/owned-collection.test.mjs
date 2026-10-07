import test from 'node:test';
import assert from 'node:assert/strict';
import {CommunityAuthError} from '../lib/community-auth.mjs';
import {buildOwnedCollection,formatOwnedCollection,OWNED_COLLECTION_SOURCE,OWNED_GAME_INFO_SOURCE} from '../lib/owned-collection.mjs';

// Synthetic ownership and totals only. No account, file, API or image state.
const row=(id=1,extra={})=>({id,name:'合成武将'+id,url:'https://www.sanguosha.cn/storage/uploads/images/pic_index/'+id+'.png',grade:1,iconUrl:'https://www.sanguosha.cn/synthetic-icon.png',...extra});
const collection=data=>({kind:'skins',protocol:'app-qr-v1',sourceUrl:OWNED_COLLECTION_SOURCE,data});
const info=data=>({kind:'gameInfo',protocol:'app-qr-v1',sourceUrl:OWNED_GAME_INFO_SOURCE,data});
const make=(rows=[row()],extra={})=>buildOwnedCollection({collectionResult:collection({generalList:rows,skinList:rows}),gameInfoResult:info({generalNum:rows.length,generalTotal:1000,skinNum:rows.length,skinTotal:2000}),kind:'ownedGenerals',...extra});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CommunityAuthError&&error.code===code);

test('owned projection uses only the official collection list and distinguishes all three counts',()=>{
  const input={collectionResult:collection({generalList:[row(1)],skinList:[row(2,{name:'合成皮肤'})],favorites:[row(9)],recent:[row(10)],token:'synthetic-secret',baseResp:{phone:'synthetic-phone'}}),gameInfoResult:info({generalNum:546,generalTotal:1100,skinNum:686,skinTotal:2200,avatar:'synthetic-private-avatar'}),kind:'ownedGenerals'};
  const original=structuredClone(input),result=buildOwnedCollection(input);
  assert.equal(result.kind,'ownedGenerals');assert.equal(result.coverage,'official-own-response');
  assert.equal(result.data.returnedCount,1);assert.equal(result.data.total,1);assert.equal(result.data.ownTotal,546);assert.equal(result.data.catalogTotal,1100);assert.equal(result.data.complete,false);
  assert.deepEqual(result.data.items.map(item=>item.id),[1]);assert.match(result.data.notice,/本次只返回部分，未展示不表示未拥有/);
  assert.doesNotMatch(JSON.stringify(result),/synthetic-secret|synthetic-phone|synthetic-private-avatar|favorites|recent|baseResp/);
  assert.deepEqual(input,original);
  const skins=buildOwnedCollection({...input,kind:'ownedSkins'});
  assert.equal(skins.data.ownTotal,686);assert.equal(skins.data.catalogTotal,2200);assert.deepEqual(skins.data.items.map(item=>item.id),[2]);
});

test('only valid aggregate equality with all unique valid rows marks this response complete',()=>{
  assert.equal(make([row(1),row(2)]).data.complete,true);
  const zero=make([],{gameInfoResult:info({generalNum:0,generalTotal:1000})});assert.equal(zero.data.complete,true);assert.equal(zero.data.pages,1);
  for(const value of [undefined,null,-1,1.5,NaN,Infinity,'-1','1.0','01x',{},true]){
    const result=make([row()],{gameInfoResult:info({generalNum:value,generalTotal:1000})});assert.equal(result.data.ownTotal,null);assert.equal(result.data.complete,false);
  }
  const strings=make([row()],{gameInfoResult:info({generalNum:'1',generalTotal:'1000'})});assert.equal(strings.data.complete,true);assert.equal(strings.data.ownTotal,1);
  const noInfo=make([row()],{gameInfoResult:null});assert.equal(noInfo.data.ownTotal,null);assert.equal(noInfo.data.catalogTotal,null);assert.equal(noInfo.data.complete,false);assert.match(noInfo.data.notice,/拥有总数暂未取得/);
});

test('invalid rows and duplicate internal IDs never establish completeness or invent another public ID',()=>{
  const raw=[row(1),row(1,{name:'同ID异名'}),null,row(2,{name:''}),row('3'),row(-1),row(4,{name:'合成\n武将'}),row(5)];
  const result=make(raw);assert.equal(result.data.returnedCount,8);assert.equal(result.data.total,2);assert.equal(result.data.invalidCount,5);assert.equal(result.data.duplicateCount,1);assert.equal(result.data.complete,false);
  assert.deepEqual(result.data.items.map(item=>item.id),[1,5]);assert.match(result.data.notice,/已忽略 6 条无效或重复条目/);
  const duplicateNames=make([row(1,{name:'同名'}),row(2,{name:'同名'})]);assert.equal(duplicateNames.data.total,2);assert.equal(duplicateNames.data.complete,true);
});

test('unknown or invalid aggregate is independent from a valid catalog denominator',()=>{
  const result=make([row()],{gameInfoResult:info({generalTotal:999})});assert.equal(result.data.ownTotal,null);assert.equal(result.data.catalogTotal,999);assert.equal(result.data.complete,false);
  const conflict=make([row(),row(2)],{gameInfoResult:info({generalNum:1,generalTotal:999})});assert.equal(conflict.data.complete,false);assert.match(conflict.data.notice,/数量与官方拥有统计不一致/);
});

test('strict response kind, protocol, fixed source and list shape reject unrelated data',()=>{
  for(const altered of [undefined,{},collection([]),collection({rows:[row()]}),collection({generalList:{}}),{...collection({generalList:[]}),kind:'favorites'},{...collection({generalList:[]}),protocol:'pc-scan-v7'},{...collection({generalList:[]}),sourceUrl:'https://evil.invalid/own'}])fails(()=>make([],{collectionResult:altered}),'SOURCE_CHANGED');
  fails(()=>make([],{kind:'favorites'}),'SOURCE_CHANGED');
  fails(()=>make([],{gameInfoResult:collection({generalNum:0})}),'SOURCE_CHANGED');
  fails(()=>make(Array.from({length:6001},(_,i)=>row(i+1))),'SOURCE_CHANGED');
});

test('projection has exact useful fields and inert canonical official artwork keys only',()=>{
  const result=make([row(1,{token:'synthetic-token',owned:false,faction:'吴',general_id:999,description:'synthetic-not-projected',url:'https://evil.invalid/p.png',iconUrl:'https://sjpubicres.sanguosha.cn/release/character_heads/one.png'})]);
  assert.deepEqual(Object.keys(result.data.items[0]),['id','name','url','grade','iconUrl']);assert.equal(result.data.items[0].url,null);assert.equal(result.data.items[0].iconUrl,'https://sjpubicres.sanguosha.cn/release/character_heads/one.png');
  assert.doesNotMatch(JSON.stringify(result),/synthetic-token|synthetic-not-projected|faction|general_id/);
  for(const url of ['http://www.sanguosha.cn/a.png','https://www.sanguosha.cn/a.png?secret=one','https://user:pass@www.sanguosha.cn/a.png','https://www.sanguosha.cn/a.png#one','file:///private/a.png','data:image/png;base64,eA==','https://sanguosha.cn.evil.invalid/a.png','https://www.sanguosha.cn:444/a.png'])assert.equal(make([row(1,{url})]).data.items[0].url,null);
});

test('24-item display paging is complete for returned rows without asking an unverified API page',()=>{
  const rows=Array.from({length:49},(_,i)=>row(i+1)),results=[1,2,3].map(page=>make(rows,{page}));
  assert.deepEqual(results.map(result=>result.data.items.length),[24,24,1]);assert(results.every(result=>result.data.returnedCount===49&&result.data.pages===3&&result.data.pageSize===24));
  assert.deepEqual(results.flatMap(result=>result.data.items.map(item=>item.id)),rows.map(item=>item.id));
  for(const page of [0,-1,1.2,NaN,Infinity,1001,'1x','1 2','吴',null,{},true,4])fails(()=>make(rows,{page}),'INVALID_ARGUMENT');
  assert.equal(make(rows,{page:'2'}).data.page,2);
});

test('text output keeps own counts, current scope and the owned navigation with no raw IDs or URLs',()=>{
  const rows=Array.from({length:25},(_,i)=>row(i+1)),result=make(rows,{gameInfoResult:info({generalNum:500,generalTotal:1000})}),text=formatOwnedCollection(result,{prefix:'#三国'});
  for(const value of ['我的武将','官方拥有：500 项','游戏总数（官方统计）：1000 项','本次返回 25 项','第 1 / 2 页','下一页：#三国我的武将 2','本次只返回部分，未展示不表示未拥有','不等于公开图鉴'])assert(text.includes(value),value);
  assert.doesNotMatch(text,/pic_index|https?:|generalList|收藏 导出/);
  const last=formatOwnedCollection(make(rows,{kind:'ownedSkins',page:2}));assert.match(last,/上一页：#sgs我的皮肤 1/);
  fails(()=>formatOwnedCollection({kind:'skinCatalog',data:{items:[]}}),'SOURCE_CHANGED');
});
