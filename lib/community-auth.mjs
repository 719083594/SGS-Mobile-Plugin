/** Original official-community QR authorization; it does not authenticate a game channel. */
import { cleanText } from './public.mjs';

export const COMMUNITY_AUTH_SOURCES = Object.freeze({
  app: 'https://hi.sanguosha.cn/pc/index.html',
  legacy: 'https://xianhua.sanguosha.cn/',
  web: 'https://xh.sanguosha.cn/web/2',
  legacyProtocol: 'https://xianhua.sanguosha.cn/_nuxt/login.0bde981d.js',
  legacyUi: 'https://xianhua.sanguosha.cn/_nuxt/default.fd6ebdba.js',
  privateProtocol: 'https://xianhua.sanguosha.cn/_nuxt/recordApi.2943a9d0.js',
  webProtocol: 'https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js'
});
const URLS = Object.freeze({ api: 'https://api-xh.sanguosha.cn', gateway: 'https://hi-gateway.sanguosha.cn/api/', oldApi: 'https://wxforum.sanguosha.cn/api/', web: 'https://xh.sanguosha.cn/web' });
const LEGACY_QUERIES = Object.freeze({
  profile: ['oldApi', 'profile'], summary: ['oldApi', 'user/getGameSummary'],
  force: ['oldApi', 'user/getGameForce'], records: ['oldApi', 'user/getGameRecord'], recent: ['oldApi', 'user/getGameRecordList'],
  gameInfo: ['gateway', 'game/v2/general/gameInfo'], assets: ['gateway', 'game/v2/general/property'],
  skins: ['gateway', 'game/v2/general/generalSkins'], abilities: ['gateway', 'game/v2/general/abilities'],
  bestGeneral: ['gateway', 'game/v2/general/bestGeneral'], favorites: ['oldApi', 'general/getMyLike']
});
const MODERN_QUERIES = Object.freeze({ profile: ['api', '/user/userInfo', 'POST'], summary: ['api', '/user/gameSummary'], roles: ['api', '/user/getAllOtherGameUser'] });
const ALLOWED_ENDPOINTS = {
  api: new Set(['/sgxh/pcScan/generateId', '/sgxh/pcScan/poll', ...Object.values(MODERN_QUERIES).map(spec => spec[1])]),
  web: new Set(['/api/auth/login', '/api/auth/logout']),
  oldApi: new Set(Object.values(LEGACY_QUERIES).filter(spec => spec[0] === 'oldApi').map(spec => spec[1])),
  gateway: new Set(['login/v1/qrcode', ...Object.values(LEGACY_QUERIES).filter(spec => spec[0] === 'gateway').map(spec => spec[1])])
};
const ALIASES = { 战绩: 'records', 将力: 'force', 资产: 'assets', 皮肤: 'skins', 武将收藏: 'favorites', 个人资料: 'profile', 角色: 'roles', 概览: 'summary', 能力: 'abilities', 擅长武将: 'bestGeneral' };
const PROTOCOLS = new Set(['app-qr-v1', 'pc-scan-v7']);
const SENSITIVE_KEY = /^(?:token|.*token|authorization|password|passwd|cookie|.*secret|phone|phoneNumber|mobile|mobilePhone|tel|email|idCard|idCardNumber|realName|real_name|id_number|ip|ipAddress|ip_address|share_pic|address|deviceId|imei|mac)$/i;

export class CommunityAuthError extends Error {
  constructor(code, message, sourceUrl) { super(message); this.name = 'CommunityAuthError'; this.code = code; this.sourceUrl = sourceUrl; }
}
function opaque(value, label, maxLength = 16384) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) throw new CommunityAuthError('INVALID_ARGUMENT', `${label}无效。`);
  return value;
}
function protocolCheck(protocol) {
  if (!PROTOCOLS.has(protocol)) throw new CommunityAuthError('UNSUPPORTED_PROTOCOL', '社区授权协议仅支持 app-qr-v1 或 pc-scan-v7。');
  return protocol;
}
export function redactOwnData(value, depth = 0) {
  if (depth > 24) return '[层级过深]';
  if (Array.isArray(value)) return value.slice(0, 6000).map(item => redactOwnData(item, depth + 1));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || SENSITIVE_KEY.test(key)) continue;
      output[key] = redactOwnData(item, depth + 1);
    }
    return output;
  }
  if (typeof value === 'string') return cleanText(value, 20000);
  return value;
}
function validateSession(session) {
  if (!session || session.scope !== 'sanguosha-community' || session.gameVersion !== 'sanguosha-mobile') throw new CommunityAuthError('AUTH_REQUIRED', '请先在私聊完成官方三国咸话扫码授权。');
  protocolCheck(session.protocol); opaque(session.token, '授权凭证');
  if (session.expiresAt && session.expiresAt < Date.now()) throw new CommunityAuthError('AUTH_EXPIRED', '官方社区授权已过期，请重新扫码。');
}
function cookieFrom(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie = cookies.find(value => /(?:^|,\s*)WEB_SESSIONID=/.test(value));
  if (!cookie) throw new CommunityAuthError('SESSION_EXCHANGE_UNVERIFIED', '已完成扫码，但官方网页未返回可验证的社区会话，尚未建立插件授权。');
  const raw = /(?:^|,\s*)WEB_SESSIONID=([^;]*)/.exec(cookie)?.[1];
  opaque(raw, '网页会话'); let token;
  try { token = decodeURIComponent(raw); } catch { token = raw; }
  const maxAge = /;\s*Max-Age=(\d+)/i.exec(cookie)?.[1];
  return { token, cookieValue: raw, ...(maxAge ? { expiresAt: Date.now() + Number(maxAge) * 1000 } : {}) };
}

