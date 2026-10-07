import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {preparePortraitResolver} from '../lib/memory-portraits.mjs';
import {createReplyCardBuilder} from '../lib/reply-cards.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source='https://api-xh.sanguosha.cn/user/gameGeneral/total';
const origin='https://sjpubicres.sanguosha.cn/release/character_skins/skins/';
const url=name=>origin+name+'.jpg';
const jpeg=fs.readFileSync(new URL('../resources/ui/assets/general-5.jpg',import.meta.url));
// Synthetic ownership values and identities only; the fixture JPEG is public.
const row=id=>({id,name:'合成皮肤'+id,isHave:true,url:url('synthetic_'+id),iconUrl:'https://zsxyreplay.sanguosha.cn/img/skins/subscript/synthetic_quality.png'});
const modern=(rows=[row(1)])=>({kind:'ownedSkins',coverage:'official-own-paginated',protocol:'pc-scan-v7',sourceUrl:source,
  data:{items:rows,returnedCount:rows.length,total:rows.length,filteredTotal:rows.length,ownTotal:100,catalogTotal:1000,invalidCount:0,duplicateCount:0,
    complete:true,page:1,pageSize:12,pages:1,countryType:0,countryLabel:'全部',notice:'官方本人拥有分页，当前仅展示一页。'}});

test('modern owned skin artwork is exact URL RAM data with anonymous requests and no quality icon substitution',async()=>{
  const result=modern([row(1),row(2)]),before=structuredClone(result),calls=[];
  result.session={token:'synthetic-private-token'};before.session={token:'synthetic-private-token'};
  const resolver=await preparePortraitResolver(result,{imageForOfficialStatic:()=>null},{fetchImpl:async(value,init)=>{calls.push({value,init});return new Response(jpeg);}});
  assert.equal(calls.length,2);
  for(const item of result.data.items){assert.match(resolver.imageForOfficialStatic(item.url),/^data:image\/jpeg;base64,/);assert.equal(resolver.imageForOfficialStatic(item.iconUrl),null);}
  for(const call of calls){assert.equal(call.init.credentials,'omit');assert.equal(call.init.redirect,'error');assert.equal(call.init.method,'GET');assert.deepEqual(Object.keys(call.init.headers),['Accept']);assert.equal(call.init.body,undefined);assert.doesNotMatch(JSON.stringify(call),/Authorization|Cookie|synthetic-private|subscript/);}
  assert.deepEqual(result,before);assert.doesNotMatch(JSON.stringify(resolver),/synthetic-private|base64/);
});

test('modern own artwork requires verified source, coverage, strict ownership and a maximum 12 current-page rows',async()=>{
  const valid=modern(),invalid=[{...valid,protocol:'app-qr-v1'},{...valid,coverage:'official-own-response'},{...valid,sourceUrl:'https://evil.invalid/private'},
    ...[{pageSize:24},{items:[row(1),null]},{items:[{...row(1),isHave:1}]},{items:[{...row(1),isHave:false}]},{items:Array.from({length:13},(_,i)=>row(i+1))}].map(extra=>({...valid,data:{...valid.data,...extra}}))];
  let count=0;for(const result of invalid){const resolver=await preparePortraitResolver(result,null,{fetchImpl:async()=>{count++;return new Response(jpeg);}});assert.equal(resolver.imageForOfficialStatic(row(1).url),null);}
  assert.equal(count,0);
  const calls=[];await preparePortraitResolver(modern(Array.from({length:12},(_,i)=>row(i+1))),null,{maxImages:100,fetchImpl:async value=>{calls.push(value);return new Response(jpeg);}});
  assert.equal(calls.length,12);
});

test('modern skin downloads retain strict skin directory and never fetch quality labels or unrelated official files',async()=>{
  const invalid=['https://zsxyreplay.sanguosha.cn/img/skins/subscript/a.png','https://sjpubicres.sanguosha.cn/release/skinLabel/a.png',
    'https://sjpubicres.sanguosha.cn/release/characters/a.png','https://sjpubicres.sanguosha.cn/release/character_heads/a.png',
    url('a')+'?x=1',url('a')+'#x',origin+'../a.jpg',origin+'a%2fb.jpg',origin+'a.svg','https://evil.invalid/a.jpg'];
  let count=0;await preparePortraitResolver(modern(invalid.map((value,index)=>({...row(index+1),url:value}))),null,{fetchImpl:async()=>{count++;return new Response(jpeg);}});assert.equal(count,0);
  const resolver=await preparePortraitResolver(modern([{...row(1),url:null}]),null,{fetchImpl:async()=>{count++;return new Response(jpeg);}});
  assert.equal(count,0);assert.equal(resolver.imageForOfficialStatic(row(1).iconUrl),null);
});

test('modern RAM artwork remains render-scoped and rejects redirects, oversized or malformed image responses',async()=>{
  const options={fetchImpl:async()=>new Response(jpeg)},first=await preparePortraitResolver(modern(),null,options),second=await preparePortraitResolver(modern([]),null,options);
  assert(first.imageForOfficialStatic(row(1).url));assert.equal(second.imageForOfficialStatic(row(1).url),null);
  const cases=[()=>new Response(jpeg,{headers:{'content-length':'262145'}}),()=>new Response('synthetic-upstream-private',{status:401}),()=>{const response=new Response(jpeg);Object.defineProperty(response,'redirected',{value:true});return response;},()=>new Response('<svg>synthetic-upstream-private</svg>')];
  for(const produce of cases){const resolver=await preparePortraitResolver(modern(),null,{fetchImpl:async()=>produce()});assert.equal(resolver.imageForOfficialStatic(row(1).url),null);assert.doesNotMatch(JSON.stringify(resolver),/synthetic-upstream-private/);}
});

test('production builder prepares 12 modern skin images and fully decodes a single private JPEG in RAM',async t=>{
  const result=modern(Array.from({length:12},(_,i)=>row(i+1))),calls=[];
  t.mock.method(globalThis,'fetch',async(value,init)=>{calls.push({value,init});return new Response(jpeg);});
  const cards=await createReplyCardBuilder({root})({type:'personal',private:true,result,params:{command:'我的皮肤'}});
  assert.equal(cards.length,1);assert.equal(cards[0].private,true);assert.equal(calls.length,12);assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,12);
  assert.doesNotMatch(cards[0].svg,/href="(?:https?:|file:)|subscript|synthetic-private/);
  const bytes=await createNativeCardRenderer()(cards[0]),decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  assert.equal(decoded.info.width,1080);assert.equal(decoded.info.height,cards[0].height);assert.equal(decoded.data.length,decoded.info.width*decoded.info.height*3);
});
