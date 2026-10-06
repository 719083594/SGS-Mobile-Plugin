/** Original presentation of fields whose labels are bound in the official community UI. */
import {redactOwnData} from './community-auth.mjs';

export const PERSONAL_FIELD_SOURCES = Object.freeze({
  protocol: 'https://xianhua.sanguosha.cn/_nuxt/recordApi.2943a9d0.js',
  desktop: 'https://xianhua.sanguosha.cn/_nuxt/record.70e69d2f.js',
  mobile: 'https://xianhua.sanguosha.cn/_nuxt/record.5e722f27.js',
  assets: 'https://xianhua.sanguosha.cn/_nuxt/obtain.cb450439.js'
});

const TITLES = Object.freeze({summary:'个人资料',force:'将力接口资料',records:'战绩统计',recent:'近期战绩',assets:'资产',gameInfo:'游戏资料',skins:'皮肤',favorites:'武将收藏',abilities:'能力',bestGeneral:'擅长武将',profile:'社区资料',roles:'角色映射'});
const COMMANDS = Object.freeze({summary:'个人资料',force:'将力',records:'战绩',recent:'近期战绩',assets:'资产',gameInfo:'游戏资料',skins:'皮肤',favorites:'武将收藏',abilities:'能力',bestGeneral:'擅长武将'});
const MODES = ['全部','排位赛','身份场','国战','斗地主'];
const SOURCE_HOSTS = new Set(['wxforum.sanguosha.cn','hi-gateway.sanguosha.cn','api-xh.sanguosha.cn','xh.sanguosha.cn']);
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
function recordLines(lines,data,used,maxItems) {
  const groups=[
    ['paiweiRate','排位赛',[['total','场次'],['total_rate','胜率','%']]],
    ['shenfenRate','身份场',[['total_rate','总胜率','%'],['emperor_rate','主公胜率','%'],['minister_rate','忠臣胜率','%'],['rebel_rate','反贼胜率','%'],['provocateur_rate','内奸胜率','%']]],
    ['guozhanRate','国战',[['total_rate','总胜率','%'],['wei_rate','魏国胜率','%'],['shu_rate','蜀国胜率','%'],['wu_rate','吴国胜率','%'],['qun_rate','群雄胜率','%'],['ye_rate','野心家胜率','%']]],
    ['doudizhuRate','斗地主',[['total','场次'],['total_rate','总胜率','%'],['lord_rate','地主胜率','%'],['peasant_rate','农民胜率','%']]]
  ];
  for(const [key,label,fields] of groups)if(object(data[key])){
    const details=[];addFields(details,data[key],fields);
    if(details.length){used.add(key);lines.push(label+'：');lines.push(...details.map(line=>'  '+line));}
  }
  if(object(data.medals)){
    // These keys and this priority are explicitly used by the desktop UI; wanmei is labelled 大师 there.
    const highest=[['chuanshuo','传说'],['wanmei','大师'],['feicui','翡翠'],['huangjin','黄金'],['baiyin','白银'],['qingtong','青铜']].find(([key])=>numeric(data.medals[key])>0);
    if(highest){lines.push('排位赛最高段位：'+highest[1]);used.add('medals');}
  }
  if(Array.isArray(data.recent)){
    const names=data.recent.slice(0,maxItems).map(row=>object(row)?scalar(row.name):null).filter(Boolean);
    if(names.length){lines.push('近期使用武将：'+names.join('、')+(data.recent.length>maxItems?'（仅显示前'+maxItems+'条）':''));used.add('recent');}
  }
  if(Array.isArray(data.g20)){
    // The official UI has only a zero/other image branch, not a documented enum.
    // Keep unfamiliar codes visible as unknown instead of inventing a defeat result.
    const results=data.g20.slice(0,20).map(value=>{const n=numeric(value);return n===0?'胜':n===1?'负':'未知';});
    lines.push('近20场结果（本次返回'+data.g20.length+'条'+(data.g20.length>20?'；显示前20条':'')+'）：'+(results.join(' ')||'暂无记录'));used.add('g20');
  }
}
function mappedLines(kind,data,{maxItems,model=0,page=1}) {
  const lines=[],used=new Set();
  if(kind==='recent' && Array.isArray(data)){
    lines.push('模式：'+(MODES[model]||'官方返回模式')+'；页码：'+page);
    lines.push('本页返回：'+data.length+'条'+(data.length>maxItems?'；显示前'+maxItems+'条':''));
    if(!data.length)lines.push('本页暂无记录。');
    for(const [index,row] of data.slice(0,maxItems).entries())if(object(row)){
      const values=[scalar(row.Model),scalar(row.begin_time),scalar(row.result)].filter(value=>value!==null);
      lines.push((index+1)+'. '+(values.join(' · ')||'该条暂无已核实的显示字段'));
    }
    return {lines,used};
  }
  if(!object(data))return {lines,used};
  if(kind==='summary')addFields(lines,data,[['nick_name','昵称'],['lv','等级'],['general_all_count','武将总数（官网统计）'],['skin_all_count','皮肤总数（官网统计）']],used);
  if(kind==='force')addFields(lines,data,[['game_total','总场次'],['game_win','获胜场次'],['win_rate','胜率','%'],['general_count','拥有武将'],['skin_count','拥有皮肤']],used);
  if(kind==='assets')addFields(lines,data,[['yb','元宝'],['jh','将魂'],['yl','雁翎'],['zml','招募令'],['ylj','雁翎甲'],['ssbz','史诗宝珠'],['hld','欢乐豆']],used);
  if(kind==='gameInfo'){
    addFields(lines,data,[['nick','昵称'],['lv','等级'],['vip','VIP'],['nowDivision','当前段位'],['maxDivision','最高段位'],['maxTitle','最高称号'],['rankWin','排位胜场'],['douDiZhuWin','斗地主胜场'],['totalGame','总场次'],['totalMvp','MVP']],used);
    ratio(lines,data,'generalNum','generalTotal','武将',used);ratio(lines,data,'skinNum','skinTotal','皮肤',used);
    winRate(lines,data,'rankWin','rankNum','排位胜率',used);winRate(lines,data,'douDiZhuWin','douDiZhuTotal','斗地主胜率',used);winRate(lines,data,'totalWin','totalGame','总胜率',used);
  }
  if(kind==='records')recordLines(lines,data,used,maxItems);
  return {lines,used};
}

