import test from 'node:test';
import assert from 'node:assert/strict';
import { MobilePublicClient, parseHeroCatalog, parseSkinCatalogPage } from '../lib/public.mjs';
import { parseHeroCatalogArgs, parseSkinCatalogArgs } from '../lib/catalog-query.mjs';

const source = 'https://www.sanguosha.cn/pc/hero-list.html';
const hero = (id, name) => `<li><a href="/pc/hero-detail-${id}.html"><img src="/storage/${id}.png" alt="${name}"></a></li>`;
const groups = [[1, '曹操', '魏'], [2, '刘备', '蜀'], [3, '周瑜', '吴'], [4, '界·周瑜', '吴'], [5, '吕布', '群'], [6, '神周瑜', '神'], [7, '周瑜', '吴']];
function catalog(rows = groups) {
  const factions = ['全', '魏', '蜀', '吴', '群', '神'];
  return '<title>三国杀移动版</title><a href="/pc/hero-detail-999.html">热门轮播</a>' +
    `<ul class="general-nation">${factions.map(name => `<li>${name}</li>`).join('')}</ul>` +
    factions.map((faction, index) => `<ul class="general-list ${index ? 'hide' : ''}">${rows.filter(row => !index || row[2] === faction).map(row => hero(...row)).join('')}</ul>`).join('');
}
const json = data => new Response(JSON.stringify({ code: 0, data }));
function skin(id, type, general = '周瑜') {
  return { id, type, general, name: `合成皮肤${id}`, label: type === 3 ? '' : '合成级别',
    banner_img_thumb: `https://sjwx-oss.sanguosha.cn/skins/image/skins${id}.jpg`,
    inner_banner: `https://sjwx-oss.sanguosha.cn/skins/image/skins${id}-large.jpg`, token: 'PRIVATE_SHOULD_NOT_ESCAPE' };
}
function pageData(rows, { page = 1, limit = 100, total = rows.length } = {}) {
  return { lists: { current_page: page, data: rows, total, per_page: limit, last_page: Math.max(1, Math.ceil(total / limit)),
    next_page_url: 'http://untrusted.invalid/api/skins/list?page=2', path: 'http://share.sanguosha.cn/api/skins/list' } };
}

test('public hero catalog arguments support exact factions and bounded pages', () => {
  assert.deepEqual(parseHeroCatalogArgs(), { faction: '全部', page: 1 });
  assert.deepEqual(parseHeroCatalogArgs('吴国 2'), { faction: '吴', page: 2 });
  assert.deepEqual(parseHeroCatalogArgs('3', { faction: '吴' }), { faction: '吴', page: 3 });
  assert.deepEqual(parseHeroCatalogArgs('魏势力'), { faction: '魏', page: 1 });
  for (const input of ['吴 0', '吴 1001', '吴 2 3', '吴 2 导出', '../1', '排位', '\n吴', '吴国 account']) {
    assert.throws(() => parseHeroCatalogArgs(input), /INVALID_CATALOG_ARGUMENT/);
  }
});

test('official faction groups retain distinct IDs and versions and exclude the popular banner', () => {
  const parsed = parseHeroCatalog(catalog(), source);
  assert.deepEqual(parsed.map(({id,name,faction}) => [id,name,faction]), groups);
  assert.equal(parsed.filter(row => row.name === '周瑜').length, 2);
  assert(parsed.every(row => row.id !== 999));
  assert.throws(() => parseHeroCatalog(catalog().replace('<li>神</li>', '<li>其他</li>'), source), error => error.code === 'SOURCE_CHANGED');
  assert.throws(() => parseHeroCatalog(catalog().replace(hero(6, '神周瑜'), ''), source), error => error.code === 'SOURCE_CHANGED');
  assert.throws(() => parseHeroCatalog(catalog().replace('三国杀移动版', '三国杀十周年'), source), error => error.code === 'SOURCE_CHANGED');
});

test('hero catalog fetches the full embedded directory once, then paginates by verified faction', async () => {
  let calls = 0;
  const client = new MobilePublicClient({ fetchImpl: async () => { calls++; return new Response(catalog()); } });
  const result = await client.heroCatalog({ faction: '吴国', pageSize: 2, page: 2 });
  assert.deepEqual(result.items.map(row => row.id), [7]);
  assert.equal(result.total, 3); assert.equal(result.pages, 2); assert.equal(result.coverage, 'official-web-catalog');
  assert.equal((await client.heroCatalog()).total, 7);
  assert.equal((await client.heroes('界周瑜')).items[0].id, 4);
  assert.equal(calls, 1);
  await assert.rejects(client.heroCatalog({ faction: '吴', page: 99 }), error => error.code === 'INVALID_ARGUMENT');
});

