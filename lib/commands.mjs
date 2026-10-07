const commands = Object.freeze([
  '帮助', '资讯', '公告', '活动', '武将', '详情', '攻略', '模式', '社区', '热榜',
  '社区授权', '扫码状态', '退出授权', '官号登录', '华为登录', '绑定', '账户', '解绑',
  '个人资料', '战绩', '近期战绩', '将力', '资产', '皮肤', '武将收藏', '能力',
  '擅长武将', '游戏资料', '状态', '功能'
].sort((a, b) => b.length - a.length));

// Account commands require their existing exact word boundary. A longer reserved
// command must never fall through to a shorter public command or a hero name.
export function parseCommand(body = '') {
  const text = String(body).trim();
  if (!text) return { cmd: '帮助', arg: '' };
  const reserved = commands.find(command => text.startsWith(command));
  if (reserved) {
    const rest = text.slice(reserved.length);
    if (!rest || /^\s/u.test(rest) || reserved === '武将') {
      return { cmd: reserved, arg: rest.trim() };
    }
  } else if (/^[\p{Script=Han}A-Za-z·•._\-\s]{2,40}$/u.test(text)) {
    // This is only a candidate: the core requires a unique exact official name
    // before sending a detail. Unknown names cannot dispatch another command.
    return { cmd: '武将', arg: text, heroShorthand: true };
  }
  return { cmd: '', arg: '' };
}
