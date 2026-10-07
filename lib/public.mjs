/** Original read-only client for 三国杀移动版 official public pages and community APIs. */
export const SOURCES = Object.freeze({
  official: 'https://www.sanguosha.cn/',
  community: 'https://xh.sanguosha.cn/web/2',
  legacyCommunity: 'https://xianhua.sanguosha.cn/',
  communityApi: 'https://wxforum.sanguosha.cn/api/',
  appIntroduction: 'https://hi.sanguosha.cn/pc/index.html',
  privacySdk: 'https://www.sanguosha.cn/sgs_agreement/SDK_info.html'
});

export const NEWS_CATEGORIES = Object.freeze({
  最新: 1004, 活动公告: 1001, 排位赛: 1006, 斗地主: 1007, 身份国战: 1008, 资讯: 1009
});
export const GUIDE_CATEGORIES = Object.freeze({
  新手须知: 3001, 初阶攻略: 3002, 进阶攻略: 3003, 三国趣闻: 3004
});
export const GAME_MODES = Object.freeze({
  身份场: 1, 排位赛: 2, 团战3V3: 3, 国战: 4, 欢乐斗地主: 5, 幻化之战: 7, 太虚幻境: 8
});
const ALLOWED_HOSTS = new Set(['www.sanguosha.cn', 'wxforum.sanguosha.cn']);
const IMAGE_HOSTS = new Set(['www.sanguosha.cn', 'imagexh.sanguosha.com', 'cf-resources.sanguosha.cn', 'cf-resources.oss-cn-hangzhou.aliyuncs.com']);
const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', hellip: '…', mdash: '—' };

export class PublicDataError extends Error {
  constructor(code, message, sourceUrl) {
    super(message); this.name = 'PublicDataError'; this.code = code; this.sourceUrl = sourceUrl;
  }
}

export function cleanText(input = '', maxLength = 6000) {
  return String(input)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|tr|section)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(x[\da-f]+|\d+);/gi, (all, number) => {
      const code = /^x/i.test(number) ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z]+);/gi, (all, entity) => ENTITY_MAP[entity.toLowerCase()] ?? all)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\t \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

function attribute(tag, name) {
  return new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(tag)?.[2] ?? '';
}
function safeImage(value, base) {
  try { const u = new URL(value, base); return u.protocol === 'https:' && IMAGE_HOSTS.has(u.hostname) ? u.href : undefined; }
  catch { return undefined; }
}
function trustedUrl(value, base = SOURCES.official) {
  let url; try { url = new URL(value, base); } catch { throw new PublicDataError('UNTRUSTED_URL', '资料来源地址无效。'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) {
    throw new PublicDataError('UNTRUSTED_URL', '仅允许查询三国杀移动版已核实的官方资料来源。');
  }
  return url;
}
function positiveInteger(value, label, max = 9999999999) {
  const text = String(value);
  if (!/^\d{1,10}$/.test(text) || Number(text) < 1 || Number(text) > max) throw new PublicDataError('INVALID_ARGUMENT', `${label}必须是 1 至 ${max} 的整数。`);
  return Number(text);
}
function boundedLimit(value = 10, max = 50) { return positiveInteger(value, '数量', max); }
function categoryId(value, mapping, fallback) {
  const selected = value ?? fallback;
  if (Object.hasOwn(mapping, selected)) return mapping[selected];
  if (Object.values(mapping).includes(Number(selected))) return Number(selected);
  throw new PublicDataError('INVALID_ARGUMENT', `分类可选：${Object.keys(mapping).join('、')}。`);
}
function normalName(value) { return cleanText(value, 100).toLowerCase().replace(/[\s·•\-_.]/g, ''); }
function ensureMobile(html, sourceUrl) {
  if (!html.includes('三国杀移动版')) throw new PublicDataError('SOURCE_CHANGED', '官网页面结构或版本标记发生变化，未将它作为移动版资料。', sourceUrl);
}

// Extract an HTML element with balanced instances of its own tag, avoiding nested-div truncation.
function classBlocks(html, className, tag = 'div') {
  const output = [];
  const starts = new RegExp(`<${tag}\\b[^>]*>`, 'gi'); let match;
  while ((match = starts.exec(html))) {
    if (!attribute(match[0], 'class').split(/\s+/).includes(className)) continue;
    const bodyStart = starts.lastIndex;
    const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'); tokens.lastIndex = bodyStart;
    let depth = 1; let token;
    while ((token = tokens.exec(html))) {
      depth += /^<\//.test(token[0]) ? -1 : /\/>$/.test(token[0]) ? 0 : 1;
      if (!depth) { output.push({ inner: html.slice(bodyStart, token.index), tag: match[0] }); break; }
    }
  }
  return output;
}
function classText(html, className, tag = 'div') { return cleanText(classBlocks(html, className, tag)[0]?.inner); }
function listItems(html) { return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)].map(m => cleanText(m[1])); }
function anchors(html) { return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].map(m => ({ tag: m[1], inner: m[2], href: attribute(m[1], 'href') })); }
function images(html, sourceUrl) { return [...new Set([...html.matchAll(/<img\b[^>]*>/gi)].map(m => safeImage(attribute(m[0], 'src'), sourceUrl)).filter(Boolean))]; }
function dedupe(items) { return [...new Map(items.map(item => [item.id, item])).values()]; }

