/** Modern official, read-only win statistics. No account access, network,
 * persistence, inventory joins, old-protocol fallback or raw-response export. */
const SOURCES=Object.freeze({
  gameInfo:'https://api-xh.sanguosha.cn/user/generalGameInfo',
  records:'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',
  recent:'https://api-xh.sanguosha.cn/user/gameRecordList/total',
  bestGeneral:'https://api-xh.sanguosha.cn/user/gameBestGeneralNew'
});
const MODES=Object.freeze([['all','全部模式',0],['rank','排位赛',4],['identity','身份场',1],['nationalWar','国战',2],['douDiZhu','斗地主',3]]);
const RATE_LABELS=Object.freeze({0:[],1:[],2:['主公','忠臣','反贼','内奸'],3:['魏国','蜀国','吴国','群雄','野心家'],4:['地主','农民']});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max=160)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF]/gu,' ').trim()).slice(0,max).join(''):'';
const normalName=value=>clean(value,80).toLowerCase().replace(/[\s·]/gu,'');

export class WinRateError extends Error{
  constructor(code,message){super(message);this.name='WinRateError';this.code=code;}
}
const fail=(code,message)=>{throw new WinRateError(code,message);};
const changed=()=>fail('SOURCE_CHANGED','官方新版胜率统计结构发生变化，本次未使用其他协议或模式的数据替代。');
function selectedMode(opts={}){
  const value=opts.model??0;
  if((typeof value!=='number'&&typeof value!=='string')||(typeof value==='string'&&!/^[0-4]$/u.test(value)))fail('INVALID_MODEL','胜率模式为 0全部、1排位、2身份、3国战、4斗地主。');
  const model=Number(value);if(!Number.isInteger(model)||model<0||model>4)fail('INVALID_MODEL','胜率模式为 0全部、1排位、2身份、3国战、4斗地主。');
  const [key,label,wireMode]=MODES[model];return {model,key,label,wireMode};
}
function dataOf(value,kind,mode){
  if(value===undefined||value===null)return null;
  if(!object(value))return changed();
  if(value.protocol!=='pc-scan-v7')fail('UNSUPPORTED_PROTOCOL','本人胜率需要当前微信扫码授权，请私聊发送 #sgs登录。');
  if(value.kind!==kind||value.scope!=='sanguosha-community'||value.gameVersion!=='sanguosha-mobile'||value.communityAuthenticated!==true||
     (value.sourceUrl??value.source)!==SOURCES[kind]||(kind==='recent'?!Array.isArray(value.data):!object(value.data)))return changed();
  if(kind!=='gameInfo'){
    const query=value.query;
    if(!object(query)||query.model!==mode.model||query.wireMode!==mode.wireMode)return changed();
    if(kind==='recent'&&(!Number.isInteger(query.page)||query.page<1||query.page>1000||query.pageSize!==10))return changed();
  }
  return value.data;
}
function count(value){
  if(typeof value==='string'){
    if(!/^\d{1,16}$/u.test(value.trim()))return null;
    value=Number(value.trim());
  }
  return Number.isSafeInteger(value)&&value>=0?value:null;
}
function ratio(value){
  if(typeof value==='string'){
    if(!/^(?:0(?:\.\d{1,12})?|1(?:\.0{1,12})?)$/u.test(value.trim()))return null;
    value=Number(value.trim());
  }
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1?value:null;
}
function stats(winsValue,gamesValue){
  const wins=count(winsValue),games=count(gamesValue);
  if(wins===null||games===null||wins>games)return null;
  return {wins,games,value:games?Number((wins/games*100).toFixed(2))+'%':'暂无记录',detail:wins+' 胜 / '+games+' 场'};
}
function scene(data,source,mode){
  return {kind:'winRate',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,
    query:{model:mode.model,wireMode:mode.wireMode},data,sourceUrl:SOURCES[source]};
}
function fallbackStats(game,model){
  if(!game)return null;
  const fields={0:['totalWin','totalGame'],1:['rankWin','rankNum'],2:['identityWin','identity'],4:['douDiZhuWin','douDiZhuTotal']};
  const keys=fields[model];return keys?stats(game[keys[0]],game[keys[1]]):null;
}

