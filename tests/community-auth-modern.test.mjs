import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityAuthClient } from '../lib/community-auth.mjs';

const encodedCookie = 'Bearer%20synthetic-modern-session';
const challenge = () => ({ protocol: 'pc-scan-v7', challengeId: 'synthetic-scan', expiresAt: Date.now() + 60000, status: 'pending' });
const response = (data, { code = 1000, cookies, combined } = {}) => ({
  ok: true, status: 200, text: async () => JSON.stringify({ code, data }),
  headers: combined !== undefined ? { get: name => name === 'set-cookie' ? combined : null } : { getSetCookie: () => cookies ?? [] }
});
function flow(profile = { userId: 123 }, options = {}) {
  const calls = [];
  const client = new CommunityAuthClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/sgxh/pcScan/poll')) return response(options.pollData ?? { appletToken: 'synthetic-ticket' });
    if (url.endsWith('/api/auth/login')) return response({}, { code: 0, cookies: options.cookies ?? [`WEB_SESSIONID=${encodedCookie}; Path=/web; Max-Age=600; Secure; HttpOnly`], ...(options.combined !== undefined ? { combined: options.combined } : {}) });
    assert.equal(url, 'https://api-xh.sanguosha.cn/user/userInfo');
    assert.equal(init.method, 'POST');
    assert.equal(init.body, '{}');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-modern-session');
    assert.equal(init.headers.Cookie, undefined);
    return response(profile, { code: options.profileCode ?? 1000 });
  } });
  return { client, calls };
}

test('modern identity proof stores only a canonical positive safe decimal user ID', async () => {
  for (const [userId, canonical] of [[1, '1'], [123, '123'], ['000123', '123'], [Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)], [String(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER)]]) {
    const { client, calls } = flow({ userId, phone: 'SYNTHETIC_PRIVATE_PHONE', token: 'SYNTHETIC_PRIVATE_TOKEN' });
    const result = await client.poll(challenge());
    assert.equal(result.status, 'authorized');
    assert.equal(result.session.communityUserId, canonical);
    assert.equal(result.communityUserId, canonical);
    assert.equal(typeof result.session.communityUserId, 'string');
    assert.equal(result.session.protocol, 'pc-scan-v7');
    assert.equal(result.session.gameAuthenticated, false);
    assert.equal(result.profile.phone, undefined);
    assert.equal(result.profile.token, undefined);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => !new URL(call.url).search));
  }
});

test('modern proof rejects missing, legacy-only, malformed and unsafe IDs before text normalization', async () => {
  const invalidIds = [undefined, null, {}, [], false, true, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '', ' ', '123 ', ' 123', '+123', '-123', '1e3', '1.0', '0x7b', '0', '000', '9007199254740992', '999999999999999999999999999999999999', '123\n', '\t123', '123\u007f', '\u00a0123'];
  for (const userId of invalidIds) {
    const { client, calls } = flow({ id: 123, userId, nickname: 'synthetic' });
    const pending = challenge();
    await assert.rejects(client.poll(pending), error => error.code === 'AUTH_VALIDATION_FAILED');
    assert.equal(pending.status, 'pending');
    assert.equal(calls.length, 3);
  }
  for (const profile of [null, {}, [], 'userinfo unavailable']) {
    const { client } = flow(profile);
    await assert.rejects(client.poll(challenge()), error => error.code === 'AUTH_VALIDATION_FAILED');
  }
});

test('failed current-user verification cannot establish a modern session or disclose ticket values', async () => {
  const { client } = flow({ userId: 123 }, { profileCode: 1003 });
  await assert.rejects(client.poll(challenge()), error => {
    assert.equal(error.code, 'AUTH_EXPIRED');
    assert.equal(error.sourceUrl, 'https://api-xh.sanguosha.cn/user/userInfo');
    assert.doesNotMatch(error.message, /synthetic-ticket|synthetic-modern-session|synthetic-scan/);
    return true;
  });
});

test('modern identity proof accepts only official web success codes without changing legacy codes', async () => {
  for (const profileCode of [200, 20002, 10000, '1000']) {
    const { client } = flow({ userId: 123 }, { profileCode });
    await assert.rejects(client.poll(challenge()), error => error.code === 'API_ERROR');
  }
  const legacySession = { token: 'synthetic-legacy-token', protocol: 'app-qr-v1', scope: 'sanguosha-community', gameVersion: 'sanguosha-mobile' };
  for (const code of [200, 20002, 10000]) {
    const client = new CommunityAuthClient({ fetchImpl: async () => response({ id: 321 }, { code }) });
    assert.equal((await client.queryOwn('profile', legacySession)).data.id, 321);
  }
});

