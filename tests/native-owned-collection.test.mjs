import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {buildOwnedCollection,OWNED_COLLECTION_SOURCE,OWNED_GAME_INFO_SOURCE} from '../lib/owned-collection.mjs';
import {buildNativePersonalCards} from '../lib/native-views.mjs';
import {createReplyCardBuilder} from '../lib/reply-cards.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';
import {createNativeStaticResolver,createNativePortraitResolver} from '../lib/native-assets.mjs';

// Synthetic own rows/totals. The only disk inputs are already-public art files.
const root=fileURLToPath(new URL('../',import.meta.url));
const publicRows=JSON.parse(fs.readFileSync(new URL('../resources/ui/assets/manifest.json',import.meta.url),'utf8')).entries.filter(row=>row.category==='general');
const row=(index=1,extra={})=>({id:index,name:'合成武将'+index,url:'https://www.sanguosha.cn/synthetic-'+index+'.png',...extra});
const owned=(kind='ownedGenerals',rows=[row()],extra={})=>buildOwnedCollection({kind,collectionResult:{kind:'skins',protocol:'app-qr-v1',sourceUrl:OWNED_COLLECTION_SOURCE,data:{generalList:rows,skinList:rows}},gameInfoResult:{kind:'gameInfo',protocol:'app-qr-v1',sourceUrl:OWNED_GAME_INFO_SOURCE,data:{generalNum:1000,generalTotal:2000,skinNum:2000,skinTotal:3000}},...extra});
const svgFor=cards=>cards.map(card=>card.svg).join('\n');
const labels=cards=>[...svgFor(cards).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>match[1].replace(/<[^>]+>/g,'')).join('\n');

test('each owned page sends exactly one private grid with scope and independent counts',()=>{
  const rows=Array.from({length:49},(_,i)=>row(i+1));
  for(const kind of ['ownedGenerals','ownedSkins'])for(const page of [1,2,3]){
    const result=owned(kind,rows,{page}),original=structuredClone(result),cards=buildNativePersonalCards(result,{prefix:'#三国',groupShare:true});
    assert.equal(cards.length,1);assert.equal(cards[0].private,true);assert.equal(cards[0].width,1080);assert(cards[0].width*cards[0].height<=12000000);
    const text=labels(cards);for(const value of [kind==='ownedGenerals'?'我的武将':'我的皮肤','官方拥有','本次返回','49','第 '+page+' / 3 页','本次只返回部分，未展示不表示未拥有','本人资料 · 仅私聊','不等于公开图鉴'])assert(text.includes(value),value);
    assert.equal((text.match(/合成武将\d+/g)||[]).length,result.data.items.length);assert.doesNotMatch(svgFor(cards),/href="(?:https?:|file:)|<script|<foreignObject|导出|发送者本人战绩/);
    assert.deepEqual(result,original);
  }
});

test('owned general images prefer exact URLs then unique official names, never internal IDs or icon fallbacks',()=>{
  const known=publicRows[0],rows=[row(known.id,{name:'合成拥有',url:known.url}),row(known.id+10000,{name:known.name,url:'https://www.sanguosha.cn/unregistered.png'}),row(known.id+20000,{name:'未知合成',url:'https://www.sanguosha.cn/another.png',iconUrl:known.url})],calls=[],statics=createNativeStaticResolver({root}),portraits=createNativePortraitResolver({root});
  const resolver={imageForGeneral:key=>{calls.push(key);return portraits.imageForGeneral(key)??statics.imageForGeneral(key);},imageForOfficialStatic:()=>assert.fail('General image cannot use skin/static fallback')};
  const cards=buildNativePersonalCards(owned('ownedGenerals',rows),{assetResolver:resolver});assert.deepEqual(calls,[rows[0].url,rows[1].url,rows[1].name,rows[2].url,rows[2].name]);assert.equal((svgFor(cards).match(/<image\b/g)||[]).length,2);
  assert.doesNotMatch(svgFor(cards),/href="https?:|unregistered|iconUrl/);
});

test('owned skins call exact static resolver only and retain placeholders for unbundled art',()=>{
  const calls=[],resolver={imageForOfficialStatic:key=>{calls.push(key);return null;},imageForGeneral:()=>assert.fail('A skin must never become a general portrait'),imageForSkin:()=>assert.fail('Internal skin IDs cannot index public gallery IDs')};
  const rows=[row(29),row(171)],cards=buildNativePersonalCards(owned('ownedSkins',rows),{assetResolver:resolver});
  assert.deepEqual(calls,rows.map(item=>item.url));assert.doesNotMatch(svgFor(cards),/<image\b/);assert.match(labels(cards),/合成武将29/);
});

test('unsafe data images never enter owned SVG and escaped names cannot inject markup',()=>{
  const unsafe=['https://evil.invalid/a.png','file:///private/a.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,eA=='];
  for(const value of unsafe){const cards=buildNativePersonalCards(owned('ownedGenerals',[row(1,{name:'<script>合成</script>'})]),{dataAlreadyRedacted:true,assetResolver:{imageForGeneral:()=>value}});assert.doesNotMatch(svgFor(cards),/<image\b|<script\b|file:\/\/|evil\.invalid/);assert.match(svgFor(cards),/&lt;script/);}
  for(const altered of [result=>({...result,coverage:'official-web-catalog'}),result=>({...result,protocol:'pc-scan-v7'}),result=>({...result,data:{...result.data,items:Array(25).fill(row())}})])assert.equal(buildNativePersonalCards(altered(owned())),null);
});

test('bounded long names and all invalid/empty rows remain a single native card',()=>{
  const long=Array.from({length:24},(_,i)=>row(i+1,{name:'长'.repeat(95)}));
  for(const result of [owned('ownedGenerals',long),owned('ownedSkins',[]),owned('ownedGenerals',[null,{id:1,name:''}])]){
    const cards=buildNativePersonalCards(result);assert.equal(cards.length,1);assert(cards[0].height<=12000);assert(cards[0].width*cards[0].height<=12000000);
  }
});

test('production builder and strict native decoder produce owned JPEG in RAM without network or persistence',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Owned projection/card must never download images'));
  const build=createReplyCardBuilder({root}),render=createNativeCardRenderer(),rows=publicRows.slice(0,24).map((entry,index)=>row(index+1,{name:'合成拥有'+(index+1),url:entry.url}));
  for(const kind of ['ownedGenerals','ownedSkins']){
    const result=owned(kind,rows),cards=await build({type:'personal',private:true,result,params:{command:kind==='ownedGenerals'?'我的武将':'我的皮肤'}});
    assert.equal(cards.length,1);assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,24);
    const bytes=await render(cards[0]),decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
    assert(Buffer.isBuffer(bytes));assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.equal(decoded.info.width,1080);assert.equal(decoded.info.height,cards[0].height);
    assert.equal(decoded.data.length,decoded.info.width*decoded.info.height*3);
  }
});
