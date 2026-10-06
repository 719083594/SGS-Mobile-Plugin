import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preparePortraitResolver} from '../lib/memory-portraits.mjs';

const origin='https://sjpubicres.sanguosha.cn/release/character_heads/';
const url=name=>origin+name+'.png';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X1cAAAAASUVORK5CYII=','base64');
const recent=urls=>({kind:'recent',data:urls.map(value=>({general_avatar:[value]}))});
const base={items:[{key:'yb',label:'元宝'}],imageForGeneral:value=>value==='刘备'?'file:///public/general-1.png':null,imageForItem:()=> 'file:///public/yb.png',imageForOfficialStatic:()=>null};

test('仅本次RAM准备PNG/JPEG，保留base方法，匿名请求不携带本人信息',async()=>{
  const jpg=fs.readFileSync(new URL('../resources/ui/assets/general-5.jpg',import.meta.url));
  const jpegUrl=origin+'example.jpg',calls=[],data=recent([url('example'),jpegUrl]);
  data.session={token:'synthetic-personal-secret'};data.data[0].nick_name='synthetic-private-name';
  const before=structuredClone(data);
  const resolver=await preparePortraitResolver(data,base,{fetchImpl:async(value,init)=>{calls.push({value,init});return new Response(value===jpegUrl?jpg:png)}});
  assert.match(resolver.imageForGeneral(url('example')),/^data:image\/png;base64,/);assert.match(resolver.imageForGeneral(jpegUrl),/^data:image\/jpeg;base64,/);
  assert.equal(resolver.imageForGeneral('刘备'),base.imageForGeneral('刘备'));assert.equal(resolver.imageForItem('yb'),base.imageForItem('yb'));assert.equal(resolver.items,base.items);
  for(const call of calls){assert.equal(call.init.method,'GET');assert.equal(call.init.redirect,'error');assert.equal(call.init.credentials,'omit');assert.equal(call.init.body,undefined);assert.deepEqual(Object.keys(call.init.headers),['Accept']);assert.doesNotMatch(JSON.stringify(call),/synthetic-personal|synthetic-private-name|Cookie|Authorization/);}
  assert.doesNotMatch(JSON.stringify(resolver),/base64|synthetic-personal|synthetic-private-name/);assert.deepEqual(data,before);
});

test('固定域名和目录精确验证，任意URL、凭据、端口、查询串和SVG不发请求',async()=>{
  const invalid=['http://sjpubicres.sanguosha.cn/release/character_heads/a.png','https://sjpubicres.sanguosha.cn.evil.invalid/release/character_heads/a.png','https://evil.invalid/a.png','https://user:secret@sjpubicres.sanguosha.cn/release/character_heads/a.png','https://sjpubicres.sanguosha.cn:443/release/character_heads/a.png','https://sjpubicres.sanguosha.cn:8443/release/character_heads/a.png',url('a')+'?token=synthetic',url('a')+'#fragment',origin+'../secret.png',origin+'a%2fb.png',origin+'a.svg',origin+'a.gif',origin+'a'.repeat(101)+'.png','https://127.0.0.1/a.png','file:///secret','data:image/png;base64,a'];
  let calls=0;await preparePortraitResolver(recent(invalid),base,{fetchImpl:async()=>{calls++;return new Response(png)}});assert.equal(calls,0);
});

test('只取recent每条第0图，去重，最多20条且并发硬上限为3',async()=>{
  let calls=0,active=0,peak=0;const seen=[];
  const data=recent(Array.from({length:21},(_,i)=>url('hero_'+i)));data.data[0].general_avatar.push(url('ignored_second'));
  const resolver=await preparePortraitResolver(data,base,{concurrency:100,maxImages:100,fetchImpl:async value=>{calls++;seen.push(value);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return new Response(png)}});
  assert.equal(calls,20);assert(peak<=3);assert(!seen.includes(url('ignored_second')));assert.equal(resolver.imageForGeneral(url('hero_20')),null);
  calls=0;await preparePortraitResolver(recent([url('same'),url('same')]),base,{fetchImpl:async()=>{calls++;return new Response(png)}});assert.equal(calls,1);
  await preparePortraitResolver({...recent([url('not_recent')]),kind:'assets'},base,{fetchImpl:()=>assert.fail('non-recent fetched')});
});

