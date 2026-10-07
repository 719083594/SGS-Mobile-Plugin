import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deflateSync} from 'node:zlib';
import {createNativeCardRenderer,NativeCardRenderError} from '../lib/native-card-renderer.mjs';
import {buildNativeRecordCards} from '../lib/native-records.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const card=(body='<rect width="1080" height="800" fill="#17313d"/><text x="40" y="80" fill="#ffffff" font-size="32">SYNTHETIC PRIVATE</text>',width=1080,height=800)=>({svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,width,height,private:true});
function fakeSharp({pending=null,error=null,result=null}={}){
  const calls=[];
  const sharp=(input,options)=>{
    calls.push(['input',input,options]);
    return {jpeg(options){calls.push(['jpeg',options]);return this},timeout(options){calls.push(['timeout',options]);return this},async toBuffer(options){calls.push(['toBuffer',options]);if(pending)await pending;if(error)throw error;return result||{data:Buffer.from([255,216,255,217]),info:{format:'jpeg',width:Number(/width="(\d+)"/.exec(input.toString())[1]),height:Number(/height="(\d+)"/.exec(input.toString())[1])}}},toFile(){assert.fail('no private output files')},metadata(){assert.fail('no second decode or file metadata pass')}};
  };
  sharp.cache=value=>calls.push(['cache',value]);sharp.concurrency=value=>calls.push(['concurrency',value]);return {sharp,calls};
}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const value of body){crc^=value;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}const length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,body,sum]);}
function png(width=1,height=1,padding=0){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,230,170,80,255]))),...(padding?[chunk('tEXt',Buffer.concat([Buffer.from('QA\0'),Buffer.alloc(padding,65)]))]:[]),chunk('IEND',Buffer.alloc(0))]);}
const data=(bytes,type='png')=>`data:image/${type};base64,${bytes.toString('base64')}`;
const image=uri=>`<image x="10" y="10" width="100" height="100" href="${uri}" preserveAspectRatio="xMidYMid slice"/>`;

test('lazy sharp receives only a RAM SVG Buffer, private cache is disabled once, and JPEG output has a native 10s limit',async()=>{
  const b=fakeSharp();let loads=0;const reports=[],render=createNativeCardRenderer({loadSharp:async()=>{loads++;return {default:b.sharp}},onMetrics:metrics=>{reports.push(metrics);throw Error('synthetic logger failure')}});
  assert.equal(loads,0);for(let i=0;i<2;i++)assert.ok(Buffer.isBuffer(await render(card())));assert.equal(loads,1);
  assert.deepEqual(b.calls.filter(call=>call[0]==='cache'),[['cache',false]]);assert.deepEqual(b.calls.filter(call=>call[0]==='concurrency'),[['concurrency',1]]);
  const input=b.calls.find(call=>call[0]==='input');assert.equal(Buffer.isBuffer(input[1]),true);assert.deepEqual(input[2],{density:72,limitInputPixels:12000000,failOn:'warning',unlimited:false});
  assert.deepEqual(b.calls.find(call=>call[0]==='timeout')[1],{seconds:10});assert.deepEqual(b.calls.find(call=>call[0]==='toBuffer')[1],{resolveWithObject:true});
  assert.equal(reports.length,2);for(const metrics of reports){assert.deepEqual(Object.keys(metrics),['backend','elapsed','code']);assert.equal(metrics.backend,'sharp');assert.equal(metrics.code,'OK');assert.ok(Number.isFinite(metrics.elapsed)&&metrics.elapsed>=0);assert.equal(Object.isFrozen(metrics),true);assert.doesNotMatch(JSON.stringify(metrics),/PRIVATE|SYNTHETIC|svg|width|file:|http/)}
});

test('trusted local gradients, clipping and XML text escapes are accepted with canonical raster data images',async()=>{
  const b=fakeSharp(),render=createNativeCardRenderer({loadSharp:()=>b.sharp}),jpeg=Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
  const body='<defs><linearGradient id="background" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#14313d"/><stop offset="100%" stop-color="#274d50"/></linearGradient><clipPath id="avatar-1"><rect x="10" y="10" width="100" height="100" rx="12"/></clipPath></defs><rect width="1080" height="800" fill="url(#background)"/><g font-family="Noto Sans CJK SC, sans-serif" font-weight="650"><text x="40" y="170">A &amp; B &lt;昵称&gt; &quot;Q&quot; &apos;P&apos;<tspan x="40" dy="40">合成</tspan></text></g>'+image(data(png())).replace('/>',' clip-path="url(#avatar-1)"/>')+image(data(jpeg,'jpeg'));
  assert.ok(Buffer.isBuffer(await render(card(body))));
});

