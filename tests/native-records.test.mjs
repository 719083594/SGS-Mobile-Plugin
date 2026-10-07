import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {buildNativeRecordCards} from '../lib/native-records.mjs';

// All quantities, names and images here are synthetic. No account or network.
const result=data=>({kind:'records',protocol:'app-qr-v1',data});
const recent=count=>Array.from({length:count},(_,index)=>({name:'合成武将-'+String(index).padStart(2,'0')}));
const g20=Array.from({length:20},(_,index)=>index%2);
const statistics={paiweiRate:{total:0,total_rate:0},shenfenRate:{total_rate:40,emperor_rate:0,minister_rate:50,rebel_rate:60,provocateur_rate:30},guozhanRate:{total_rate:45,wei_rate:0,shu_rate:30,wu_rate:40,qun_rate:50,ye_rate:10},doudizhuRate:{total:0,total_rate:55,lord_rate:60,peasant_rate:50},medals:{wanmei:1,feicui:5},g20};
const allSvg=cards=>cards.map(card=>card.svg).join('\n');
const decode=text=>text.replace(/&(amp|lt|gt|quot|apos);/g,(_,value)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[value]);
const textContents=svg=>[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>decode(match[1].replace(/<[^>]+>/g,'')));
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

test('unsupported kinds, protocols and shapes return null before resolving any images',()=>{
  let calls=0;const options={imageForGeneral:()=>{calls++;throw Error('unexpected');}};
  for(const value of [null,{}, {kind:'recent',protocol:'app-qr-v1',data:[]},{kind:'records',protocol:'pc-scan-v7',data:{}},result(null),result([])])assert.equal(buildNativeRecordCards(value,options),null);
  assert.equal(calls,0);
});

test('24 generals remain on a single private SVG, with or without all statistics, and data is not changed',()=>{
  for(const extra of [{},statistics]){
    const data={...extra,recent:recent(24)},original=structuredClone(data),cards=buildNativeRecordCards(result(data));
    assert.equal(cards.length,1);assert.deepEqual(Object.keys(cards[0]),['svg','width','height','private']);
    assert.equal(cards[0].width,1080);assert.equal(cards[0].private,true);
    assert.ok(cards[0].height>=100&&cards[0].height<=12000&&cards[0].width*cards[0].height<=12000000);
    const values=textContents(cards[0].svg);assert.deepEqual(values.filter(value=>value.startsWith('合成武将-')),data.recent.map(row=>row.name));
    assert.match(cards[0].svg,/Noto Sans CJK SC, WenQuanYi Micro Hei, DejaVu Sans/);
    assert.ok(values.includes('更多字段：#sgs战绩 0 导出'));assert.deepEqual(data,original);
  }
});

test('25 generals continue on a second SVG while all names occur exactly once and statistics stay on the first',()=>{
  for(const extra of [{},statistics]){
    const data={...extra,recent:recent(25)},cards=buildNativeRecordCards(result(data));assert.equal(cards.length,2);
    const names=cards.map(card=>textContents(card.svg).filter(value=>value.startsWith('合成武将-')));
    assert.deepEqual(names.map(group=>group.length),[24,1]);assert.deepEqual(names.flat(),data.recent.map(row=>row.name));
    assert.ok(textContents(cards[0].svg).includes('1 / 2'));assert.ok(textContents(cards[1].svg).includes('2 / 2'));
    if(extra===statistics){assert.match(cards[0].svg,/排位赛最高段位/);assert.doesNotMatch(cards[1].svg,/排位赛最高段位|近期胜负/);}
  }
});

