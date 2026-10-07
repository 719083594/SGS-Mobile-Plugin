import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {formatPersonal} from '../lib/format-personal.mjs';
import {SanguoshaMobile} from '../api.mjs';
import {privateFileUpload} from '../lib/private-file.mjs';
import {redactOwnData} from '../lib/community-auth.mjs';

const result=(kind,data)=>({kind,data,protocol:'app-qr-v1',sourceUrl:'https://wxforum.sanguosha.cn/api/user/getGameSummary'});
const exported=(kind,data,options={})=>JSON.parse(formatPersonal(result(kind,data),{...options,exportJson:true}).file.data);

test('资产名称来自官方绑定，零值保留，未知计数不被解释为余额',()=>{
  const data={yb:0,jh:12,yl:34,zml:2,ylj:1,ssbz:3,hld:56,count:700,coins:800};
  const text=formatPersonal(result('assets',data)).text;
  for(const label of ['元宝：0','将魂：12','雁翎：34','招募令：2','雁翎甲：1','史诗宝珠：3','欢乐豆：56'])assert(text.includes(label));
  assert.match(text,/未映射字段：count、coins/);
  assert.doesNotMatch(text,/余额|元宝：700|元宝：800/);
  assert.deepEqual(exported('assets',data).data,data);
  assert.doesNotMatch(formatPersonal(result('assets',{unknown:1})).text,/元宝：0/);
});

test('概览中的总数分母与本人拥有数分开，force百分数字段不再次乘100',()=>{
  const summary=formatPersonal(result('summary',{nick_name:'测试角色',lv:12,general_all_count:500,skin_all_count:900})).text;
  assert.match(summary,/昵称：测试角色/);assert.match(summary,/等级：12/);
  assert.match(summary,/武将总数（官网统计）：500/);assert.doesNotMatch(summary,/拥有武将：500/);
  const force=formatPersonal(result('force',{game_total:0,game_win:0,win_rate:0.5,general_count:3,skin_count:4,official:'未知标签'})).text;
  assert.match(force,/总场次：0/);assert.match(force,/获胜场次：0/);assert.match(force,/胜率：0\.5%/);
  assert.match(force,/拥有武将：3/);assert.doesNotMatch(force,/军阶|50%/);
  assert.match(force,/未映射字段：official/);
});

