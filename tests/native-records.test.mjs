import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import sharp from 'sharp';
import {buildNativeRecordCards} from '../lib/native-records.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';
const result=(data={},extra={})=>({kind:'records',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,sourceUrl:'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',query:{model:0,wireMode:0},data:{winGames:20,totalGames:40,mvp:3,...data},...extra});
const recent=(names=['合成武将'])=>({kind:'recent',protocol:'pc-scan-v7',sourceUrl:'https://api-xh.sanguosha.cn/user/gameRecordList/total',query:{model:0,wireMode:0,page:1,pageSize:10},data:names.map((name,i)=>({general_names:[name],outcomeCode:i%2}))});
function pngChunk(type,data){
  const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
  for(const value of body){crc^=value;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}
  const length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([length,body,sum]);
}
function png(width=1,height=1,padding=0){
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(Buffer.from([0,170,120,50,255]))),...(padding?[pngChunk('tEXt',Buffer.alloc(padding,65))]:[]),pngChunk('IEND',Buffer.alloc(0))]);
}
const dataUrl=(bytes,type='png')=>'data:image/'+type+';base64,'+bytes.toString('base64');
const jpeg=Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);


test('modern record view rejects legacy, wrong source and crossed modes before resolving artwork',()=>{
 let calls=0;const options={imageForGeneral:()=>{calls++;throw Error('no');}};
 for(const r of [null,{},result({}, {protocol:'app-qr-v1'}),result({}, {sourceUrl:'https://evil.invalid'}),result({}, {query:{model:1,wireMode:4}}),result({}, {scope:'other'}),result({winGames:41}),result({totalGames:-1})])assert.equal(buildNativeRecordCards(r,options),null);
 assert.equal(calls,0);
});
test('modern formal counts and larger official batch show only ten own records in one private JPEG',async()=>{
 const portrait=dataUrl(png()),names=Array.from({length:20},(_,i)=>'合成武将'+i),r=result({rates:[{name:'主公',rate:'0.75'}],force:0},{recentRecords:recent(names)}),before=structuredClone(r);
 const cards=buildNativeRecordCards(r,{imageForGeneral:()=>portrait});assert.equal(cards.length,1);assert(cards[0].private);assert.equal((cards[0].svg.match(/<image /g)||[]).length,10);
 for(const value of ['50%','75%','20 胜 / 40 场','近期本页胜率','本页 10 条','本批前10条'])assert(cards[0].svg.includes(value),value);
 assert(!cards[0].svg.includes('合成武将19'));
 assert.doesNotMatch(cards[0].svg,/近20场|href="(?:https?:|file:)|<script/);assert.deepEqual(r,before);
 const bytes=await createNativeCardRenderer()(cards[0]),decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,1080);assert.equal(decoded.info.height,cards[0].height);assert.equal(decoded.data.length,1080*cards[0].height*3);
});
test('zero denominator is unknown, zero percent is real, and group footer contains only invoking statistics',()=>{
 const a=buildNativeRecordCards(result({winGames:0,totalGames:0},{recentRecords:recent([])}),{groupShare:true});assert(a[0].svg.includes('暂无可统计场次'));assert(a[0].svg.includes('发送者本人战绩'));
 const b=buildNativeRecordCards(result({winGames:0,totalGames:20}));assert(b[0].svg.includes('0%'));assert(b[0].svg.includes('0 胜 / 20 场'));
 assert.equal(buildNativeRecordCards(result({}, {recentRecords:{...recent(),query:{model:2,wireMode:1,page:1,pageSize:10}}})),null);
});
test('untrusted image sources, malformed PNG, SVG and oversized raster are not embedded',()=>{
 const invalid=[null,{},'https://evil.invalid/a.png','file:///private','data:image/svg+xml;base64,PHN2Zy8+',dataUrl(Buffer.from('not image')),dataUrl(png(5000,1)),dataUrl(png(1,1,270000)),dataUrl(Buffer.concat([png(),Buffer.from('trailing')]))];
 for(const value of invalid){const card=buildNativeRecordCards(result({}, {recentRecords:recent()}),{imageForGeneral:()=>value})[0];assert.doesNotMatch(card.svg,/<image\b/);assert(card.svg.includes('合成武将'));}
 for(const value of [dataUrl(png()),dataUrl(jpeg,'jpeg')])assert.match(buildNativeRecordCards(result({}, {recentRecords:recent()}),{imageForGeneral:()=>value})[0].svg,/<image\b/);
});
test('modern text is escaped and names stay within one bounded card',()=>{
 const r=result({rates:[{name:'<script>合成</script>',rate:'0.4'}]},{recentRecords:recent(['<script>长名'.repeat(20)])});const card=buildNativeRecordCards(r)[0];assert.match(card.svg,/&lt;script/);assert.doesNotMatch(card.svg,/<script/);assert(card.width*card.height<=12000000);
});
