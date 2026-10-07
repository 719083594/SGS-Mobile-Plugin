/** Original presentation of fields whose labels are bound in the official community UI. */
import {redactOwnData} from './community-auth.mjs';

export const PERSONAL_FIELD_SOURCES = Object.freeze({
  protocol: 'https://note.sanguosha.cn/record/assets/index-Oam2QQVM.js',
  desktop: 'https://note.sanguosha.cn/record/assets/index-CXtl96WG.js',
  mobile: 'https://note.sanguosha.cn/record/',
  assets: 'https://note.sanguosha.cn/record/assets/index-CXtl96WG.js'
});

const TITLES = Object.freeze({summary:'个人资料',force:'战力资料',records:'战绩统计',recent:'近期战绩',assets:'资产',gameInfo:'游戏资料',abilities:'能力',bestGeneral:'擅长武将',profile:'社区资料',roles:'角色映射'});
const COMMANDS = Object.freeze({summary:'个人资料',force:'将力',records:'战绩',recent:'近期战绩',assets:'资产',gameInfo:'游戏资料',abilities:'能力',bestGeneral:'擅长武将'});
const MODES = ['全部','排位赛','身份场','国战','斗地主'];
const SOURCE_HOSTS = new Set(['api-xh.sanguosha.cn','xh.sanguosha.cn','note.sanguosha.cn']);
const ASSETS=[['yb','元宝'],['jh','将魂'],['yl','雁翎'],['zml','招募令'],['ylj','雁翎甲'],['ssbz','史诗宝珠'],['dianj','点将卡'],['hld','欢乐豆'],['shouq','手气卡'],['xiny','心愿积分'],['yinb','银币']];
const FORCES=[['totalForce','综合战力'],['doudizhuForce','斗地主战力'],['paiweiForce','排位战力'],['guozhanForce','国战战力'],['shenfenForce','身份战力']];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function scalar(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/[\r\n\t\u0000-\u001f\u007f]+/g,' ');
}
function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value.trim()))return null;
  const number=Number(value);return Number.isFinite(number)?number:null;
}
function sourceLink(value) {
  try {const url=new URL(value);return url.protocol==='https:' && SOURCE_HOSTS.has(url.hostname) && !url.username && !url.password ? url.origin+url.pathname : '';} catch {return '';}
}
function addFields(lines,data,fields,used) {
  for (const [key,label,unit=''] of fields) {
    const value=scalar(data[key]);
    if (value===null) continue;
    used?.add(key);
    lines.push(label+'：'+value+(unit==='%' && value.endsWith('%') ? '' : unit));
  }
}
function ratio(lines,data,numerator,denominator,label,used) {
  const count=scalar(data[numerator]),total=scalar(data[denominator]);
  if (count!==null) {lines.push(label+'：'+count+(total===null?'':' / '+total));used.add(numerator);if(total!==null)used.add(denominator);}
  else if(total!==null) {lines.push(label+'总数（官网统计）：'+total);used.add(denominator);}
}
function winRate(lines,data,winKey,totalKey,label,used) {
  const wins=numeric(data[winKey]),total=numeric(data[totalKey]);
  // The H5 UI truncates wins/total*100. Missing or invalid denominators never become a fabricated 0%.
  if(wins===null||total===null||wins<0||total<=0||wins>total)return;
  lines.push(label+'：'+Math.trunc(wins/total*100)+'%');used.add(winKey);used.add(totalKey);
}
function mappedLines(kind,data,{maxItems,model=0,page=1}) {
  const lines=[],used=new Set();
  if(kind==='recent' && Array.isArray(data)){
    lines.push('模式：'+(MODES[model]||'官方返回模式')+'；页码：'+page);
    lines.push('本批返回：'+data.length+'条'+(data.length>maxItems?'；显示前'+maxItems+'条':''));
    if(!data.length)lines.push('本批暂无记录。');
    for(const [index,row] of data.slice(0,maxItems).entries())if(object(row)){
      const names=Array.isArray(row.general_names)?row.general_names.slice(0,3).map(scalar).filter(Boolean).join('、'):'';
      const values=[scalar(row.Model),scalar(row.begin_time),scalar(row.result),names||null,row.mvp===true?'MVP':null,row.run===true?'逃跑':null].filter(value=>value!==null);
      lines.push((index+1)+'. '+(values.join(' · ')||'该条暂无已核实的显示字段'));
    }
    return {lines,used};
  }
  if(!object(data))return {lines,used};
  if(kind==='summary')addFields(lines,data,[['nick_name','昵称'],['lv','等级'],['generalCount','拥有武将'],['skinCount','拥有皮肤'],['general_all_count','武将总数（官网统计）'],['skin_all_count','皮肤总数（官网统计）']],used);
  if(kind==='force'){
    if(object(data.game_force)){const values=[];addFields(values,data.game_force,FORCES);if(values.length){lines.push(...values);used.add('game_force');}}
  }
  if(kind==='assets')addFields(lines,data,ASSETS,used);
  if(kind==='gameInfo'){
    addFields(lines,data,[['nick','昵称'],['lv','等级'],['vip','VIP'],['nowDivision','当前段位'],['maxDivision','最高段位'],['maxTitle','最高称号'],['rankWin','排位胜场'],['douDiZhuWin','斗地主胜场'],['totalGame','总场次'],['totalMvp','MVP']],used);
    ratio(lines,data,'generalNum','generalTotal','武将',used);ratio(lines,data,'skinNum','skinTotal','皮肤',used);
    winRate(lines,data,'rankWin','rankNum','排位胜率',used);winRate(lines,data,'douDiZhuWin','douDiZhuTotal','斗地主胜率',used);winRate(lines,data,'totalWin','totalGame','总胜率',used);
  }
  if(kind==='records'){
    addFields(lines,data,[['winGames','获胜场次'],['totalGames','总场次']],used);
    // The modern official UI multiplies this 0..1 fraction by 100. Keep the
    // original fraction in JSON; values outside that contract remain unmapped.
    const fraction=numeric(data.rate);
    if(fraction!==null&&fraction>=0&&fraction<=1){lines.push('官方胜率：'+Number((fraction*100).toFixed(2))+'%');used.add('rate');}
    addFields(lines,data,[['mvp','MVP'],['force','战力']],used);
  }
  return {lines,used};
}

