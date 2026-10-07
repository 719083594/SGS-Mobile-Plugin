import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWinRateOverview,buildGeneralWinRate,formatWinRate,WinRateError} from '../lib/win-rate.mjs';

const envelope=(kind,data)=>({kind,protocol:'app-qr-v1',data});
const best=(data)=>envelope('bestGeneral',data);
const records=(data)=>envelope('records',data);
const byLabel=(result,label)=>result.data.entries.find(row=>row.label===label);
const throwsCode=(fn,code)=>assert.throws(fn,error=>error instanceof WinRateError&&error.code===code);

test('官方总场次、胜场计算总览，不受昵称、凭据或雷达能力值影响',()=>{
  const raw={totalWin:9,totalGame:16,rankWin:'2',rankNum:'3',douDiZhuWin:0,douDiZhuTotal:5,token:'synthetic-secret',nick:'synthetic-private-name',ri:{one:9999}};
  const original=structuredClone(raw),result=buildWinRateOverview({gameInfo:envelope('gameInfo',raw)});
  assert.deepEqual(byLabel(result,'总胜率'),{label:'总胜率',value:'56.25%',detail:'9 胜 / 16 场'});
  assert.equal(byLabel(result,'排位胜率').value,'66.67%');assert.equal(byLabel(result,'斗地主胜率').value,'0%');
  assert.doesNotMatch(JSON.stringify(result),/synthetic|9999|nick|token/);assert.deepEqual(raw,original);
});

test('零场、缺字段和不一致统计不冒充0%胜率',()=>{
  const result=buildWinRateOverview({gameInfo:{totalWin:0,totalGame:0,rankWin:4,rankNum:3,douDiZhuTotal:4}});
  assert.equal(byLabel(result,'总胜率').value,'暂无记录');
  assert.equal(byLabel(result,'排位胜率').value,'未返回有效统计');assert.equal(byLabel(result,'斗地主胜率').value,'未返回有效统计');
  for(const value of [-1,NaN,Infinity,1.5,true,'1e3','9007199254740992',''])assert.equal(byLabel(buildWinRateOverview({gameInfo:{totalWin:value,totalGame:10}}),'总胜率').value,'未返回有效统计');
});

test('近20场独立标范围，未知码从胜率分母排除并列明数量',()=>{
  const result=buildWinRateOverview({records:records({g20:[0,'0',1,'1',2,.5,null,true,'unexpected']})},{model:2});
  const row=byLabel(result,'近20场胜率（身份场）');assert.equal(row.value,'50%');assert.match(row.detail,/2 胜 \/ 2 负；未知 5 场，已排除/);
  assert.match(result.data.notice,/不能代替完整战绩/);
  const clipped=buildWinRateOverview({records:{g20:[...Array(20).fill(0),1]}});assert.match(clipped.data.notice,/仅使用前20条/);assert.match(clipped.data.entries.at(-1).detail,/本次取 20 条/);
});

test('近20场无有效结果、空列表与缺失列表分别说明',()=>{
  assert.equal(buildWinRateOverview({records:{g20:[2,null]}}).data.entries.at(-1).value,'无可统计结果');
  assert.equal(buildWinRateOverview({records:{g20:[]}}).data.entries.at(-1).value,'暂无记录');
  assert.equal(buildWinRateOverview().data.entries.at(-1).value,'未返回记录');
  throwsCode(()=>buildWinRateOverview({},{model:5}),'INVALID_MODEL');
});

test('按完整名称匹配擅长武将四模式，保留势界神而不合并各模式胜场',()=>{
  const input=best({rank:[{Id:100,name:'势·周瑜',win:1,total:3,token:'synthetic-token',ri:{one:999}}],identity:[{Id:100,name:'势周瑜',win:9,total:10,ii:{zhu:888}}],nationalWar:[{Id:100,name:'势·周瑜',win:0,total:0}],douDiZhu:[{Id:100,name:'势·周瑜',win:1,total:2}]});
  const original=structuredClone(input),result=buildGeneralWinRate('势 周瑜',{bestGeneral:input});
  assert.deepEqual(result.data.generals.map(row=>row.label),['排位赛','身份场','国战','斗地主']);
  assert.deepEqual(result.data.generals.map(row=>row.value),['33.33%','90%','暂无记录','50%']);
  assert.match(result.data.notice,/不合并推算生涯/);assert.doesNotMatch(JSON.stringify(result),/synthetic|999|888|"ii"|"ri"/);assert.deepEqual(input,original);
  for(const name of ['周瑜','界周瑜','神周瑜'])throwsCode(()=>buildGeneralWinRate(name,{bestGeneral:input}),'GENERAL_STATS_NOT_RETURNED');
});

