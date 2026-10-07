import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHelpCard, buildPersonalCards, buildPublicCards } from '../lib/card-views.mjs';

// All account/quantity fixtures are synthetic; no network or private screenshot.
const result = (kind, data, protocol = 'pc-scan-v7') => ({ kind, data, protocol });
const htmlFor = (kind, data, options = {}, protocol) => buildPersonalCards(result(kind, data, protocol), options).map(card => card.html).join('\n');
const sources = html => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
const resolver = {
  items: [
    { key: 'dianj', label: '点将卡' },
    { key: 'shouq', label: '手气卡' },
    { key: 'xiny', label: '心愿积分' },
    { key: 'yinb', label: '银币' }
  ],
  imageForItem(key) { return 'file:///synthetic-public-resources/items/' + key + '.png'; },
  imageForGeneral(key) { return key === '赵云' || key === 'https://www.sanguosha.cn/storage/uploads/images/pic_index/207.png' ? 'file:///synthetic-public-resources/generals/207.png' : null; }
};

test('help is an inert compact mobile-version card with all standalone commands and channel limits', () => {
  const card = buildHelpCard({ prefix: '#移动' });
  assert.equal(card.width, 1080);
  for (const text of ['资讯', '活动', '公告', '武将', '攻略', '模式', '详情', '社区', '热榜', '个人资料', '将力', '游戏资料', '能力', '战绩', '近期战绩', '资产', '皮肤', '我的武将', '我的吴国武将', '我的皮肤', '擅长武将', '导出', '#移动登录', '扫码状态', '授权状态', '取消扫码', '退出授权', '账户', '解绑', '官号登录', '华为登录', '绑定', '功能', '状态', '#移动帮助']) assert.ok(card.html.includes(text), text);
  assert.doesNotMatch(card.html, /新版授权|新版扫码状态|取消新版授权|APP 扫码|社区喜欢|旧协议待迁移|旧查询待接入/);
  assert.match(card.html, /官号、华为游戏登录尚未接通/);
  assert.match(card.html, /绑定只记录身份/);
  assert.match(card.html, /签到、点赞、分享、兑换与领奖均不提供执行入口/);
  assert.match(card.html, /grid two/);
  assert.match(card.html, /Content-Security-Policy/);
  assert.match(card.html, /connect-src 'none'/);
  assert.doesNotMatch(card.html, /<script\b|<iframe\b|<link\b|@import|url\(/i);
});

test('eleven labelled assets keep zero amounts, use prepared local icons and never invent absent amounts', () => {
  const data = Object.fromEntries(['yb', 'jh', 'yl', 'zml', 'ylj', 'ssbz', 'hld', 'dianj', 'shouq', 'xiny', 'yinb'].map(key => [key, 0]));
  const cards = buildPersonalCards(result('assets', data), { assetResolver: resolver });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].width, 1080);
  for (const label of ['元宝', '将魂', '雁翎', '招募令', '雁翎甲', '史诗宝珠', '欢乐豆', '点将卡', '手气卡', '心愿积分', '银币']) assert.ok(cards[0].html.includes(label), label);
  assert.equal(sources(cards[0].html).length, 11);
  assert.match(cards[0].html, /grid three/);
  assert.match(cards[0].html, /#sgs资产 导出/);
  const missing = htmlFor('assets', { yb: 0, unknown: 99 }, { assetResolver: resolver });
  assert.match(missing, /元宝/);
  assert.doesNotMatch(missing, /将魂|unknown|99/);
  assert.match(missing, /更多字段可用/);
});

test('only trusted local file image URLs are embedded, including bundled original item SVG', async t => {
  for (const value of ['https://evil.invalid/portrait.png', 'http://127.0.0.1/a.png', 'data:image/png;base64,eA==', 'javascript:alert(1)',
    'file://server/share/a.png', 'file:////server/share/a.png', 'file:///safe/a.png?token=private', 'file:///safe/a.png#private', 'file:///safe/a.html', 'file:///safe/a.png\" onerror=\"alert(1)', 'file:///safe/a%00.png']) {
    await t.test(value.slice(0, 45), () => {
      const html = htmlFor('assets', { yb: 0 }, { assetResolver: { imageForItem: () => value } });
      assert.equal(sources(html).length, 0);
      assert.doesNotMatch(html, /onerror\s*=/i);
    });
  }
  const item = htmlFor('assets', { yb: 0 }, { assetResolver: { imageForItem: () => 'file:///synthetic-public-resources/items/yb.svg' } });
  assert.deepEqual(sources(item), ['file:///synthetic-public-resources/items/yb.svg']);
  const general = htmlFor('records', { recent: [{ name: '赵云' }] }, { assetResolver: { imageForGeneral: () => 'file:///safe/unreviewed.svg' } });
  assert.equal(sources(general).length, 0);
});

