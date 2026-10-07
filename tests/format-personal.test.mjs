import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {formatPersonal} from '../lib/format-personal.mjs';
import {SanguoshaMobile} from '../api.mjs';
import {privateFileUpload} from '../lib/private-file.mjs';
import {redactOwnData} from '../lib/community-auth.mjs';

const result=(kind,data)=>({kind,data,protocol:'pc-scan-v7',sourceUrl:'https://api-xh.sanguosha.cn/user/gameSummary'});
const exported=(kind,data,options={})=>JSON.parse(formatPersonal(result(kind,data),{...options,exportJson:true}).file.data);

test('资产名称来自官方绑定，零值保留，未知计数不被解释为余额',()=>{
  const data={yb:0,jh:12,yl:34,zml:2,ylj:1,ssbz:3,hld:56,dianj:57,shouq:58,xiny:59,yinb:60,count:700,coins:800};
  const text=formatPersonal(result('assets',data)).text;
  for(const label of ['元宝：0','将魂：12','雁翎：34','招募令：2','雁翎甲：1','史诗宝珠：3','欢乐豆：56','点将卡：57','手气卡：58','心愿积分：59','银币：60'])assert(text.includes(label));
  assert.match(text,/未映射字段：count、coins/);
  assert.doesNotMatch(text,/余额|元宝：700|元宝：800/);
  assert.deepEqual(exported('assets',data).data,data);
  assert.doesNotMatch(formatPersonal(result('assets',{unknown:1})).text,/元宝：0/);
});

test('现代概览拥有量与总数分开，五项战力使用官方原值而非图表轴上限',()=>{
  const summary=formatPersonal(result('summary',{nick_name:'合成角色',lv:12,generalCount:5,skinCount:8,general_all_count:500,skin_all_count:900})).text;
  for(const value of ['昵称：合成角色','等级：12','拥有武将：5','拥有皮肤：8','武将总数（官网统计）：500'])assert(summary.includes(value),value);
  const data={general_power:12345,game_force:{totalForce:19000,doudizhuForce:0,paiweiForce:2000,guozhanForce:3000,shenfenForce:4000}};
  const force=formatPersonal(result('force',data)).text;
  for(const value of ['综合战力：19000','斗地主战力：0','排位战力：2000','国战战力：3000','身份战力：4000'])assert(force.includes(value),value);
  assert.doesNotMatch(force,/综合战力：8000|军阶|将力：12345/);assert.match(force,/未映射字段：general_power/);
  assert.deepEqual(exported('force',data).data,data);
});

test('现代生涯字段使用当前官方原值，不套旧模式或段位枚举',()=>{
  const data={winGames:6,totalGames:10,rate:'0.6',mvp:2,force:19000,nowRank:123,maxRank:456,future:{untouched:7}};
  const text=formatPersonal(result('records',data),{model:2}).text;
  for(const value of ['获胜场次：6','总场次：10','官方胜率：60%','MVP：2','战力：19000','#sgs战绩 2 导出'])assert(text.includes(value),value);
  assert.doesNotMatch(text,/大师|主公胜率|野心家胜率|近20场/);assert.match(text,/未映射字段：nowRank、maxRank、future/);
  assert.deepEqual(exported('records',data).data,data);
});

test('现代rate按官方比例乘100，边界零值保留，异常值不伪装胜率且导出原比例',()=>{
  for(const [rate,value] of [['0.5','50%'],[0,'0%'],['1.0','100%'],['0.333333','33.33%']]){
    assert(formatPersonal(result('records',{rate})).text.includes('官方胜率：'+value));
    assert.equal(exported('records',{rate}).data.rate,rate);
  }
  for(const rate of ['50%','未返回',1.1,-1,NaN,Infinity,null,{},'9'.repeat(500)]){
    assert.doesNotMatch(formatPersonal(result('records',{rate,totalGames:1})).text,/官方胜率：/);
  }
  assert.doesNotMatch(formatPersonal(result('records',{rate:'0.5'})).text,/官方胜率：0\.5(?:%|$)/);
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

test('停止旧协议后旧会话及未知协议不能显示或导出个人字段',()=>{
  for(const protocol of ['app-qr-v1','unknown',undefined]){
    const out=formatPersonal({...result('assets',{yb:12,token:'synthetic-secret'}),protocol},{exportJson:true});
    assert.match(out.text,/协议已停止支持/);assert.doesNotMatch(out.text,/元宝|synthetic-secret|yb/);assert.equal(out.file,undefined);
  }
});

test('旧皮肤与社区喜欢查询不以现代协议标签继续渲染或导出',()=>{
  for(const kind of ['skins','favorites']){
    const out=formatPersonal(result(kind,{name:'never-display-retired-query'}),{exportJson:true});
    assert.match(out.text,/该旧收藏查询已停止支持/);assert.doesNotMatch(out.text,/never-display/);assert.equal(out.file,undefined);
  }
});

test('输出与导出再次隐私清洗，不修改输入，不带来源URL查询凭据',()=>{
  const data={yb:1,token:'synthetic-private-token',phone:'synthetic-phone',unknown:{value:7,cookie:'synthetic-private-cookie'},nick:'<b>测试</b>'};
  const original=structuredClone(data);
  const out=formatPersonal({...result('assets',data),sourceUrl:'https://api-xh.sanguosha.cn/user/gameProperty?token=synthetic-url-secret'},{exportJson:true});
  const text=JSON.stringify(out);
  assert.doesNotMatch(text,/synthetic-private|synthetic-phone|synthetic-url-secret|<b>/);
  assert.deepEqual(JSON.parse(out.file.data).data,{yb:1,unknown:{value:7},nick:'测试'});
  assert.equal(JSON.parse(out.file.data).sourceUrl,'https://api-xh.sanguosha.cn/user/gameProperty');
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
    const owner='100000001';bot.saveAuth(owner,{session:{protocol:'pc-scan-v7',token:'synthetic-session',cookieValue:'synthetic-cookie',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityUserId:'12345678',communityAuthenticated:true,gameAuthenticated:false,channelVerified:false}});
    const calls=[];bot.auth.queryOwn=async(kind,session,params)=>{calls.push({kind,params});return {...result(kind,{list:[{mode:'2',modeName:'国战',beginTime:1600000000,result:0,players:[{isMe:true,general:['合成武将']}],myGeneralAvatar:[],mvp:1,run:0,unknown:5}]}),sourceUrl:'https://api-xh.sanguosha.cn/user/gameRecordList/total',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,query:{model:3,wireMode:2,page:2,pageSize:10}};};
    const out=await bot.handle({owner,privateChat:true,text:'#sgs近期战绩 3 2 导出'});
    assert(out.file);assert.equal(out.file.name,'三国移动-recent.json');assert.equal(JSON.parse(out.file.data).data[0].unknown,undefined);assert.equal(JSON.parse(out.file.data).data[0].mvp,true);assert.deepEqual(JSON.parse(out.file.data).data[0].general_names,['合成武将']);
    assert.deepEqual(calls,[{kind:'recent',params:{model:3,page:2}}]);
    assert.match((await bot.handle({owner,privateChat:true,group_id:'200000001',text:'#sgs近期战绩 3 2 导出'})).text,/私聊/);
    assert.match((await bot.handle({owner:'100000002',privateChat:true,text:'#sgs近期战绩 导出'})).text,/请先/);
    assert.equal(calls.length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
