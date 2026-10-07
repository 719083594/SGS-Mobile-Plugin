import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWinRateOverview,buildGeneralWinRate,formatWinRate,WinRateError} from '../lib/win-rate.mjs';

const sources={gameInfo:'https://api-xh.sanguosha.cn/user/generalGameInfo',records:'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',recent:'https://api-xh.sanguosha.cn/user/gameRecordList/total',bestGeneral:'https://api-xh.sanguosha.cn/user/gameBestGeneralNew'};
const wire=[0,4,1,2,3];
const envelope=(kind,data,model=0)=>({kind,data,protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,sourceUrl:sources[kind],...(kind==='gameInfo'?{}:{query:{model,wireMode:wire[model],...(kind==='recent'?{page:1,pageSize:10}:{})}})});
const best=(list,model=0)=>envelope('bestGeneral',{list},model);
const general=(changes={})=>({total:3,win:1,info:{id:100,name:'势·周瑜',country:3,country2:0,url:'https://imagexh.sanguosha.com/synthetic.jpg',isHave:true},...changes});
const records=(data={},model=0)=>envelope('records',{totalGames:16,winGames:9,rate:'0.5625',rates:[],...data},model);
const byLabel=(result,label)=>result.data.entries.find(row=>row.label===label);
const throwsCode=(fn,code)=>assert.throws(fn,error=>error instanceof WinRateError&&error.code===code);

test('现代当前模式胜场与场次计算总览，忽略身份与能力等非显示字段且不修改输入',()=>{
  const input=records({token:'synthetic-token',nick:'synthetic-name',ri:{one:9999}}),original=structuredClone(input);
  const result=buildWinRateOverview({records:input});
  assert.deepEqual(byLabel(result,'总胜率'),{label:'总胜率',value:'56.25%',detail:'9 胜 / 16 场'});
  assert.equal(result.protocol,'pc-scan-v7');assert.equal(result.sourceUrl,sources.records);
  assert.doesNotMatch(JSON.stringify(result),/synthetic|9999|nick|token/);assert.deepEqual(input,original);
});

test('五种公开模式严格核对新版 wire mode，不拼其他模式统计',()=>{
  for(const [model,label] of [[0,'全部模式'],[1,'排位赛'],[2,'身份场'],[3,'国战'],[4,'斗地主']]){
    const result=buildWinRateOverview({records:records({},model)},{model});
    assert.equal(result.data.gameMode,label);assert.equal(result.data.model,model);assert.deepEqual(result.query,{model,wireMode:wire[model]});
    assert.equal(result.data.entries.length,1);assert.equal(result.data.entries[0].value,'56.25%');
    if(model)assert.match(formatWinRate(result).text,new RegExp(label+' 导出'));
  }
  throwsCode(()=>buildWinRateOverview({records:records({},1)},{model:4}),'SOURCE_CHANGED');
  const wrong=records({},1);wrong.query.wireMode=1;
  throwsCode(()=>buildWinRateOverview({records:wrong},{model:1}),'SOURCE_CHANGED');
  for(const model of [5,-1,1.1,true,'01','1e0',{},[]])throwsCode(()=>buildWinRateOverview({},{model}),'INVALID_MODEL');
});

