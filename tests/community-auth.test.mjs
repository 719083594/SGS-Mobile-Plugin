import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityAuthClient, redactOwnData } from '../lib/community-auth.mjs';
const reply = (data, code = 1000, headers = {}) => new Response(JSON.stringify({ code, data }), { status: 200, headers });
const session = { token: 'Bearer synthetic-community-token', protocol: 'pc-scan-v7', scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile', communityUserId: '123456' };
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('default QR flow uses the current official scanner without claiming game-channel authentication', async () => {
  const calls = [], client = new CommunityAuthClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return calls.length === 1 ? reply({ scanId: 'synthetic-scan', expireIn: 300 }) : reply({}); } });
  const challenge = await client.start();
  assert.equal(challenge.protocol, 'pc-scan-v7'); assert.equal(challenge.scanner, '微信扫一扫');
  assert.match(challenge.qrPayload, /^https:\/\/xh\.sanguosha\.cn\/web\/scan\/weixin\?scanId=/);
  assert.equal(calls[0].url, 'https://api-xh.sanguosha.cn/sgxh/pcScan/generateId');
  assert.equal(calls[0].init.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].init.body), { gameId: 2 });
  assert.equal((await client.poll(challenge)).status, 'pending'); assert.equal(challenge.gameAuthenticated, false);
  assert.equal(calls[1].url, 'https://api-xh.sanguosha.cn/sgxh/pcScan/poll');
  assert.deepEqual(JSON.parse(calls[1].init.body), { scanId: 'synthetic-scan' });
});

test('current scanner exchanges its ticket and proves the new identity before authorizing', async () => {
  const calls = [], client = new CommunityAuthClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/poll')) return reply({ status: 'authorized', appletToken: 'synthetic-ticket' });
    if (url.endsWith('/api/auth/login')) return reply({}, 0, { 'set-cookie': 'WEB_SESSIONID=Bearer%20synthetic-session; Path=/web; Max-Age=600; Secure' });
    assert.equal(url, 'https://api-xh.sanguosha.cn/user/userInfo'); assert.equal(init.headers.Authorization, 'Bearer synthetic-session');
    return reply({ userId: '123456', avatar: '/synthetic-avatar', phone: 'SYNTHETIC_PRIVATE_PHONE' });
  } });
  const result = await client.poll({ protocol: 'pc-scan-v7', challengeId: 'synthetic-scan', expiresAt: Date.now() + 10000 });
  assert.equal(result.status, 'authorized'); assert.equal(result.session.communityUserId, '123456');
  assert.equal(result.session.token, 'Bearer synthetic-session'); assert.equal(result.gameAuthenticated, false); assert.equal(result.channelVerified, false);
  assert.deepEqual(result.profile, { avatar: '/synthetic-avatar' }); assert.equal(JSON.parse(calls[1].init.body).ticket, 'synthetic-ticket');
});

test('fixed modern self queries preserve data while redacting credentials, identity echo and PII', async () => {
  const calls = [], client = new CommunityAuthClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init }); return reply({ yb: 100, ip_address: '192.0.2.1', userId: '123456', nested: { email: 'SYNTHETIC_PRIVATE', victories: 4 } });
  } });
  const result = await client.queryOwn('资产', session);
  assert.equal(calls[0].url, 'https://api-xh.sanguosha.cn/user/gameProperty?toUserId=123456');
  assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.deepEqual(result.data, { yb: 100, nested: { victories: 4 } }); assert.equal(result.protocol, 'pc-scan-v7'); assert.equal(result.gameAuthenticated, false);
  assert.doesNotMatch(result.sourceUrl, /\?/); assert.doesNotMatch(JSON.stringify(result), /123456|synthetic-community-token/);
  await rejects(client.queryOwn('assets', session, { toUserId: '999' }), 'INVALID_ARGUMENT');
  for (const kind of ['purchase', 'favorites', 'skins', 'constructor', 'toString']) await rejects(client.queryOwn(kind, session), 'QUERY_UNSUPPORTED');
  await rejects(client.request('api', 'https://evil.invalid/private', { token: session.token }), 'UNTRUSTED_URL'); assert.equal(calls.length, 1);
  await rejects(client.request('api', '/user/gameProperty', { method: 'POST', token: session.token }), 'UNTRUSTED_URL');
  await rejects(client.request('web', '/api/auth/logout', { method: 'GET', token: session.token }), 'UNTRUSTED_URL'); assert.equal(calls.length, 1);
});

test('modern fixed endpoints use only the authenticated identity and no legacy host or Cookie', async () => {
  const routes = { profile: ['/user/userInfo', 'POST'], summary: ['/user/gameSummary'], roles: ['/user/getAllOtherGameUser'], gameInfo: ['/user/generalGameInfo'], assets: ['/user/gameProperty'], abilities: ['/user/gameGeneralAbilities'] };
  const calls = [], client = new CommunityAuthClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return reply({ userId: 123456, value: 1 }); } });
  for (const [kind, [path, method = 'GET']] of Object.entries(routes)) {
    const result = await client.queryOwn(kind, session), call = calls.at(-1), url = new URL(call.url);
    assert.equal(url.origin, 'https://api-xh.sanguosha.cn'); assert.equal(url.pathname, path); assert.equal(call.init.method, method);
    assert.equal(call.init.headers.Authorization, session.token); assert.equal(call.init.headers.Cookie, undefined); assert.equal(call.init.redirect, 'error');
    assert.deepEqual(Object.fromEntries(url.searchParams), ['profile', 'summary', 'roles'].includes(kind) ? {} : { toUserId: '123456' });
    assert.equal(call.init.body, kind === 'profile' ? '{}' : undefined); assert.equal(result.sourceUrl, url.origin + path);
  }
  assert.deepEqual(client.supportedQueries().sort(), ['profile','summary','roles','gameInfo','assets','force','records','recent','abilities','bestGeneral','ownedGenerals','ownedSkins'].sort());
});