test('resolver failures and unprepared images produce a styled placeholder without a network fallback', () => {
  const html = htmlFor('assets', { yb: 0 }, { assetResolver: { imageForItem() { throw new Error('never display synthetic-token'); } } });
  assert.match(html, /placeholder/);
  assert.equal(sources(html).length, 0);
  assert.doesNotMatch(html, /synthetic-token/);
});

test('modern profile counts and official force metrics keep zero and values above the chart axis', () => {
  const summary = htmlFor('summary', { nick_name: '合成角色', lv: 0, generalCount: 5, skinCount: 8, general_all_count: 500, skin_all_count: 900 });
  for(const value of ['合成角色','等级 0','武将总数（官网统计）','拥有武将','拥有皮肤'])assert(summary.includes(value),value);
  const force = htmlFor('force', { general_power: 12345, game_force:{totalForce:19000,doudizhuForce:0,paiweiForce:2000,guozhanForce:3000,shenfenForce:4000} });
  for(const value of ['综合战力','斗地主战力','排位战力','国战战力','身份战力','19000','general_power'])assert(force.includes(value),value);
  assert.doesNotMatch(force,/军阶|获胜场次|8000<|NaN|Infinity/);
});

test('gameInfo calculates only valid official win ratios and distinguishes missing data from zero', () => {
  const html = htmlFor('gameInfo', { nick: '合成角色', lv: 0, vip: 0, rankWin: 1, rankNum: 3,
    douDiZhuWin: 2, douDiZhuTotal: 3, totalWin: 6, totalGame: 10, totalMvp: 2, generalNum: 5, generalTotal: 100, skinNum: 0, skinTotal: 200 });
  for (const text of ['33%', '66%', '60%', '总 MVP', 'VIP 0', '武将收藏', '皮肤收藏']) assert.ok(html.includes(text), text);
  const invalid = htmlFor('gameInfo', { rankWin: 0, rankNum: 0, totalWin: 2, totalGame: 1 });
  assert.doesNotMatch(invalid, /排位胜率|总胜率|NaN|Infinity/);
  const absent = htmlFor('gameInfo', {});
  assert.match(absent, /本次暂无可展示/);
  assert.doesNotMatch(absent, /总场次|VIP 0|无段位/);
});

