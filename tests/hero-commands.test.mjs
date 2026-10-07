import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SanguoshaMobile } from '../api.mjs';

const names = new Map([[41, '邓艾'], [643, '势·邓艾'], [42, '界·邓艾']]);
const mobile = '<title>三国杀移动版</title>';
const listHtml = rows => mobile + rows.map(([id, name]) =>
  `<a href="/pc/hero-detail-${id}.html"><img alt="${name}" src="/storage/${id}.png"></a>`).join('');
const detailHtml = name => `${mobile}<h3 class="hero-title"><span>${name}</span><i>魏</i></h3>` +
  '<div class="hero-intro">合成简介</div><div class="skill"><ul class="skill-nav"><li>屯田</li></ul><ul class="skill-info"><li>合成技能说明</li></ul></div>';

async function workspace(fn, rows = [...names]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sgs-hero-commands-'));
  const calls = [];
  try {
    const bot = new SanguoshaMobile(root, { fetch: async (url, init) => {
      assert.equal(init.method, 'GET');
      assert.equal(new URL(url).hostname, 'www.sanguosha.cn');
      assert.equal(new Headers(init.headers).has('cookie'), false);
      calls.push(String(url));
      if (url.endsWith('/pc/hero-list.html')) return new Response(listHtml(rows));
      const id = Number(/hero-detail-(\d+)\.html$/.exec(url)?.[1]);
      assert(names.has(id), 'only positively resolved official IDs may be requested');
      return new Response(detailHtml(names.get(id)));
    }});
    await fn(bot, calls);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('用户连写、带空格与裸武将名均查询势邓艾详情，文字后缀保留', () => workspace(async (bot, calls) => {
  for (const body of ['武将势邓艾', '武将 势邓艾', '武将　势·邓艾', '势邓艾', '势·邓艾']) {
    const result = await bot.handle({ text: '#sgs' + body, imageReply: true });
    assert.equal(result.handled, true);
    assert.equal(result.card.type, 'public');
    assert.equal(result.card.private, false);
    assert.equal(result.card.result.name, '势·邓艾');
    assert.match(result.card.result.sourceUrl, /hero-detail-643\.html$/);
    assert.match(result.text, /屯田/);
    const text = await bot.handle({ text: '#sgs' + body + ' 文字', imageReply: true });
    assert.equal(text.card, undefined);
    assert.match(text.text, /势·邓艾/);
    assert.match(text.text, /屯田/);
  }
  assert.equal(calls.filter(url => url.endsWith('hero-list.html')).length, 1);
  assert.equal(calls.filter(url => url.endsWith('hero-detail-643.html')).length, 1);
}));

test('不同武将前缀保持独立，显式部分名称检索保留列表而裸名不猜测', () => workspace(async bot => {
  for (const [body, expected] of [['邓艾', '邓艾'], ['界邓艾', '界·邓艾'], ['武将 643', '势·邓艾']]) {
    const result = await bot.handle({ text: '#sgs' + body, imageReply: true });
    assert.equal(result.card.result.name, expected);
  }
  const partial = await bot.handle({ text: '#sgs武将 邓', imageReply: true });
  assert.equal(partial.card.result.items.length, 3);
  const missing = await bot.handle({ text: '#sgs势邓', imageReply: true });
  assert.match(missing.text, /未找到该名称/);
  assert.equal(missing.card, undefined);
  assert.match((await bot.handle({ text: '#sgs武将 不存在合成武将' })).text, /没有找到/);
}));

test('相同规范名称对应多个官网ID时拒绝猜测，不请求任意详情', () => workspace(async (bot, calls) => {
  for (const text of ['#sgs势邓艾', '#sgs武将势邓艾']) {
    const result = await bot.handle({ text, imageReply: true });
    assert.match(result.text, /多个同名武将/);
    assert.equal(result.card, undefined);
  }
  assert.equal(calls.some(url => url.includes('hero-detail-')), false);
}, [[643, '势·邓艾'], [644, '势邓艾']]));

test('重叠及连写的账户命令不回退为公开查询，不触发扫码或加密账户写入', () => workspace(async (bot, calls) => {
  const owner = '100000001';
  bot.vault.set(owner, { session: { protocol: 'app-qr-v1', token: 'synthetic-session' }, identities: [] });
  const before = fs.readFileSync(path.join(bot.root, 'data/sessions.enc.json'));
  bot.auth.start = async () => { assert.fail('must not start authorization'); };
  bot.auth.logout = async () => { assert.fail('must not revoke authorization'); };
  bot.auth.queryOwn = async () => { assert.fail('must not query personal information'); };
  for (const body of ['武将收藏势邓艾', '社区授权微信', '退出授权势邓艾', '解绑官号', '绑定官号123456', '扫码状态势邓艾', '近期战绩势邓艾', '官号登录势邓艾']) {
    assert.match((await bot.handle({ owner, privateChat: true, text: '#sgs' + body })).text, /未识别命令/);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(fs.readFileSync(path.join(bot.root, 'data/sessions.enc.json')), before);
  for (const body of ['武将收藏', '社区授权', '退出授权', '解绑', '绑定 官号 123456']) {
    const result = await bot.handle({ owner, privateChat: true, group_id: '200000001', text: '#sgs' + body });
    assert.match(result.text, /私聊/);
  }
  assert.deepEqual(fs.readFileSync(path.join(bot.root, 'data/sessions.enc.json')), before);
}));

test('自定义前缀仍支持武将简写，其他插件及旧前缀不被接管', () => workspace(async bot => {
  const config = bot.config.read();
  fs.writeFileSync(bot.config.file, JSON.stringify({ ...config, prefix: '#test' }));
  assert.equal((await bot.handle({ text: '#sgs势邓艾' })).handled, false);
  assert.equal((await bot.handle({ text: '#三国帮助' })).handled, false);
  assert.equal((await bot.handle({ text: '#原神帮助' })).handled, false);
  const result = await bot.handle({ text: '#test势邓艾', imageReply: true });
  assert.equal(result.card.result.name, '势·邓艾');
}));