test('modern Cookie parser accepts one session among combined cookies without splitting Expires dates', async () => {
  const { client } = flow({ userId: 123 }, { combined: `OTHER=value; Expires=Fri, 01 Jan 2100 00:00:00 GMT, WEB_SESSIONID=${encodedCookie}; Expires=Fri, 01 Jan 2100 00:00:00 GMT; Secure` });
  const result = await client.poll(challenge());
  assert.equal(result.session.cookieValue, encodedCookie);
  assert.equal(result.session.expiresAt, Date.parse('Fri, 01 Jan 2100 00:00:00 GMT'));
  const maxAgePrecedence = flow({ userId: 123 }, { cookies: [`WEB_SESSIONID=${encodedCookie}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=600`] });
  assert.equal((await maxAgePrecedence.client.poll(challenge())).status, 'authorized');
});

test('modern Cookie parser rejects duplicate or ambiguous WEB_SESSIONID values', async () => {
  const good = `WEB_SESSIONID=${encodedCookie}`;
  for (const cookies of [[good, good], [good, 'WEB_SESSIONID=other'], [`${good}, WEB_SESSIONID=other`], [`${good}; WEB_SESSIONID=other`], [`${good}; Path=/web, WEB_SESSIONID =other`], [good, 'WEB_SESSIONID =other'], [good, 'WEB_SESSIONID=']]) {
    const { client, calls } = flow({ userId: 123 }, { cookies });
    await assert.rejects(client.poll(challenge()), error => error.code === 'SESSION_EXCHANGE_UNVERIFIED');
    assert.equal(calls.length, 2);
  }
});

test('modern Cookie parser rejects header injection, encoded controls and malformed encodings', async () => {
  const values = ['', ' space', 'space ', 'a b', '"quoted"', 'back\\slash', 'x,y', 'x\r\nInjected:yes', 'x\t', 'x\u007f', 'x\u0085', '%0d%0aInjected%3Ayes', '%09x', '%7f', '%C2%85', '%ZZ', '%E0%A4%A'];
  for (const value of values) {
    const { client, calls } = flow({ userId: 123 }, { cookies: [`WEB_SESSIONID=${value}; Path=/web`] });
    await assert.rejects(client.poll(challenge()), error => error.code === 'SESSION_EXCHANGE_UNVERIFIED');
    assert.equal(calls.length, 2);
  }
});

test('modern Cookie parser refuses expired, duplicate or unsafe expiry attributes', async () => {
  for (const attribute of ['Max-Age=0', 'Max-Age=-1', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT']) {
    const { client, calls } = flow({ userId: 123 }, { cookies: [`WEB_SESSIONID=${encodedCookie}; ${attribute}`] });
    await assert.rejects(client.poll(challenge()), error => error.code === 'AUTH_EXPIRED');
    assert.equal(calls.length, 2);
  }
  for (const attribute of ['Max-Age', 'Max-Age=nope', 'Max-Age=1e3', 'Max-Age=999999999999999999', 'Max-Age=9007199254740', 'Max-Age=600; max-age=600', 'Expires=nope', 'Expires=Fri, 01 Jan 2100 00:00:00 GMT; Expires=Fri, 01 Jan 2100 00:00:00 GMT']) {
    const { client } = flow({ userId: 123 }, { cookies: [`WEB_SESSIONID=${encodedCookie}; ${attribute}`] });
    await assert.rejects(client.poll(challenge()), error => error.code === 'SESSION_EXCHANGE_UNVERIFIED');
  }
});

test('modern exchange without a unique official Cookie stays unverified', async () => {
  for (const cookies of [[], ['OTHER=value'], Array.from({ length: 33 }, () => 'OTHER=value'), [`WEB_SESSIONID=${'x'.repeat(16385)}`]]) {
    const { client, calls } = flow({ userId: 123 }, { cookies });
    await assert.rejects(client.poll(challenge()), error => error.code === 'SESSION_EXCHANGE_UNVERIFIED');
    assert.equal(calls.length, 2);
  }
});

test('explicit terminal modern poll states never exchange an accompanying ticket', async () => {
  for (const status of ['expired', 'failed', 'error']) {
    const { client, calls } = flow({ userId: 123 }, { pollData: { status, appletToken: 'synthetic-ticket' } });
    const result = await client.poll(challenge());
    assert.equal(result.status, 'expired');
    assert.equal(result.gameAuthenticated, false);
    assert.equal(result.session, undefined);
    assert.equal(calls.length, 1);
  }
  const pending = flow({ userId: 123 }, { pollData: {} });
  assert.equal((await pending.client.poll(challenge())).status, 'pending');
  assert.equal(pending.calls.length, 1);
});

test('legacy current-user proof keeps its existing identity and session shape', async () => {
  const client = new CommunityAuthClient({ fetchImpl: async url => new Response(JSON.stringify({ code: 0, data: url.includes('qrcode') ? { token: 'synthetic-legacy-token' } : { id: 321, nick_name: 'legacy user' } })) });
  const result = await client.poll({ protocol: 'app-qr-v1', qrPayload: 'synthetic-legacy-qr', expiresAt: Date.now() + 60000 });
  assert.equal(result.status, 'authorized');
  assert.deepEqual(result.profile, { id: 321, nick_name: 'legacy user' });
  assert.equal(Object.hasOwn(result.session, 'communityUserId'), false);
  assert.equal(Object.hasOwn(result, 'communityUserId'), false);
});
