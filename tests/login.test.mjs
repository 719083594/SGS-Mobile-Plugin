import test from 'node:test';
import assert from 'node:assert/strict';
import { channelStatus, bindIdentity, assertAuthenticated, formatLoginStatus } from '../lib/login.mjs';

test('both game login channels report unsupported and never community-authenticated game state', () => {
  for (const channel of ['official', 'huawei']) {
    const status = channelStatus(channel);
    assert.equal(status.status, 'unsupported');
    assert.equal(status.supported, false);
    assert.equal(status.authenticated, false);
    assert.equal(status.gameVersion, 'sanguosha-mobile');
    assert.ok(status.sources.length >= 3);
  }
  assert.match(formatLoginStatus('华为'), /暂未接入/);
});

test('same game ID has separate official and huawei identities and is not authenticated', () => {
  const official = bindIdentity({ channel: 'official', gameId: '12345678', server: '测试区' });
  const huawei = bindIdentity({ channel: 'huawei', gameId: '12345678', server: '测试区' });
  assert.notEqual(official.identityKey, huawei.identityKey);
  assert.equal(official.authenticated, false);
  assert.equal(official.verified, false);
  assert.equal(official.state, 'identity-bound');
  assert.throws(() => assertAuthenticated({ ...official, authenticated: true }), error => error.code === 'LOGIN_UNSUPPORTED');
});

test('binding rejects unknown versions/channels and credential-shaped data', () => {
  assert.throws(() => channelStatus('sanguosha-ol'), error => error.code === 'INVALID_CHANNEL');
  assert.throws(() => bindIdentity({ channel: 'huawei', gameId: 'Bearer fake-token' }), error => error.code === 'INVALID_IDENTITY');
  assert.throws(() => bindIdentity({ gameId: '12', server: 'x\nprivate' }), error => error.code === 'INVALID_IDENTITY');
  assert.throws(() => bindIdentity({ gameId: '../unsafe' }), error => error.code === 'INVALID_IDENTITY');
});
