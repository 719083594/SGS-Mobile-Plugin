const commands = Object.freeze([
  '帮助', '资讯', '公告', '活动', '武将', '详情', '攻略', '模式', '社区', '热榜',
  '社区授权', '扫码状态', '退出授权', '官号登录', '华为登录', '绑定', '账户', '解绑',
  '个人资料', '战绩', '近期战绩', '将力', '资产', '皮肤', '武将收藏', '能力',
  '擅长武将', '游戏资料', '武将胜率', '胜率', '状态', '功能'
].sort((a, b) => b.length - a.length));

const heroName = /^[\p{Script=Han}A-Za-z·•._\-\s]{2,40}$/u;
function namedWinRate(text) {
  const match = /^(.+?)\s*胜率(.*)$/u.exec(text);
  const name = match?.[1].trim();
  return name && heroName.test(name) ? { cmd: '胜率', arg: name + (match[2].trim() ? ' '+match[2].trim() : '') } : null;
}

export const GAME_MODES=Object.freeze([
  Object.freeze({model:0,key:'all',label:'全部模式',aliases:Object.freeze(['全部模式','全部','0'])}),
  Object.freeze({model:1,key:'rank',label:'排位赛',aliases:Object.freeze(['排位赛','排位','1'])}),
  Object.freeze({model:2,key:'identity',label:'身份场',aliases:Object.freeze(['身份场','身份','2'])}),
  Object.freeze({model:3,key:'nationalWar',label:'国战',aliases:Object.freeze(['国战','3'])}),
  Object.freeze({model:4,key:'douDiZhu',label:'斗地主',aliases:Object.freeze(['欢乐斗地主','斗地主','4'])})
]);
const modeAliases=GAME_MODES.flatMap(mode=>mode.aliases.map(alias=>({alias,mode}))).sort((a,b)=>b.alias.length-a.alias.length);
const argumentError=()=>{throw new RangeError('INVALID_STAT_ARGUMENT');};
const exportSuffix=value=>{
  if(typeof value!=='string'||/[\u0000-\u001f\u007f-\u009f]/u.test(value))return argumentError();
  const text=value.trim(),exportJson=/(?:^|\s)导出$/u.test(text);
  return {text:exportJson?text.replace(/(?:^|\s)导出$/u,'').trim():text,exportJson};
};

/** Name, mode and export are parsed independently from dispatch. No account ID
 * or target user syntax is accepted by either gameplay parser. */
export function parseWinRateArgs(value=''){
  const {text,exportJson}=exportSuffix(value);let name=text,mode=GAME_MODES[0],modeExplicit=false;
  for(const entry of modeAliases){
    if(text===entry.alias||text.endsWith(entry.alias)&&(!/^\d$/u.test(entry.alias)||/\s/u.test(text.at(-entry.alias.length-1)||''))){
      const before=text.slice(0,-entry.alias.length).trim();
      name=before;mode=entry.mode;modeExplicit=true;break;
    }
  }
  if(name&&(!heroName.test(name)||Array.from(name).length>60))return argumentError();
  // A second mode token cannot become part of an exact hero name by accident.
  if(name&&name.split(/\s+/u).some(token=>modeAliases.some(row=>row.alias===token)))return argumentError();
  return {name,model:mode.model,gameMode:mode.label,modeExplicit,exportJson};
}

export function parseGameplayArgs(value='',{recent=false,modeAllowed=false}={}){
  const {text,exportJson}=exportSuffix(value),parts=text?text.split(/\s+/u):[];
  if(!modeAllowed){if(parts.length)return argumentError();return {exportJson};}
  if(parts.length>(recent?2:1))return argumentError();
  const mode=parts.length?GAME_MODES.find(row=>row.aliases.includes(parts[0])):GAME_MODES[0];
  if(!mode)return argumentError();
  const page=recent?Number(parts[1]??1):undefined;
  if(recent&&(!/^\d{1,4}$/u.test(parts[1]??'1')||!Number.isInteger(page)||page<1||page>1000))return argumentError();
  return {model:mode.model,gameMode:mode.label,...(recent?{page}:{}),exportJson};
}

// Account commands require their existing exact word boundary. A longer reserved
// command must never fall through to a shorter public command or a hero name.
export function parseCommand(body = '') {
  const text = String(body).trim();
  if (!text) return { cmd: '帮助', arg: '' };
  const reserved = commands.find(command => text.startsWith(command));
  if (reserved) {
    const rest = text.slice(reserved.length);
    if (reserved === '武将') {
      const rate = namedWinRate(rest.trim());
      if (rate) return rate;
    }
    if (!rest || /^\s/u.test(rest) || reserved === '武将' || reserved === '胜率' || reserved === '武将胜率') {
      return { cmd: reserved==='武将胜率'?'胜率':reserved, arg: rest.trim() };
    }
  } else {
    const rate = namedWinRate(text);
    if (rate) return rate;
    if (heroName.test(text)) {
    // This is only a candidate: the core requires a unique exact official name
    // before sending a detail. Unknown names cannot dispatch another command.
      return { cmd: '武将', arg: text, heroShorthand: true };
    }
  }
  return { cmd: '', arg: '' };
}