/** No network, persistence or logging. Unknown data stays in the privacy-filtered JSON export. */
export function formatPersonal(result,{maxLength=3500,maxItems=8,prefix='#sgs',command,model=0,page=1,exportJson=false,dataAlreadyRedacted=false}={}) {
  if(result?.protocol!=='pc-scan-v7')return {text:'该授权协议已停止支持，请私聊发送 '+String(prefix).replace(/[\r\n\u0000-\u001f\u007f]/g,'')+'登录 重新授权。'};
  if(['skins','favorites'].includes(result.kind))return {text:'该旧收藏查询已停止支持，请使用 '+String(prefix).replace(/[\r\n\u0000-\u001f\u007f]/g,'')+'我的武将 或 我的皮肤 查询官方拥有列表。'};
  const kind=Object.hasOwn(TITLES,result?.kind)?result.kind:'personal';
  // queryOwn already filters and normalizes strings. Do not decode/strip unknown strings twice.
  const data=dataAlreadyRedacted?result?.data:redactOwnData(result?.data),sourceUrl=sourceLink(result?.sourceUrl);
  const limit=Number.isInteger(maxLength)?Math.max(500,Math.min(8000,maxLength)):3500;
  const items=Number.isInteger(maxItems)?Math.max(1,Math.min(20,maxItems)):8;
  const title=TITLES[kind]||'本人资料';
  const exportArg=kind==='recent'?' '+model+' '+page:kind==='records'?' '+model:'';
  const exportCommand=String(prefix).replace(/[\r\n\u0000-\u001f\u007f]/g,'')+(command||COMMANDS[kind]||'个人资料')+exportArg+' 导出';
  const file=()=>({name:'三国移动-'+kind+'.json',data:JSON.stringify({kind,data,sourceUrl},null,2)});
  const mapped=['summary','force','records','recent','assets','gameInfo'].includes(kind);
  const formatted=mapped?mappedLines(kind,data,{maxItems:items,model,page}):{lines:[],used:new Set()};
  const lines=[title];
  if(formatted.lines.length){
    lines.push(...formatted.lines);
    const unknown=object(data)?Object.keys(data).filter(key=>!formatted.used.has(key)):[];
    if(unknown.length)lines.push('未映射字段：'+unknown.slice(0,6).map(key=>key.replace(/[\r\n\t\u0000-\u001f\u007f]/g,' ').slice(0,50)).join('、')+(unknown.length>6?'等':''));
    lines.push('完整已脱敏 JSON：'+exportCommand);
  }else{
    lines.push('暂无已核实的中文字段映射，以下保留官方字段名：',JSON.stringify(data,null,2)??'null');
    lines.push('导出已脱敏 JSON：'+exportCommand);
  }
  if(sourceUrl)lines.push('来源：'+sourceUrl);
  const text=lines.join('\n');
  if(exportJson)return {text:title+'已生成完整已脱敏 JSON。',file:file()};
  if(text.length>limit)return {text:title+'超过消息长度，已生成完整已脱敏 JSON。',file:file()};
  return {text};
}