test('public mode numbers explicitly map to modern wire modes and reject query injection', async () => {
  const calls = [], client = new CommunityAuthClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return reply({ list: [] }); } });
  const paths = { records: '/user/gameCareerUserInfo', force: '/user/gameForce', bestGeneral: '/user/gameBestGeneralNew', recent: '/user/gameRecordList/total' };
  for (const [kind, path] of Object.entries(paths)) for (const [model, wireMode] of [0,4,1,2,3].entries()) {
    const result = await client.queryOwn(kind, session, { model, ...(kind === 'recent' ? { page: 2 } : {}) }), url = new URL(calls.at(-1).url);
    assert.equal(url.pathname, path);
    assert.deepEqual(Object.fromEntries(url.searchParams), { toUserId: '123456', mode: String(wireMode), ...(kind === 'recent' ? { page: '2', size: '10', result_: '0' } : {}) });
    assert.deepEqual(result.query, { model, wireMode, ...(kind === 'recent' ? { page: 2, pageSize: 10 } : {}) }); assert.doesNotMatch(JSON.stringify(result), /123456|toUserId/);
  }
  const before = calls.length;
  for (const params of [null, [], { model: true }, { model: 5 }, { model: '1x' }, { model: 1.5 }, { toUserId: '123' }, { mode: 4 }, { model: 1, url: 'https://evil.invalid' }, { page: 2 }]) await rejects(client.queryOwn('records', session, params), 'INVALID_ARGUMENT');
  for (const params of [{ page: 0 }, { page: 1001 }, { page: true }, { page: '1x' }, { result_: 1 }, { size: 20 }, { pageSize: 20 }]) await rejects(client.queryOwn('recent', session, params), 'INVALID_ARGUMENT'); assert.equal(calls.length, before);
});

test('legacy protocol, missing identity, expired sessions and unlinked roles fail closed', async () => {
  let calls = 0; const client = new CommunityAuthClient({ fetchImpl: async () => { calls++; return reply({}, 40001); } });
  assert.equal((await client.poll({ protocol: 'pc-scan-v7', expiresAt: 1 })).status, 'expired'); assert.equal(calls, 0);
  await rejects(client.queryOwn('summary', session), 'ROLE_LINK_REQUIRED'); const after = calls;
  const legacy = { ...session, protocol: 'app-qr-v1' };
  await rejects(client.start({ protocol: 'app-qr-v1' }), 'UNSUPPORTED_PROTOCOL');
  await rejects(client.poll({ protocol: 'app-qr-v1', expiresAt: Date.now() + 10000 }), 'UNSUPPORTED_PROTOCOL');
  await rejects(client.queryOwn('assets', legacy), 'UNSUPPORTED_PROTOCOL'); await rejects(client.logout(legacy), 'UNSUPPORTED_PROTOCOL');
  assert.throws(() => client.supportedQueries('app-qr-v1'), error => error.code === 'UNSUPPORTED_PROTOCOL');
  for (const communityUserId of [undefined, 0, true, '123\n', Number.MAX_SAFE_INTEGER + 1]) await rejects(client.queryOwn('summary', { ...session, communityUserId }), 'AUTH_VALIDATION_FAILED');
  await rejects(client.queryOwn('profile', { ...session, token: 'bad\nheader' }), 'INVALID_ARGUMENT');
  await rejects(client.queryOwn('profile', { ...session, expiresAt: 1 }), 'AUTH_EXPIRED');
  await rejects(client.queryOwn('profile', { ...session, scope: 'sanguosha-ol' }), 'AUTH_REQUIRED'); assert.equal(calls, after);
});

test('profile rejects a different identity proof and logout only uses proven official revoke', async () => {
  await rejects(new CommunityAuthClient({ fetchImpl: async () => reply({ userId: 999999 }) }).queryOwn('profile', session), 'AUTH_VALIDATION_FAILED');
  const calls = [], client = new CommunityAuthClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return reply({}); } });
  assert.deepEqual(await client.logout({ ...session, cookieValue: 'Bearer%20synthetic-community-token' }), { status: 'logged-out', discardLocalSession: true, revokedRemotely: true });
  assert.equal(calls[0].url, 'https://xh.sanguosha.cn/web/api/auth/logout'); assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.body, 'null');
  assert.equal(calls[0].init.headers.Cookie, 'WEB_SESSIONID=Bearer%20synthetic-community-token');
  assert.deepEqual(redactOwnData({ win: 4, token: 'synthetic-secret', deep: { realName: 'SYNTHETIC_PRIVATE', cardCount: 6, toUserId: 123 } }), { win: 4, deep: { cardCount: 6 } });
});
