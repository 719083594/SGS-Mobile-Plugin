import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {SanguoshaMobile} from '../api.mjs';
import {CommunityAuthError} from '../lib/community-auth.mjs';
import {parseCommand,parseWinRateArgs,parseGameplayArgs} from '../lib/commands.mjs';

const owner='100000001',other='100000002',privateEvent={owner,privateChat:true,imageReply:true};
const session={protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',token:'synthetic-session',communityUserId:'100000003'};
const wire=[0,4,1,2,3];
const sources={gameInfo:'https://api-xh.sanguosha.cn/user/generalGameInfo',records:'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',recent:'https://api-xh.sanguosha.cn/user/gameRecordList/total',bestGeneral:'https://api-xh.sanguosha.cn/user/gameBestGeneralNew',force:'https://api-xh.sanguosha.cn/user/gameForce',abilities:'https://api-xh.sanguosha.cn/user/gameGeneralAbilities'};
const envelope=(kind,data,params={})=>({kind,protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,data,sourceUrl:sources[kind],...(['records','recent','bestGeneral','force'].includes(kind)?{query:{model:params.model??0,wireMode:wire[params.model??0],...(kind==='recent'?{page:params.page??1,pageSize:10}:{})}}:{})});
const gameInfo={totalWin:5,totalGame:10,rankWin:2,rankNum:5,identityWin:3,identity:8,douDiZhuWin:1,douDiZhuTotal:3};
const general={total:10,win:7,info:{id:20,name:'势·周瑜',country:3,country2:0,url:'https://sjpubicres.sanguosha.cn/release/character_heads/synthetic.png',star:3,maxStar:5}};
const bestGeneral={list:[general]};
const records={winGames:5,totalGames:10,rate:'0.5',mvp:2,rates:[]};
const recent=(model=0)=>({list:[0,1,0].map((result,index)=>({mode:String(wire[model]||4),modeName:['排位赛','排位赛','身份场','国战','斗地主'][model],beginTime:1750000000+index,result,mvp:index===0?1:0,run:0,myGeneralAvatar:['https://sjpubicres.sanguosha.cn/release/character_heads/synthetic.png'],players:[{isMe:true,general:['势·周瑜'],nick:'synthetic-self-name'},{isMe:false,general:['另一武将'],nick:'synthetic-other-name'}]}))});
const fixture=(kind,params={})=>({gameInfo,bestGeneral:(params.model??0)===3?{list:[]}:bestGeneral,records,recent:recent(params.model??0),force:{game_force:{totalForce:100,paiweiForce:20},game_total:10,game_win:5},abilities:{ri:{one:1,two:2,three:3,four:4},riTotal:{one:2,two:3,three:4,four:5}}}[kind]??{});

async function workspace(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-win-rate-core-'));
  try{
    const bot=new SanguoshaMobile(root,{fetch:async()=>assert.fail('unexpected network')});
    bot.vault.set(owner,{session,identities:[]});
    const calls=[];bot.auth.queryOwn=async(kind,current,params={})=>{
      assert.deepEqual(current,session);calls.push({kind,params});return envelope(kind,structuredClone(fixture(kind,params)),params);
    };
    await fn(bot,calls,root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('现代胜率总览调用游戏资料、当前模式正式战绩与近期样本并返回私密统计卡',()=>workspace(async(bot,calls)=>{
  const result=await bot.handle({...privateEvent,text:'#sgs胜率'});
  assert.equal(result.card.type,'personal');assert.equal(result.card.private,true);assert.equal(result.card.result.kind,'winRate');assert.equal(result.card.result.protocol,'pc-scan-v7');
  assert.deepEqual(calls,[{kind:'gameInfo',params:{}},{kind:'records',params:{model:0}},{kind:'recent',params:{model:0,page:1}}]);
  assert.match(result.text,/总胜率：50%/);assert.match(result.text,/近期本页样本胜率/);assert.doesNotMatch(result.text,/近20/);
  assert.match(bot.help(),/#sgs胜率.*势周瑜/);
}));

test('六种武将胜率写法只查询当前模式新版擅长列表，原生资料名称不改变',()=>workspace(async(bot,calls)=>{
  for(const body of ['胜率 势周瑜','胜率势周瑜','势周瑜胜率','势周瑜 胜率','武将势周瑜胜率','武将 势·周瑜 胜率']){
    calls.length=0;const result=await bot.handle({...privateEvent,text:'#sgs'+body});
    assert.equal(result.card.result.kind,'winRate');assert.equal(result.card.private,true);
    assert.equal(result.card.result.data.generals[0].name,'势·周瑜');assert.equal(result.card.result.data.generals[0].value,'70%');
    assert.deepEqual(calls,[{kind:'bestGeneral',params:{model:0}}]);
  }
  assert.deepEqual(parseCommand('势周瑜'),{cmd:'武将',arg:'势周瑜',heroShorthand:true});
  assert.deepEqual(parseCommand('武将势周瑜'),{cmd:'武将',arg:'势周瑜'});
}));

test('胜率文字与脱敏导出只选当前统计字段，授权密文保持不变',()=>workspace(async(bot,calls,root)=>{
  const before=fs.readFileSync(path.join(root,'data/sessions.enc.json'));
  const original=bot.auth.queryOwn;bot.auth.queryOwn=async(...args)=>{
    const result=await original(...args);return {...result,token:'synthetic-top-secret',data:{...result.data,phone:'synthetic-private-phone',unknown:{secret:'synthetic-nested-secret'}}};
  };
  const text=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率 文字'});assert.equal(text.card,undefined);assert.match(text.text,/70%/);
  // Overview's recent response has its own strict raw schema, so keep its list
  // object intact while adding synthetic fields, as the real API may do.
  for(const body of ['胜率 导出','胜率 势周瑜 导出','势周瑜胜率 导出','势周瑜 胜率 导出','武将势周瑜胜率 导出']){
    const output=await bot.handle({...privateEvent,text:'#sgs'+body});assert(output.file);assert.equal(output.card,undefined);
    const exported=JSON.parse(output.file.data);assert.equal(exported.kind,'winRate');assert.equal(exported.protocol,'pc-scan-v7');assert.doesNotMatch(output.file.data,/synthetic|unknown|phone|secret|token/);
  }
  assert.deepEqual(fs.readFileSync(path.join(root,'data/sessions.enc.json')),before);
}));

test('群内可展示调用者本人统计，其他QQ、群导出与个人查询关闭先拒绝',()=>workspace(async(bot,calls,root)=>{
  const before=fs.readFileSync(path.join(root,'data/sessions.enc.json'));
  for(const body of ['胜率','势周瑜胜率','武将势周瑜胜率']){
    for(const context of [{group_id:'200000001'},{privateChat:false},{isGroup:true}]){
      const result=await bot.handle({...privateEvent,...context,text:'#sgs'+body});
      assert.equal(result.card.private,true);assert.deepEqual(result.card.share,{scope:'own-gameplay',owner});
      assert.equal(result.card.result.kind,'winRate');assert.doesNotMatch(result.text,/导出|来源：/);
    }
    assert.match((await bot.handle({...privateEvent,owner:other,text:'#sgs'+body})).text,/请先.*(?:登录|社区授权)/);
  }
  calls.length=0;
  for(const body of ['胜率 导出','胜率 势周瑜 导出','势周瑜胜率 排位 导出'])assert.match((await bot.handle({...privateEvent,group_id:'200000001',text:'#sgs'+body})).text,/导出.*私聊/);
  assert.match((await bot.handle({...privateEvent,user_id:other,group_id:'200000001',text:'#sgs胜率'})).text,/请先.*(?:登录|社区授权)/);
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),personalDataEnabled:false}));
  assert.match((await bot.handle({...privateEvent,text:'#sgs胜率'})).text,/管理员已关闭/);
  assert.match((await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'})).text,/管理员已关闭/);
  assert.equal(calls.length,0);assert.deepEqual(fs.readFileSync(path.join(root,'data/sessions.enc.json')),before);
}));

test('模式名数字与连写统一解析，派生武将名称不包含模式词',()=>{
  const names=['全部','排位','身份','国战','斗地主'];
  for(const [model,mode] of names.entries()){
    for(const body of ['势周瑜胜率'+mode,'势周瑜 胜率 '+mode,'胜率 势周瑜 '+mode,'武将势周瑜胜率 '+mode,'武将胜率 势周瑜 '+mode]){
      const parsed=parseCommand(body);assert.equal(parsed.cmd,'胜率');const args=parseWinRateArgs(parsed.arg);assert.equal(args.name,'势周瑜');assert.equal(args.model,model);assert.equal(args.modeExplicit,true);
    }
    assert.equal(parseWinRateArgs(mode).model,model);assert.equal(parseWinRateArgs(String(model)).model,model);
  }
  assert.equal(parseWinRateArgs('势·周瑜 排位 导出').exportJson,true);
  assert.deepEqual(parseGameplayArgs('身份 2',{recent:true,modeAllowed:true}),{model:2,gameMode:'身份场',page:2,exportJson:false});
  for(const body of ['势周瑜 排位 身份','势周瑜 123456','@100000002','势\n周瑜','势周瑜 排位 导出 更多'])assert.throws(()=>parseWinRateArgs(body));
});

test('武将与总览传递同一公开模式，API错模式不能被其他成功数据掩盖',()=>workspace(async(bot,calls)=>{
  for(const body of ['势周瑜胜率排位','势周瑜胜率 排位','胜率 势周瑜 排位','武将势周瑜胜率 1']){
    calls.length=0;const result=await bot.handle({...privateEvent,text:'#sgs'+body});
    assert.equal(result.card.params.model,1);assert.equal(result.card.params.gameMode,'排位赛');assert.equal(result.card.params.name,'势周瑜');
    assert.deepEqual(result.card.result.data.generals.map(row=>row.mode),['rank']);assert.deepEqual(calls,[{kind:'bestGeneral',params:{model:1}}]);
  }
  calls.length=0;const overview=await bot.handle({...privateEvent,text:'#sgs胜率 排位'});
  assert.deepEqual(overview.card.result.data.entries.map(row=>row.label),['排位赛胜率','近期本页样本胜率（排位赛）']);
  assert.deepEqual(calls,[{kind:'gameInfo',params:{}},{kind:'records',params:{model:1}},{kind:'recent',params:{model:1,page:1}}]);
  assert.match((await bot.handle({...privateEvent,text:'#sgs势周瑜胜率 国战'})).text,/未返回.*国战.*不代表胜率为 0/);
  const original=bot.auth.queryOwn;bot.auth.queryOwn=async(...args)=>{const result=await original(...args);if(args[0]==='records')result.query.wireMode=1;return result;};
  const changed=await bot.handle({...privateEvent,text:'#sgs胜率 排位'});assert.equal(changed.card,undefined);assert.match(changed.text,/结构发生变化/);
}));

test('群内战绩等只传选定本人统计，不泄露对手或未知字段，所有导出仍需私聊',()=>workspace(async(bot,calls)=>{
  const sensitive={nick:'private-nick',nick_name:'private-name',token:'private-token',uid:999999999,unknown:{secret:'private-secret'},phone:'private-phone'};
  bot.auth.queryOwn=async(kind,current,params={})=>{
    assert.deepEqual(current,session);calls.push({kind,params});const data=structuredClone(fixture(kind,params));
    Object.assign(data,sensitive);return envelope(kind,data,params);
  };
  for(const body of ['战绩 排位','近期战绩 身份 2','将力','能力','擅长武将']){
    for(const suffix of ['', ' 文字']){
      const result=await bot.handle({...privateEvent,user_id:owner,group_id:'200000001',text:'#sgs'+body+suffix});
      assert.equal(result.file,undefined);assert.doesNotMatch(JSON.stringify(result),/private-nick|private-name|private-token|private-secret|private-phone|999999999|synthetic-other-name|另一武将/);
      assert.doesNotMatch(result.text,/导出|JSON|来源：/);
      if(!suffix){
        assert.equal(result.card.private,true);assert.deepEqual(result.card.share,{scope:'own-gameplay',owner});
        const recentData=result.card.result.kind==='recent'?result.card.result.data:result.card.result.recentRecords?.data;
        if(recentData){assert.equal(recentData[0].mvp,true);assert.equal(recentData[0].run,false);assert.deepEqual(recentData[0].general_names,['势·周瑜']);}
        if(body==='能力')assert.deepEqual(result.card.result.data.riTotal,{one:2,two:3,three:4,four:5});
      }
      else assert.equal(result.card,undefined);
    }
  }
  calls.length=0;
  for(const body of ['资产','个人资料','游戏资料','我的皮肤','我的武将','账户','社区授权','扫码状态','退出授权','绑定 官号 123456','解绑','胜率 导出','战绩 1 导出','近期战绩 1 1 导出','将力 导出','能力 导出','擅长武将 导出','战绩 1 100000002','近期战绩 1 2 100000002','将力 100000002']){
    const result=await bot.handle({...privateEvent,group_id:'200000001',text:'#sgs'+body});assert.equal(result.card,undefined);assert.equal(result.file,undefined);
  }
  assert.equal(calls.length,0);
}));

test('群空统计和长度限制不自动导出文件或声称生成JSON',()=>workspace(async(bot)=>{
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),maxReplyChars:500,maxItems:20}));
  bot.auth.queryOwn=async(kind,current,params={})=>envelope(kind,kind==='records'?{...records}:kind==='recent'?{list:[]}:kind==='bestGeneral'?{list:[]}:kind==='gameInfo'?gameInfo:{},params);
  for(const body of ['战绩','将力','能力','擅长武将','近期战绩']){
    const result=await bot.handle({...privateEvent,group_id:'200000001',text:'#sgs'+body+' 文字'});
    assert.equal(result.file,undefined);assert.equal(result.card,undefined);assert(result.text.length<=500);assert.doesNotMatch(result.text,/JSON|导出|已生成.*文件/);
  }
}));