test('旧授权、原始未证明对象、错误source与缺少scope不被现代数据接受',()=>{
  throwsCode(()=>buildWinRateOverview({records:{protocol:'app-qr-v1',data:{g20:[0]}}}),'UNSUPPORTED_PROTOCOL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:{protocol:'app-qr-v1',data:{rank:[]}}}),'UNSUPPORTED_PROTOCOL');
  throwsCode(()=>buildWinRateOverview({records:{winGames:1,totalGames:2}}),'UNSUPPORTED_PROTOCOL');
  for(const patch of [{sourceUrl:'https://untrusted.invalid/'},{scope:undefined},{communityAuthenticated:false},{gameVersion:'another-game'},{kind:'summary'},{query:{model:0}}]){
    throwsCode(()=>buildWinRateOverview({records:{...records(),...patch}}),'SOURCE_CHANGED');
  }
});

test('零场可展示暂无记录；不一致或非法现代场次不被汇总fallback掩盖',()=>{
  assert.equal(buildWinRateOverview({records:records({winGames:0,totalGames:0})}).data.entries[0].value,'暂无记录');
  const gameInfo=envelope('gameInfo',{totalWin:1,totalGame:2});
  for(const value of [-1,NaN,Infinity,1.5,true,'1e3','9007199254740992',''])throwsCode(()=>buildWinRateOverview({records:records({winGames:value}),gameInfo}),'SOURCE_CHANGED');
  throwsCode(()=>buildWinRateOverview({records:records({winGames:17}),gameInfo}),'SOURCE_CHANGED');
});

test('现代汇总只在当前战绩端点缺失时降级，用核实字段且标明范围',()=>{
  const gameInfo=envelope('gameInfo',{totalWin:5,totalGame:10,rankWin:2,rankNum:3,identityWin:1,identity:4,douDiZhuWin:0,douDiZhuTotal:7,nationalWarWin:1,nationalWar:1});
  for(const [model,value] of [[0,'50%'],[1,'66.67%'],[2,'25%'],[4,'0%']]){
    const result=buildWinRateOverview({gameInfo},{model});assert.equal(result.data.entries[0].value,value);assert.match(result.data.notice,/官方汇总场次/);assert.equal(result.sourceUrl,sources.gameInfo);
  }
  assert.equal(buildWinRateOverview({gameInfo},{model:3}).data.entries[0].value,'未返回有效统计');
  assert.equal(buildWinRateOverview().data.entries[0].value,'未返回有效统计');
  assert.equal(buildWinRateOverview({gameInfo,records:records()}).data.entries[0].value,'56.25%');
});

test('官方分项rate为0到1的比例，仅核实角色名称可显示且不当作场次',()=>{
  const input=records({rates:[{name:'主公',rate:'0.5'},{name:'忠臣',rate:0},{name:'反贼',rate:'1.0'},{name:'内奸',rate:'0.3333'},{name:'synthetic-secret',rate:1},{name:'主公',rate:1},{name:'内奸',rate:33}]},2);
  const result=buildWinRateOverview({records:input},{model:2});
  assert.deepEqual(result.data.entries.slice(1).map(row=>[row.label,row.value]),[['主公胜率','50%'],['忠臣胜率','0%'],['反贼胜率','100%'],['内奸胜率','33.33%']]);
  assert.match(result.data.entries[1].detail,/未提供该分项场次/);assert.match(result.data.notice,/分项未显示/);assert.doesNotMatch(JSON.stringify(result),/synthetic/);
  for(const rates of [{name:'主公',rate:1},Array(21).fill({name:'主公',rate:1})])throwsCode(()=>buildWinRateOverview({records:records({rates})}),'SOURCE_CHANGED');
});

test('近期仅按安全DTO outcomeCode统计本页最多10条，未知排除，忽略result文字',()=>{
  const rows=[{outcomeCode:0,result:'失败',token:'synthetic-secret'},{outcomeCode:1,result:'胜利'},{outcomeCode:null},{outcomeCode:'0'},{outcomeCode:2}];
  const recent=envelope('recent',rows,2);recent.query.page=2;
  const result=buildWinRateOverview({records:records({},2),recent},{model:2}),row=result.data.entries.at(-1);
  assert.equal(row.value,'50%');assert.match(row.detail,/1 胜 \/ 1 负；未知 3 场，已排除；请求第 2 页，本批取前 5 条/);
  assert.match(result.data.notice,/前10条/);assert.doesNotMatch(JSON.stringify(result),/synthetic|近20/);
  assert.equal(buildWinRateOverview({recent:envelope('recent',[])}).data.entries.at(-1).value,'暂无记录');
  assert.equal(buildWinRateOverview({recent:envelope('recent',[{outcomeCode:null}])}).data.entries.at(-1).value,'无可统计结果');
});

test('近期原始list、超限页长或不一致模式元数据拒绝，不能冒充当前模式样本',()=>{
  throwsCode(()=>buildWinRateOverview({recent:envelope('recent',{list:[{result:0}]})}),'SOURCE_CHANGED');
  throwsCode(()=>buildWinRateOverview({recent:envelope('recent',Array(101).fill({outcomeCode:0}))}),'SOURCE_CHANGED');
  throwsCode(()=>buildWinRateOverview({recent:envelope('recent',[null])}),'SOURCE_CHANGED');
  throwsCode(()=>buildWinRateOverview({recent:envelope('recent',[],1)},{model:2}),'SOURCE_CHANGED');
  for(const patch of [{page:0},{page:1001},{pageSize:20}]){
    const value=envelope('recent',[]);Object.assign(value.query,patch);throwsCode(()=>buildWinRateOverview({recent:value}),'SOURCE_CHANGED');
  }
});
test('larger bounded official batches calculate a labelled ten-record sample without changing formal win rate',()=>{
  const recent=envelope('recent',[...Array(10).fill({outcomeCode:0}),...Array(10).fill({outcomeCode:1})]);
  const input=structuredClone(recent),result=buildWinRateOverview({records:records({winGames:3,totalGames:10}),recent});
  assert.equal(result.data.entries[0].value,'30%');assert.equal(result.data.entries.at(-1).value,'100%');
  assert.match(result.data.entries.at(-1).detail,/取前 10 条/);assert.deepEqual(recent,input);
  recent.data[19]=null;throwsCode(()=>buildWinRateOverview({recent}),'SOURCE_CHANGED');
});

test('新嵌套info精确名称匹配保留势界神前缀，只有当前模式且不读能力或个人字段',()=>{
  const input=best([general({token:'synthetic-token',ii:{zhu:9999}})],1),original=structuredClone(input);
  const result=buildGeneralWinRate('势 周瑜',{bestGeneral:input},{model:1});
  assert.equal(result.data.generals.length,1);assert.equal(result.data.generals[0].value,'33.33%');assert.equal(result.data.generals[0].mode,'rank');assert.equal(result.data.generals[0].label,'排位赛');
  assert.match(result.data.notice,/仅返回部分擅长武将/);assert.doesNotMatch(JSON.stringify(result),/synthetic|9999|url|isHave|country|"ii"/);assert.deepEqual(input,original);
  for(const name of ['周瑜','界周瑜','神周瑜'])throwsCode(()=>buildGeneralWinRate(name,{bestGeneral:input},{model:1}),'GENERAL_STATS_NOT_RETURNED');
});

test('全部模式使用new endpoint当前全部模式统计，不合并旧四数组',()=>{
  const result=buildGeneralWinRate('势周瑜',{bestGeneral:best([general()])});assert.equal(result.data.generals[0].mode,'all');assert.equal(result.data.generals[0].label,'全部模式');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:envelope('bestGeneral',{rank:[{Id:100,name:'势周瑜',win:1,total:2}]})}),'SOURCE_CHANGED');
});

