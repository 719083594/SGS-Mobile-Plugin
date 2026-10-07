/** Original official-community QR authorization; it does not authenticate a game channel. */
import { cleanText } from './public.mjs';

export const COMMUNITY_AUTH_SOURCES = Object.freeze({
  web: 'https://xh.sanguosha.cn/web/2',
  record: 'https://note.sanguosha.cn/record/index.html',
  recordProtocol: 'https://note.sanguosha.cn/record/assets/index-Oam2QQVM.js',
  recordUi: 'https://note.sanguosha.cn/record/assets/index-CXtl96WG.js',
  webProtocol: 'https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js'
});
const URLS = Object.freeze({ api: 'https://api-xh.sanguosha.cn', web: 'https://xh.sanguosha.cn/web' });
const MODERN_QUERIES = Object.freeze({ profile: ['api', '/user/userInfo', 'POST'], summary: ['api', '/user/gameSummary'], roles: ['api', '/user/getAllOtherGameUser'],
  gameInfo: ['api', '/user/generalGameInfo'], assets: ['api', '/user/gameProperty'], force: ['api', '/user/gameForce'],
  records: ['api', '/user/gameCareerUserInfo'], recent: ['api', '/user/gameRecordList/total'],
  abilities: ['api', '/user/gameGeneralAbilities'], bestGeneral: ['api', '/user/gameBestGeneralNew'],
  ownedGenerals: ['api', '/user/gameGeneral/total'], ownedSkins: ['api', '/user/gameGeneral/total'] });
export const MODERN_OWNED_COLLECTION_SOURCE = 'https://api-xh.sanguosha.cn/user/gameGeneral/total';
export const MODERN_OWNED_COLLECTION_PAGE_SIZE = 12;
const ALLOWED_ENDPOINTS = {
  api: new Set(['/sgxh/pcScan/generateId', '/sgxh/pcScan/poll', ...Object.values(MODERN_QUERIES).map(spec => spec[1])]),
  web: new Set(['/api/auth/login', '/api/auth/logout'])
};
const ALIASES = { 战绩: 'records', 将力: 'force', 资产: 'assets', 皮肤: 'ownedSkins', 个人资料: 'profile', 角色: 'roles', 概览: 'summary', 能力: 'abilities', 擅长武将: 'bestGeneral' };
const MODE_TO_WIRE = Object.freeze([0, 4, 1, 2, 3]);
const SENSITIVE_KEY = /^(?:token|.*token|authorization|password|passwd|cookie|.*secret|phone|phoneNumber|mobile|mobilePhone|tel|email|idCard|idCardNumber|realName|real_name|id_number|ip|ipAddress|ip_address|share_pic|address|deviceId|imei|mac|userId|toUserId|viewUserId|communityUserId)$/i;

export class CommunityAuthError extends Error {
  constructor(code, message, sourceUrl) { super(message); this.name = 'CommunityAuthError'; this.code = code; this.sourceUrl = sourceUrl; }
}
function opaque(value, label, maxLength = 16384) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) throw new CommunityAuthError('INVALID_ARGUMENT', `${label}无效。`);
  return value;
}
function protocolCheck(protocol) {
  if (protocol !== 'pc-scan-v7') throw new CommunityAuthError('UNSUPPORTED_PROTOCOL', '请使用 #sgs登录 完成现行官方社区扫码授权。');
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
function verifiedCommunityUserId(value) {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^[0-9]+$/.test(value))) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new CommunityAuthError('AUTH_VALIDATION_FAILED', '官方未返回可验证的新版本人社区身份，尚未建立授权。');
  }
  return String(Number(value));
}
function ownedArgument(value, min, max, label) {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^[0-9]+$/.test(value))) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new CommunityAuthError('INVALID_ARGUMENT', `${label}无效。`);
  }
  return Number(value);
}
function modernQuery(kind, params, communityUserId) {
  const modeQuery = ['records', 'recent', 'force', 'bestGeneral'].includes(kind);
  const allowed = modeQuery ? (kind === 'recent' ? ['model', 'page'] : ['model']) : [];
  if (!params || typeof params !== 'object' || Array.isArray(params) || Reflect.ownKeys(params).some(key => !allowed.includes(key))) {
    throw new CommunityAuthError('INVALID_ARGUMENT', '本人查询只接受当前功能支持的模式或页码参数。');
  }
  const query = ['profile', 'summary', 'roles'].includes(kind) ? {} : { toUserId: communityUserId };
  if (!modeQuery) return { query };
  const model = ownedArgument(params.model ?? 0, 0, 4, '战绩模式'), wireMode = MODE_TO_WIRE[model];
  query.mode = wireMode;
  const metadata = { model, wireMode };
  if (kind === 'recent') {
    const page = ownedArgument(params.page ?? 1, 1, 1000, '战绩页码');
    Object.assign(query, { page, size: 10, result_: 0 });
    Object.assign(metadata, { page, pageSize: 10 });
  }
  return { query, metadata };
}
function modernOwnedQuery(kind, params) {
  if (!params || typeof params !== 'object' || Array.isArray(params) || Reflect.ownKeys(params).some(key => key !== 'page' && key !== 'countryType')) {
    throw new CommunityAuthError('INVALID_ARGUMENT', '本人收藏只接受页码与武将势力筛选。');
  }
  const page = ownedArgument(params.page ?? 1, 1, 1000, '本人收藏页码'), countryType = ownedArgument(params.countryType ?? 0, 0, 5, '武将势力');
  const skin = kind === 'ownedSkins';
  if (skin && countryType !== 0) throw new CommunityAuthError('INVALID_ARGUMENT', '本人皮肤暂不支持势力筛选。');
  return { page, pageSize: MODERN_OWNED_COLLECTION_PAGE_SIZE, countryType, skin };
}
/** Validate the modern official owned page before redaction or display.
 * The query is safe local metadata; it intentionally never includes toUserId. */
