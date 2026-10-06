import test from 'node:test';
import assert from 'node:assert/strict';
import { MobilePublicClient, PublicDataError, parseArticleList, parseArticle, parseHeroList, parseHero, parseMode, cleanText, formatPublic } from '../lib/public.mjs';

const base = 'https://www.sanguosha.cn/';
const mobile = '<title>三国杀移动版</title>';
const response = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const newsHtml = `${mobile}<ul><li><a href="${base}pc/news-detail-12.html"><p class="news-name"><span>活动公告</span>测试公告&amp;奖励</p><p class="news-time">10-07</p></a></li></ul>`;
const heroesHtml = `${mobile}<a href="${base}pc/hero-detail-1.html"><div><img src="/storage/1.png" alt="刘备"/></div>刘备</a><a href="${base}pc/hero-detail-2.html"><img src="/storage/2.png" alt="界·刘备"/>界·刘备</a>`;
const heroHtml = `${mobile}<h3 class="hero-title"><span>刘备</span><i>蜀</i><ul class="hero-from"><li>身份</li><li>国战</li></ul></h3><div class="hero-intro">角色简介</div><div class="hero-desc"><p>特点</p></div><div class="hero-info"><img src="/storage/skin.png"/><img src="http://evil.example/a"/></div><div class="skill"><ul class="skill-nav"><li>仁德</li></ul><ul class="skill-info"><li>分配手牌</li></ul></div><div class="skill hide"><ul class="skill-nav"><li>国战仁德</li></ul><ul class="skill-info"><li>国战说明</li></ul></div><div class="play">玩法</div>`;

test('official page parsers preserve article IDs, category and nested content without executable HTML', () => {
  assert.deepEqual(parseArticleList(newsHtml, `${base}pc/news-list-1004.html`)[0], {
    id: 12, title: '测试公告&奖励', name: '测试公告&奖励', category: '活动公告', date: '10-07', description: '', url: `${base}pc/news-detail-12.html`, sourceUrl: `${base}pc/news-list-1004.html`
  });
  const article = parseArticle(`${mobile}<div class="detail-title">公告</div><p class="detail-time">2026-10-07</p><div class="detail-content"><p>正文</p><div><p>嵌套内容</p></div><script>secret()</script><img src="/storage/table.png"></div>`, `${base}pc/news-detail-12.html`);
  assert.equal(article.description, '正文\n嵌套内容');
  assert.equal(article.images[0], `${base}storage/table.png`);
  assert.ok(article.imageNotice);
  assert.throws(() => parseArticleList('<title>三国杀OL</title>', base), error => error.code === 'SOURCE_CHANGED');
});

test('mobile hero parser distinguishes variant IDs, skills by mode and allowlisted skin images', () => {
  assert.deepEqual(parseHeroList(heroesHtml, base).map(x => [x.id, x.name]), [[1, '刘备'], [2, '界·刘备']]);
  const hero = parseHero(heroHtml, `${base}pc/hero-detail-1.html`);
  assert.equal(hero.faction, '蜀');
  assert.deepEqual(hero.skills.map(x => [x.mode, x.name]), [['身份', '仁德'], ['国战', '国战仁德']]);
  assert.deepEqual(hero.images, [`${base}storage/skin.png`]);
});

test('client searches variant names and caches the official hero list', async () => {
  const calls = [];
  const client = new MobilePublicClient({ fetchImpl: async url => { calls.push(url); return response(url.includes('hero-list') ? heroesHtml : heroHtml); } });
  assert.equal((await client.heroes('界刘备')).items[0].id, 2);
  assert.equal((await client.hero('刘备')).name, '刘备');
  assert.equal(calls.filter(url => url.includes('hero-list')).length, 1);
});

test('topics use a proven read-only GET and expose selected public fields only', async () => {
  let observed;
  const client = new MobilePublicClient({ fetchImpl: async (url, init) => {
    observed = { url, init };
    return response({ code: 0, data: [{ id: 12970636, title: '武将攻略', body: '<p>攻略</p>', created_at: '2026-10-07', share_pic: '192.0.2.1', address: '{private metadata}', token: 'SHOULD_NOT_ESCAPE', user: { nick_name: '测试作者', phone: 'PRIVATE_PHONE', province: 'PRIVATE_LOCATION' }, body_image: ['https://imagexh.sanguosha.com/1.png'], like_count: 2 }] });
  } });
  const result = await client.topics({ keyword: '赵云', guidesOnly: true });
  assert.equal(observed.init.method, 'GET');
  assert.equal(new URL(observed.url).pathname, '/api/searchV2/topics');
  assert.equal(new URL(observed.url).searchParams.get('category_id'), '6');
  assert.equal(result.items[0].author, '测试作者');
  assert.equal(result.items[0].id, 12970636);
  assert.equal(result.items[0].description, '攻略');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SHOULD_NOT_ESCAPE|192\.0\.2\.1|private metadata/);
});

test('public client rejects untrusted redirects and protected/error responses', async () => {
  const redirects = new MobilePublicClient({ fetchImpl: async () => response('', 302, { location: 'http://127.0.0.1/private' }) });
  await assert.rejects(redirects.news(), error => error instanceof PublicDataError && error.code === 'UNTRUSTED_URL');
  const protectedClient = new MobilePublicClient({ fetchImpl: async () => response({ code: 1003, data: 'Not Authenticated' }, 401) });
  await assert.rejects(protectedClient.hot(), error => error.code === 'AUTH_REQUIRED');
  const errorClient = new MobilePublicClient({ fetchImpl: async () => response({ code: 401, data: {}, msg: 'token:do-not-return' }) });
  await assert.rejects(errorClient.hot(), error => error.code === 'AUTH_REQUIRED' && !error.message.includes('do-not-return'));
});

test('arguments prevent arbitrary endpoints and reject overlarge responses', async () => {
  let calls = 0;
  const client = new MobilePublicClient({ fetchImpl: async () => { calls++; return response(newsHtml); } });
  await assert.rejects(client.article('../private'), error => error.code === 'INVALID_ARGUMENT');
  await assert.rejects(client.news({ category: 9999 }), error => error.code === 'INVALID_ARGUMENT');
  assert.equal(calls, 0);
  const capped = new MobilePublicClient({ maxResponseBytes: 8, fetchImpl: async () => response(newsHtml) });
  await assert.rejects(capped.news(), error => error.code === 'RESPONSE_TOO_LARGE');
});

test('mode sections and output formatting remain readable', () => {
  const mode = parseMode(`${mobile}<div class="detail-title">身份场</div><div class="detail-content"><h3>人数</h3><p>8人</p><h3>玩法简介</h3><p>测试规则</p></div>`, `${base}pc/mode-info-1.html`);
  assert.deepEqual(mode.sections, [{ name: '人数', description: '8人' }, { name: '玩法简介', description: '测试规则' }]);
  assert.match(formatPublic({ items: [{ id: 12, title: '公告', url: base }], sourceUrl: base }), /公告.*12/);
  assert.equal(cleanText('<script>bad()</script><p>&#x4e09;&nbsp;&amp;</p>'), '三 &');
});