test('source-confirmed mode fields preserve zero values and official percentage scale, with conservative result codes',()=>{
  const cards=buildNativeRecordCards(result({...statistics,paiweiRate:{total:0,total_rate:.5},g20:[0,1,2,.5,null,'0','1']}),{prefix:'#移动',model:2});
  const values=textContents(allSvg(cards));
  for(const value of ['排位赛','身份场','国战','斗地主','0.5%','主公胜率','忠臣胜率','反贼胜率','内奸胜率','野心家胜率','地主胜率','农民胜率','排位赛最高段位 · 大师','更多字段：#移动战绩 2 导出'])assert.ok(values.includes(value),value);
  assert.equal(values.filter(value=>value==='胜').length,2);assert.equal(values.filter(value=>value==='负').length,2);assert.equal(values.filter(value=>value==='未知').length,3);
  assert.ok(values.includes('0'));assert.ok(values.includes('0%'));assert.equal(values.includes('50%')&&values.includes('0.5%'),true);
  assert.doesNotMatch(allSvg(cards),/拥有武将|MVP/);
});

test('empty, missing and invalid values do not invent zero quantities or unsupported results',()=>{
  const empty=buildNativeRecordCards(result({}));assert.equal(empty.length,1);assert.match(empty[0].svg,/本次暂无可展示的资料/);
  const cards=buildNativeRecordCards(result({paiweiRate:{total:null,total_rate:Infinity},medals:{wanmei:0},recent:[{},null,{name:''}]}));
  assert.match(allSvg(cards),/本次暂无可展示的资料/);assert.doesNotMatch(allSvg(cards),/大师|排位赛最高段位|NaN|Infinity/);
});

test('recent-only records calculate a distinct first-page win rate from at most 20 results and exclude unknown codes',()=>{
  const data={g20:[0,'0',1,'1',2,.5,null,true,'0.0','unknown',...Array(10).fill(0),1],recent:recent(25)},original=structuredClone(data);
  const cards=buildNativeRecordCards(result(data),{model:2}),first=textContents(cards[0].svg),second=textContents(cards[1].svg);
  assert.equal(cards.length,3);assert.ok(first.includes('胜率概览'));assert.ok(first.includes('近20场胜率（身份场）'));
  assert.ok(first.includes('85.71%'));assert.ok(first.includes('12 胜 / 2 负；未知 6 场，已排除；本次取 20 条（仅前20条）'));
  assert.ok(first.includes('近20场单独统计，不能代替完整战绩胜率。'));assert.equal(second.includes('胜率概览'),false);
  assert.equal(first.filter(value=>value==='近20场胜率（身份场）').length,1);
  assert.equal(textContents(allSvg(cards)).filter(value=>value.startsWith('合成武将-')).length,25);assert.deepEqual(data,original);
  assert.doesNotMatch(allSvg(cards),/总胜率|官方本人统计|生涯/);
});

test('zero observed matches and all-unknown samples never render a fabricated zero-percent win rate',()=>{
  for(const [sample,detail] of [[[],'0 胜 / 0 负；未知 0 场，已排除；本次取 0 条'],[[2,null,true,'1.0'],'0 胜 / 0 负；未知 4 场，已排除；本次取 4 条']]){
    const values=textContents(allSvg(buildNativeRecordCards(result({g20:sample}))));
    assert.ok(values.includes('近20场胜率（全部模式）'));assert.ok(values.includes('暂无可统计结果'));assert.ok(values.includes(detail));assert.equal(values.includes('0%'),false);
  }
  for(const [sample,expected] of [[[0,0],'100%'],[[1,1],'0%']])assert.ok(textContents(allSvg(buildNativeRecordCards(result({g20:sample})))).includes(expected));
});