export function validateModernOwnedPage(data, query) {
  const changed = () => { throw new CommunityAuthError('SOURCE_CHANGED', '官方本人收藏分页响应结构发生变化，暂未生成拥有列表。', MODERN_OWNED_COLLECTION_SOURCE); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(query) || Reflect.ownKeys(query).some(key => !['page', 'pageSize', 'countryType', 'skin'].includes(key)) ||
      query.pageSize !== MODERN_OWNED_COLLECTION_PAGE_SIZE || typeof query.skin !== 'boolean' ||
      !Number.isInteger(query.page) || query.page < 1 || query.page > 1000 || !Number.isInteger(query.countryType) || query.countryType < 0 || query.countryType > 5 || (query.skin && query.countryType !== 0)) return changed();
  if (!object(data) || ![data.have, data.total, data.searchNum].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000) ||
      data.have > data.total || data.searchNum > data.have || (query.countryType === 0 && data.searchNum !== data.have)) return changed();
  const pages = Math.max(1, Math.ceil(data.searchNum / query.pageSize));
  if (query.page > pages) throw new CommunityAuthError('INVALID_ARGUMENT', '本人收藏页码超出当前筛选的有效范围。');
  const key = query.skin ? 'skins' : 'generals', rows = data[key];
  const expected = Math.min(query.pageSize, Math.max(0, data.searchNum - (query.page - 1) * query.pageSize));
  if (!Array.isArray(rows) || rows.length !== expected) return changed();
  const seen = new Set(), safeRows = [];
  for (const row of rows) {
    if (!object(row) || !Number.isSafeInteger(row.id) || row.id < 1 || seen.has(row.id) || row.isHave !== true ||
        typeof row.name !== 'string' || !row.name.trim() || Array.from(row.name).length > 100 || /[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF\uD800-\uDFFF]/u.test(row.name)) return changed();
    if (!query.skin && query.countryType !== 0 && row.country !== query.countryType && row.country2 !== query.countryType) return changed();
    seen.add(row.id);
    const safe = { id: row.id, name: row.name.trim(), isHave: true };
    for (const field of ['url', 'iconUrl']) {
      if (row[field] === undefined || row[field] === null) continue;
      if (typeof row[field] !== 'string' || row[field].length > 2048 || /[\u0000-\u001f\u007f-\u009f]/u.test(row[field])) return changed();
      safe[field] = row[field];
    }
    const integers = query.skin ? ['generalId', 'grade', 'commentNum'] : ['country', 'country2', 'grade', 'star', 'maxStar'];
    for (const field of integers) {
      if (row[field] === undefined || row[field] === null) continue;
      if (!Number.isSafeInteger(row[field]) || row[field] < 0 || row[field] > 1000000 || (['country', 'country2'].includes(field) && row[field] > 5)) return changed();
      safe[field] = row[field];
    }
    if (!query.skin && row.score !== undefined && row.score !== null) {
      if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0) return changed();
      safe.score = row.score;
    }
    safeRows.push(safe);
  }
  return { data: { [key]: safeRows, have: data.have, total: data.total, searchNum: data.searchNum }, pages };
}
function cookieFrom(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
  const unverified = () => new CommunityAuthError('SESSION_EXCHANGE_UNVERIFIED', '已完成扫码，但官方网页未返回可验证的社区会话，尚未建立插件授权。');
  if (!Array.isArray(cookies) || cookies.length > 32) throw unverified();
  const candidates = []; let sessionNames = 0;
  for (const header of cookies) {
    if (typeof header !== 'string' || header.length > 65536 || /[\u0000-\u001f\u007f-\u009f]/.test(header)) throw unverified();
    sessionNames += [...header.matchAll(/(?:^|[,;])\s*WEB_SESSIONID\s*=/g)].length;
    // Combined Set-Cookie fallback: an Expires date comma is not a cookie boundary.
    for (const cookie of header.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/)) {
      const [pair, ...attributes] = cookie.split(';');
      if (attributes.some(attribute => /^\s*WEB_SESSIONID\s*=/.test(attribute))) throw unverified();
      const match = /^\s*WEB_SESSIONID=(.*)$/.exec(pair);
      if (!match && /^\s*WEB_SESSIONID\s*=/.test(pair)) throw unverified();
      if (match) candidates.push({ raw: match[1], attributes });
    }
  }
  if (candidates.length !== 1 || sessionNames !== 1) throw unverified();
  const { raw, attributes } = candidates[0];
  // RFC cookie-octet excludes whitespace, quotes, commas, semicolons and backslashes.
  if (!raw || raw.length > 16384 || !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/.test(raw)) throw unverified();
  let token;
  try { token = decodeURIComponent(raw); } catch { throw unverified(); }
  if (!token.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(token)) throw unverified();
  const expires = new Map();
  for (const attribute of attributes) {
    const match = /^\s*(Max-Age|Expires)\s*=(.*?)\s*$/i.exec(attribute);
    if (!match) {
      if (/^\s*(Max-Age|Expires)(?:\s|=|$)/i.test(attribute)) throw unverified();
      continue;
    }
    const name = match[1].toLowerCase();
    if (expires.has(name)) throw unverified();
    expires.set(name, match[2]);
  }
  let expiresAt;
  if (expires.has('max-age')) {
    const value = expires.get('max-age');
    if (!/^-?[0-9]+$/.test(value)) throw unverified();
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds)) throw unverified();
    if (seconds <= 0) throw new CommunityAuthError('AUTH_EXPIRED', '官方网页会话已过期，请重新扫码。');
    expiresAt = Date.now() + seconds * 1000;
    if (!Number.isSafeInteger(expiresAt)) throw unverified();
  } else if (expires.has('expires')) {
    expiresAt = Date.parse(expires.get('expires'));
    if (!Number.isFinite(expiresAt)) throw unverified();
    if (expiresAt <= Date.now()) throw new CommunityAuthError('AUTH_EXPIRED', '官方网页会话已过期，请重新扫码。');
  }
  return { token, cookieValue: raw, ...(expiresAt !== undefined ? { expiresAt } : {}) };
}