test('战绩按官方模式分组，wanmei按前端标为大师，近期使用不是拥有列表',()=>{
  const data={paiweiRate:{total:10,total_rate:30},shenfenRate:{total_rate:40,emperor_rate:0,minister_rate:50,rebel_rate:60,provocateur_rate:25},guozhanRate:{total_rate:45,wei_rate:50,shu_rate:40,wu_rate:30,qun_rate:20,ye_rate:10},doudizhuRate:{total:20,total_rate:55,lord_rate:60,peasant_rate:50},medals:{wanmei:2,feicui:5},recent:[{name:'刘备'},{name:'赵云'}],g20:[0,1,0],future:{untouched:7}};
  const text=formatPersonal(result('records',data),{model:2}).text;
  for(const label of ['排位赛：','身份场：','国战：','斗地主：','主公胜率：0%','内奸胜率：25%','野心家胜率：10%','地主胜率：60%','排位赛最高段位：大师','近期使用武将：刘备、赵云','胜 负 胜'])assert(text.includes(label));
  assert.doesNotMatch(text,/拥有武将/);assert.match(text,/#sgs战绩 2 导出/);
  assert.deepEqual(exported('records',data).data,data);
});

test('近20场仅解释已知胜负值，陌生结果码不被一律标为负且导出保留原值',()=>{
  const data={g20:[0,1,2,0.5,null,'0','1','unexpected']};
  const text=formatPersonal(result('records',data)).text;
  assert.match(text,/胜 负 未知 未知 未知 胜 负 未知/);
  assert.deepEqual(exported('records',data).data,data);
});

test('近期战绩保留官方模式时间结果，摘要限条，导出保留所有条目与未知字段',()=>{
  const data=[{Model:'身份场',begin_time:'示例时间一',result:'失败',future:{value:11}},{Model:'排位赛',begin_time:'示例时间二',result:'胜利'},{Model:'国战',begin_time:'示例时间三',result:'胜利'}];
  const text=formatPersonal(result('recent',data),{model:2,page:3,maxItems:2,prefix:'#移动'}).text;
  assert.match(text,/模式：身份场；页码：3/);assert.match(text,/返回：3条；显示前2条/);
  assert.match(text,/身份场 · 示例时间一 · 失败/);assert.doesNotMatch(text,/示例时间三/);
  assert.match(text,/#移动近期战绩 2 3 导出/);
  assert.deepEqual(exported('recent',data,{model:2,page:3}).data,data);
  assert.match(formatPersonal(result('recent',[])).text,/本页暂无记录/);
});

test('gameInfo胜率按官方公式截断，仅有效分母计算，不伪造缺失段位或零胜率',()=>{
  const data={nick:'测试角色',lv:10,vip:0,nowDivision:'白银',maxDivision:'黄金',maxTitle:'示例称号',rankWin:1,rankNum:3,douDiZhuWin:2,douDiZhuTotal:3,totalGame:10,totalWin:6,totalMvp:2,generalNum:5,generalTotal:100,skinNum:0,skinTotal:200,official:'原字段未释义'};
  const text=formatPersonal(result('gameInfo',data)).text;
  for(const label of ['VIP：0','当前段位：白银','最高段位：黄金','最高称号：示例称号','排位胜场：1','斗地主胜场：2','总场次：10','MVP：2','武将：5 / 100','皮肤：0 / 200','排位胜率：33%','斗地主胜率：66%','总胜率：60%'])assert(text.includes(label));
  assert.doesNotMatch(text,/军阶/);assert.deepEqual(exported('gameInfo',data).data,data);
  const invalid=formatPersonal(result('gameInfo',{rankWin:0,rankNum:0,totalGame:0,totalWin:0})).text;
  assert.doesNotMatch(invalid,/胜率：0%|当前段位：无|最高段位：无/);
  const overflow=formatPersonal(result('gameInfo',{rankWin:'9'.repeat(500),rankNum:'9'.repeat(500)})).text;
  assert.doesNotMatch(overflow,/胜率：(?:NaN|Infinity)/);
});

test('只为明确APP协议解释字段，微信或未知协议保留原字段',()=>{
  for(const protocol of ['pc-scan-v7','unknown',undefined]){
    const text=formatPersonal({...result('assets',{yb:12}),protocol}).text;
    assert.match(text,/暂无已核实的中文字段映射/);assert.match(text,/'yb'|"yb"/);assert.doesNotMatch(text,/元宝：12/);
  }
});

test('输出与导出再次隐私清洗，不修改输入，不带来源URL查询凭据',()=>{
  const data={yb:1,token:'synthetic-private-token',phone:'synthetic-phone',unknown:{value:7,cookie:'synthetic-private-cookie'},nick:'<b>测试</b>'};
  const original=structuredClone(data);
  const out=formatPersonal({...result('assets',data),sourceUrl:'https://hi-gateway.sanguosha.cn/api/game/v2/general/property?token=synthetic-url-secret'},{exportJson:true});
  const text=JSON.stringify(out);
  assert.doesNotMatch(text,/synthetic-private|synthetic-phone|synthetic-url-secret|<b>/);
  assert.deepEqual(JSON.parse(out.file.data).data,{yb:1,unknown:{value:7},nick:'测试'});
  assert.equal(JSON.parse(out.file.data).sourceUrl,'https://hi-gateway.sanguosha.cn/api/game/v2/general/property');
  assert.deepEqual(data,original);
});

test('未知结构超长时走完整JSON文件协议，仍可按现有适配器转换为内存Buffer',()=>{
  const data={unknown:{value:'synthetic'.repeat(1000)}};
  const out=formatPersonal(result('assets',data),{maxLength:500});
  assert(out.file);assert.deepEqual(JSON.parse(out.file.data).data,data);
  const upload=privateFileUpload(out.file.data,out.file.name);
  assert(Buffer.isBuffer(upload.buffer));assert.equal(upload.buffer.toString(),'[私密文件内容已隐藏]');
  assert.deepEqual(JSON.parse(upload.buffer.toString('utf8')).data,data);
});

test('queryOwn已清洗的未知字符串不会二次解码或去标签而丢失数据',()=>{
  const data=redactOwnData({yb:1,unknown:{encoded:'&lt;example&gt;',nested:[{value:'&amp;lt;literal&amp;gt;'}]}});
  const out=formatPersonal(result('assets',data),{exportJson:true,dataAlreadyRedacted:true});
  assert.deepEqual(JSON.parse(out.file.data).data,data);
});

test('核心导出模式页码正确，群聊和其他本人无法读取已授权会话或导出文件',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-format-'));
  try{
    const bot=new SanguoshaMobile(root,{fetch:async()=>{throw new Error('No network is allowed in this test');}});
    const owner='100000001';bot.vault.set(owner,{session:{protocol:'app-qr-v1',token:'synthetic-session'}});
    const calls=[];bot.auth.queryOwn=async(kind,session,params)=>{calls.push({kind,params});return result(kind,[{Model:'国战',begin_time:'示例时间',result:'胜利',unknown:5}]);};
    const out=await bot.handle({owner,privateChat:true,text:'#sgs近期战绩 3 2 导出'});
    assert(out.file);assert.equal(out.file.name,'三国移动-recent.json');assert.equal(JSON.parse(out.file.data).data[0].unknown,5);
    assert.deepEqual(calls,[{kind:'recent',params:{model:3,page:2}}]);
    assert.match((await bot.handle({owner,privateChat:true,group_id:'200000001',text:'#sgs近期战绩 3 2 导出'})).text,/私聊/);
    assert.match((await bot.handle({owner:'100000002',privateChat:true,text:'#sgs近期战绩 导出'})).text,/请先/);
    assert.equal(calls.length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