/** records is modern gameCareerUserInfo for the selected mode. generalGameInfo
 * supplies aggregate counts only when that endpoint is unavailable. */
export function buildWinRateOverview({gameInfo,records,recent}={},opts={}){
  const mode=selectedMode(opts),record=dataOf(records,'records',mode),game=dataOf(gameInfo,'gameInfo',mode),sample=dataOf(recent,'recent',mode);
  const entries=[],recordStats=record?stats(record.winGames,record.totalGames):null;
  if(record&&!recordStats)return changed();
  const value=recordStats??fallbackStats(game,mode.model),label=(mode.model?mode.label:'总')+'胜率';
  entries.push(value?{label,value:value.value,detail:value.detail}:{label,value:'未返回有效统计',detail:'缺失或不一致的数据未计入'});
  let notice='官方当前模式统计的周期未标明；擅长武将与近期对局均不代表完整生涯明细。';
  if(record){
    if(record.rates!==undefined&&!Array.isArray(record.rates))return changed();
    if(Array.isArray(record.rates)&&record.rates.length>20)return changed();
    const seen=new Set();let skipped=0;
    for(const row of record.rates??[]){
      const title=object(row)?clean(row.name,30):'',part=object(row)?ratio(row.rate):null;
      if(!RATE_LABELS[mode.model].includes(title)||part===null||seen.has(title)){skipped++;continue;}
      seen.add(title);entries.push({label:title+'胜率',value:Number((part*100).toFixed(2))+'%',detail:'官方分项比例；未提供该分项场次'});
    }
    if(skipped)notice+=' 无效、重复或未核实名称的分项未显示。';
  }else if(value)notice+=' 分模式战绩接口暂不可用，本项来自游戏资料的官方汇总场次。';
  if(sample){
    if(sample.length>100||sample.some(row=>!object(row)))return changed();
    const visible=sample.slice(0,10);
    let wins=0,losses=0,unknown=0;
    for(const row of visible){
      if(!object(row))return changed();
      if(row.outcomeCode===0)wins++;else if(row.outcomeCode===1)losses++;else unknown++;
    }
    const known=wins+losses,recentStats=stats(wins,known);
    entries.push({label:'近期本页样本胜率（'+mode.label+'）',value:known?recentStats.value:sample.length?'无可统计结果':'暂无记录',
      detail:wins+' 胜 / '+losses+' 负；未知 '+unknown+' 场，已排除；请求第 '+recent.query.page+' 页，本批取前 '+visible.length+' 条'});
    notice+=' 近期样本只取本次官方返回批次的前10条，不能代替完整战绩胜率。';
  }
  return scene({title:'本人胜率 · '+mode.label,scope:'官方本人统计 · '+mode.label+' · 统计周期未标明',model:mode.model,gameMode:mode.label,entries,generals:[],notice},record?'records':'gameInfo',mode);
}

/** Exact normalized names preserve 势/界/神. The official best-general list is
 * a returned subset, never an inventory or proof of a missing general's 0%. */