test('appended overview accepts only known labels and bounded display text, deduplicates recent rate and keeps source statistics separate',()=>{
  const data={...statistics,recent:recent(25)},input={...result(data),winRateSummary:{kind:'winRate',protocol:'app-qr-v1',data:{scope:'synthetic-private-scope',token:'synthetic-secret',entries:[
    {label:'总胜率',value:'60%',detail:'6 胜 / 10 场',token:'synthetic-token'},
    {label:'排位胜率',value:'暂无记录',detail:'0 胜 / 0 场'},
    {label:'斗地主胜率',value:'50%',detail:'2 胜 / 4 场'},
    {label:'近20场胜率（全部模式）',value:'99%',detail:'synthetic-stale-near20'},
    {label:'总胜率',value:'1%',detail:'synthetic-duplicate'},
    {label:'未确认雷达胜率',value:'synthetic-unknown',detail:'synthetic-unknown-detail'}
  ]}}},original=structuredClone(input),cards=buildNativeRecordCards(input),first=textContents(cards[0].svg);
  for(const value of ['总胜率','60%','6 胜 / 10 场','排位胜率','暂无记录','斗地主胜率','50%','近20场胜率（全部模式）','10 胜 / 10 负；未知 0 场，已排除；本次取 20 条','官方本人统计 · 统计周期未标明','身份场','国战'])assert.ok(first.includes(value),value);
  assert.equal(first.filter(value=>value==='近20场胜率（全部模式）').length,1);assert.equal(first.filter(value=>value==='总胜率').length,1);
  assert.doesNotMatch(allSvg(cards),/synthetic-|99%|未确认雷达胜率|生涯/);assert.deepEqual(input,original);
  assert.doesNotMatch(cards[1].svg,/胜率概览|总胜率|统计周期未标明/);
  const long={...result({}),winRateSummary:{kind:'winRate',protocol:'app-qr-v1',data:{entries:[{label:'总胜率',value:'<'.repeat(1000),detail:'合'.repeat(1000)}]}}};
  const bounded=buildNativeRecordCards(long),values=textContents(allSvg(bounded));assert.ok(values.includes('<'.repeat(40)));assert.ok(values.includes('合'.repeat(120)));assert.doesNotMatch(allSvg(bounded),/<{2}/);
  for(const card of bounded){assert.ok(card.width*card.height<=12000000);assert.ok(Buffer.byteLength(card.svg)<=4*1024*1024);}
});

test('unverified summary protocol or unknown overview shapes are ignored while local recent computation survives',()=>{
  for(const summary of [null,{}, {kind:'winRate',protocol:'pc-scan-v7',data:{entries:[{label:'总胜率',value:'77%'}]}},{kind:'other',protocol:'app-qr-v1',data:{entries:[{label:'总胜率',value:'77%'}]}},{kind:'winRate',protocol:'app-qr-v1',data:{entries:[{label:'总胜率',value:{secret:'synthetic-secret'}},{label:'总胜率\u0000',value:'77%'}]}}]){
    const values=textContents(allSvg(buildNativeRecordCards({...result({g20:[0,1]}),winRateSummary:summary})));
    assert.ok(values.includes('近20场胜率（全部模式）'));assert.ok(values.includes('50%'));assert.equal(values.includes('总胜率'),false);assert.equal(values.includes('77%'),false);
  }
});

test('untrusted XML is escaped, controls are removed, general names wrap by character and private fields do not enter SVG',()=>{
  const name='<script>&"\'合成</script>',long='长'.repeat(60),data={recent:[{name},{name:long}],token:'synthetic-secret',cookie:'synthetic-cookie',phone:'synthetic-phone'};
  const svg=allSvg(buildNativeRecordCards(result(data),{prefix:'<svg>&',command:'战绩"\'',dataAlreadyRedacted:true}));
  assert.doesNotMatch(svg,/<script\b|<foreignObject\b|<!DOCTYPE|<!ENTITY|synthetic-secret|synthetic-cookie|synthetic-phone|style=|<style\b|on\w+=/i);
  assert.match(svg,/&lt;script&gt;/);assert.match(svg,/&amp;/);assert.match(svg,/&quot;/);assert.match(svg,/&apos;/);
  assert.ok(textContents(svg).includes(name));assert.ok(textContents(svg).includes(long));
  const wrapped=[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].find(match=>match[1].includes('长'))[1];assert.ok((wrapped.match(/<tspan/g)||[]).length>1);
  const cleaned=allSvg(buildNativeRecordCards(result({recent:[{name:'合\u0000成\uFFFE将\uD800'}]})));
  assert.doesNotMatch(cleaned,/[\u0000\uFFFE\uD800]/u);
});

