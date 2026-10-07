const commands = Object.freeze([
  '帮助', '资讯', '公告', '活动', '武将', '详情', '攻略', '模式', '社区', '热榜',
  '社区授权', '扫码状态', '退出授权', '官号登录', '华为登录', '绑定', '账户', '解绑',
  '个人资料', '战绩', '近期战绩', '将力', '资产', '皮肤', '武将收藏', '能力',
  '擅长武将', '游戏资料', '胜率', '状态', '功能'
].sort((a, b) => b.length - a.length));

const heroName = /^[\p{Script=Han}A-Za-z·•._\-\s]{2,40}$/u;
function namedWinRate(text) {
  const match = /^(.+?)\s*胜率(?:\s+(导出))?$/u.exec(text);
  const name = match?.[1].trim();
  return name && heroName.test(name) ? { cmd: '胜率', arg: name + (match[2] ? ' 导出' : '') } : null;
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
    if (!rest || /^\s/u.test(rest) || reserved === '武将' || reserved === '胜率') {
      return { cmd: reserved, arg: rest.trim() };
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