test('skin arguments separate official type, exact general variant and page', () => {
  assert.deepEqual(parseSkinCatalogArgs(), { general: '', type: '全部', page: 1 });
  assert.deepEqual(parseSkinCatalogArgs('传说 势周瑜 2'), { general: '势周瑜', type: '传说', page: 2 });
  assert.deepEqual(parseSkinCatalogArgs('周瑜 至尊 2'), { general: '周瑜', type: '至尊', page: 2 });
  assert.deepEqual(parseSkinCatalogArgs('原画 郭嘉&戏志才 2'), { general: '郭嘉&戏志才', type: '原画', page: 2 });
  assert.deepEqual(parseSkinCatalogArgs('郭嘉＆戏志才 原画'), { general: '郭嘉＆戏志才', type: '原画', page: 1 });
  assert.deepEqual(parseSkinCatalogArgs('2', { general: '界·周瑜' }), { general: '界·周瑜', type: '全部', page: 2 });
  assert.deepEqual(parseSkinCatalogArgs('原画'), { general: '', type: '原画', page: 1 });
  for (const input of ['0', '1001', '周瑜 2 3', '至尊 传说', '周瑜 导出', '../x', '\r周瑜', '100 2']) {
    assert.throws(() => parseSkinCatalogArgs(input), /INVALID_CATALOG_ARGUMENT/);
  }
});

test('skin page parser projects verified public fields and safely chooses the original-art image', () => {
  const row = { ...skin(1, 3), banner_img_thumb: null };
  const parsed = parseSkinCatalogPage(pageData([row]), { type: 3, page: 1 });
  assert.equal(parsed.items[0].image, row.inner_banner);
  assert.equal(parsed.items[0].grade, '皮肤原画');
  assert.equal(parsed.items[0].generalName, '周瑜');
  assert.match(parsed.items[0].url, /#\/skinDetailSmall\?id=1$/);
  assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE_|next_page_url|untrusted/);
  const insecureThumbnail = parseSkinCatalogPage(pageData([{ ...row, banner_img_thumb: 'http://sjwx-oss.sanguosha.cn/skins/image/skins1.jpg' }]), { type: 3, page: 1 });
  assert.equal(insecureThumbnail.items[0].image, row.inner_banner);
  const unsafe = parseSkinCatalogPage(pageData([{ ...row, inner_banner: 'https://evil.invalid/skin.jpg' }]), { type: 3, page: 1 });
  assert.equal(unsafe.items[0].image, undefined);
});

test('skin catalog traverses complete bounded pages and filters exact general names without variant mixing', async () => {
  const calls = [];
  const client = new MobilePublicClient({ fetchImpl: async (url, init) => {
    const parsed = new URL(url), type = Number(parsed.searchParams.get('type')), page = Number(parsed.searchParams.get('page'));
    assert.equal(parsed.origin, 'https://share.sanguosha.cn');
    assert.equal(parsed.pathname, '/api/skins/list'); assert.equal(parsed.searchParams.get('limit'), '100');
    assert.equal(init.method, 'GET'); assert(!new Headers(init.headers).has('authorization')); assert(!new Headers(init.headers).has('cookie'));
    calls.push(`${type}:${page}`);
    const rows = type === 2 ? Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => skin(1000 + (page - 1) * 100 + index, type, index === 0 ? '界·周瑜' : '周瑜')) : [skin(type, type, type === 1 ? '神周瑜' : '周瑜')];
    return json(pageData(rows, { page, total: type === 2 ? 101 : 1 }));
  } });
  const all = await client.skinCatalog({ pageSize: 24 });
  assert.equal(all.total, 103); assert.equal(all.pages, 5); assert.equal(all.coverage, 'official-skin-gallery');
  assert.deepEqual(calls.toSorted(), ['1:1','2:1','2:2','3:1']);
  const exact = await client.skinCatalog({ general: '界周瑜' });
  assert.equal(exact.total, 2); assert(exact.items.every(row => row.generalName === '界·周瑜'));
  const standard = await client.skinCatalog({ general: '周瑜' });
  assert.equal(standard.total, 100); assert(standard.items.every(row => row.generalName === '周瑜'));
  const absent = await client.skinCatalog({ general: '势周瑜' });
  assert.equal(absent.total, 0); assert.match(absent.notice, /未收录该将.*不代表游戏中没有/);
  assert.equal(calls.length, 4);
});

test('incomplete, inconsistent or duplicate skin pagination fails closed', async () => {
  for (const mutate of [data => { delete data.lists.total; }, data => { data.lists.last_page = 99; }, data => { data.lists.current_page = 2; }, data => { data.lists.total = 2; }, data => { data.lists.data[0].type = 3; }]) {
    const data = pageData([skin(1, 2)]); mutate(data);
    assert.throws(() => parseSkinCatalogPage(data, { type: 2, page: 1 }), error => error.code === 'SOURCE_CHANGED');
  }
  assert.throws(() => parseSkinCatalogPage(pageData([skin(1,2),skin(1,2)]), { type: 2, page: 1 }), error => error.code === 'SOURCE_CHANGED');
  const collision = new MobilePublicClient({ fetchImpl: async url => json(pageData([skin(1, Number(new URL(url).searchParams.get('type')))])) });
  await assert.rejects(collision.skinCatalog(), error => error.code === 'SOURCE_CHANGED');
  const changed = new MobilePublicClient({ fetchImpl: async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    const rows = Array.from({length: page === 1 ? 100 : 2}, (_, index) => skin((page - 1) * 100 + index + 1, 2));
    return json(pageData(rows, { page, total: page === 1 ? 101 : 102 }));
  } });
  await assert.rejects(changed.skinCatalog({ type: '传说' }), error => error.code === 'SOURCE_CHANGED');
});