export class CommunityAuthClient {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 15000, maxResponseBytes = 3000000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; this.maxResponseBytes = maxResponseBytes;
  }
  async request(baseName, endpoint, { method = 'GET', body, token, cookieValue, params = {} } = {}) {
    // baseName/path are selected inside this module, never from caller-controlled URLs.
    if (!Object.hasOwn(URLS, baseName) || !ALLOWED_ENDPOINTS[baseName].has(endpoint)) throw new CommunityAuthError('UNTRUSTED_URL', '仅允许访问已核实的官方社区授权及本人只读端点。');
    const url = baseName === 'api' || baseName === 'web' ? new URL(`${URLS[baseName]}${endpoint}`) : new URL(endpoint, URLS[baseName]);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const headers = baseName === 'api' || baseName === 'web'
      ? { 'Content-Type': 'application/json;charset=UTF-8', 'App-System': 'pc', 'client-Id': '', 'app-version': '7.0.0', 'AppVersion-Code': '' }
      : { 'Content-Type': 'application/json', platform: 'pc', 'AppVersion-Code': '1.0.0', 'current-uri': endpoint, dataType: 'json' };
    if (token) headers.Authorization = opaque(token, '授权凭证');
    if (cookieValue) {
      opaque(cookieValue, '网页会话');
      if (/[;,]/.test(cookieValue)) throw new CommunityAuthError('INVALID_ARGUMENT', '网页会话格式无效。');
      headers.Cookie = `WEB_SESSIONID=${cookieValue}`;
    }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url.href, { method, headers, redirect: 'error', signal: controller.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      if (response.status === 401) throw new CommunityAuthError('AUTH_EXPIRED', '官方社区会话无效或已过期，请重新扫码授权。', url.href.split('?')[0]);
      if (!response.ok) throw new CommunityAuthError('HTTP_ERROR', `官方社区请求失败（HTTP ${response.status}）。`, url.href.split('?')[0]);
      const raw = await response.text();
      if (new TextEncoder().encode(raw).length > this.maxResponseBytes) throw new CommunityAuthError('RESPONSE_TOO_LARGE', '官方社区数据超过读取上限。');
      let payload; try { payload = JSON.parse(raw); } catch { throw new CommunityAuthError('SOURCE_CHANGED', '官方社区响应格式发生变化。'); }
      if (![0, 1000, 200, 20002, 10000].includes(payload.code)) {
        const source = url.href.split('?')[0];
        if ([401, 1003].includes(payload.code)) throw new CommunityAuthError('AUTH_EXPIRED', '官方社区会话无效或已过期，请重新扫码授权。', source);
        if (payload.code === 20020) throw new CommunityAuthError('ROLE_LINK_REQUIRED', '官方社区尚未关联可查询的移动版角色，请在官方三国咸话APP内完成角色关联。', source);
        throw new CommunityAuthError('API_ERROR', `官方社区未完成请求（代码 ${Number(payload.code) || 'unknown'}）。`, source);
      }
      return { data: payload.data, response, sourceUrl: url.href.split('?')[0] };
    } catch (error) {
      if (error instanceof CommunityAuthError) throw error;
      if (controller.signal.aborted) throw new CommunityAuthError('TIMEOUT', '官方社区请求超时，请稍后重试。');
      throw new CommunityAuthError('NETWORK_ERROR', '暂时无法连接官方三国咸话社区。');
    } finally { clearTimeout(timer); }
  }
  async start({ protocol = 'app-qr-v1' } = {}) {
    protocolCheck(protocol); const createdAt = Date.now();
    if (protocol === 'app-qr-v1') {
      const result = await this.request('gateway', 'login/v1/qrcode', { method: 'POST', body: null });
      const qrPayload = opaque(result.data?.qrcode, '官方扫码内容', 2048);
      return { challengeId: globalThis.crypto.randomUUID(), qrPayload, expiresAt: createdAt + 120000,
        createdAt, protocol, status: 'pending', pollIntervalMs: 2000, scanner: '三国咸话APP扫一扫', scope: 'sanguosha-community', gameAuthenticated: false,
        expiryNote: '120秒为官方网页轮询窗口；接口没有返回精确会话有效期。' };
    }
    const result = await this.request('api', '/sgxh/pcScan/generateId', { method: 'POST', body: { gameId: 2 } });
    const scanId = opaque(result.data?.scanId, '扫码ID', 256); const expireIn = Number(result.data?.expireIn);
    if (!(expireIn > 0 && expireIn <= 3600)) throw new CommunityAuthError('SOURCE_CHANGED', '官方扫码过期时间无法验证。');
    return { challengeId: scanId, qrPayload: `${URLS.web}/scan/weixin?scanId=${encodeURIComponent(scanId)}`, expiresAt: createdAt + expireIn * 1000,
      createdAt, protocol, status: 'pending', pollIntervalMs: 1500, scanner: '微信扫一扫', scope: 'sanguosha-community', gameAuthenticated: false };
  }
  async poll(challenge) {
    if (!challenge) throw new CommunityAuthError('INVALID_ARGUMENT', '没有待扫码请求。');
    const protocol = protocolCheck(challenge.protocol);
    if (!Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= Date.now()) return { status: 'expired', gameAuthenticated: false };
    let credential;
    if (protocol === 'app-qr-v1') {
      const result = await this.request('gateway', 'login/v1/qrcode', { params: { qrcode: opaque(challenge.qrPayload, '官方扫码内容', 2048) } });
      if (!result.data?.token) return { status: 'pending', gameAuthenticated: false };
      credential = { token: opaque(result.data.token, '官方授权凭证') };
    } else {
      const result = await this.request('api', '/sgxh/pcScan/poll', { method: 'POST', body: { scanId: opaque(challenge.challengeId, '扫码ID', 256) } });
      if (!result.data?.appletToken) return { status: ['expired', 'failed', 'error'].includes(result.data?.status) ? 'expired' : 'pending', gameAuthenticated: false };
      const exchange = await this.request('web', '/api/auth/login', { method: 'POST', body: { ticket: opaque(result.data.appletToken, '扫码票据') } });
      credential = cookieFrom(exchange.response);
    }
    const session = { ...credential, protocol, scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile',
      communityAuthenticated: true, gameAuthenticated: false, channelVerified: false, authenticatedAt: Date.now() };
    // Verify ownership through the official current-user endpoint before storing/claiming authorization.
    const profile = await this.queryOwn('profile', session);
    if (!profile.data || typeof profile.data !== 'object' || Array.isArray(profile.data) || !Object.keys(profile.data).length) throw new CommunityAuthError('AUTH_VALIDATION_FAILED', '官方未返回可验证的本人社区资料，尚未建立授权。');
    return { status: 'authorized', session, profile: profile.data, communityAuthenticated: true, gameAuthenticated: false, channelVerified: false };
  }
  async queryOwn(kind, session, params = {}) {
    validateSession(session); kind = ALIASES[kind] ?? kind;
    const mapping = session.protocol === 'app-qr-v1' ? LEGACY_QUERIES : MODERN_QUERIES;
    const spec = mapping[kind];
    if (!spec) throw new CommunityAuthError('QUERY_UNSUPPORTED', `此社区授权协议支持：${Object.keys(mapping).join('、')}。华为/官号渠道认证与角色关联仍需官方支持。`);
    const [baseName, endpoint, method = 'GET'] = spec; let query = {};
    if (kind === 'records' || kind === 'recent') {
      const model = Number(params.model ?? 0);
      if (!Number.isInteger(model) || model < 0 || model > 4) throw new CommunityAuthError('INVALID_ARGUMENT', '战绩模式为 0全部、1排位、2身份、3国战、4斗地主。');
      query = { model };
      if (kind === 'recent') {
        const page = Number(params.page ?? 1);
        if (!Number.isInteger(page) || page < 1 || page > 1000) throw new CommunityAuthError('INVALID_ARGUMENT', '战绩页码为 1 至 1000。');
        query.page = page;
      }
    }
    const result = await this.request(baseName, endpoint, { method, token: session.token, params: query, ...(method === 'POST' ? { body: {} } : {}) });
    return { kind, data: redactOwnData(result.data), sourceUrl: result.sourceUrl, source: result.sourceUrl,
      protocol: session.protocol, scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile', communityAuthenticated: true,
      gameAuthenticated: false, channelVerified: false, notice: '数据来自你已授权的官方社区本人接口；尚未验证官号/华为游戏渠道登录。' };
  }
  async logout(session) {
    validateSession(session);
    if (session.protocol === 'pc-scan-v7') {
      await this.request('web', '/api/auth/logout', { method: 'POST', body: null, token: session.token, cookieValue: session.cookieValue });
      return { status: 'logged-out', discardLocalSession: true, revokedRemotely: true };
    }
    return { status: 'logged-out', discardLocalSession: true, revokedRemotely: false,
      notice: '应删除本插件本地加密会话；未核实旧版官方社区的服务器撤销接口，不能宣称已撤销其他客户端会话。' };
  }
  supportedQueries(protocol = 'app-qr-v1') { return Object.keys(protocolCheck(protocol) === 'app-qr-v1' ? LEGACY_QUERIES : MODERN_QUERIES); }
}
export function createCommunityAuthClient(options) { return new CommunityAuthClient(options); }