export function parseArticleList(html, sourceUrl, type = 'news') {
  ensureMobile(html, sourceUrl);
  const matcher = type === 'guide' ? /\/pc\/guide-info-(\d+)\.html$/ : /\/pc\/news-detail-(\d+)\.html$/;
  return dedupe(anchors(html).flatMap(a => {
    const id = matcher.exec(a.href)?.[1]; if (!id) return [];
    const categoryMatch = /<span\b[^>]*>([\s\S]*?)<\/span\s*>/i.exec(a.inner);
    const titleHtml = classBlocks(a.inner, 'news-name', 'p')[0]?.inner;
    const title = cleanText((titleHtml ?? a.inner).replace(/<span\b[^>]*>[\s\S]*?<\/span\s*>/i, ''), 300);
    return title ? [{ id: Number(id), title, name: title, category: cleanText(categoryMatch?.[1], 80), date: classText(a.inner, 'news-time', 'p'), description: '', url: trustedUrl(a.href).href, sourceUrl }] : [];
  }));
}

export function parseHeroList(html, sourceUrl) {
  ensureMobile(html, sourceUrl);
  return dedupe(anchors(html).flatMap(a => {
    const id = /\/pc\/hero-detail-(\d+)\.html$/.exec(a.href)?.[1]; if (!id) return [];
    const imageTag = /<img\b[^>]*>/i.exec(a.inner)?.[0] ?? '';
    const name = cleanText(attribute(imageTag, 'alt') || a.inner, 100);
    if (!name) return [];
    return [{ id: Number(id), title: name, name, description: '', url: trustedUrl(a.href).href, image: safeImage(attribute(imageTag, 'src'), sourceUrl), sourceUrl }];
  }));
}

export function parseHero(html, sourceUrl) {
  ensureMobile(html, sourceUrl);
  const titleHtml = classBlocks(html, 'hero-title', 'h3')[0]?.inner ?? '';
  const name = cleanText(/<span\b[^>]*>([\s\S]*?)<\/span\s*>/i.exec(titleHtml)?.[1], 100);
  if (!name) throw new PublicDataError('SOURCE_CHANGED', '官网武将资料暂时无法解析。', sourceUrl);
  const modes = listItems(classBlocks(titleHtml, 'hero-from', 'ul')[0]?.inner ?? '');
  const skills = classBlocks(html, 'skill').flatMap((block, index) => {
    const names = listItems(classBlocks(block.inner, 'skill-nav', 'ul')[0]?.inner ?? '');
    const descriptions = listItems(classBlocks(block.inner, 'skill-info', 'ul')[0]?.inner ?? '');
    return names.map((skillName, i) => ({ mode: modes[index] ?? `模式${index + 1}`, name: skillName, description: descriptions[i] ?? '' }));
  });
  const skinSection = classBlocks(html, 'hero-info')[0]?.inner ?? '';
  return {
    id: Number(/hero-detail-(\d+)/.exec(sourceUrl)?.[1]), title: name, name,
    faction: cleanText(/<i\b[^>]*>([\s\S]*?)<\/i\s*>/i.exec(titleHtml)?.[1], 20), modes,
    description: classText(html, 'hero-intro'), features: classText(html, 'hero-desc'),
    playGuide: classText(html, 'play'), skills, images: images(skinSection, sourceUrl),
    url: sourceUrl, sourceUrl
  };
}