export function buildGeneralWinRate(name,{bestGeneral}={},opts={}){
  if(typeof name!=='string'||!name.trim()||Array.from(name).length>60||/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF]/u.test(name))fail('INVALID_GENERAL_NAME','请填写武将完整名称，例如 #sgs势周瑜胜率。');
  const query=normalName(name);if(!query)fail('INVALID_GENERAL_NAME','请填写有效的武将完整名称。');
  const mode=selectedMode(opts),best=dataOf(bestGeneral,'bestGeneral',mode),matched=[];
  if(best&&!Array.isArray(best.list))return changed();
  if((best?.list?.length??0)>1000)fail('STATS_LIMIT','官方武将统计条目过多，暂不能可靠处理。');
  for(const row of best?.list??[]){
    if(!object(row)||!object(row.info)||!Number.isSafeInteger(row.info.id)||row.info.id<1||typeof row.info.name!=='string'||!normalName(row.info.name))return changed();
    if(normalName(row.info.name)!==query)continue;
    matched.push({id:row.info.id,name:clean(row.info.name,60),value:stats(row.win,row.total)});
  }
  if(new Set(matched.map(row=>row.id)).size>1)fail('AMBIGUOUS_GENERAL','官方返回了多个同名武将统计，暂不能可靠区分；请使用包含势、界或神前缀的完整名称。');
  if(matched.some(row=>!row.value))fail('INVALID_STATS','官方返回的该武将场次与胜场不一致，本次未计算胜率。');
  if(!matched.length)fail('GENERAL_STATS_NOT_RETURNED','官方擅长武将列表本次未返回该武将的'+mode.label+'统计，不代表胜率为 0；请使用包含势、界或神前缀的完整名称。');
  const row=matched[0];
  if(matched.some(other=>other.value.wins!==row.value.wins||other.value.games!==row.value.games))fail('AMBIGUOUS_GENERAL','官方返回了重复且不一致的武将统计，本次未选择其中任何一条。');
  return scene({title:row.name+' · 胜率',scope:'官方擅长武将统计 · '+mode.label,model:mode.model,gameMode:mode.label,entries:[],
    generals:[{name:row.name,mode:mode.key,label:mode.label,...row.value,id:row.id}],
    notice:'官方本次仅返回部分擅长武将，统计周期未标明；仅显示当前模式，不将其他模式或近期对局拼成该武将胜率。'},'bestGeneral',mode);
}

/** Export only selected display fields. Unknown caller response fields never
 * enter text or JSON, including identifiers from the authorization envelope. */
export function formatWinRate(result,{prefix='#sgs',exportJson=false}={}){
  if(result?.kind!=='winRate'||result?.protocol!=='pc-scan-v7'||!object(result.data))fail('INVALID_STATS','胜率统计格式不完整，请重新查询。');
  const input=result.data,mode=selectedMode({model:input.model??0}),entries=(Array.isArray(input.entries)?input.entries:[]).slice(0,8).filter(object).map(row=>({label:clean(row.label,80),value:clean(row.value,60),detail:clean(row.detail,180)}));
  const generals=(Array.isArray(input.generals)?input.generals:[]).slice(0,1).filter(object).map(row=>{
    const value=stats(row.wins,row.games);if(!value||row.mode!==mode.key)return null;
    return {name:clean(row.name,60),mode:mode.key,label:mode.label,...value,...(Number.isSafeInteger(row.id)&&row.id>0?{id:row.id}:{})};
  }).filter(Boolean);
  const data={title:clean(input.title,100)||'本人胜率',scope:clean(input.scope,180),model:mode.model,gameMode:mode.label,entries,generals,notice:clean(input.notice,500)};
  const sourceUrl=Object.values(SOURCES).includes(result.sourceUrl)?result.sourceUrl:'';
  if(exportJson)return {text:'已生成本人胜率统计 JSON，仅包含已核实的显示字段。',file:{name:'三国移动-win-rate.json',data:JSON.stringify({kind:'winRate',protocol:'pc-scan-v7',data,sourceUrl},null,2)}};
  const lines=[data.title,data.scope,...entries.map(row=>row.label+'：'+row.value+(row.detail?'（'+row.detail+'）':'')),...generals.map(row=>row.label+'：'+row.value+'（'+row.detail+'）'),data.notice].filter(Boolean);
  const p=clean(prefix,30)||'#sgs',command=generals.length?generals[0].name+'胜率':'胜率';
  lines.push('统计导出：'+p+command+(mode.model?' '+mode.label:'')+' 导出');if(sourceUrl)lines.push('来源：'+sourceUrl);
  return {text:lines.join('\n')};
}
