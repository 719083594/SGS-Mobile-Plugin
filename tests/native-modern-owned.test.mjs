import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {buildNativePersonalCards} from '../lib/native-views.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';

// Entirely synthetic inventory. Only the raster fixture is already-public art.
const jpeg=fs.readFileSync(new URL('../resources/ui/assets/general-5.jpg',import.meta.url));
const dataImage='data:image/jpeg;base64,'+jpeg.toString('base64');
const countries=['全部','魏国','蜀国','吴国','群雄','神将'];
const row=(id,extra={})=>({id,name:'合成拥有'+id,isHave:true,url:'https://sjpubicres.sanguosha.cn/release/character_skins/skins/synthetic_'+id+'.jpg',...extra});
function modern(kind='ownedGenerals',{page=1,total=29,countryType=0,rows,...extra}={}){
  const items=rows??Array.from({length:Math.min(12,Math.max(0,total-(page-1)*12))},(_,i)=>row((page-1)*12+i+1));
  const pages=Math.max(1,Math.ceil(total/12));
  return {kind,protocol:'pc-scan-v7',coverage:'official-own-paginated',sourceUrl:'https://api-xh.sanguosha.cn/user/gameGeneral/total',
    data:{items,returnedCount:items.length,total,filteredTotal:total,ownTotal:900,catalogTotal:2000,invalidCount:0,duplicateCount:0,
      page,pageSize:12,pages,countryType,countryLabel:countries[countryType],complete:pages===1&&items.length===total,
      notice:'官方本人拥有列表每页12项；当前仅获取这一页，其他页未展示不表示未拥有。',...extra}};
}
const svgFor=cards=>cards.map(card=>card.svg).join('\n');
const labels=cards=>[...svgFor(cards).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>match[1].replace(/<[^>]+>/g,'')).join('\n');

test('modern owned cards keep official totals, filtered counts and page counts separate with 12 rows per image',()=>{
  for(const countryType of [0,1,2,3,4,5])for(const page of [1,2,3]){
    const result=modern('ownedGenerals',{page,countryType}),before=structuredClone(result),cards=buildNativePersonalCards(result,{groupShare:true});
    assert.equal(cards.length,1);assert.equal(cards[0].private,true);assert.equal(cards[0].width,1080);
    const text=labels(cards);
    for(const value of ['官方拥有武将 · 全部势力','900','筛选匹配武将 · '+countries[countryType],'29','第 '+page+' / 3 页','每页 12 项','游戏总数 2000','本人资料 · 仅私聊','本次展示当前页'])assert(text.includes(value),value);
    assert.equal((text.match(/合成拥有\d+/g)||[]).length,result.data.items.length);
    const command='#sgs我的武将'+(countryType?' '+['','魏','蜀','吴','群','神'][countryType]:'')+' '+(page<3?page+1:page-1);
    assert(text.includes(command),command);
    assert(text.includes('#'+((page-1)*12+1)));assert.doesNotMatch(svgFor(cards),/href="(?:https?:|file:)|<script|<foreignObject|已下载全量|发送者本人战绩/);
    assert.deepEqual(result,before);
  }
});

test('modern generals use exact trusted name only, never private IDs, response image URLs or gallery joins',()=>{
  const calls=[],result=modern('ownedGenerals',{total:2,rows:[row(171,{name:'合成界武将'}),row(29,{name:'合成势武将'})]});
  const cards=buildNativePersonalCards(result,{assetResolver:{imageForGeneral:key=>{calls.push(key);return dataImage;},imageForSkin:()=>assert.fail('No public skin ID join'),imageForOfficialStatic:()=>assert.fail('No general static URL join')}});
  assert.deepEqual(calls,['合成界武将','合成势武将']);assert.equal((svgFor(cards).match(/<image\b/g)||[]).length,2);
  assert.doesNotMatch(svgFor(cards),/synthetic_171|synthetic_29/);
});

test('modern skin cards preserve skin identity, own pagination and placeholders without borrowing general portraits',()=>{
  const result=modern('ownedSkins',{page:2,total:15}),calls=[];
  const cards=buildNativePersonalCards(result,{assetResolver:{imageForOfficialStatic:key=>{calls.push(key);return null;},imageForGeneral:()=>assert.fail('A skin is not a general portrait'),imageForSkin:()=>assert.fail('No public gallery ID join')}});
  assert.equal(cards.length,1);assert.equal(cards[0].private,true);assert.deepEqual(calls,result.data.items.map(item=>item.url));
  const text=labels(cards);for(const value of ['我的皮肤','官方拥有皮肤','筛选匹配皮肤 · 全部','本页 3 项','#13','#sgs我的皮肤 1','暂不支持按武将搜索'])assert(text.includes(value),value);
  assert.doesNotMatch(svgFor(cards),/<image\b/);
});

test('modern malformed projections fail closed rather than render a misleading complete inventory',()=>{
  const valid=modern(),altered=[
    {...valid,coverage:'official-own-response'},{...valid,sourceUrl:'https://evil.invalid/private'},
    ...[{pageSize:24},{items:Array.from({length:13},(_,i)=>row(i+1))},{page:0},{page:4},{pages:4},{total:-1},{filteredTotal:28},{returnedCount:11},
      {countryType:6},{countryLabel:'吴国'},{complete:true},{notice:''},{items:[row(1),row(1)]},{items:[row(1,{isHave:false})]},{items:[row(1,{id:'1'})]},
      {items:[row(1,{name:'长'.repeat(101)})]}].map(extra=>({...valid,data:{...valid.data,...extra}})),
    modern('ownedSkins',{countryType:3})
  ];
  for(const result of altered)assert.equal(buildNativePersonalCards(result),null);
});

test('modern names and notices are XML escaped and untrusted raster values never become network references',()=>{
  for(const unsafe of ['https://evil.invalid/a.png','file:///private/a.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,eA==']){
    const result=modern('ownedGenerals',{total:1,rows:[row(1,{name:'<script>合成</script>'})],notice:'<svg onload="合成">'});
    const cards=buildNativePersonalCards(result,{dataAlreadyRedacted:true,assetResolver:{imageForGeneral:()=>unsafe}});
    assert.equal(cards.length,1);assert.match(svgFor(cards),/&lt;script/);assert.match(svgFor(cards),/&lt;svg/);
    assert.doesNotMatch(svgFor(cards),/<script\b|<svg onload|<image\b|href="(?:https?:|file:)/);
  }
});

test('modern 12 long names, final page and empty matches fully decode as one JPEG in RAM',async()=>{
  const render=createNativeCardRenderer();
  const results=[modern('ownedGenerals',{rows:Array.from({length:12},(_,i)=>row(i+1,{name:'长'.repeat(100)}))}),modern('ownedSkins',{page:3}),modern('ownedGenerals',{total:0,countryType:3})];
  for(const result of results){
    const cards=buildNativePersonalCards(result,{assetResolver:{imageForGeneral:()=>dataImage,imageForOfficialStatic:()=>dataImage}});
    assert.equal(cards.length,1);assert(cards[0].width*cards[0].height<=12000000);
    const bytes=await render(cards[0]),decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
    assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.equal(decoded.info.width,1080);assert.equal(decoded.info.height,cards[0].height);
    assert.equal(decoded.data.length,decoded.info.width*decoded.info.height*3);
    if(!result.data.total)assert.match(labels(cards),/未返回可展示条目/);
  }
});
