/** Selected, read-only win statistics. No account access, network, persistence,
 * or raw-response export. Radar abilities are deliberately never read here. */
const SOURCES=Object.freeze({
  gameInfo:'https://hi-gateway.sanguosha.cn/api/game/v2/general/gameInfo',
  bestGeneral:'https://hi-gateway.sanguosha.cn/api/game/v2/general/bestGeneral',
  records:'https://wxforum.sanguosha.cn/api/user/getGameRecord'
});
const MODES=Object.freeze([['rank','排位赛'],['identity','身份场'],['nationalWar','国战'],['douDiZhu','斗地主']]);
const RECORD_MODES=['全部模式','排位赛','身份场','国战','斗地主'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max=160)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF]/gu,' ').trim()).slice(0,max).join(''):'';
const normalName=value=>clean(value,80).toLowerCase().replace(/[\s·]/gu,'');

export class WinRateError extends Error{
  constructor(code,message){super(message);this.name='WinRateError';this.code=code;}
}
const fail=(code,message)=>{throw new WinRateError(code,message);};
function dataOf(value){
  if(!object(value))return {};
  if(Object.hasOwn(value,'data')){
    if(value.protocol!==undefined&&value.protocol!=='app-qr-v1')fail('UNSUPPORTED_PROTOCOL','当前社区授权协议未提供已核实的本人胜率统计。');
    return object(value.data)?value.data:{};
  }
  return value;
}
function count(value){
  if(typeof value==='string'){
    if(!/^\d{1,16}$/.test(value.trim()))return null;
    value=Number(value.trim());
  }
  return Number.isSafeInteger(value)&&value>=0?value:null;
}
function percent(value){
  if(typeof value==='string'){
    if(!/^\d{1,3}(?:\.\d{1,6})?$/.test(value.trim()))return null;
    value=Number(value.trim());
  }
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
}
function stats(winsValue,gamesValue){
  const wins=count(winsValue),games=count(gamesValue);
  if(wins===null||games===null||wins>games)return null;
  return {wins,games,value:games?Number((wins/games*100).toFixed(2))+'%':'暂无记录',detail:wins+' 胜 / '+games+' 场'};
}
function matchingPercent(rate,wins,games){
  const reported=percent(rate);if(reported===null)return false;
  if(!games)return wins===0&&reported===0;
  const expected=wins/games*100;
  // Official pages truncate integer percentages. Also accept the response's
  // own decimal precision when rounded or truncated, never an arbitrary gap.
  const decimals=Math.min(6,(String(reported).split('.')[1]||'').length),scale=10**decimals;
  return Math.abs(reported-Math.round(expected*scale)/scale)<1e-8||Math.abs(reported-Math.floor(expected*scale+1e-8)/scale)<1e-8;
}
function scene(data,source){return {kind:'winRate',protocol:'app-qr-v1',data,sourceUrl:SOURCES[source]};}
function identity(row,key){const id=count(row[key]);return id!==null&&id>0?id:undefined;}
function uniqueName(rows){
  const identities=new Set(rows.flatMap(row=>row.id===undefined?[]:[row.id]));
  if(identities.size>1)fail('AMBIGUOUS_GENERAL','官方返回了多个同名武将统计，暂不能可靠区分；请使用包含势、界或神前缀的完整名称。');
}
function deduplicate(rows){
  uniqueName(rows);const byMode=new Map();
  for(const row of rows){
    const previous=byMode.get(row.mode);
    if(previous&&(previous.wins!==row.wins||previous.games!==row.games))fail('AMBIGUOUS_GENERAL','官方返回了重复且不一致的武将统计，本次未选择其中任何一条。');
    if(!previous)byMode.set(row.mode,row);
  }
  return [...byMode.values()];
}
function selectedMode(opts={}){
  const model=Number(opts.model??0);
  if(!Number.isInteger(model)||model<0||model>4)fail('INVALID_MODEL','胜率模式为 0全部、1排位、2身份、3国战、4斗地主。');
  return {model,key:model?MODES[model-1][0]:'all',label:RECORD_MODES[model]};
}