export function parseArticle(html, sourceUrl) {
  ensureMobile(html, sourceUrl);
  const title = classText(html, 'detail-title');
  const content = classBlocks(html, 'detail-content')[0]?.inner;
  if (!title || content == null) throw new PublicDataError('SOURCE_CHANGED', '官网文章暂时无法解析。', sourceUrl);
  return { id: Number(/(?:news-detail|guide-info)-(\d+)/.exec(sourceUrl)?.[1]), title, name: title,
    date: classText(html, 'detail-time', 'p'), description: cleanText(content, 16000), images: images(content, sourceUrl),
    imageNotice: images(content, sourceUrl).length ? '部分将池、概率表或奖励可能只在原文图片中，请查看原文及附图。' : '',
    url: sourceUrl, sourceUrl };
}

export function parseMode(html, sourceUrl) {
  const article = parseArticle(html, sourceUrl);
  const content = classBlocks(html, 'detail-content')[0]?.inner ?? '';
  const sections = [...content.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3\s*>([\s\S]*?)(?=<h3\b|$)/gi)].map(m => ({ name: cleanText(m[1], 80), description: cleanText(m[2]) }));
  return { ...article, id: Number(/mode-info-(\d+)/.exec(sourceUrl)?.[1]), sections };
}

function sanitizeTopic(item, sourceUrl) {
  const id = positiveInteger(item.id, '帖子编号');
  const title = cleanText(item.title, 300);
  return { id, title, name: title, description: cleanText(item.excerpt || item.body, 1800),
    date: cleanText(item.created_at, 50), category: cleanText(item.category_name, 80),
    author: cleanText(item.user?.nick_name, 80), likes: Number(item.like_count) || 0,
    replies: Number(item.reply_count) || 0, views: Number(item.view_count) || 0,
    images: Array.isArray(item.body_image) ? item.body_image.map(url => safeImage(url, SOURCES.legacyCommunity)).filter(Boolean).slice(0, 8) : [],
    url: `${SOURCES.legacyCommunity}postDetails?id=${id}`, sourceUrl };
}