test('unsafe XML, unsupported tags/attributes, entity obfuscation, external references and malformed structures fail before loading sharp',async()=>{
  let loaded=0;const render=createNativeCardRenderer({loadSharp:()=>{loaded++;return fakeSharp().sharp}});
  const bodies=['<script/>','<foreignObject/>','<style>text{fill:red}</style>','<rect onclick="secret()"/>','<rect style="fill:url(https://example.invalid/a)"/>','<image href="https://example.invalid/private.png"/>','<image href="file:///private/account.json"/>','<image href="data:image/svg+xml;base64,PHN2Zy8+"/>','<image href="d&#97;ta:image/png;base64,AAAA"/>','<g xml:base="file:///private/"/>','<use href="#a"/>','<rect fill="url(https://example.invalid/a)"/>','<rect fill="url(#missing)"/>','<defs><clipPath id="a" clip-path="url(#a)"><rect width="1" height="1"/></clipPath></defs>','<defs><linearGradient id="a"/><linearGradient id="a"/></defs>','<text>&secret;</text>','<text>&#x41;</text>','<text>unescaped & value</text>','<g><rect></g>','<svg/>','<rect width="1"width="2"/>','<rect width="1" width="2"/>','<path d="M 0 0 L 1e999 2"/>'];
  for(const body of bodies)await assert.rejects(render(card(body)),error=>error instanceof NativeCardRenderError&&['UNSAFE_NATIVE_SVG','INVALID_NATIVE_IMAGE'].includes(error.code));
  for(const svg of ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///private/">]>'+card().svg,'<?xml version="1.0"?>'+card().svg,card().svg+'<svg/>',card('<text><![CDATA[secret]]></text>').svg,card().svg.replace('xmlns="http://www.w3.org/2000/svg"','xmlns="https://example.invalid/"'),card().svg.replace('viewBox="0 0 1080 800"','viewBox="0 0 99999 800"')])await assert.rejects(render({...card(),svg}),error=>error.code==='UNSAFE_NATIVE_SVG');
  assert.equal(loaded,0);
});

test('SVG size, canvas size, tree depth and node count are bounded before backend allocation',async()=>{
  let loaded=0;const render=createNativeCardRenderer({loadSharp:()=>{loaded++;return fakeSharp().sharp}});
  for(const args of [{...card(),width:319},{...card(),width:1601},{...card(),height:12001},card('',1600,8000),{...card(),width:1080.5},{...card(),private:false},{...card(),svg:'x'.repeat(4*1024*1024+1)}])await assert.rejects(render(args),error=>error.code==='INVALID_NATIVE_CARD');
  for(const body of ['<g>'.repeat(33)+'</g>'.repeat(33),'<rect/>'.repeat(10001)])await assert.rejects(render(card(body)),error=>error.code==='UNSAFE_NATIVE_SVG');assert.equal(loaded,0);
});

test('embedded rasters require valid magic/CRC/dimensions, canonical base64 and compressed/decoded aggregate limits',async()=>{
  let loaded=0;const render=createNativeCardRenderer({loadSharp:()=>{loaded++;return fakeSharp().sharp}}),valid=png(),bad=Buffer.from(valid);bad[29]^=1;
  const animated=Buffer.concat([valid.subarray(0,-12),chunk('acTL',Buffer.alloc(8)),valid.subarray(-12)]);
  for(const uri of [data(Buffer.from('<html>private</html>')),data(valid,'jpeg'),data(bad),data(animated),data(png(4097,1)),data(png(3000,2000)),data(Buffer.from([255,216,255,217]),'jpeg'),data(valid)+'=',data(valid).replace('base64,','base64,\n'),data(png(1,1,256*1024))])await assert.rejects(render(card(image(uri))),error=>['INVALID_NATIVE_IMAGE','NATIVE_IMAGE_LIMIT'].includes(error.code));
  for(const body of [image(data(valid)).repeat(65),image(data(png(1,1,240000))).repeat(9),image(data(png(4000,1000))).repeat(4)])await assert.rejects(render(card(body)),error=>error.code==='NATIVE_IMAGE_LIMIT');assert.equal(loaded,0);
});

test('backend/import errors and invalid output are sanitized, and asynchronous metrics rejection cannot change rendering',async()=>{
  const unavailable=createNativeCardRenderer({loadSharp:()=>{throw Error('COOKIE=synthetic-secret /private/account.json')}});await assert.rejects(unavailable(card()),error=>error.code==='NATIVE_BACKEND_UNAVAILABLE'&&!/COOKIE|secret|private/.test(error.message));
  const b=fakeSharp({error:Error('UID=synthetic-secret upstream failure')}),render=createNativeCardRenderer({loadSharp:()=>b.sharp,onMetrics:()=>Promise.reject(Error('synthetic log failure'))});await assert.rejects(render(card()),error=>error.code==='NATIVE_RENDER_FAILED'&&!error.message.includes('synthetic'));await flush();
  const oversized=Buffer.alloc(8*1024*1024+1);oversized[0]=255;oversized[1]=216;oversized[oversized.length-2]=255;oversized[oversized.length-1]=217;
  for(const result of [{data:Buffer.from('not a jpeg'),info:{format:'jpeg',width:1080,height:800}},{data:Buffer.from([255,216,255,217]),info:{format:'jpeg',width:1,height:1}},{data:oversized,info:{format:'jpeg',width:1080,height:800}}])await assert.rejects(createNativeCardRenderer({loadSharp:()=>fakeSharp({result}).sharp})(card()),error=>error.code==='INVALID_NATIVE_IMAGE');
});

test('one native pipeline is admitted across module copies and a pending pipeline is never unlocked by a caller deadline',async()=>{
  const peer=await import('../lib/native-card-renderer.mjs?peer-copy');let release;const pending=new Promise(resolve=>{release=resolve}),first=fakeSharp({pending}),second=fakeSharp(),render=createNativeCardRenderer({loadSharp:()=>first.sharp}),other=peer.createNativeCardRenderer({loadSharp:()=>second.sharp});
  const job=render(card());await flush();await assert.rejects(other(card()),error=>error.code==='NATIVE_RENDER_BUSY');assert.equal(second.calls.length,0);release();await job;assert.ok(Buffer.isBuffer(await other(card())));
});

test('real pinned sharp converts a synthetic private SVG to an exact JPEG Buffer without browser or file output APIs',async()=>{
  const sharp=(await import('sharp')).default,render=createNativeCardRenderer();const bytes=await render(card('<rect width="320" height="100" fill="#14313d"/><text x="12" y="55" fill="#ffffff" font-size="26">SYNTHETIC QA</text>',320,100));const metadata=await sharp(bytes).metadata();
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,320);assert.equal(metadata.height,100);
  const source=fs.readFileSync(new URL('../lib/native-card-renderer.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:fetch|readFile|writeFile|createWriteStream|toFile|launch)\s*\(/);assert.doesNotMatch(source,/from ['"](?:node:fs|puppeteer)/);
});

test('actual records builder with 10 clipped raster portraits and nested defs renders through real sharp entirely in RAM',async()=>{
  const sharp=(await import('sharp')).default,portrait=data(png()),recent=Array.from({length:10},(_,index)=>({general_names:['合成武将-'+index],outcomeCode:index%2}));
  const cards=buildNativeRecordCards({kind:'records',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,sourceUrl:'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',query:{model:0,wireMode:0},data:{winGames:50,totalGames:100},recentRecords:{kind:'recent',protocol:'pc-scan-v7',sourceUrl:'https://api-xh.sanguosha.cn/user/gameRecordList/total',query:{model:0,wireMode:0,page:1,pageSize:10},data:recent}},{imageForGeneral:()=>portrait});
  assert.equal(cards.length,1);assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,10);assert.match(cards[0].svg,/<g\b[^>]*>[\s\S]*<defs><clipPath/);
  const bytes=await createNativeCardRenderer()(cards[0]),metadata=await sharp(bytes).metadata();
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1080);assert.equal(metadata.height,cards[0].height);assert.ok(bytes.length<=8*1024*1024);
});
