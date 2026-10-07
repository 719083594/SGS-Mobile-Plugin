import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preparePortraitResolver} from '../lib/memory-portraits.mjs';

const origin='https://sjpubicres.sanguosha.cn/release/character_skins/skins/';
const url=name=>origin+name+'.jpg';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X1cAAAAASUVORK5CYII=','base64');
const owned=urls=>({kind:'ownedSkins',coverage:'official-own-response',protocol:'app-qr-v1',data:{items:urls.map(value=>({url:value}))}});
const base={sentinel:'base',imageForGeneral(value){assert.equal(this.sentinel,'base');return value==='刘备'?'file:///public/general.png':null;},imageForOfficialStatic(value){assert.equal(this.sentinel,'base');return value==='prepared'?'file:///public/prepared.png':null;}};

test('本人皮肤本页图片仅匿名读取row.url，RAM精确覆写static并保留base绑定',async()=>{
  const jpeg=fs.readFileSync(new URL('../resources/ui/assets/general-5.jpg',import.meta.url)),calls=[];
  const data=owned([url('synthetic_skin'),origin+'synthetic_skin.png']);
  data.session={token:'synthetic-private-token'};data.data.items[0].name='synthetic-private-name';
  data.data.items[0].iconUrl=url('ignored_icon');data.data.items[0].general_avatar=[url('ignored_avatar')];
  const before=structuredClone(data);
  const out=await preparePortraitResolver(data,base,{fetchImpl:async(value,init)=>{calls.push({value,init});return new Response(value.endsWith('.jpg')?jpeg:png);}});
  assert.match(out.imageForOfficialStatic(url('synthetic_skin')),/^data:image\/jpeg;base64,/);
  assert.match(out.imageForOfficialStatic(origin+'synthetic_skin.png'),/^data:image\/png;base64,/);
  assert.equal(out.imageForOfficialStatic('prepared'),'file:///public/prepared.png');assert.equal(out.imageForGeneral('刘备'),'file:///public/general.png');
  assert.equal(out.imageForGeneral(url('synthetic_skin')),null);assert.equal(calls.length,2);
  for(const call of calls){assert.equal(call.init.method,'GET');assert.equal(call.init.credentials,'omit');assert.equal(call.init.redirect,'error');assert.equal(call.init.body,undefined);assert.equal(call.init.referrerPolicy,'no-referrer');assert.equal(call.init.cache,'no-store');assert.deepEqual(Object.keys(call.init.headers),['Accept']);assert.doesNotMatch(JSON.stringify(call),/synthetic-private|Cookie|Authorization/);}
  assert.deepEqual(data,before);assert.doesNotMatch(JSON.stringify(out),/synthetic-private|base64/);
});

test('仅官方本人协议及coverage的本页最多24项可下载，其他结果不下载',async()=>{
  const valid=owned([url('a')]);
  const invalid=[{...valid,kind:'ownedGenerals'},{...valid,kind:'skins'},{...valid,protocol:'pc-scan-v7'},{...valid,protocol:undefined},{...valid,coverage:'official-skin-gallery'},{...valid,coverage:undefined},{...valid,data:[]},{...valid,data:{items:null}},owned(Array.from({length:25},(_,i)=>url('over_'+i)))];
  let calls=0;
  for(const data of invalid){const out=await preparePortraitResolver(data,base,{fetchImpl:async()=>{calls++;return new Response(png);}});assert.equal(out.imageForOfficialStatic(url('a')),null);assert.equal(out.imageForOfficialStatic('prepared'),'file:///public/prepared.png');}
  assert.equal(calls,0);
});