/** gameInfo and records may be queryOwn envelopes or already-selected data. */
export function buildWinRateOverview({gameInfo,records}={},opts={}){
  const game=dataOf(gameInfo),record=dataOf(records),{model,label:gameMode}=selectedMode(opts);
  const fields={0:[['总胜率','totalWin','totalGame'],['排位胜率','rankWin','rankNum'],['斗地主胜率','douDiZhuWin','douDiZhuTotal']],1:[['排位胜率','rankWin','rankNum']],2:[['身份场胜率',null,null]],3:[['国战胜率',null,null]],4:[['斗地主胜率','douDiZhuWin','douDiZhuTotal']]};
  const entries=fields[model].map(([label,winKey,gameKey])=>{
    const value=winKey&&gameKey?stats(game[winKey],game[gameKey]):null;
    return value?{label,value:value.value,detail:value.detail}:{label,value:'未返回有效统计',detail:'缺失或不一致的数据未计入'};
  });
  let notice='官方本人统计的周期未标明；近20场单独统计，不能代替完整战绩胜率。';
  if(Array.isArray(record.g20)){
    const sample=record.g20.slice(0,20);let wins=0,losses=0,unknown=0;
    for(const code of sample){const n=count(code);if(n===0)wins++;else if(n===1)losses++;else unknown++;}
    const known=wins+losses,value=stats(wins,known);
    entries.push({label:'近20场胜率（'+RECORD_MODES[model]+'）',value:known?value.value:sample.length?'无可统计结果':'暂无记录',detail:wins+' 胜 / '+losses+' 负；未知 '+unknown+' 场，已排除；本次取 '+sample.length+' 条'});
    if(record.g20.length>20)notice+=' 官方本次返回超过20条结果，样本仅使用前20条。';
  }else entries.push({label:'近20场胜率（'+RECORD_MODES[model]+'）',value:'未返回记录',detail:'不以其他字段推测近20场结果'});
  return scene({title:'本人胜率 · '+gameMode,scope:'官方本人统计 · '+gameMode+' · 统计周期未标明',model,gameMode,entries,generals:[],notice},'gameInfo');
}

/** Exact normalized names only. A missing general is not a zero win rate. */
export function buildGeneralWinRate(name,{bestGeneral,records}={},opts={}){
  if(typeof name!=='string'||!name.trim()||Array.from(name).length>60||/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF]/u.test(name))fail('INVALID_GENERAL_NAME','请填写武将完整名称，例如 #sgs势周瑜胜率。');
  const query=normalName(name);if(!query)fail('INVALID_GENERAL_NAME','请填写有效的武将完整名称。');
  const {model,key:modeKey,label:gameMode}=selectedMode(opts);
  const best=dataOf(bestGeneral),record=dataOf(records),matched=[],bestIdentities=[];let invalid=0;
  for(const [mode,label] of MODES){
    if(model&&mode!==modeKey)continue;
    if(!Array.isArray(best[mode]))continue;
    if(best[mode].length>1000)fail('STATS_LIMIT','官方武将统计条目过多，暂不能可靠处理。');
    for(const row of best[mode]){
      if(!object(row)||normalName(row.name)!==query)continue;
      const id=identity(row,'Id');bestIdentities.push({id});
      const value=stats(row.win,row.total);if(!value){invalid++;continue;}
      matched.push({name:clean(row.name,60),mode,label,...value,...(id===undefined?{}:{id})});
    }
  }
  uniqueName(bestIdentities);
  if(matched.length){
    const generals=deduplicate(matched);
    return scene({title:generals[0].name+' · 胜率',scope:'官方擅长武将统计 · '+(model?gameMode:'分模式展示'),model,gameMode,entries:[],generals,notice:'官方仅返回部分擅长武将，统计周期未标明；不同模式分别显示，不合并推算生涯胜率。'+(invalid?' 部分不一致统计未显示。':'')},'bestGeneral');
  }
  if(invalid)fail('INVALID_STATS','官方返回的该武将场次与胜场不一致，本次未计算胜率。');
  if(model)fail('GENERAL_STATS_NOT_RETURNED','官方本次未返回该武将的'+gameMode+'统计，不代表胜率为 0；近期使用武将统计未说明模式，未用来冒充'+gameMode+'胜率。');
  const recent=[],recentIdentities=[];
  if(Array.isArray(record.recent)){
    if(record.recent.length>1000)fail('STATS_LIMIT','官方武将统计条目过多，暂不能可靠处理。');
    for(const row of record.recent){
      if(!object(row)||normalName(row.name)!==query)continue;
      const id=identity(row,'general');recentIdentities.push({id});
      const value=stats(row.win_num,row.num);
      if(!value||!matchingPercent(row.win_rate,value.wins,value.games)){invalid++;continue;}
      recent.push({name:clean(row.name,60),mode:'recent',label:'近期使用武将',...value,...(id===undefined?{}:{id})});
    }
  }
  uniqueName(recentIdentities);
  if(recent.length){
    const generals=deduplicate(recent);
    return scene({title:generals[0].name+' · 胜率',scope:'官方近期使用武将统计（统计周期及模式未标明）',model,gameMode,entries:[],generals,notice:'本结果来自官方近期使用武将统计，统计周期及模式未标明；不能视作近20局、指定模式或完整生涯胜率。'+(invalid?' 部分不一致统计未显示。':'')},'records');
  }
  if(invalid)fail('INVALID_STATS','官方返回的该武将胜率与场次不一致，本次未计算胜率。');
  fail('GENERAL_STATS_NOT_RETURNED','官方本次未返回该武将统计，不代表胜率为 0；请使用包含势、界或神前缀的完整名称。');
}