test('重定向、错误、未知返回URL和错误不会泄漏上游正文或修改会话',async()=>{
  const cases=[()=>new Response('synthetic-upstream-secret',{status:401}),()=>{const response=new Response(png);Object.defineProperty(response,'redirected',{value:true});return response},()=>{const response=new Response(png);Object.defineProperty(response,'url',{value:'https://evil.invalid/a.png'});return response},()=>{throw new Error('synthetic-upstream-secret')}];
  for(const produce of cases){const out=await preparePortraitResolver(recent([url('a')]),base,{fetchImpl:async()=>produce()});assert.equal(out.imageForGeneral(url('a')),null);assert.doesNotMatch(JSON.stringify(out),/synthetic-upstream-secret/);}
});

test('content-length及增量流都限额，不能用完整arrayBuffer绕过',async()=>{
  for(const length of['262145','invalid']){const out=await preparePortraitResolver(recent([url('oversize')]),base,{fetchImpl:async()=>new Response(png,{headers:{'content-length':length}})});assert.equal(out.imageForGeneral(url('oversize')),null);}
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(png.subarray(0,30));controller.enqueue(png.subarray(30));},cancel(){cancelled=true}});
  const out=await preparePortraitResolver(recent([url('stream')]),base,{maxPerImageBytes:png.length-1,fetchImpl:async()=>new Response(stream)});
  assert.equal(out.imageForGeneral(url('stream')),null);assert.equal(cancelled,true);
});

test('所有图片累计流读取限额，超限后已有图片仍可用且不继续处理队列',async()=>{
  let calls=0;const values=Array.from({length:6},(_,i)=>url('total_'+i));
  const out=await preparePortraitResolver(recent(values),base,{concurrency:1,maxTotalBytes:png.length*2,fetchImpl:async()=>{calls++;return new Response(png)}});
  assert.match(out.imageForGeneral(values[0]),/^data:image\/png/);assert.match(out.imageForGeneral(values[1]),/^data:image\/png/);
  for(const value of values.slice(2))assert.equal(out.imageForGeneral(value),null);assert.equal(calls,3);
});

test('魔数、PNG尺寸与JPEG SOF尺寸验证拒绝伪图片和巨大解码尺寸',async()=>{
  const hugePng=Buffer.from(png);hugePng.writeUInt32BE(3000,16);
  const hugeJpeg=Buffer.from(fs.readFileSync(new URL('../resources/ui/assets/general-5.jpg',import.meta.url)));
  let found=false;for(let i=2;i<hugeJpeg.length-10;i++)if(hugeJpeg[i]===255&&[0xc0,0xc1,0xc2].includes(hugeJpeg[i+1])){hugeJpeg.writeUInt16BE(3000,i+7);found=true;break}assert(found);
  for(const body of[Buffer.from('<svg><script>secret</script></svg>'),Buffer.alloc(100),hugePng,hugeJpeg]){const out=await preparePortraitResolver(recent([url('invalid')]),base,{fetchImpl:async()=>new Response(body)});assert.equal(out.imageForGeneral(url('invalid')),null);}
});

test('下一次渲染不会继承上次RAM头像缓存，也不会把数据URI作为新网络地址',async()=>{
  let calls=0;const options={fetchImpl:async()=>{calls++;return new Response(png)}};
  const first=await preparePortraitResolver(recent([url('same')]),base,options),empty=await preparePortraitResolver(recent([]),base,options);
  assert(first.imageForGeneral(url('same')));assert.equal(empty.imageForGeneral(url('same')),null);
  await preparePortraitResolver(recent([url('same')]),base,options);assert.equal(calls,2);
  await preparePortraitResolver(recent([first.imageForGeneral(url('same'))]),base,{fetchImpl:()=>assert.fail('data image fetched')});
});

test('整体截止时间可中断尚未完成的官方读取并回退',async()=>{
  const out=await preparePortraitResolver(recent([url('slow')]),base,{overallTimeoutMs:5,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});
  assert.equal(out.imageForGeneral(url('slow')),null);
});