test('本人皮肤目录精确限制域名路径ASCII文件名，拒绝所有查询串与重定向形式',async()=>{
  const invalid=['http://sjpubicres.sanguosha.cn/release/character_skins/skins/a.jpg','https://sjpubicres.sanguosha.cn.evil.invalid/release/character_skins/skins/a.jpg','https://user:synthetic@sjpubicres.sanguosha.cn/release/character_skins/skins/a.jpg','https://sjpubicres.sanguosha.cn:443/release/character_skins/skins/a.jpg','https://sjpubicres.sanguosha.cn:8443/release/character_skins/skins/a.jpg',url('a')+'?anything=1',url('a')+'?',url('a')+'#fragment',origin+'../a.jpg',origin+'a%2fb.jpg',origin+'a/b.jpg',origin+'中文.jpg',origin+'a.svg',origin+'a.gif',origin+'a'.repeat(101)+'.jpg','https://sjpubicres.sanguosha.cn/release/character_heads/a.png','https://sjpubicres.sanguosha.cn/release/character_skins/a.jpg','https://127.0.0.1/a.jpg','file:///secret','data:image/png;base64,a'];
  let calls=0;await preparePortraitResolver(owned(invalid),base,{fetchImpl:async()=>{calls++;return new Response(png);}});assert.equal(calls,0);
});

test('本页默认可准备24项，去重且并发硬上限3，recent仍保持20上限',async()=>{
  let active=0,peak=0;const seen=[],values=Array.from({length:24},(_,i)=>url('skin_'+i));
  const out=await preparePortraitResolver(owned(values),base,{concurrency:100,fetchImpl:async value=>{seen.push(value);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return new Response(png);}});
  assert.equal(seen.length,24);assert(peak<=3);assert.match(out.imageForOfficialStatic(values[23]),/^data:image\/png/);
  let count=0;await preparePortraitResolver(owned([url('same'),url('same')]),base,{fetchImpl:async()=>{count++;return new Response(png);}});assert.equal(count,1);
  const heads=Array.from({length:21},(_,i)=>'https://sjpubicres.sanguosha.cn/release/character_heads/h'+i+'.png');count=0;
  const recent=await preparePortraitResolver({kind:'recent',data:heads.map(value=>({general_avatar:[value]}))},base,{maxImages:100,fetchImpl:async()=>{count++;return new Response(png);}});
  assert.equal(count,20);assert.equal(recent.imageForGeneral(heads[20]),null);assert.equal(recent.imageForOfficialStatic(heads[0]),null);
});

test('本人皮肤重复渲染不共享RAM，原图URL和dataURI不转为新网络来源',async()=>{
  let count=0;const options={fetchImpl:async()=>{count++;return new Response(png);}};
  const first=await preparePortraitResolver(owned([url('same')]),base,options),empty=await preparePortraitResolver(owned([]),base,options);
  assert(first.imageForOfficialStatic(url('same')));assert.equal(empty.imageForOfficialStatic(url('same')),null);
  await preparePortraitResolver(owned([url('same')]),base,options);assert.equal(count,2);
  const before=count;await preparePortraitResolver(owned([first.imageForOfficialStatic(url('same'))]),base,options);assert.equal(count,before);
});

test('本人皮肤共享累计2MB硬限制及单图限制，失败仅回退不泄漏上游正文',async()=>{
  let count=0;const values=Array.from({length:4},(_,i)=>url('total_'+i));
  const out=await preparePortraitResolver(owned(values),base,{concurrency:1,maxTotalBytes:png.length*2,fetchImpl:async()=>{count++;return new Response(png);}});
  assert(out.imageForOfficialStatic(values[0]));assert(out.imageForOfficialStatic(values[1]));assert.equal(out.imageForOfficialStatic(values[2]),null);assert.equal(count,3);
  const cases=[()=>new Response(png,{headers:{'content-length':'262145'}}),()=>new Response('synthetic-upstream-private',{status:401}),()=>{const response=new Response(png);Object.defineProperty(response,'redirected',{value:true});return response;},()=>{const response=new Response(png);Object.defineProperty(response,'url',{value:'https://evil.invalid/a.jpg'});return response;},()=>{throw new Error('synthetic-upstream-private');},()=>new Response(Buffer.from('<svg>synthetic-upstream-private</svg>'))];
  for(const produce of cases){const result=await preparePortraitResolver(owned([url('bad')]),base,{fetchImpl:async()=>produce()});assert.equal(result.imageForOfficialStatic(url('bad')),null);assert.doesNotMatch(JSON.stringify(result),/synthetic-upstream-private/);}
});