/** Export only the selected display fields; never serialize caller response extras. */
export function formatWinRate(result,{prefix='#sgs',exportJson=false}={}){
  if(result?.kind!=='winRate'||result?.protocol!=='app-qr-v1'||!object(result.data))fail('INVALID_STATS','胜率统计格式不完整，请重新查询。');
  const input=result.data,entries=(Array.isArray(input.entries)?input.entries:[]).slice(0,8).filter(object).map(row=>({label:clean(row.label,80),value:clean(row.value,60),detail:clean(row.detail,180)}));
  const generals=(Array.isArray(input.generals)?input.generals:[]).slice(0,4).filter(object).map(row=>{
    const value=stats(row.wins,row.games);if(!value)return null;
    const mode=MODES.some(([key])=>key===row.mode)?row.mode:row.mode==='recent'?'recent':null;if(!mode)return null;
    const id=identity(row,'id');return {name:clean(row.name,60),mode,label:mode==='recent'?'近期使用武将':MODES.find(([key])=>key===mode)[1],...value,...(id===undefined?{}:{id})};
  }).filter(Boolean);
  const mode=selectedMode({model:input.model??0}),data={title:clean(input.title,100)||'本人胜率',scope:clean(input.scope,180),model:mode.model,gameMode:mode.label,entries,generals,notice:clean(input.notice,400)};
  const sourceUrl=Object.values(SOURCES).includes(result.sourceUrl)?result.sourceUrl:'';
  if(exportJson)return {text:'已生成本人胜率统计 JSON，仅包含已核实的显示字段。',file:{name:'三国移动-win-rate.json',data:JSON.stringify({kind:'winRate',protocol:'app-qr-v1',data,sourceUrl},null,2)}};
  const lines=[data.title,data.scope,...entries.map(row=>row.label+'：'+row.value+(row.detail?'（'+row.detail+'）':'')),...generals.map(row=>row.label+'：'+row.value+'（'+row.detail+'）'),data.notice].filter(Boolean);
  const p=clean(prefix,30)||'#sgs',command=generals.length?generals[0].name+'胜率':'胜率';
  lines.push('统计导出：'+p+command+(mode.model?' '+mode.label:'')+' 导出');if(sourceUrl)lines.push('来源：'+sourceUrl);
  return {text:lines.join('\n')};
}