test('胜率后缀不能借账户重叠名称启动授权或写入账号',()=>workspace(async(bot,calls,root)=>{
  const before=fs.readFileSync(path.join(root,'data/sessions.enc.json'));
  bot.auth.start=async()=>assert.fail('must not start auth');bot.auth.logout=async()=>assert.fail('must not revoke auth');
  for(const body of ['武将收藏势周瑜胜率','社区授权胜率','退出授权势周瑜胜率','绑定官号胜率','解绑官号胜率','官号登录势周瑜胜率','扫码状态势周瑜胜率'])assert.match((await bot.handle({...privateEvent,text:'#sgs'+body})).text,/未识别|已移除/);
  assert.deepEqual(parseCommand('绑定 官号 123456'),{cmd:'绑定',arg:'官号 123456'});assert.deepEqual(parseCommand('社区授权 微信'),{cmd:'社区授权',arg:'微信'});
  assert.equal(calls.length,0);assert.deepEqual(fs.readFileSync(path.join(root,'data/sessions.enc.json')),before);
}));

test('聚合接口暂时失败仍展示当前正式统计，擅长失败不再回退旧近期数据',()=>workspace(async(bot,calls)=>{
  const original=bot.auth.queryOwn;bot.auth.queryOwn=async(...args)=>{if(args[0]==='gameInfo')throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');return original(...args);};
  const overview=await bot.handle({...privateEvent,text:'#sgs胜率'});assert(overview.card);assert.match(overview.text,/总胜率：50%/);assert.match(overview.text,/部分官方统计接口暂不可用/);
  calls.length=0;bot.auth.queryOwn=async(...args)=>{calls.push({kind:args[0],params:args[2]});throw new CommunityAuthError('NETWORK_ERROR','暂时无法连接官方三国咸话社区。');};
  const general=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'});assert.equal(general.card,undefined);assert.match(general.text,/无法连接/);assert.deepEqual(calls,[{kind:'bestGeneral',params:{model:0}}]);
}));

test('部分成功不能吞掉授权失效、未关联角色或协议错误',()=>workspace(async(bot)=>{
  const original=bot.auth.queryOwn;
  for(const [code,message] of [['AUTH_EXPIRED','官方社区会话已过期，请重新扫码授权。'],['ROLE_LINK_REQUIRED','官方社区尚未关联角色。'],['QUERY_UNSUPPORTED','此社区授权协议未提供所需查询。']]){
    bot.auth.queryOwn=async(...args)=>{if(['records','bestGeneral'].includes(args[0]))throw new CommunityAuthError(code,message);return original(...args);};
    for(const text of ['#sgs胜率','#sgs势周瑜胜率']){const result=await bot.handle({...privateEvent,text});assert.equal(result.card,undefined);assert.equal(result.text,message);}
  }
}));

test('全部失败保留官方错误，空擅长列表明确不等于0，错误source不降级',()=>workspace(async(bot)=>{
  bot.auth.queryOwn=async()=>{throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');};
  const failed=await bot.handle({...privateEvent,text:'#sgs胜率'});assert.equal(failed.card,undefined);assert.match(failed.text,/官方社区请求超时/);
  bot.auth.queryOwn=async(kind,current,params={})=>envelope(kind,{list:[]},params);
  const missing=await bot.handle({...privateEvent,text:'#sgs势周瑜胜率'});assert.equal(missing.card,undefined);assert.match(missing.text,/未返回.*不代表胜率为 0/);
  bot.auth.queryOwn=async(kind,current,params={})=>({...envelope(kind,fixture(kind,params),params),sourceUrl:'https://wxforum.sanguosha.cn/api/user/getGameRecord'});
  const old=await bot.handle({...privateEvent,text:'#sgs胜率'});assert.equal(old.card,undefined);assert.match(old.text,/结构发生变化/);
}));

test('战绩附加当前模式胜率摘要与安全近期记录，导出只保留原统计data',()=>workspace(async(bot,calls)=>{
  const data={...records,future:{keep:7}},original=structuredClone(data);
  bot.auth.queryOwn=async(kind,current,params={})=>{calls.push({kind,params});return envelope(kind,kind==='records'?data:fixture(kind,params),params);};
  const result=await bot.handle({...privateEvent,text:'#sgs战绩 2'});
  assert.equal(result.card.result.data,data);assert.deepEqual(data,original);assert.equal(result.card.result.winRateSummary.kind,'winRate');
  assert.match(result.card.result.winRateSummary.data.entries.at(-1).label,/身份场/);assert(Array.isArray(result.card.result.recentRecords.data));
  assert.doesNotMatch(JSON.stringify(result.card.result.recentRecords),/synthetic-self-name|synthetic-other-name|players/);
  assert.deepEqual(calls,[{kind:'records',params:{model:2}},{kind:'recent',params:{model:2,page:1}}]);
  const output=await bot.handle({...privateEvent,text:'#sgs战绩 2 导出'});const exported=JSON.parse(output.file.data);
  assert.deepEqual(exported.data,original);assert.equal(exported.winRateSummary,undefined);assert.doesNotMatch(output.file.data,/"entries"|"generals"|recentRecords/);
}));

test('战绩近期样本临时失败保留正式统计，样本授权错误不被吞掉',()=>workspace(async(bot)=>{
  bot.auth.queryOwn=async(kind,current,params={})=>{if(kind==='recent')throw new CommunityAuthError('TIMEOUT','官方社区请求超时，请稍后重试。');return envelope(kind,fixture(kind,params),params);};
  const partial=await bot.handle({...privateEvent,text:'#sgs战绩'});assert(partial.card);assert.match(partial.card.result.winRateSummary.data.notice,/近期记录暂不可用/);assert.equal(partial.card.result.winRateSummary.data.entries.length,1);
  bot.auth.queryOwn=async(kind,current,params={})=>{if(kind==='recent')throw new CommunityAuthError('AUTH_EXPIRED','官方社区授权已过期，请重新扫码。');return envelope(kind,fixture(kind,params),params);};
  const expired=await bot.handle({...privateEvent,text:'#sgs战绩'});assert.equal(expired.card,undefined);assert.match(expired.text,/授权已过期/);
}));

test('自定义前缀与畸形参数边界，不能通过目标账号或URL参数查询',()=>workspace(async(bot,calls)=>{
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),prefix:'#test'}));
  assert.equal((await bot.handle({...privateEvent,text:'#sgs胜率'})).handled,false);
  const result=await bot.handle({...privateEvent,text:'#test势周瑜胜率'});assert.equal(result.card.result.kind,'winRate');assert.match(result.text,/#test势·周瑜胜率 导出/);
  calls.length=0;for(const text of ['#test胜率 势\n周瑜','#test胜率 https://invalid.example','#test胜率 123'])assert.match((await bot.handle({...privateEvent,text})).text,/用法/);
  assert.equal(calls.length,0);
}));
