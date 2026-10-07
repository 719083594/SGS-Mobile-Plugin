import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {SanguoshaMobile} from '../api.mjs';
import {CommunityAuthError} from '../lib/community-auth.mjs';
import {parseCommand} from '../lib/commands.mjs';

const owner='100000001',other='100000002',privateEvent={owner,privateChat:true,imageReply:true};
const session={protocol:'app-qr-v1',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',token:'synthetic-session'};
const envelope=(kind,data)=>({kind,protocol:'app-qr-v1',data,sourceUrl:'https://wxforum.sanguosha.cn/api/user/getGameRecord'});
const gameInfo={totalWin:5,totalGame:10,rankWin:2,rankNum:5,douDiZhuWin:1,douDiZhuTotal:3};
const bestGeneral={rank:[{Id:20,name:'势·周瑜',total:10,win:7}],identity:[{Id:20,name:'势·周瑜',total:20,win:9}]};
const records={g20:[0,1,0],recent:[{general:20,name:'势·周瑜',win_num:3,num:4,win_rate:75}]};

async function workspace(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-win-rate-core-'));
  try{
    const bot=new SanguoshaMobile(root,{fetch:async()=>assert.fail('unexpected network')});
    bot.vault.set(owner,{session,identities:[]});
    const calls=[];bot.auth.queryOwn=async(kind,current,params)=>{
      assert.deepEqual(current,session);calls.push({kind,params});
      return envelope(kind,{gameInfo,bestGeneral,records}[kind]??{});
    };
    await fn(bot,calls,root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('胜率总览调用本人官方gameInfo和records并返回私密统计卡',()=>workspace(async(bot,calls)=>{
  const result=await bot.handle({...privateEvent,text:'#sgs胜率'});
  assert.equal(result.card.type,'personal');assert.equal(result.card.private,true);assert.equal(result.card.result.kind,'winRate');
  assert.deepEqual(calls,[{kind:'gameInfo',params:{}},{kind:'records',params:{model:0}}]);
  assert.match(result.text,/总胜率：50%/);assert.match(result.text,/近20场胜率/);
  assert.match(bot.help(),/#sgs胜率.*势周瑜/);
}));

test('六种武将胜率写法均走同一私密统计分支，原生资料名称不改变',()=>workspace(async(bot,calls)=>{
  for(const body of ['胜率 势周瑜','胜率势周瑜','势周瑜胜率','势周瑜 胜率','武将势周瑜胜率','武将 势·周瑜 胜率']){
    calls.length=0;const result=await bot.handle({...privateEvent,text:'#sgs'+body});
    assert.equal(result.card.result.kind,'winRate');assert.equal(result.card.private,true);
    assert.equal(result.card.result.data.generals[0].name,'势·周瑜');assert.equal(result.card.result.data.generals[0].value,'70%');
    assert.deepEqual(calls,[{kind:'bestGeneral',params:{}},{kind:'records',params:{model:0}}]);
  }
  assert.deepEqual(parseCommand('势周瑜'),{cmd:'武将',arg:'势周瑜',heroShorthand:true});
  assert.deepEqual(parseCommand('武将势周瑜'),{cmd:'武将',arg:'势周瑜'});
}));

test('胜率文字与脱敏导出后缀兼容连写形式，只导出选定统计而非原始数据',()=>workspace(async(bot,calls,root)=>{
  const before=fs.readFileSync(path.join(root,'data/sessions.enc.json'));
  const original=bot.auth.queryOwn;bot.auth.queryOwn=async(...args)=>{
    const result=await original(...args);return {...result,token:'synthetic-top-secret',data:{...result.data,phone:'synthetic-private-phone',unknown:{secret:'synthetic-nested-secret'}}};
  };
  const text=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率 文字'});assert.equal(text.card,undefined);assert.match(text.text,/70%/);
  for(const body of ['胜率 导出','胜率 势周瑜 导出','势周瑜胜率 导出','势周瑜 胜率 导出','武将势周瑜胜率 导出']){
    const output=await bot.handle({...privateEvent,text:'#sgs'+body});assert(output.file);assert.equal(output.card,undefined);
    const exported=JSON.parse(output.file.data);assert.equal(exported.kind,'winRate');assert.doesNotMatch(output.file.data,/synthetic|unknown|phone|secret|token/);
  }
  assert.deepEqual(fs.readFileSync(path.join(root,'data/sessions.enc.json')),before);
}));

test('群聊、混合上下文、其他QQ和关闭个人查询都先拒绝，不调用API或修改授权',()=>workspace(async(bot,calls,root)=>{
  const before=fs.readFileSync(path.join(root,'data/sessions.enc.json'));
  for(const body of ['胜率','势周瑜胜率','武将势周瑜胜率','胜率 势周瑜 导出']){
    for(const context of [{group_id:'200000001'},{privateChat:false},{isGroup:true}])assert.match((await bot.handle({...privateEvent,...context,text:'#sgs'+body})).text,/私聊/);
    assert.match((await bot.handle({...privateEvent,owner:other,text:'#sgs'+body})).text,/请先.*社区授权/);
  }
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),personalDataEnabled:false}));
  assert.match((await bot.handle({...privateEvent,text:'#sgs胜率'})).text,/管理员已关闭/);
  assert.match((await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'})).text,/管理员已关闭/);
  assert.equal(calls.length,0);assert.deepEqual(fs.readFileSync(path.join(root,'data/sessions.enc.json')),before);
}));

test('胜率后缀不改变既有账户命令边界，不能借重叠名称启动授权或写账号',()=>workspace(async(bot,calls,root)=>{
  const before=fs.readFileSync(path.join(root,'data/sessions.enc.json'));
  bot.auth.start=async()=>assert.fail('must not start auth');bot.auth.logout=async()=>assert.fail('must not revoke auth');
  for(const body of ['武将收藏势周瑜胜率','社区授权胜率','退出授权势周瑜胜率','绑定官号胜率','解绑官号胜率','官号登录势周瑜胜率','扫码状态势周瑜胜率'])assert.match((await bot.handle({...privateEvent,text:'#sgs'+body})).text,/未识别/);
  assert.deepEqual(parseCommand('绑定 官号 123456'),{cmd:'绑定',arg:'官号 123456'});
  assert.deepEqual(parseCommand('社区授权 微信'),{cmd:'社区授权',arg:'微信'});
  assert.deepEqual(parseCommand('武将收藏'),{cmd:'武将收藏',arg:''});
  assert.equal(calls.length,0);assert.deepEqual(fs.readFileSync(path.join(root,'data/sessions.enc.json')),before);
}));

test('单接口临时失败可降级到官方成功数据，明确范围而不虚构缺失值',()=>workspace(async(bot,calls)=>{
  const original=bot.auth.queryOwn;bot.auth.queryOwn=async(...args)=>{if(args[0]==='gameInfo')throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');return original(...args);};
  const overview=await bot.handle({...privateEvent,text:'#sgs胜率'});assert(overview.card);assert.match(overview.text,/总胜率：未返回有效统计/);assert.match(overview.text,/部分官方统计接口暂不可用/);
  bot.auth.queryOwn=async(...args)=>{if(args[0]==='bestGeneral')throw new CommunityAuthError('NETWORK_ERROR','暂时无法连接官方三国咸话社区。');return original(...args);};
  const general=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'});assert(general.card);assert.equal(general.card.result.data.generals[0].value,'75%');assert.match(general.text,/官方近期使用武将统计/);assert.match(general.text,/部分官方统计接口暂不可用/);
}));

test('另一接口成功也不能吞掉授权失效、角色未关联或协议不支持错误',()=>workspace(async(bot)=>{
  const original=bot.auth.queryOwn;
  for(const [code,message] of [['AUTH_EXPIRED','官方社区会话已过期，请重新扫码授权。'],['ROLE_LINK_REQUIRED','官方社区尚未关联角色。'],['QUERY_UNSUPPORTED','此社区授权协议未提供所需查询。']]){
    bot.auth.queryOwn=async(...args)=>{if(args[0]==='records')throw new CommunityAuthError(code,message);return original(...args);};
    for(const text of ['#sgs胜率','#sgs势周瑜胜率']){const result=await bot.handle({...privateEvent,text});assert.equal(result.card,undefined);assert.equal(result.text,message);}
  }
}));

test('双失败保留官方错误，未命中不显示0%；部分失败且未命中提示重试',()=>workspace(async(bot)=>{
  bot.auth.queryOwn=async()=>{throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');};
  const failed=await bot.handle({...privateEvent,text:'#sgs胜率'});assert.equal(failed.card,undefined);assert.match(failed.text,/官方社区请求超时/);
  bot.auth.queryOwn=async kind=>envelope(kind,{});
  const missing=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'});assert.equal(missing.card,undefined);assert.match(missing.text,/未返回.*不代表胜率为 0/);
  bot.auth.queryOwn=async kind=>{if(kind==='records')throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');return envelope(kind,{});};
  const partial=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'});assert.equal(partial.card,undefined);assert.match(partial.text,/另一统计接口暂不可用.*不代表胜率为 0/);
}));

test('战绩追加独立胜率摘要保留官方data及模式，导出不混入派生元数据',()=>workspace(async(bot,calls)=>{
  const data={...records,future:{keep:7}},original=structuredClone(data);
  bot.auth.queryOwn=async(kind,current,params)=>{calls.push({kind,params});return envelope(kind,kind==='records'?data:gameInfo);};
  const result=await bot.handle({...privateEvent,text:'#sgs战绩 2'});
  assert.equal(result.card.result.data,data);assert.deepEqual(data,original);assert.equal(result.card.result.winRateSummary.kind,'winRate');
  assert.match(result.card.result.winRateSummary.data.entries.at(-1).label,/身份场/);
  assert.deepEqual(calls,[{kind:'records',params:{model:2}},{kind:'gameInfo',params:{}}]);
  const output=await bot.handle({...privateEvent,text:'#sgs战绩 2 导出'});const exported=JSON.parse(output.file.data);
  assert.deepEqual(exported.data,original);assert.equal(exported.winRateSummary,undefined);assert.doesNotMatch(output.file.data,/"entries"|"generals"/);
}));

test('战绩额外总场次临时失败保留原战绩，授权失败则明确拒绝',()=>workspace(async(bot)=>{
  bot.auth.queryOwn=async kind=>{if(kind==='gameInfo')throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');return envelope(kind,records);};
  const partial=await bot.handle({...privateEvent,text:'#sgs战绩'});assert(partial.card);assert.match(partial.card.result.winRateSummary.data.notice,/总场次统计暂不可用/);
  bot.auth.queryOwn=async kind=>{if(kind==='gameInfo')throw new CommunityAuthError('AUTH_EXPIRED','官方社区授权已过期，请重新扫码。');return envelope(kind,records);};
  const expired=await bot.handle({...privateEvent,text:'#sgs战绩'});assert.equal(expired.card,undefined);assert.match(expired.text,/授权已过期/);
}));

test('自定义前缀有效；畸形胜率参数在调用接口前拒绝',()=>workspace(async(bot,calls)=>{
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),prefix:'#test'}));
  assert.equal((await bot.handle({...privateEvent,text:'#sgs胜率'})).handled,false);
  const result=await bot.handle({...privateEvent,text:'#test势周瑜胜率'});assert.equal(result.card.result.kind,'winRate');assert.match(result.text,/#test势·周瑜胜率 导出/);
  calls.length=0;for(const text of ['#test胜率 势\n周瑜','#test胜率 https://invalid.example','#test胜率 123'])assert.match((await bot.handle({...privateEvent,text})).text,/用法/);
  assert.equal(calls.length,0);
}));