export class MobilePublicClient {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 12000, cacheTtlMs = 300000, maxResponseBytes = 2500000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; this.cacheTtlMs = cacheTtlMs;
    this.maxResponseBytes = maxResponseBytes; this.cache = new Map();
  }
  async request(value, json = false) {
    let url = trustedUrl(value); const cacheKey = url.href;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response;
      for (let hop = 0; hop < 4; hop++) {
        response = await this.fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal: controller.signal,
          headers: { Accept: json ? 'application/json' : 'text/html', 'User-Agent': 'SGS-Mobile-Plugin/1.0 (read-only public client)',
            ...(json ? { 'content-type': 'application/json', platform: 'pc', 'AppVersion-Code': '1.0.0' } : {}) } });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        if (hop === 3) throw new PublicDataError('TOO_MANY_REDIRECTS', '官网跳转过多，请稍后重试。', cacheKey);
        const location = response.headers.get('location');
        if (!location) throw new PublicDataError('SOURCE_CHANGED', '官网跳转缺少地址。', cacheKey);
        url = trustedUrl(location, url.href);
      }
      if (!response.ok) throw new PublicDataError(response.status === 401 ? 'AUTH_REQUIRED' : 'HTTP_ERROR', response.status === 401 ? '此接口需要官方账号授权。' : `官方资料请求失败（HTTP ${response.status}）。`, cacheKey);
      if (Number(response.headers.get('content-length')) > this.maxResponseBytes) throw new PublicDataError('RESPONSE_TOO_LARGE', '官方资料超过本插件读取上限。', cacheKey);
      const text = await response.text();
      if (new TextEncoder().encode(text).length > this.maxResponseBytes) throw new PublicDataError('RESPONSE_TOO_LARGE', '官方资料超过本插件读取上限。', cacheKey);
      let result = text;
      if (json) {
        let body; try { body = JSON.parse(text); } catch { throw new PublicDataError('SOURCE_CHANGED', '官方接口未返回有效 JSON。', cacheKey); }
        if (![0, 1000, 200, 20002, 10000].includes(body.code)) throw new PublicDataError([401, 1003].includes(body.code) ? 'AUTH_REQUIRED' : 'API_ERROR', [401, 1003].includes(body.code) ? '此接口需要官方账号授权。' : `官方接口暂时不可用（代码 ${Number(body.code) || 'unknown'}）。`, cacheKey);
        result = body.data;
      }
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(cacheKey, { value: result, expiresAt: Date.now() + this.cacheTtlMs });
      return structuredClone(result);
    } catch (error) {
      if (error instanceof PublicDataError) throw error;
      if (controller.signal.aborted) throw new PublicDataError('TIMEOUT', '官方资料请求超时，请稍后重试。', cacheKey);
      throw new PublicDataError('NETWORK_ERROR', '暂时无法连接官方资料来源。', cacheKey);
    } finally { clearTimeout(timer); }
  }
  async news({ category = '最新', page = 1, limit = 10, keyword = '' } = {}) {
    const id = categoryId(category, NEWS_CATEGORIES, '最新'); page = positiveInteger(page, '页码', 2000); limit = boundedLimit(limit);
    const sourceUrl = `${SOURCES.official}pc/news-list-${id}.html?page=${page}`;
    const all = parseArticleList(await this.request(sourceUrl), sourceUrl);
    const items = keyword ? all.filter(item => normalName(item.title).includes(normalName(keyword))) : all;
    return { items: items.slice(0, limit), total: items.length, page, category: id, sourceUrl };
  }
  async article(id) {
    id = positiveInteger(id, '公告编号'); const sourceUrl = `${SOURCES.official}pc/news-detail-${id}.html`;
    return parseArticle(await this.request(sourceUrl), sourceUrl);
  }
  async heroes(query = '', { limit = 50 } = {}) {
    if (typeof query === 'object') { limit = query.limit ?? limit; query = query.query ?? query.keyword ?? ''; }
    limit = boundedLimit(limit, 1000); const sourceUrl = `${SOURCES.official}pc/hero-list.html`;
    const all = parseHeroList(await this.request(sourceUrl), sourceUrl);
    if (!all.length) throw new PublicDataError('SOURCE_CHANGED', '官网武将列表暂时无法解析。', sourceUrl);
    const needle = normalName(query); const items = needle ? all.filter(item => normalName(item.name).includes(needle)) : all;
    return { items: items.slice(0, limit), total: items.length, sourceUrl };
  }
  async hero(idOrName) {
    let id = idOrName;
    if (!/^\d+$/.test(String(idOrName))) {
      const list = await this.heroes(String(idOrName), { limit: 1000 });
      const exact = list.items.filter(item => normalName(item.name) === normalName(idOrName));
      const choices = exact.length ? exact : list.items;
      if (!choices.length) throw new PublicDataError('NOT_FOUND', '官网中没有找到此移动版武将。', list.sourceUrl);
      if (choices.length > 1) throw new PublicDataError('AMBIGUOUS_HERO', `找到多个武将，请指定名字或编号：${choices.slice(0, 12).map(item => `${item.name}(${item.id})`).join('、')}。`, list.sourceUrl);
      id = choices[0].id;
    }
    id = positiveInteger(id, '武将编号'); const sourceUrl = `${SOURCES.official}pc/hero-detail-${id}.html`;
    return parseHero(await this.request(sourceUrl), sourceUrl);
  }
  async guides({ category = '新手须知', page = 1, keyword = '', limit = 10 } = {}) {
    const id = categoryId(category, GUIDE_CATEGORIES, '新手须知'); page = positiveInteger(page, '页码', 1000); limit = boundedLimit(limit);
    const sourceUrl = `${SOURCES.official}pc/guide-list-${id}.html?page=${page}`;
    const all = parseArticleList(await this.request(sourceUrl), sourceUrl, 'guide');
    const items = keyword ? all.filter(item => normalName(item.title).includes(normalName(keyword))) : all;
    return { items: items.slice(0, limit), total: items.length, page, category: id, sourceUrl };
  }
  async guide(id) {
    id = positiveInteger(id, '攻略编号'); const sourceUrl = `${SOURCES.official}pc/guide-info-${id}.html`;
    return parseArticle(await this.request(sourceUrl), sourceUrl);
  }
  async mode(idOrName = '身份场') {
    const aliases = { 身份: '身份场', 排位: '排位赛', 斗地主: '欢乐斗地主', 团战: '团战3V3', '3v3': '团战3V3', 幻化: '幻化之战', 太虚: '太虚幻境' };
    const id = categoryId(aliases[idOrName] ?? idOrName, GAME_MODES, '身份场');
    const sourceUrl = `${SOURCES.official}pc/mode-info-${id}.html`;
    return parseMode(await this.request(sourceUrl), sourceUrl);
  }
  async topics({ keyword = '', categoryId = 0, page = 1, limit = 10, guidesOnly = false } = {}) {
    page = positiveInteger(page, '页码', 1000); limit = boundedLimit(limit);
    if (!Number.isInteger(Number(categoryId)) || Number(categoryId) < 0 || Number(categoryId) > 100) throw new PublicDataError('INVALID_ARGUMENT', '社区分类编号无效。');
    keyword = cleanText(keyword, 80);
    const url = new URL(keyword ? 'searchV2/topics' : 'topics', SOURCES.communityApi);
    const params = keyword ? { keyword, category_id: guidesOnly ? 6 : categoryId, is_theme: 0, page, from: 'general' } : { page, category_id: categoryId, include: 'user,label', has_label: 0, just_video: 0 };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const data = await this.request(url.href, true);
    if (!Array.isArray(data)) throw new PublicDataError('SOURCE_CHANGED', '官方社区列表结构发生变化。', url.href);
    const items = data.filter(item => item && /^\d+$/.test(String(item.id)) && Number(item.id) > 0).map(item => sanitizeTopic(item, url.href));
    return { items: items.slice(0, limit), total: items.length, page, keyword, sourceUrl: url.href };
  }
  async hot({ kind = 'today', limit = 10 } = {}) {
    const aliases = { 今日: 'today', 今日热榜: 'today', 话题: 'theme', 热门话题: 'theme', 一周红人: 'week', 著名大佬: 'all' };
    kind = aliases[kind] ?? kind;
    if (!['today', 'theme', 'week', 'all'].includes(kind)) throw new PublicDataError('INVALID_ARGUMENT', '热榜可选：today、theme、week、all。');
    limit = boundedLimit(limit); const sourceUrl = `${SOURCES.communityApi}rank/${kind}`;
    const data = await this.request(sourceUrl, true);
    if (!Array.isArray(data)) throw new PublicDataError('SOURCE_CHANGED', '官方社区热榜结构发生变化。', sourceUrl);
    const items = data.map(item => {
      const name = cleanText(item.title || item.theme_name || item.nick_name || item.user?.nick_name, 300);
      const id = String(item.id ?? item.theme_id ?? '');
      let url = SOURCES.legacyCommunity;
      if (/^\d+$/.test(id)) url += kind === 'today' ? `postDetails?id=${id}` : kind === 'theme' ? `topics?theme_id=${id}` : `userCenter?userId=${id}`;
      return { id, title: name, name, description: `${kind === 'theme' ? '话题热度' : ['week', 'all'].includes(kind) ? '社区人气' : '帖子热度'}：${Number(item.total ?? item.view_count) || 0}`,
        heat: Number(item.total ?? item.view_count) || 0, date: cleanText(item.created_at, 50), url, sourceUrl };
    });
    return { items: items.slice(0, limit), total: items.length, kind, sourceUrl };
  }
}