test('同名不同ID或同模式不一致重复数据拒绝选第一项',()=>{
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{Id:1,name:'势·周瑜',win:1,total:2},{Id:2,name:'势周瑜',win:1,total:2}]}}),'AMBIGUOUS_GENERAL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{Id:1,name:'势周瑜',win:1,total:2},{Id:1,name:'势·周瑜',win:1,total:3}]}}),'AMBIGUOUS_GENERAL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{Id:1,name:'势周瑜',win:1,total:2}],identity:[{Id:2,name:'势·周瑜',win:1,total:2}]}}),'AMBIGUOUS_GENERAL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{Id:1,name:'势周瑜',win:1,total:2},{Id:2,name:'势·周瑜',win:3,total:2}]}}),'AMBIGUOUS_GENERAL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{records:{recent:[{general:1,name:'势周瑜',win_num:1,num:2,win_rate:50},{general:2,name:'势·周瑜',win_num:3,num:2,win_rate:50}]}}),'AMBIGUOUS_GENERAL');
});

test('相同模式相同统计可去重，不改变输入',()=>{
  const row={Id:1,name:'势·周瑜',win:1,total:2};const result=buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[row,{...row}]}});
  assert.equal(result.data.generals.length,1);
});

test('优先擅长列表，近期使用统计仅在擅长列表未命中时回退',()=>{
  const recent=records({recent:[{general:100,name:'势·周瑜',win_num:3,num:4,win_rate:75,general_score:10000,phone:'synthetic-phone'}]});
  const result=buildGeneralWinRate('势周瑜',{records:recent});assert.equal(result.data.generals[0].value,'75%');
  assert.equal(result.data.scope,'官方近期使用武将统计（统计周期未标明）');assert.match(result.data.notice,/不能视作近20局或完整生涯/);
  assert.doesNotMatch(JSON.stringify(result),/10000|synthetic|phone|general_score/);
  const chosen=buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{Id:100,name:'势周瑜',win:1,total:4}]},records:recent});assert.equal(chosen.data.generals[0].value,'25%');
});

test('近期统计必须同时通过非负整数、胜场范围及百分比一致性检查',()=>{
  const row={name:'势·周瑜',general:100,win_num:1,num:3,win_rate:33};
  for(const win_rate of [33,33.3,33.33,33.333])assert.equal(buildGeneralWinRate('势周瑜',{records:{recent:[{...row,win_rate}]}}).data.generals[0].value,'33.33%');
  for(const invalid of [{win_num:-1},{num:2.5},{win_num:4},{win_rate:0.3333},{win_rate:32.5},{win_rate:101},{win_rate:null},{win_rate:undefined}])throwsCode(()=>buildGeneralWinRate('势周瑜',{records:{recent:[{...row,...invalid}]}}),'INVALID_STATS');
  assert.equal(buildGeneralWinRate('势周瑜',{records:{recent:[{...row,win_num:0,num:0,win_rate:0}]}}).data.generals[0].value,'暂无记录');
});

test('无武将记录明确不等于0，不从收藏、近20局或能力伪造',()=>{
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{favorites:[{name:'势周瑜',win:20,total:20}],ri:{one:1}},records:{g20:[0,0],recent:[{name:'周瑜',win_num:10,num:10,win_rate:100}]}}),'GENERAL_STATS_NOT_RETURNED');
  try{buildGeneralWinRate('势周瑜',{});}catch(error){assert.match(error.message,/不代表胜率为 0/);}
  for(const name of ['',null,'将'.repeat(61),'势\u0000周瑜'])throwsCode(()=>buildGeneralWinRate(name,{}),'INVALID_GENERAL_NAME');
});

test('不一致擅长统计不能被近期统计掩盖，过大列表显式拒绝',()=>{
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{name:'势周瑜',win:3,total:2}]},records:{recent:[{name:'势周瑜',win_num:1,num:2,win_rate:50}]}}),'INVALID_STATS');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{rank:Array(1001).fill({name:'势周瑜',win:1,total:2})}}),'STATS_LIMIT');
});

test('不接不支持的社区协议，输入wrapper中附加凭据不被选择',()=>{
  throwsCode(()=>buildWinRateOverview({gameInfo:{protocol:'pc-scan-v7',data:{totalWin:1,totalGame:1}}}),'UNSUPPORTED_PROTOCOL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{protocol:'pc-scan-v7',data:{}}}),'UNSUPPORTED_PROTOCOL');
  const result=buildWinRateOverview({gameInfo:{protocol:'app-qr-v1',token:'synthetic-token',data:{totalWin:1,totalGame:1}}});assert.doesNotMatch(JSON.stringify(result),/synthetic|token/);
});

test('文本与JSON导出仅选显示字段，来源不能注入凭据或外部链接',()=>{
  const result=buildGeneralWinRate('势周瑜',{bestGeneral:{rank:[{Id:10,name:'势·周瑜',win:1,total:2}]}});
  const text=formatWinRate(result,{prefix:'#移动'}).text;assert.match(text,/#移动势·周瑜胜率 导出/);assert.match(text,/排位赛：50%（1 胜 \/ 2 场）/);
  result.data.token='synthetic-token';result.token='synthetic-top';result.data.generals[0].secret='synthetic-general';result.sourceUrl='https://untrusted.invalid/?token=synthetic-url';
  const output=formatWinRate(result,{exportJson:true});assert.equal(output.file.name,'三国移动-win-rate.json');assert.doesNotMatch(output.file.data,/synthetic|secret|token|untrusted/);
  const parsed=JSON.parse(output.file.data);assert.equal(parsed.sourceUrl,'');assert.equal(parsed.data.generals[0].games,2);
});