test('modern raw career HTML retains current fields without guessing legacy mode or rank semantics', () => {
  const html=htmlFor('records',{winGames:6,totalGames:10,rate:'0.6',mvp:2,nowRank:123,maxRank:456,force:9001},{model:2});
  for(const value of ['winGames','totalGames','0.6','nowRank','maxRank','9001','#sgs战绩 2 导出'])assert(html.includes(value),value);
  assert.doesNotMatch(html,/主公胜率|野心家胜率|大师|class="result-cell/);
});

test('recent HTML limits a 20-record batch to 10 visible matches with truthful batch counts and private export', () => {
  const data = Array.from({ length: 20 }, (_, index) => ({ Model: '身份场', begin_time: '合成记录-' + String(index).padStart(2,'0'), result: index % 2 ? '失败' : '胜利',
    general_avatar: ['https://www.sanguosha.cn/storage/uploads/images/pic_index/207.png'], general_id: 'unverified-internal-id', mvp: 'never-display-this-marker' }));
  const cards = buildPersonalCards(result('recent', data), { assetResolver: resolver, prefix: '#移动', model: 2, page: 3 });
  assert.equal(cards.length, 1);
  const html = cards.map(card => card.html).join('\n');
  for (let index = 0; index < 20; index++) assert.equal(html.includes('合成记录-' + String(index).padStart(2,'0')),index<10);
  assert.match(html, /身份场 · 第 3 页 · 本批返回 20 条/);assert.match(html,/本次展示前10条/);assert.match(html,/导出本批 JSON/);
  assert.match(html, /#移动近期战绩 2 3 导出/);
  assert.doesNotMatch(html, /never-display|unverified-internal-id|MVP/);
  assert.equal(sources(html).length, 10);
  const unknown = htmlFor('recent', [{ Model: '合成模式', result: '官方特别结果' }]);
  assert.match(unknown, /官方特别结果/);
  assert.doesNotMatch(unknown, /class="match-result (?:win|lose)"/);
});





test('abilities and bestGeneral have dedicated titles and readable cards rather than raw JSON', () => {
  for (const [kind, title, command] of [['abilities', '能力一览', '能力'], ['bestGeneral', '擅长武将', '擅长武将']]) {
    const html = htmlFor(kind, { rows: [{ name: '合成条目', source_count: 2, details: { source_label: '合成说明' } }] });
    assert.ok(html.includes('<title>' + title + '</title>'));
    assert.match(html, /合成条目/);
    assert.match(html, /合成说明/);
    assert.ok(html.includes('#sgs' + command + ' 导出'));
    assert.doesNotMatch(html, /<pre\b|JSON|raw未知|&quot;rows&quot;/);
  }
});

test('stopped legacy and unknown protocols cannot render personal HTML or resolve artwork', () => {
  for(const protocol of ['app-qr-v1','unknown',undefined])assert.equal(buildPersonalCards({...result('assets',{yb:2}),protocol},{assetResolver:{imageForItem:()=>assert.fail('Unsupported session cannot resolve artwork')}}),null);
  for(const kind of ['skins','favorites'])assert.equal(buildPersonalCards(result(kind,{name:'never-display-retired-query'})),null);
});

test('views escape injected markup, remove sensitive fields, and never alter input', () => {
  const data = { nick_name: '<img src=x onerror="synthetic-payload">合成角色', lv: 1, token: 'synthetic-secret', phone: 'synthetic-phone',
    nested: { name: '</style><script>synthetic-script</script>', value: 'keep', cookie: 'synthetic-cookie' } };
  const original = structuredClone(data);
  const cards = buildPersonalCards(result('summary', data), { prefix: '<svg onload="synthetic-prefix">', command: '<script>bad-command</script>' });
  const html = cards[0].html;
  assert.doesNotMatch(html, /<script\b|<svg\b|<img src=x|synthetic-secret|synthetic-phone|synthetic-cookie/);
  assert.match(html, /合成角色/);
  assert.deepEqual(data, original);
  const help = buildHelpCard({ prefix: '</style><script>' }).html;
  assert.doesNotMatch(help, /<script\b/);
  assert.match(help, /&lt;\/style&gt;/);
});

test('unknown structures and empty responses offer the correct private export without guessing titles', () => {
  const unknown = htmlFor('newKind', { arbitrary: { future: '合成未来字段' } });
  assert.match(unknown, /<title>本人资料<\/title>/);
  assert.match(unknown, /合成未来字段/);
  assert.match(unknown, /#sgs个人资料 导出/);
  const empty = htmlFor('recent', []);
  assert.match(empty, /本次暂无可展示/);
  assert.match(empty, /#sgs近期战绩 0 1 导出/);
});

test('already-cleaned personal responses retain literal text and still escape HTML', () => {
  const data = { rows: [{ encoded: '&lt;example&gt;', literal: '<script>合成文本</script>' }] };
  const original = structuredClone(data);
  const cards = buildPersonalCards(result('abilities', data), { dataAlreadyRedacted: true });
  assert.match(cards[0].html, /&amp;lt;example&amp;gt;/);
  assert.match(cards[0].html, /&lt;script&gt;合成文本&lt;\/script&gt;/);
  assert.doesNotMatch(cards[0].html, /<script\b/);
  assert.match(cards[0].html, /<main id="container" class="sheet"/);
  assert.deepEqual(data, original);
  assert.match(buildHelpCard().html, /<main id="container" class="sheet"/);
});

test('help banner only resolves fixed public heroes and never uses a user avatar', () => {
  const seen = [];
  const html = buildHelpCard({ assetResolver: { imageForGeneral(name) { seen.push(name); return 'file:///synthetic-public-resources/generals/' + seen.length + '.png'; } } }).html;
  assert.deepEqual(seen, ['刘备', '关羽', '诸葛亮', '赵云']);
  assert.equal(sources(html).length, 4);
  assert.match(html, /help-hero help-banner/);
  assert.match(html, /hero-portraits/);
});

test('personal cards cap long results at eight pages with an explicit complete-export notice', () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({ name: '合成收藏-' + index }));
  const cards = buildPersonalCards(result('abilities', rows));
  assert.equal(cards.length, 8);
  for (const card of cards) {
    assert.match(card.html, /仅展示前 8 页（本次共 10 页）/);
    assert.match(card.html, /完整资料请导出/);
    assert.match(card.html, /#sgs能力 导出/);
  }
  const html = cards.map(card => card.html).join('\n');
  assert.match(html, /合成收藏-47/);
  assert.doesNotMatch(html, /合成收藏-48/);
});

test('public IDs lead only to implemented commands and already-cleaned strings are not decoded twice', () => {
  const items = [{ id: 12, title: '&lt;合成条目&gt;', description: '<script>合成文本</script>' }];
  const heroes = buildPublicCards({ items }, { command: '武将', dataAlreadyRedacted: true })[0].html;
  assert.match(heroes, /#sgs武将 12/);
  assert.doesNotMatch(heroes, /#sgs详情/);
  assert.match(heroes, /&amp;lt;合成条目&amp;gt;/);
  assert.match(heroes, /&lt;script&gt;合成文本&lt;\/script&gt;/);
  assert.doesNotMatch(heroes, /<script\b/);
  for (const command of ['社区', '热榜', '攻略']) {
    const html = buildPublicCards({ items }, { command, dataAlreadyRedacted: true })[0].html;
    assert.match(html, /ID 12/);
    assert.doesNotMatch(html, /#sgs详情 12/);
  }
  assert.match(buildPublicCards({ items }, { command: '公告' })[0].html, /#sgs详情 12/);
  const many = buildPublicCards({ items: Array.from({ length: 55 }, (_, index) => ({ id: index + 1, title: '合成公告' })) }, { command: '公告' });
  assert.equal(many.length, 8);
  assert.match(many[0].html, /仅展示前 8 页（本次共 10 页）/);
  assert.doesNotMatch(many[0].html, /完整资料请导出/);
});

test('confirmed static badge fields use exact prepared artwork and preserve career names/counts', () => {
  const known = 'https://www.sanguosha.cn/storage/uploads/images/pic_index/207.png';
  const unknown = 'https://imagexh.sanguosha.com/unbundled-account-image.png';
  const seen = [];
  const assetResolver = { imageForOfficialStatic(key) { seen.push(key); return key === known ? 'file:///synthetic-public-resources/generals/207.png' : null; } };
  const summary = htmlFor('summary', { light: [known, unknown, 'https://evil.invalid/a.png', known + '?token=private'] }, { assetResolver });
  assert.equal(sources(summary).length, 1);
  assert.match(summary, /资料图标/);
  assert.doesNotMatch(summary, /将灯/);
  const game = htmlFor('gameInfo', { light: [known], lights: [known, unknown], titleList: [{ name: '合成生涯零值', num: 0, url: unknown }, { name: '合成生涯资料', num: 2, url: known }] }, { assetResolver });
  assert.equal(sources(game).length, 2);
  assert.match(game, /将灯/);
  assert.match(game, /生涯资料/);
  assert.match(game, /合成生涯零值/);
  assert.match(game, /career inactive/);
  assert.doesNotMatch(game, /unbundled-account-image|token=private|evil\.invalid/);
  assert.ok(seen.every(key => !key.includes('?') && !key.includes('evil.invalid')));
});

test('prepared RAM portraits accept strict PNG/JPEG only through the trusted resolver', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/HsAAAAASUVORK5CYII=';
  const jpg = 'data:image/jpeg;base64,/9j/2Q==';
  const remoteKey = 'https://sjpubicres.sanguosha.cn/release/character_heads/synthetic.png';
  for (const value of [png, jpg]) {
    const html = htmlFor('recent', [{ general_avatar: [remoteKey], result: '胜利' }], { assetResolver: { imageForGeneral: () => value } });
    assert.equal(sources(html)[0], value);
    assert.match(html, /img-src file: data:/);
    assert.doesNotMatch(html, /src="https:/);
  }
  for (const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,eA==', png + ' ', png + 'x', 'data:image/jpeg;base64,' + 'A'.repeat(350000)]) {
    const html = htmlFor('recent', [{ general_avatar: [remoteKey] }], { assetResolver: { imageForGeneral: () => value } });
    assert.equal(sources(html).length, 0);
  }
  let called = false;
  const raw = htmlFor('recent', [{ general_avatar: [png] }], { assetResolver: { imageForGeneral: () => { called = true; return png; } } });
  assert.equal(called, false);
  assert.equal(sources(raw).length, 0);
  const item = htmlFor('assets', { yb: 0 }, { assetResolver: { imageForItem: () => png } });
  assert.equal(sources(item).length, 0);
});

test('demo cards carry an unmistakable synthetic-data label without changing normal cards', () => {
  const demo = htmlFor('assets', { yb: 0 }, { demo: true });
  assert.match(demo, /脱敏排版示例 · 非真实账户数据/);
  assert.match(demo, /道具数量为合成示例，不代表真实账户/);
  const normal = htmlFor('assets', { yb: 0 });
  assert.doesNotMatch(normal, /脱敏排版示例|合成示例/);
});

test('public list and detail cards stay inert and paginate article entries', () => {
  const cards = buildPublicCards({ items: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, title: '合成公告-' + index, description: '合成说明', url: 'https://evil.invalid/unused' })) }, { command: '公告' });
  assert.equal(cards.length, 3);
  const html = cards.map(card => card.html).join('\n');
  for (let index = 0; index < 14; index++) assert.ok(html.includes('合成公告-' + index));
  assert.doesNotMatch(html, /evil\.invalid|<a\b|<script\b/);
  const detail = buildPublicCards({ name: '赵云', description: '公开合成说明', skills: [{ name: '合成技能', description: '技能说明' }] }, { assetResolver: resolver });
  assert.match(detail[0].html, /公开合成说明|合成技能/);
  assert.equal(detail[0].width, 1080);
});