export function createPublicClient(options) { return new MobilePublicClient(options); }

export function formatPublic(result, { maxItems = 10, maxLength = 3600 } = {}) {
  if (Array.isArray(result?.items)) {
    return cleanText(result.items.slice(0, maxItems).map((item, i) => `${i + 1}. ${item.title || item.name}${item.id ? ` [${item.id}]` : ''}${item.date ? ` (${item.date})` : ''}\n${item.description ? `${item.description.slice(0, 180)}\n` : ''}${item.url}`).join('\n\n') + `\n\n来源：${result.sourceUrl}`, maxLength);
  }
  const body = [result.title || result.name, result.faction ? `势力：${result.faction}` : '', result.date,
    result.description, result.features, result.playGuide,
    ...(result.skills ?? []).map(skill => `${skill.mode}·${skill.name}：${skill.description}`),
    ...(result.sections ?? []).map(section => `${section.name}：${section.description}`),
    result.skins?.length?'官网皮肤资料（'+result.skins.length+'条）：\n'+result.skins.slice(0,8).map(s=>[s.name||s.title,s.image||s.url].filter(Boolean).join('：')).join('\n'):'',result.imageNotice, `来源：${result.sourceUrl}`].filter(Boolean).join('\n\n');
  return cleanText(body, maxLength);
}
