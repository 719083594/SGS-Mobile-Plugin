import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createReplyCardBuilder} from '../lib/reply-cards.mjs';
import {createSharedNativeCardRenderer} from '../lib/shared-renderer.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const kinds={
  summary:{nick_name:'合成角色',general_all_count:8},force:{game_force:{totalForce:9001,doudizhuForce:0,paiweiForce:12,guozhanForce:33,shenfenForce:44}},
  assets:{yb:0,jh:12,yl:3,zml:4,ylj:5,ssbz:6,hld:7,dianj:8,shouq:9,xiny:10,yinb:11},
  records:{totalGames:10,winGames:6,rate:'0.6',mvp:2,force:9001},recent:[],
  gameInfo:{nick:'合成角色',totalGame:10,totalWin:6,rankNum:2,rankWin:1},
  abilities:{ri:10,riTotal:20,ii:2,iiTotal:10,nw:0,nwTotal:5,ddz:8,ddzTotal:9},
  bestGeneral:{list:[{info:{name:'势周瑜',isHave:true},total:10,win:6}]},
  winRate:{title:'势周瑜 · 胜率',scope:'合成统计',entries:[],generals:[{name:'势周瑜',label:'排位赛',value:'60%',detail:'6 胜 / 10 场'}],notice:'合成测试'}
};
const personalResult=(kind,data)=>({kind,protocol:'pc-scan-v7',data,...(kind==='records'?{
  scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,
  sourceUrl:'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',query:{model:0,wireMode:0},
  recentRecords:{kind:'recent',protocol:'pc-scan-v7',sourceUrl:'https://api-xh.sanguosha.cn/user/gameRecordList/total',query:{model:0,wireMode:0,page:1,pageSize:10},data:[{general_names:['势周瑜'],outcomeCode:0}]}
}:{} )});

test('生产 builder 为所有标准动态场景生成原生卡，资产11图标与0保留',async()=>{
  const build=createReplyCardBuilder({root});
  for(const [kind,data] of Object.entries(kinds)){
    const cards=await build({type:'personal',result:personalResult(kind,data),params:{command:kind==='winRate'?'势周瑜胜率':undefined,...(kind==='winRate'?{general:'势周瑜',gameMode:'排位赛',model:1}:{})}});
    assert(cards.length>0);assert(cards.every(card=>typeof card.svg==='string'&&card.private===true&&!Object.hasOwn(card,'html')));
    if(kind==='assets'){const svg=cards.map(card=>card.svg).join('');assert.equal((svg.match(/<image /g)||[]).length,11);assert.match(svg,/>0<\/tspan>/);}
    if(kind==='winRate')assert.match(cards[0].svg,/#sgs势周瑜胜率 排位赛 导出/);
  }
  const publicCards=await build({type:'public',result:{name:'关羽',skills:[{name:'武圣',description:'合成测试'}]},params:{command:'武将'}});
  assert(publicCards.every(card=>card.private===false&&card.svg));
});

test('真实AI共享服务可转换生产builder的资产、战绩、胜率与公开卡',async t=>{
  if(!fs.existsSync(new URL('../../AI-Plugin/src/rendering/index.mjs',import.meta.url))){t.skip('独立SG仓库没有同级AI-Plugin；宿主集成验收执行此项');return;}
  const sharp=(await import('sharp')).default,build=createReplyCardBuilder({root}),render=createSharedNativeCardRenderer();
  for(const kind of ['assets','records','winRate']){
    const cards=await build({type:'personal',result:personalResult(kind,kinds[kind])});
    for(const card of cards){const jpeg=await render(card),meta=await sharp(jpeg).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,1080);assert.equal(meta.height,card.height);}
  }
  const [card]=await build({type:'public',result:{name:'关羽'},params:{command:'武将'}});
  const image=await render(card);assert.equal((await sharp(image).metadata()).width,1080);
});

test('production builder rejects retired collections and stopped protocols before artwork',async()=>{
  const build=createReplyCardBuilder({root,loadSharp:()=>assert.fail('Unsupported queries cannot prepare artwork')});
  for(const kind of ['skins','favorites'])await assert.rejects(build({type:'personal',result:personalResult(kind,{name:'never-display-retired-query'})}),{code:'INVALID_NATIVE_CARD'});
  for(const protocol of ['app-qr-v1','unknown',undefined])await assert.rejects(build({type:'personal',result:{...personalResult('assets',{yb:1}),protocol}}),{code:'INVALID_NATIVE_CARD'});
});

test('生产资料卡保留manifest批准URL头像与资料图标，不把原URL直接嵌入',async()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../resources/ui/assets/manifest.json',import.meta.url),'utf8'));
  const url=manifest.entries.find(row=>row.kind==='official-artwork'&&row.category==='general'&&row.name==='刘备').url;
  const build=createReplyCardBuilder({root});
  const [card]=await build({type:'personal',result:{kind:'gameInfo',protocol:'pc-scan-v7',data:{nick:'合成角色',head:url,lights:[url]}}});
  assert.equal((card.svg.match(/<image /g)||[]).length,2);
  assert.match(card.svg,/将灯/);assert.doesNotMatch(card.svg,/href="(?:https?:|file:)/);
});
