/** Login readiness and channel-isolated identity records; never fabricate game authentication. */
export const LOGIN_EVIDENCE_DATE = '2026-10-07';
export const LOGIN_SOURCES = Object.freeze({
  official: 'https://www.sanguosha.cn/',
  officialCommunity: 'https://xh.sanguosha.cn/web/2',
  appIntroduction: 'https://hi.sanguosha.cn/pc/index.html',
  sdkDisclosure: 'https://www.sanguosha.cn/sgs_agreement/SDK_info.html',
  huaweiAccountKit: 'https://developer.huawei.com/consumer/cn/sdk/account-kit',
  huaweiAppGallery: 'https://appgallery.huawei.com/'
});
const CHANNELS = Object.freeze({
  official: {
    name: '官号', officialEntry: LOGIN_SOURCES.official,
    steps: ['通过三国杀移动版官网下载安装官方版本，在游戏内完成官方账号登录。', '通过官网进入三国咸话，在官方页面使用微信扫码登录，按官方页面说明关联移动版角色。'],
    reason: '已核实三国咸话的微信扫码/手机号社区授权和受保护战绩接口；尚未核实可供本插件直接使用的官号游戏授权与角色绑定协议。社区登录不能被标记为官号游戏登录成功。'
  },
  huawei: {
    name: '华为渠道', officialEntry: LOGIN_SOURCES.huaweiAppGallery,
    steps: ['在华为应用市场或华为游戏中心内找到三国杀移动版，确认发行方为杭州游卡网络技术有限公司，在对应渠道版本内使用华为账号登录。', '完成渠道登录后再按官方三国咸话提供的角色关联流程操作；可先在本插件登记华为渠道游戏 ID 和区服。'],
    reason: '三国杀移动版官方 SDK 清单列有华为 Game Service SDK，但未发现该游戏向第三方机器人开放的华为渠道授权和角色数据协议。独立应用的华为 Account Kit 授权不会自动获得三国杀移动版角色资产。'
  }
});

export class LoginUnavailableError extends Error {
  constructor(message, code = 'LOGIN_UNSUPPORTED') { super(message); this.name = 'LoginUnavailableError'; this.code = code; }
}
export function normalizeChannel(channel = 'official') {
  const aliases = { 官号: 'official', 官服: 'official', 官方: 'official', 华为: 'huawei', 华为渠道: 'huawei' };
  const value = aliases[channel] ?? channel;
  if (!Object.hasOwn(CHANNELS, value)) throw new LoginUnavailableError('账号渠道仅支持 official（官号）或 huawei（华为）。', 'INVALID_CHANNEL');
  return value;
}
export function channelStatus(channel = 'official') {
  channel = normalizeChannel(channel); const config = CHANNELS[channel];
  return { channel, name: config.name, status: 'unsupported', supported: false, authenticated: false,
    gameVersion: 'sanguosha-mobile', evidenceDate: LOGIN_EVIDENCE_DATE, reason: config.reason,
    officialEntry: config.officialEntry, communityEntry: LOGIN_SOURCES.officialCommunity,
    steps: [...config.steps], requiredEvidence: ['该游戏对第三方插件可用的授权入口与客户端凭据', '官号/华为渠道到移动版角色 ID、区服的授权映射', '个人战绩/将力/武将/皮肤接口的本人授权实测'],
    sources: channel === 'huawei' ? [LOGIN_SOURCES.sdkDisclosure, LOGIN_SOURCES.huaweiAccountKit, LOGIN_SOURCES.appIntroduction] : [LOGIN_SOURCES.official, LOGIN_SOURCES.officialCommunity, LOGIN_SOURCES.appIntroduction] };
}
function identityField(value, label, { optional = false, maxLength = 80 } = {}) {
  const field = String(value ?? '').trim();
  if (!field && optional) return '';
  if (!field || field.length > maxLength || /[\u0000-\u001f\u007f]/.test(field)) throw new LoginUnavailableError(`${label}需为 1 至 ${maxLength} 个字符，且不能含控制字符。`, 'INVALID_IDENTITY');
  return field;
}
export function bindIdentity({ channel = 'official', gameId, server = '', nickname = '' } = {}) {
  channel = normalizeChannel(channel);
  gameId = identityField(gameId, '游戏 ID', { maxLength: 24 });
  if (!/^\d{1,24}$/.test(gameId)) throw new LoginUnavailableError('游戏 ID 必须是游戏内显示的数字 ID；不要填写手机号、密码、验证码或 Token。', 'INVALID_IDENTITY');
  server = identityField(server, '区服', { optional: true, maxLength: 64 });
  nickname = identityField(nickname, '昵称', { optional: true, maxLength: 80 });
  return { channel, channelName: CHANNELS[channel].name, gameVersion: 'sanguosha-mobile', gameId, server, nickname,
    identityKey: ['sanguosha-mobile', channel, encodeURIComponent(server), gameId].join(':'),
    state: 'identity-bound', status: 'identity-bound', authenticated: false, verified: false,
    message: '仅登记该渠道角色身份，尚未取得游戏数据授权，不代表登录成功。' };
}
export function assertAuthenticated(identity) {
  const channel = normalizeChannel(identity?.channel ?? 'official');
  // No game authorization adapter has been verified in this release; stored flags are not proof.
  throw new LoginUnavailableError(`${CHANNELS[channel].name}个人数据暂不可查询：${channelStatus(channel).reason}`);
}
export async function login(channel = 'official') { return channelStatus(channel); }
export function formatLoginStatus(channel = 'official') {
  const status = channelStatus(channel);
  return `${status.name}登录：暂未接入\n${status.reason}\n\n${status.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n官方入口：${status.officialEntry}\n官方三国咸话：${status.communityEntry}`;
}