test('同名不同ID歧义与同ID冲突拒绝，相同统计可去重',()=>{
  const a=general(),b=general({info:{...a.info,id:101}});
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best([a,b])}),'AMBIGUOUS_GENERAL');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best([a,general({total:4})])}),'AMBIGUOUS_GENERAL');
  assert.equal(buildGeneralWinRate('势周瑜',{bestGeneral:best([a,structuredClone(a)])}).data.generals.length,1);
  b.win=4;throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best([a,b])}),'AMBIGUOUS_GENERAL');
});

test('武将计数严格核验，无记录不等于0；旧recent不能作为回退',()=>{
  for(const patch of [{win:4},{win:-1},{total:1.1},{win:true},{win:'1e0'}])throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best([general(patch)])}),'INVALID_STATS');
  assert.equal(buildGeneralWinRate('势周瑜',{bestGeneral:best([general({win:0,total:0})])}).data.generals[0].value,'暂无记录');
  const records={recent:[{name:'势周瑜',win_num:1,num:1,win_rate:100}]};
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best([]),records}),'GENERAL_STATS_NOT_RETURNED');
  try{buildGeneralWinRate('势周瑜',{bestGeneral:best([])})}catch(error){assert.match(error.message,/不代表胜率为 0/)}
});

test('武将数据结构错误、超大列表、模式不符与无效输入显式拒绝',()=>{
  for(const list of [[{}],[general({info:{id:0,name:'势周瑜'}})],[general({info:{id:1,name:''}})]])throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best(list)}),'SOURCE_CHANGED');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best(Array(1001).fill(general()))}),'STATS_LIMIT');
  throwsCode(()=>buildGeneralWinRate('势周瑜',{bestGeneral:best([general()],1)},{model:2}),'SOURCE_CHANGED');
  for(const name of ['',null,'将'.repeat(61),'势\u0000周瑜'])throwsCode(()=>buildGeneralWinRate(name,{bestGeneral:best([])}),'INVALID_GENERAL_NAME');
});

test('文本和JSON只选择当前展示字段，不导出响应附加信息或不可信source',()=>{
  const result=buildGeneralWinRate('势周瑜',{bestGeneral:best([general()],1)},{model:1});
  assert.match(formatWinRate(result,{prefix:'#移动'}).text,/#移动势·周瑜胜率 排位赛 导出/);
  result.token='synthetic-top';result.data.secret='synthetic-secret';result.data.generals[0].cookie='synthetic-cookie';result.sourceUrl='https://untrusted.invalid/?token=synthetic';
  const output=formatWinRate(result,{exportJson:true});assert.equal(output.file.name,'三国移动-win-rate.json');assert.doesNotMatch(output.file.data,/synthetic|secret|cookie|token|untrusted/);
  const parsed=JSON.parse(output.file.data);assert.equal(parsed.protocol,'pc-scan-v7');assert.equal(parsed.sourceUrl,'');assert.equal(parsed.data.generals[0].games,3);
  throwsCode(()=>formatWinRate({...result,protocol:'app-qr-v1'}),'INVALID_STATS');
});
