import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityAuthClient, redactOwnData } from '../lib/community-auth.mjs';
const reply = (data, code = 0, headers = {}) => new Response(JSON.stringify({ code, data }), { status: 200, headers });
const session = { token: 'test-community-token', protocol: 'app-qr-v1', scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile' };

test('APP QR pending flow follows real official gateway and never marks game authentication', async () => {
  const calls = [];
  const client = new CommunityAuthClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return calls.length === 1 ? reply({ qrcode: 'test-qr-payload' }) : reply({ token: '' }); } });
  const challenge = await client.start();
  assert.equal(challenge.protocol, 'app-qr-v1'); assert.equal(challenge.qrPayload, 'test-qr-payload');
  assert.equal(challenge.scanner, '三国咸话APP扫一扫');
  assert.equal(calls[0].url, 'https://hi-gateway.sanguosha.cn/api/login/v1/qrcode');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((await client.poll(challenge)).status, 'pending');
  assert.equal(challenge.gameAuthenticated, false);
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(new URL(calls[1].url).searchParams.get('qrcode'), 'test-qr-payload');
});

test('authorized APP session requires successful current-user validation and is community-only', async () => {
  let calls = 0;
  const client = new CommunityAuthClient({ fetchImpl: async (url, init) => {
    calls++; if (calls === 1) return reply({ token: session.token });
    assert.equal(url, 'https://wxforum.sanguosha.cn/api/profile');
    assert.equal(init.headers.Authorization, session.token);
    return reply({ id: 123, nick_name: '测试本人', phone: 'PRIVATE_PHONE', token: 'PRIVATE_TOKEN' });
  } });
  const result = await client.poll({ protocol: 'app-qr-v1', qrPayload: 'qr', expiresAt: Date.now() + 10000 });
  assert.equal(result.status, 'authorized'); assert.equal(result.session.token, session.token);
  assert.equal(result.gameAuthenticated, false); assert.equal(result.channelVerified, false);
  assert.deepEqual(result.profile, { id: 123, nick_name: '测试本人' });
  const invalid = new CommunityAuthClient({ fetchImpl: async () => reply({}) });
  await assert.rejects(invalid.queryOwn('profile', { ...session, scope: 'sanguosha-ol' }), e => e.code === 'AUTH_REQUIRED');
});

test('modern scanner exchanges official ticket and validates WEB_SESSIONID before claiming authorization', async () => {
  const calls = [];
  const client = new CommunityAuthClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/generateId')) return reply({ scanId: 'test-scan-id', expireIn: 300 }, 1000);
    if (url.endsWith('/poll')) return reply({ status: 'authorized', appletToken: 'test-ticket' }, 1000);
    if (url.endsWith('/api/auth/login')) return reply({}, 0, { 'set-cookie': 'WEB_SESSIONID=Bearer%20test-session; Path=/web; Max-Age=600; Secure' });
    assert.equal(url, 'https://api-xh.sanguosha.cn/user/userInfo');
    assert.equal(init.headers.Authorization, 'Bearer test-session');
    return reply({ userId: '123', avatar: '/test-avatar' }, 1000);
  } });
  const challenge = await client.start({ protocol: 'pc-scan-v7' });
  assert.match(challenge.qrPayload, /^https:\/\/xh\.sanguosha\.cn\/web\/scan\/weixin\?scanId=/);
  const result = await client.poll(challenge);
  assert.equal(result.status, 'authorized'); assert.equal(result.gameAuthenticated, false);
  assert.equal(result.session.token, 'Bearer test-session');
  assert.equal(JSON.parse(calls[2].init.body).ticket, 'test-ticket');
});

test('fixed本人 read-only queries preserve inventory and redact credentials/PII recursively', async () => {
  const calls = [];
  const client = new CommunityAuthClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init }); return reply({ generals: [{ id: 1, count: 3, name: '测试武将', authToken: 'PRIVATE' }], coins: 100, ip_address: '192.0.2.1', nested: { email: 'PRIVATE', victories: 4 } });
  } });
  const result = await client.queryOwn('资产', session);
  assert.equal(calls[0].url, 'https://hi-gateway.sanguosha.cn/api/game/v2/general/property');
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(result.data, { generals: [{ id: 1, count: 3, name: '测试武将' }], coins: 100, nested: { victories: 4 } });
  assert.equal(result.gameAuthenticated, false);
  await client.queryOwn('records', session, { model: 4, url: 'https://evil.example/private' });
  assert.equal(new URL(calls[1].url).searchParams.get('model'), '4');
  assert.equal(new URL(calls[1].url).hostname, 'wxforum.sanguosha.cn');
  await client.queryOwn('recent', session, { model: 1, page: 2 });
  assert.equal(new URL(calls[2].url).pathname, '/api/user/getGameRecordList');
  assert.equal(new URL(calls[2].url).searchParams.get('page'), '2');
  await assert.rejects(client.queryOwn('records', session, { model: 9 }), e => e.code === 'INVALID_ARGUMENT');
  await assert.rejects(client.queryOwn('purchase', session), e => e.code === 'QUERY_UNSUPPORTED');
  await assert.rejects(client.request('oldApi', 'https://evil.example/private', { token: session.token }), e => e.code === 'UNTRUSTED_URL');
});

test('expired challenge/session and protected or unlinked data do not claim login success', async () => {
  let calls = 0; const client = new CommunityAuthClient({ fetchImpl: async () => { calls++; return reply({}, 20020); } });
  assert.equal((await client.poll({ protocol: 'app-qr-v1', expiresAt: 1 })).status, 'expired'); assert.equal(calls, 0);
  await assert.rejects(client.queryOwn('summary', session), e => e.code === 'ROLE_LINK_REQUIRED');
  await assert.rejects(client.queryOwn('profile', { ...session, token: 'bad\nheader' }), e => e.code === 'INVALID_ARGUMENT');
  await assert.rejects(client.queryOwn('profile', { ...session, expiresAt: 1 }), e => e.code === 'AUTH_EXPIRED');
  const emptyProfile = new CommunityAuthClient({ fetchImpl: async url => reply(url.includes('qrcode') ? { token: session.token } : {}) });
  await assert.rejects(emptyProfile.poll({ protocol: 'app-qr-v1', qrPayload: 'qr', expiresAt: Date.now() + 10000 }), e => e.code === 'AUTH_VALIDATION_FAILED');
});

test('legacy logout requests local discard without inventing a remote revoke endpoint', async () => {
  let calls = 0; const client = new CommunityAuthClient({ fetchImpl: async () => { calls++; return reply({}); } });
  const result = await client.logout(session);
  assert.equal(result.discardLocalSession, true); assert.equal(result.revokedRemotely, false); assert.equal(calls, 0);
  assert.deepEqual(redactOwnData({ win: 4, token: 'secret', deep: { realName: 'PRIVATE', cardCount: 6 } }), { win: 4, deep: { cardCount: 6 } });
});
