import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildNativePersonalCards,buildNativePublicCards} from '../lib/native-views.mjs';
import {prepareNativeUiAssets} from '../lib/native-ui-assets.mjs';
import {createNativePortraitResolver,createNativeStaticResolver} from '../lib/native-assets.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';

// Synthetic fields only. Private responses and output pictures never go to disk.
const result=(kind,data,protocol='pc-scan-v7')=>({kind,data,protocol});
const svgFor=cards=>cards.map(card=>card.svg).join('\n');
const labels=cards=>[...svgFor(cards).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>match[1].replace(/<[^>]+>/g,'')).join('\n');

const publicManifest=()=>JSON.parse(fs.readFileSync(fileURLToPath(new URL('../resources/ui/assets/manifest.json',import.meta.url)),'utf8'));
function combinedPublicResolver(){
  const portraits=createNativePortraitResolver(),statics=createNativeStaticResolver();
  return {imageForGeneral:value=>portraits.imageForGeneral(value)??statics.imageForGeneral(value),imageForOfficialStatic:statics.imageForOfficialStatic};
}

test('asset card contains eleven independent symbols, preserves zero and distinguishes absent fields',async()=>{
  const ui=await prepareNativeUiAssets(),data={yb:0,jh:123,yl:0,zml:2,ylj:3,ssbz:4,hld:5,dianj:6,shouq:7,xiny:8,yinb:9,unknown:777};
  const original=structuredClone(data),cards=buildNativePersonalCards(result('assets',data),{assetResolver:ui});
  assert.equal(cards.length,1);assert.equal(cards[0].width,1080);assert.equal(cards[0].private,true);
  const svg=svgFor(cards);assert.equal((svg.match(/<image\b/g)||[]).length,11);
  for(const label of ['元宝','将魂','雁翎','招募令','雁翎甲','史诗宝珠','欢乐豆','点将卡','手气卡','心愿积分','银币','#sgs资产 导出'])assert(svg.includes(label),label);
  assert.equal((labels(cards).match(/^0$/gm)||[]).length,2);
  assert.doesNotMatch(svg,/对应待核实/);assert.match(svg,/未映射/);assert.doesNotMatch(labels(cards),/777|unknown/);assert.doesNotMatch(svg,/file:\/\/|href="https?:|image\/svg/);
  const missing=labels(buildNativePersonalCards(result('assets',{yb:0})));
  assert.equal((missing.match(/^未返回$/gm)||[]).length,10);assert.equal((missing.match(/^0$/gm)||[]).length,1);
  assert.deepEqual(data,original);
});

test('all existing personal data shapes produce native pages with dedicated titles',()=>{
  const fixtures={summary:{nick_name:'合成角色',lv:0,general_all_count:500,skin_all_count:900},force:{general_power:12345,game_force:{totalForce:19000,doudizhuForce:0,paiweiForce:20,guozhanForce:30,shenfenForce:40}},gameInfo:{nick:'合成角色',lv:0,vip:0,rankWin:1,rankNum:3,douDiZhuWin:2,douDiZhuTotal:3,totalWin:6,totalGame:10,totalMvp:2,generalNum:5,generalTotal:100,skinNum:0,skinTotal:200},recent:[{Model:'身份场',begin_time:'合成时间',result:'官方特别结果'}],abilities:{rows:[{name:'合成能力',details:{source_label:'合成说明'}}]},bestGeneral:{rows:[{name:'合成擅长',source_count:2}]}};
  for(const [kind,data] of Object.entries(fixtures)){
    const cards=buildNativePersonalCards(result(kind,data));assert(cards.length>0,kind);
    for(const card of cards){assert.equal(card.private,true);assert.equal(card.width,1080);assert(card.width*card.height<=12000000);assert.match(card.svg,/本人资料 · 仅私聊/);assert.doesNotMatch(card.svg,/<foreignObject|<script|<style|<iframe|<pre/i);}
  }
  const force=labels(buildNativePersonalCards(result('force',fixtures.force)));for(const value of ['综合战力','斗地主战力','排位战力','国战战力','身份战力','19000','general_power'])assert(force.includes(value),value);assert.doesNotMatch(force,/军阶|NaN|Infinity/);
  const game=labels(buildNativePersonalCards(result('gameInfo',fixtures.gameInfo)));for(const label of ['33%','66%','60%','总 MVP','VIP 0','武将收藏','皮肤收藏'])assert(game.includes(label),label);
  const invalid=labels(buildNativePersonalCards(result('gameInfo',{rankWin:0,rankNum:0,totalWin:2,totalGame:1})));assert.doesNotMatch(invalid,/排位胜率|总胜率|NaN|Infinity/);
});

test('approved profile avatar URLs and declared static badge fields embed canonical RAM images',t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Native profile cards must never fetch remote artwork'));
  const entries=publicManifest().entries,portrait=entries.find(row=>row.category==='general'&&row.name==='刘备'),artwork=entries.find(row=>row.category==='item'&&row.key==='yb');assert(portrait);assert(artwork);
  const resolver=combinedPublicResolver(),fixtures=[
    ['summary',{nick_name:'合成角色',avatar:portrait.url,light:[artwork.url]},2],
    ['gameInfo',{nick:'合成角色',head:portrait.url,lights:[artwork.url],titleList:[{name:'合成徽章',num:0,url:artwork.url}]},3]
  ];
  // Reuse known bundled public artwork only to verify field routing. These
  // synthetic fields make no claim that the item image is a real badge.
  for(const [kind,data,count] of fixtures){
    const original=structuredClone(data),cards=buildNativePersonalCards(result(kind,data),{assetResolver:resolver}),svg=svgFor(cards);
    assert.equal((svg.match(/<image\b/g)||[]).length,count,kind);assert.doesNotMatch(svg,/href="(?:https?:|file:)|data:image\/svg/);assert.deepEqual(data,original);
  }
  const game=labels(buildNativePersonalCards(result('gameInfo',fixtures[1][1]),{assetResolver:resolver}));assert.match(game,/合成徽章/);assert.match(game,/^0$/m);
});

test('unapproved profile artwork stays absent while known badge text and zero counts remain readable',()=>{
  const resolver=combinedPublicResolver(),unapproved='https://untrusted.invalid/synthetic.png';
  const fixtures=[
    ['summary',{nick_name:'合成角色',avatar:unapproved,light:[unapproved]}],
    ['gameInfo',{nick:'合成角色',head:unapproved,lights:[unapproved],titleList:[{name:'合成徽章',num:0,url:unapproved}]}]
  ];
  for(const [kind,data] of fixtures){const svg=svgFor(buildNativePersonalCards(result(kind,data),{assetResolver:resolver}));assert.doesNotMatch(svg,/<image\b|untrusted\.invalid/);}
  const game=labels(buildNativePersonalCards(result('gameInfo',fixtures[1][1]),{assetResolver:resolver}));assert.match(game,/合成徽章/);assert.match(game,/^0$/m);
});

test('profile artwork reads only declared original fields and preserves page image limits',()=>{
  const artwork=publicManifest().entries.find(row=>row.category==='item'&&row.key==='yb').url,resolver=combinedPublicResolver();
  const unproven=buildNativePersonalCards(result('force',{official:'合成军阶',rankPicture:artwork,icon:artwork}),{assetResolver:resolver});assert.doesNotMatch(svgFor(unproven),/<image\b/);
  const cards=buildNativePersonalCards(result('gameInfo',{titleList:Array.from({length:150},(_,index)=>({name:'合成徽章-'+index,num:index,url:artwork}))}),{assetResolver:resolver});
  assert.equal(cards.length,8);for(const card of cards){assert((card.svg.match(/<image\b/g)||[]).length<=64);assert(Buffer.byteLength(card.svg)<=4*1024*1024);assert.match(card.svg,/节选前 8 页/);}
});

test('recent pages show only proven row fields, retain every row and keep valid source results',()=>{
  const data=Array.from({length:23},(_,i)=>({Model:'身份场',begin_time:'合成时间-'+i,result:i%2?'失败':'胜利',general_avatar:['https://untrusted.invalid/private.png'],mvp:'never-guess-single-mvp',general_id:'never-guess-game-id'}));
  const cards=buildNativePersonalCards(result('recent',data),{prefix:'#移动',model:2,page:3}),svg=svgFor(cards),text=labels(cards);
  assert(cards.length>=2);for(let i=0;i<23;i++)assert(text.includes('合成时间-'+i));assert.match(text,/身份场 · 第 3 页 · 本页 23 场/);assert.match(text,/#移动近期战绩 2 3 导出/);
  assert.doesNotMatch(svg,/untrusted|never-guess|MVP|href="https?:/);
  assert.match(labels(buildNativePersonalCards(result('recent',[{result:'官方特别结果'}]))),/官方特别结果/);
});

test('modern recent own names and strict MVP/run flags remain readable in a fully decoded long-row JPEG',async()=>{
  const data=[{Model:'身份场',begin_time:'2026-01-02 03:04:05',result:'胜利',general_names:['合成武将甲','合成武将乙'],mvp:true,run:true,
    otherPlayers:[{name:'never-display-other-player'}],general_id:'never-display-internal-id'},
    {Model:'合成超长模式'.repeat(9),begin_time:'合成超长时间'.repeat(8),result:'官方未知结果'.repeat(9),general_names:['合成武将长名'.repeat(8)],mvp:'true',run:1}];
  const before=structuredClone(data),cards=buildNativePersonalCards(result('recent',data)),visible=labels(cards);
  for(const value of ['合成武将甲、合成武将乙','MVP','逃跑','2026-01-02'])assert(visible.includes(value),value);
  assert.equal((visible.match(/MVP/g)||[]).length,1);assert.equal((visible.match(/逃跑/g)||[]).length,1);
  assert.doesNotMatch(svgFor(cards),/never-display/);assert.deepEqual(data,before);
  const render=createNativeCardRenderer();for(const card of cards){const jpeg=await render(card);assert.equal(jpeg[0],255);assert.equal(jpeg[1],216);assert(jpeg.length>5000);}
});

test('stopped legacy and unknown protocols cannot render native private cards',()=>{
  for(const protocol of ['app-qr-v1','unknown',undefined])assert.equal(buildNativePersonalCards({...result('assets',{yb:2}),protocol}),null);
  for(const kind of ['skins','favorites'])assert.equal(buildNativePersonalCards(result(kind,{name:'never-display-retired-query'})),null);
  for(const value of [null,{}])assert.equal(buildNativePersonalCards(value),null);
  const unknown=labels(buildNativePersonalCards(result('newKind',{arbitrary:{future:'合成未来字段'}})));assert.match(unknown,/本人资料/);assert.match(unknown,/#sgs个人资料 导出/);
  assert.equal(buildNativePersonalCards(result('records',{})),null);
});

test('private and public markup is escaped, sensitive keys removed, original inputs retained',()=>{
  const data={nick_name:'<img src=x onerror="synthetic-payload">合成角色',lv:1,token:'synthetic-secret',phone:'synthetic-phone',nested:{name:'</style><script>synthetic-script</script>',value:'keep',cookie:'synthetic-cookie'}};
  const original=structuredClone(data),cards=buildNativePersonalCards(result('summary',data),{prefix:'<svg onload="synthetic-prefix">',command:'<script>bad-command</script>'}),svg=svgFor(cards);
  assert.doesNotMatch(svg,/<script\b|<img src=x|synthetic-secret|synthetic-phone|synthetic-cookie/);assert.match(svg,/合成角色/);assert.deepEqual(data,original);
  const cleaned=svgFor(buildNativePersonalCards(result('abilities',{rows:[{encoded:'&lt;example&gt;',literal:'<script>合成文本</script>'}]}),{dataAlreadyRedacted:true}));
  assert.match(cleaned,/&amp;lt;example&amp;gt;/);assert.match(cleaned,/&lt;script&gt;合成文本&lt;\/script&gt;/);assert.doesNotMatch(cleaned,/<script\b/);
});

test('public hero detail, article paragraphs and catalog lists paginate in native cards',()=>{
  const portraits=createNativePortraitResolver(),hero={name:'势·邓艾',faction:'魏',description:'合成简介',skills:[{name:'合成技能',description:'长句'.repeat(1500)},{name:'第二技能',description:'合成末尾说明'}]};
  const cards=buildNativePublicCards(hero,{command:'武将',assetResolver:portraits});assert(cards.length>=2);for(const card of cards)assert.equal(card.private,false);
  const svg=svgFor(cards),text=labels(cards);assert.match(svg,/<image\b/);assert.match(text,/势·邓艾/);assert.match(text,/第二技能/);assert.match(text,/合成末尾说明/);assert.doesNotMatch(svg,/href="(?:https?:|file:)/);
  const catalog=labels(buildNativePublicCards({items:[{id:12,name:'赵云'}]},{command:'武将'}));assert.match(catalog,/#sgs武将 12/);
  const news=labels(buildNativePublicCards({items:[{id:42,title:'合成公告',date:'合成日期'}]},{command:'公告'}));assert.match(news,/#sgs详情 42/);
  const community=labels(buildNativePublicCards({items:[{id:42,title:'合成社区'}]},{command:'社区'}));assert.match(community,/ID 42/);assert.doesNotMatch(community,/#sgs详情/);
});

test('page, text and embedded image limits stay bounded and discarded pages are explained',()=>{
  const data=Array.from({length:1200},(_,i)=>({name:'合成条目-'+i,description:'合成说明'.repeat(50)})),cards=buildNativePersonalCards(result('abilities',data));
  assert.equal(cards.length,8);for(const card of cards){assert(card.height<=11111);assert(Buffer.byteLength(card.svg)<=4*1024*1024);assert.match(card.svg,/节选前 8 页/);}
  const bad=['https://evil.invalid/a.png','file:///private/key.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,eA=='];
  for(const url of bad)assert.doesNotMatch(svgFor(buildNativePublicCards({name:'合成武将'},{command:'武将',assetResolver:{imageForGeneral:()=>url}})),/<image\b/);
});

test('winRate views display normalized official statistics without treating nested or unknown fields as wins',()=>{
  const data={title:'合成武将胜率',scope:'身份场',entries:[{label:'生涯胜率',value:'56.25%',detail:'900 胜 / 1600 场'}],generals:[{name:'势·邓艾',mode:'rank',label:'排位赛',value:'50%',detail:'1 胜 / 2 场',wins:1,games:2}],notice:'统计口径来自官方字段'};
  const cards=buildNativePersonalCards(result('winRate',data),{assetResolver:createNativePortraitResolver()}),text=labels(cards);
  for(const value of ['合成武将胜率','56.25%','900 胜 / 1600 场','势·邓艾 · 排位赛','50% · 1 胜 / 2 场','统计口径来自官方字段'])assert(text.includes(value),value);
  assert.match(svgFor(cards),/<image\b/);
});

test('actual strict local decoder accepts every private and public native scene in RAM',async()=>{
  const ui=await prepareNativeUiAssets(),portrait=createNativePortraitResolver(),assetResolver={...ui,...portrait},render=createNativeCardRenderer();
  const scenes=[...buildNativePersonalCards(result('assets',{yb:0,jh:123}),{assetResolver}),...buildNativePersonalCards(result('summary',{nick_name:'合成角色',lv:0}),{assetResolver}),...buildNativePersonalCards(result('force',{game_force:{totalForce:19000,paiweiForce:0}}),{assetResolver}),...buildNativePersonalCards(result('gameInfo',{nick:'合成角色',totalGame:0}),{assetResolver}),...buildNativePersonalCards(result('recent',[{Model:'身份场',begin_time:'合成时间',result:'胜利'}]),{assetResolver}),...buildNativePersonalCards(result('abilities',{rows:[{name:'合成武将',source_count:2}]}),{assetResolver}),...buildNativePublicCards({name:'势·邓艾',faction:'魏',skills:[{name:'合成技能',description:'合成说明'.repeat(180)}]},{command:'武将',assetResolver}),...buildNativePublicCards({items:[{id:12,name:'刘备'}]},{command:'武将',assetResolver})];
  for(const card of scenes){const bytes=await render({...card,private:true});assert(Buffer.isBuffer(bytes));assert(bytes.length>5000);assert.equal(bytes[0],255);assert.equal(bytes[1],216);}
});