test('prepared PNG/JPEG portraits are embedded only as canonical raster data with local clipping',()=>{
  const pngUrl=dataUrl(png()),jpegUrl=dataUrl(jpeg,'jpeg'),seen=[];
  const cards=buildNativeRecordCards(result({recent:recent(2)}),{imageForGeneral:name=>{seen.push(name);return seen.length===1?pngUrl:jpegUrl;}});
  assert.deepEqual(seen,recent(2).map(row=>row.name));assert.match(cards[0].svg,/<image\b/);
  assert.deepEqual([...cards[0].svg.matchAll(/href="([^"]+)"/g)].map(match=>match[1]),[pngUrl,jpegUrl]);
  assert.match(cards[0].svg,/clip-path="url\(#avatar-0\)"/);assert.match(cards[0].svg,/clip-path="url\(#avatar-1\)"/);
  assert.doesNotMatch(cards[0].svg,/href="(?:https?:|file:)|xmlns:xlink|foreignObject/);
});

test('remote/file/HTML/SVG, malformed images, throwing readers and oversized portraits use placeholders',()=>{
  const valid=png(),badCrc=Buffer.from(valid);badCrc[29]^=1;
  const animated=Buffer.concat([valid.subarray(0,-12),pngChunk('acTL',Buffer.alloc(8)),valid.subarray(-12)]);
  const inputs=[null,'https://evil.invalid/avatar.png','file:///private/account.png','data:image/svg+xml;base64,PHN2Zy8+',dataUrl(Buffer.from('<html>synthetic</html>')),dataUrl(valid,'jpeg'),dataUrl(badCrc),dataUrl(animated),dataUrl(png(4097,1)),dataUrl(png(3000,2000)),dataUrl(png(1,1,MAX_SAFE_PAD)),dataUrl(valid)+'='];
  for(const input of inputs){const svg=allSvg(buildNativeRecordCards(result({recent:recent(1)}),{imageForGeneral:()=>input}));assert.doesNotMatch(svg,/<image\b/);assert.ok(textContents(svg).includes('将'));}
  const thrown=allSvg(buildNativeRecordCards(result({recent:recent(1)}),{imageForGeneral:()=>{throw Error('synthetic-secret');}}));assert.doesNotMatch(thrown,/<image\b|synthetic-secret/);
});
const MAX_SAFE_PAD=262144;

test('portrait bytes are bounded per page and a large result is explicitly excerpted at eight pages',()=>{
  const portrait=dataUrl(png(1,1,240000));
  const cards=buildNativeRecordCards(result({recent:recent(24)}),{imageForGeneral:()=>portrait});
  assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,8);assert.ok(Buffer.byteLength(cards[0].svg)<=4*1024*1024);
  const data={g20:Array.from({length:161},()=>0),recent:recent(25)},limited=buildNativeRecordCards(result(data));
  assert.equal(limited.length,8);
  for(const card of limited){assert.match(card.svg,/节选前 8 页（本次共 10 页）；完整资料请导出/);assert.match(card.svg,/#sgs战绩 0 导出/);}
});

test('aggregate portrait dimension metadata stays within the native decoder pixel budget',()=>{
  // The structural guard accounts for IHDR dimensions before any raster
  // decoding; actual decoder validation remains the backend's responsibility.
  const portrait=dataUrl(png(1024,1024));
  const cards=buildNativeRecordCards(result({recent:recent(24)}),{imageForGeneral:()=>portrait});
  assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,11);
  assert.equal(textContents(cards[0].svg).filter(value=>value==='将').length,13);
});

test('already-redacted input is not decoded again and extreme text never exceeds native output limits',()=>{
  const data={recent:[{name:'&lt;合成&gt;'}],paiweiRate:{total:'极'.repeat(500),total_rate:'长'.repeat(500)}};
  const original=structuredClone(data),cards=buildNativeRecordCards(result(data),{dataAlreadyRedacted:true});
  assert.ok(cards);assert.match(cards[0].svg,/&amp;lt;合成&amp;gt;/);assert.deepEqual(data,original);
  for(const card of cards){assert.equal(card.private,true);assert.ok(card.width*card.height<=12000000);assert.ok(card.height<=12000);assert.ok(Buffer.byteLength(card.svg)<=4*1024*1024);}
});