/** No network, persistence or logging. Unknown data stays in the privacy-filtered JSON export. */
export function formatPersonal(result,{maxLength=3500,maxItems=8,prefix='#三国',command,model=0,page=1,exportJson=false,dataAlreadyRedacted=false}={}) {
  const kind=Object.hasOwn(TITLES,result?.kind)?result.kind:'personal';
  // queryOwn already filters and normalizes strings. Do not decode/strip unknown strings twice.
  const data=dataAlreadyRedacted?result?.data:redactOwnData(result?.data),sourceUrl=sourceLink(result?.sourceUrl);
  const limit=Number.isInteger(maxLength)?Math.max(500,Math.min(8000,maxLength)):3500;
  const items=Number.isInteger(maxItems)?Math.max(1,Math.min(20,maxItems)):8;
  const title=TITLES[kind]||'本人资料';
  const exportArg=kind==='recent'?' '+model+' '+page:kind==='records'?' '+model:'';
  const exportCommand=String(prefix).replace(/[\r\n\u0000-\u001f\u007f]/g,'')+(command||COMMANDS[kind]||'个人资料')+exportArg+' 导出';
  const file=()=>({name:'三国移动-'+kind+'.json',data:JSON.stringify({kind,data,sourceUrl},null,2)});
  // The field contracts below belong to the legacy APP protocol, not the newer WeChat API.
  const mapped=result?.protocol==='app-qr-v1' && ['summary','force','records','recent','assets','gameInfo'].includes(kind);
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