export class CommunityAuthClient {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 15000, maxResponseBytes = 3000000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; this.maxResponseBytes = maxResponseBytes;
  }
  async request(baseName, endpoint, { method = 'GET', body, token, cookieValue, params = {} } = {}) {
    // baseName/path are selected inside this module, never from caller-controlled URLs.
    if (!Object.hasOwn(URLS, baseName) || !ALLOWED_ENDPOINTS[baseName].has(endpoint)) throw new CommunityAuthError('UNTRUSTED_URL', '仅允许访问已核实的官方社区授权及本人只读端点。');
    const expectedMethod = baseName === 'web' || endpoint.startsWith('/sgxh/pcScan/') || endpoint === '/user/userInfo' ? 'POST' : 'GET';
    if (method !== expectedMethod) throw new CommunityAuthError('UNTRUSTED_URL', '仅允许使用已核实的官方接口请求方式。');
    const url = new URL(`${URLS[baseName]}${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const headers = { 'Content-Type': 'application/json;charset=UTF-8', 'App-System': 'pc', 'client-Id': '', 'app-version': '7.0.0', 'AppVersion-Code': '' };
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
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CommunityAuthError('SOURCE_CHANGED', '官方社区响应格式发生变化。');
      if (![0, 1000].includes(payload.code)) {
        const source = url.href.split('?')[0];
        if ([401, 1003].includes(payload.code)) throw new CommunityAuthError('AUTH_EXPIRED', '官方社区会话无效或已过期，请重新扫码授权。', source);
        if (payload.code === 40001) throw new CommunityAuthError('ROLE_LINK_REQUIRED', '官方社区尚未关联可查询的移动版角色，请在官方三国咸话APP内完成角色关联。', source);
        throw new CommunityAuthError('API_ERROR', `官方社区未完成请求（代码 ${Number(payload.code) || 'unknown'}）。`, source);
      }
      return { data: payload.data, response, sourceUrl: url.href.split('?')[0] };
    } catch (error) {
      if (error instanceof CommunityAuthError) throw error;
      if (controller.signal.aborted) throw new CommunityAuthError('TIMEOUT', '官方社区请求超时，请稍后重试。');
      throw new CommunityAuthError('NETWORK_ERROR', '暂时无法连接官方三国咸话社区。');
    } finally { clearTimeout(timer); }
  }
  async start({ protocol = 'pc-scan-v7' } = {}) {
    protocolCheck(protocol); const createdAt = Date.now();
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
    const result = await this.request('api', '/sgxh/pcScan/poll', { method: 'POST', body: { scanId: opaque(challenge.challengeId, '扫码ID', 256) } });
    if (['expired', 'failed', 'error'].includes(result.data?.status)) return { status: 'expired', gameAuthenticated: false };
    if (!result.data?.appletToken) return { status: 'pending', gameAuthenticated: false };
    const exchange = await this.request('web', '/api/auth/login', { method: 'POST', body: { ticket: opaque(result.data.appletToken, '扫码票据') } });
    const credential = cookieFrom(exchange.response);
    const session = { ...credential, protocol, scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile',
      communityAuthenticated: true, gameAuthenticated: false, channelVerified: false, authenticatedAt: Date.now() };
    // Verify ownership through the official current-user endpoint before storing/claiming authorization.
    const profile = await this.queryOwn('profile', session);
    if (!profile.data || typeof profile.data !== 'object' || Array.isArray(profile.data)) throw new CommunityAuthError('AUTH_VALIDATION_FAILED', '官方未返回可验证的本人社区资料，尚未建立授权。');
    session.communityUserId = verifiedCommunityUserId(profile.communityUserId);
    return { status: 'authorized', session, profile: profile.data, communityUserId: session.communityUserId, communityAuthenticated: true, gameAuthenticated: false, channelVerified: false };
  }
  async queryOwn(kind, session, params = {}) {
    validateSession(session); kind = ALIASES[kind] ?? kind;
    const spec = Object.hasOwn(MODERN_QUERIES, kind) ? MODERN_QUERIES[kind] : undefined;
    if (!spec) throw new CommunityAuthError('QUERY_UNSUPPORTED', `此社区授权协议支持：${Object.keys(MODERN_QUERIES).join('、')}。华为/官号渠道认证与角色关联仍需官方支持。`);
    const [baseName, endpoint, method = 'GET'] = spec;
    const authenticatedUserId = kind === 'profile' ? undefined : verifiedCommunityUserId(session.communityUserId);
    let query = {}, ownedQuery, metadata;
    if (kind === 'ownedGenerals' || kind === 'ownedSkins') {
      ownedQuery = modernOwnedQuery(kind, params);
      query = { toUserId: authenticatedUserId, have: true, skin: ownedQuery.skin, mode: 0, score: '',
        countryType: ownedQuery.countryType, gradeType: 0, page: ownedQuery.page, pageSize: ownedQuery.pageSize };
    } else {
      ({ query, metadata } = modernQuery(kind, params, authenticatedUserId));
    }
    const result = await this.request(baseName, endpoint, { method, token: session.token, params: query, ...(method === 'POST' ? { body: {} } : {}) });
    const ownedData = ownedQuery ? validateModernOwnedPage(result.data, ownedQuery).data : undefined;
    // Validate the raw identity before text redaction can normalize malformed input.
    const communityUserId = kind === 'profile' ? verifiedCommunityUserId(result.data?.userId) : undefined;
    if (communityUserId && session.communityUserId !== undefined && verifiedCommunityUserId(session.communityUserId) !== communityUserId) {
      throw new CommunityAuthError('AUTH_VALIDATION_FAILED', '官方返回的本人身份与当前授权不一致，请重新扫码。');
    }
    return { kind, data: redactOwnData(ownedData ?? result.data), ...(ownedQuery || metadata ? { query: ownedQuery ?? metadata } : {}), ...(communityUserId ? { communityUserId } : {}), sourceUrl: result.sourceUrl, source: result.sourceUrl,
      protocol: session.protocol, scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile', communityAuthenticated: true,
      gameAuthenticated: false, channelVerified: false, notice: '数据来自你已授权的官方社区本人接口；尚未验证官号/华为游戏渠道登录。' };
  }
  async logout(session) {
    validateSession(session);
    await this.request('web', '/api/auth/logout', { method: 'POST', body: null, token: session.token, cookieValue: session.cookieValue });
    return { status: 'logged-out', discardLocalSession: true, revokedRemotely: true };
  }
  supportedQueries(protocol = 'pc-scan-v7') { protocolCheck(protocol); return Object.keys(MODERN_QUERIES); }
}
export function createCommunityAuthClient(options) { return new CommunityAuthClient(options); }
