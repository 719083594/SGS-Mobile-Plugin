/** Original, inert HTML/CSS cards. Rendering/uploading belongs to the caller.
 * No fetching, persistence, scripts, web fonts, or remote image embedding.
 * Field meanings follow the same official app-qr-v1 sources as format-personal.
 * assetResolver.items may extend the seven established labels with separately
 * verified item metadata; image methods must return a prepared local file URL.
 */
import { redactOwnData } from './community-auth.mjs';

const WIDTH = 1080;
const MAX_PAGES = 8;
const TITLES = Object.freeze({ summary: '个人资料', profile: '社区资料', force: '将力与对局', gameInfo: '游戏资料', assets: '我的资产', records: '战绩统计', recent: '近期对局', skins: '皮肤收藏', favorites: '武将收藏', abilities: '能力一览', bestGeneral: '擅长武将', roles: '角色资料', personal: '本人资料' });
const COMMANDS = Object.freeze({ summary: '个人资料', profile: '个人资料', force: '将力', gameInfo: '游戏资料', assets: '资产', records: '战绩', recent: '近期战绩', skins: '皮肤', favorites: '武将收藏', abilities: '能力', bestGeneral: '擅长武将', roles: '个人资料', personal: '个人资料' });
const MODES = ['全部', '排位赛', '身份场', '国战', '斗地主'];
const ITEMS = [['yb', '元宝'], ['jh', '将魂'], ['yl', '雁翎'], ['zml', '招募令'], ['ylj', '雁翎甲'], ['ssbz', '史诗宝珠'], ['hld', '欢乐豆']];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const short = (value, max = 180) => typeof value === 'number' ? Number.isFinite(value) ? String(value) : '' : typeof value === 'boolean' ? String(value) : typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
const prefixFor = value => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20) : '#sgs';
const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const chunk = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

function fileImage(value, allowBundledSvg = false, allowPreparedPortrait = false) {
  if (allowPreparedPortrait && typeof value === 'string' && value.length <= 350000 && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    const encoded = value.slice(value.indexOf(',') + 1);
    if (encoded.length % 4) return null;
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > 262144 || bytes.toString('base64') !== encoded) return null;
    if (value.startsWith('data:image/png;')) {
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) return null;
    } else if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
    return value;
  }
  if (typeof value !== 'string' || !/^file:\/\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    if (url.protocol !== 'file:' || url.hostname || url.username || url.password || url.search || url.hash || /^\/\//.test(pathname) || /[\u0000-\u001f\u007f]/.test(pathname)) return null;
    if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(pathname) && !(allowBundledSvg && /\.svg$/i.test(pathname))) return null;
    return url.href;
  } catch { return null; }
}

function imageSource(resolver, method, key) {
  if (method === 'imageForGeneral' && typeof key === 'string' && /^data:/i.test(key)) return null;
  let source = null;
  // The trusted resolver may supply its bundled inert original item symbols.
  // Prepared portraits may be RAM-only raster data URLs from the trusted
  // resolver. Never use an input row URL directly as an image source.
  try { if (key !== null && key !== undefined && typeof resolver?.[method] === 'function') source = fileImage(resolver[method](key), method === 'imageForItem', method === 'imageForGeneral'); } catch {}
  return source;
}

function image(resolver, method, key, label, className = 'avatar') {
  const source = imageSource(resolver, method, key);
  return source ? `<img class="${className}" src="${esc(source)}" alt="${esc(short(label, 40))}">` : `<span class="${className} placeholder" aria-label="${esc(short(label, 40))}">${esc(short(label, 1) || '将')}</span>`;
}

function staticArtwork(resolver, value, label, className = 'badge-icon') {
  // Account-supplied URLs are lookup keys only. The resolver must already have
  // an exact attributed public-manifest entry; no download or remote fallback.
  if (typeof value !== 'string' || value.length > 1000) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.sanguosha.cn', 'imagexh.sanguosha.com'].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.href !== value || !/\.(?:png|jpe?g)$/i.test(url.pathname)) return '';
    const source = imageSource(resolver, 'imageForOfficialStatic', value);
    return source ? `<img class="${className}" src="${esc(source)}" alt="${esc(short(label, 40))}">` : '';
  } catch { return ''; }
}

const CSS = `
*{box-sizing:border-box}html,body{margin:0;width:1080px}body{font-family:"Noto Sans CJK SC","Microsoft YaHei","PingFang SC",sans-serif;color:#f5efdf;background:#10232e}.sheet{padding:44px 46px 36px;background:radial-gradient(ellipse at 95% 0%,#284451 0,transparent 50%),linear-gradient(140deg,#142e3b,#10212c 65%);position:relative;overflow:hidden}.sheet:before{content:"";position:absolute;inset:18px;border:1px solid #bc985a40;pointer-events:none}.masthead{display:flex;align-items:center;gap:22px;margin:0 0 30px}.seal{flex:none;border:2px solid #d4ad68;color:#edcf94;width:74px;height:82px;display:grid;place-items:center;font-family:serif;font-size:31px;line-height:1.1;letter-spacing:3px;border-radius:6px;box-shadow:5px 5px 0 #d4ad6812}.eyebrow{font-size:19px;letter-spacing:4px;color:#c9b895;margin-bottom:8px}.title{font-size:52px;font-weight:800;letter-spacing:3px;line-height:1.2}.masthead .page{margin-left:auto;align-self:flex-start;color:#d7c6a3;font-size:22px;border:1px solid #a78f603d;border-radius:40px;padding:10px 18px;white-space:nowrap}.intro{font-size:27px;line-height:1.7;color:#e0e6e3;margin:0 0 28px}.grid{display:grid;gap:18px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.panel{background:linear-gradient(145deg,#f7f1e4,#e9e2d3);border:1px solid #e8c68b80;border-radius:22px;padding:26px;color:#203947;box-shadow:0 9px 0 #06141a21;min-width:0}.panel.dark{background:linear-gradient(145deg,#24434f,#1b3542);color:#f2ead9;border-color:#ba985647}.section{margin-top:26px}.section-title{display:flex;align-items:center;gap:14px;color:#ebc984;font-size:30px;font-weight:750;letter-spacing:2px;margin:0 0 16px}.section-title:before{content:"";display:block;width:5px;height:25px;background:#d3aa65;border-radius:3px}.minor{font-size:22px;line-height:1.65;color:#aabfc5}.panel .minor{color:#63737a}.dark .minor{color:#b5c8cb}.label{font-size:23px;line-height:1.5;color:#667578}.value{font-size:42px;font-weight:800;color:#193746;line-height:1.35;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.dark .label{color:#b7c8cb}.dark .value{color:#f3d59d}.metric{padding:22px 24px}.metric.wide{grid-column:span 2}.metric .value.small{font-size:31px}.identity{display:flex;align-items:center;gap:24px;padding:30px}.identity .name{font-size:42px;font-weight:800;overflow-wrap:anywhere}.identity .subtitle{font-size:25px;line-height:1.7;color:#67767b;margin-top:6px}.identity.dark .subtitle{color:#b9cdcf}.avatar{height:112px;width:112px;flex:none;border-radius:20px;object-fit:cover;background:#d8c9ad;border:2px solid #cfad71;display:inline-flex;align-items:center;justify-content:center}.placeholder{font-family:serif;color:#9d7c47;font-size:42px;background:linear-gradient(145deg,#eee0c6,#cab58d)}.item{display:flex;align-items:center;gap:16px;padding:24px 20px;min-height:156px}.item-icon{width:72px;height:80px;flex:none;object-fit:contain;display:inline-flex;align-items:center;justify-content:center;font-size:30px;border-radius:14px;background:#d8c6a12b}.item .value{font-size:37px}.item .label{font-size:24px;color:#3d535b}.pill{display:inline-flex;align-items:center;border-radius:30px;padding:7px 14px;background:#d4b67924;color:#a77c36;font-size:20px;white-space:nowrap}.dark .pill{color:#edc67f;background:#f4d28d13}.profile-pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:13px}.rate-head{display:flex;align-items:center;gap:18px;margin-bottom:14px}.rate-head .ring{width:102px;height:102px;border-radius:50%;background:conic-gradient(#ad874b var(--progress),#d5d1c3 0);display:grid;place-items:center;flex:none}.ring:before{content:"";position:absolute}.rate-head .ring span{display:grid;place-items:center;width:80px;height:80px;background:#f0e9db;border-radius:50%;font-size:26px;font-weight:800}.rate-name{font-size:30px;font-weight:800}.rate-main{font-size:35px;font-weight:800;color:#936c30}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 18px}.fact{font-size:23px;line-height:1.5;min-width:0;overflow-wrap:anywhere}.fact span{color:#738083;display:block;font-size:20px}.result-strip{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:10px}.result-cell{border-radius:12px;padding:13px 0;text-align:center;font-size:25px;font-weight:750;background:#d8d6ca;color:#768381}.result-cell.win{background:#dce7d9;color:#44765b}.result-cell.lose{background:#f0ddd4;color:#a46552}.result-cell small{display:block;font-size:15px;font-weight:500;opacity:.7;margin-top:2px}.general{display:flex;align-items:center;gap:18px;min-height:150px}.general .avatar{height:91px;width:91px;border-radius:14px}.general-name{font-size:28px;font-weight:800;overflow-wrap:anywhere}.match{display:flex;align-items:center;gap:22px;margin-bottom:14px;padding:22px 26px}.match:last-child{margin-bottom:0}.match .avatar{height:88px;width:88px;border-radius:15px}.match-content{flex:1;min-width:0}.match-mode{font-size:29px;font-weight:750}.match-time{font-size:22px;line-height:1.6;color:#758286;overflow-wrap:anywhere}.match-result{font-size:29px;font-weight:800;color:#8b724b;max-width:220px;overflow-wrap:anywhere}.match-result.win{color:#4b7c61}.match-result.lose{color:#a36755}.entry-name{font-size:29px;font-weight:800;margin:0 0 16px;overflow-wrap:anywhere}.entry-fields{display:grid;gap:14px}.entry-field{font-size:25px;line-height:1.6;overflow-wrap:anywhere}.entry-field .key{font-size:20px;color:#7a817e;margin-right:10px}.empty{padding:46px 32px;text-align:center;font-size:29px;line-height:1.8}.foot{border-top:1px solid #cdb37b30;margin-top:30px;padding-top:20px;color:#b0c0c2;font-size:21px;line-height:1.7;overflow-wrap:anywhere}.foot strong{color:#e8cc95;font-weight:650}.help-hero{padding:26px 30px;border-left:4px solid #d6b371;border-radius:0 18px 18px 0;background:#f2d69a0c;font-size:28px;line-height:1.7;margin-bottom:24px}.help-group{padding:25px 23px}.help-heading{font-size:30px;font-weight:800;color:#f2d196;margin-bottom:14px}.help-line{font-size:25px;line-height:1.75;overflow-wrap:anywhere}.help-group .minor{font-size:20px;margin-top:12px}.help-note{border:1px solid #d3b06b40;background:#d3b06b0c;border-radius:18px;padding:22px 28px;font-size:24px;line-height:1.75;margin-top:24px}.article-title{font-size:33px;font-weight:800;line-height:1.55;margin:0 0 16px}.article-text{font-size:27px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}.public-row{display:flex;gap:22px;align-items:flex-start;margin-bottom:18px}.public-row:last-child{margin-bottom:0}.public-index{font-size:32px;color:#bc9353;min-width:40px;font-weight:800}.public-row .entry-name{margin-bottom:7px}.public-row .minor{font-size:24px}.source{margin-top:12px;font-size:18px;color:#879a9d}
.help-banner{display:flex;align-items:center;gap:26px}.hero-copy{flex:1;min-width:0}.hero-portraits{display:flex;gap:12px;flex:none}.hero-person{text-align:center;color:#d7bf8b;font-size:17px;line-height:1.6}.hero-person .avatar{display:block;width:74px;height:74px;border-radius:16px;border-color:#b79458;box-shadow:0 5px 14px #0004}.hero-person span:last-child{display:block;margin-top:6px}.badges{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px}.badge-icon{width:100%;height:100px;object-fit:contain}.career{display:flex;align-items:center;gap:18px;min-height:140px}.career .badge-icon{width:86px;height:86px;flex:none}.career .value{font-size:33px}.career.inactive{filter:grayscale(1);opacity:.7}.career .entry-name{margin-bottom:5px;font-size:26px}.rank-card{display:flex;align-items:center;gap:22px}.rank-card .badge-icon{width:92px;height:92px;flex:none}
`;

function frame(title, body, { kind = 'personal', foot = '', index = 1, total = 1, subtitle = '三国杀移动版 · 三国咸话' } = {}) {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(title)}</title><style>${CSS}</style></head><body><main id="container" class="sheet" data-kind="${esc(kind)}"><header class="masthead"><div class="seal">三<br>国</div><div><div class="eyebrow">${esc(subtitle)}</div><div class="title">${esc(title)}</div></div>${total > 1 ? `<div class="page">${index} / ${total}</div>` : ''}</header>${body}<footer class="foot">${foot || '三国杀移动助手 · 资料来自官方移动版与三国咸话'}</footer></main></body></html>`;
  return { html, width: WIDTH };
}

function exportCommand(kind, { prefix, command, model, page }) {
  const mode = Number.isInteger(Number(model)) && Number(model) >= 0 && Number(model) <= 4 ? Number(model) : 0;
  const args = kind === 'recent' ? ` ${mode} ${positive(page, 1)}` : kind === 'records' ? ` ${mode}` : '';
  return prefixFor(prefix) + (short(command, 30) || COMMANDS[kind]) + args + ' 导出';
}

function metrics(data, fields) {
  return fields.flatMap(([key, label, suffix = '']) => {
    const value = short(data?.[key]);
    if (!value) return [];
    return [`<div class="panel metric"><div class="label">${esc(label)}</div><div class="value${value.length > 14 ? ' small' : ''}">${esc(value)}${suffix && !(suffix === '%' && value.endsWith('%')) ? esc(suffix) : ''}</div></div>`];
  });
}
const section = (title, content) => content ? `<section class="section"><h2 class="section-title">${esc(title)}</h2>${content}</section>` : '';
const grid = (cards, columns = 'two') => `<div class="grid ${columns}">${cards.join('')}</div>`;
const empty = message => `<div class="panel empty">${esc(message)}</div>`;

export function buildHelpCard({ prefix = '#sgs', assetResolver } = {}) {
  const p = prefixFor(prefix);
  const groups = [
    ['公开资料', [`${p}资讯 / 活动 / 公告`, `${p}武将 [名称或ID]`, `${p}攻略 [关键词]`, `${p}模式 [名称]`, `${p}详情 文章ID`], '官网武将、技能、模式与攻略'],
    ['社区动态', [`${p}社区 [关键词]`, `${p}热榜 [today/week/all/theme]`], '只读浏览官方三国咸话内容'],
    ['本人战绩', [`${p}个人资料 / 将力`, `${p}游戏资料 / 能力`, `${p}战绩 [模式0-4]`, `${p}胜率 / 势周瑜胜率`, `${p}近期战绩 [模式] [页码]`], '胜率仅本人私聊；模式：0全部 · 1排位 · 2身份 · 3国战 · 4斗地主'],
    ['本人收藏', [`${p}资产 / 皮肤`, `${p}武将收藏 / 擅长武将`, `${p}资产 导出`, `${p}战绩 2 导出`], '所有本人查询末尾加「导出」可获取完整资料'],
    ['扫码与账户', [`${p}社区授权`, `${p}扫码状态 / 退出授权`, `${p}账户 / 解绑`], '请在本人私聊使用三国咸话 APP 扫码确认'],
    ['渠道与状态', [`${p}官号登录 / 华为登录`, `${p}绑定 官号或华为 游戏ID [区服]`, `${p}功能 / 状态`], '官号、华为游戏登录尚未接通；绑定只记录身份']
  ];
  const portraits = ['刘备', '关羽', '诸葛亮', '赵云'].map(name => `<div class="hero-person">${image(assetResolver, 'imageForGeneral', name, name)}<span>${name}</span></div>`).join('');
  const body = `<div class="help-hero help-banner"><div class="hero-copy">掌握战绩，收藏名将。<br><span class="minor">移动版专用 · 公开资料随时查<br>本人资料仅私聊</span></div><div class="hero-portraits">${portraits}</div></div>` + grid(groups.map(([title, commands, note]) => `<section class="panel dark help-group"><div class="help-heading">${esc(title)}</div>${commands.map(line => `<div class="help-line">${esc(line)}</div>`).join('')}<div class="minor">${esc(note)}</div></section>`)) + `<div class="help-note">社区扫码授权用于查询本人资料，账户加密保存。<br>签到、点赞、分享、兑换与领奖均不提供执行入口。</div>`;
  return frame('三国杀移动助手', body, { kind: 'help', foot: `<strong>${esc(p)}帮助</strong> · 三国杀移动版官网 sanguosha.cn · 官方三国咸话` });
}

function identity(data, kind, resolver) {
  const nick = short(kind === 'summary' ? data.nick_name : data.nick, 60);
  const avatar = kind === 'summary' ? data.avatar : data.head;
  const pills = [['lv', '等级'], ['vip', 'VIP'], ['nowDivision', '当前段位'], ['maxTitle', '称号']].flatMap(([key, label]) => short(data[key], 60) ? [`<span class="pill">${esc(label)} ${esc(short(data[key], 60))}</span>`] : []);
  if (!nick && !pills.length && !avatar) return '';
  return `<div class="panel identity">${image(resolver, 'imageForGeneral', avatar, nick || '角色')}<div><div class="name">${esc(nick || TITLES[kind])}</div><div class="subtitle">本人关联的移动版角色</div><div class="profile-pills">${pills.join('')}</div></div></div>`;
}

function profileBody(kind, data, resolver) {
  if (kind === 'summary') {
    const cards = metrics(data, [['general_all_count', '武将总数（官网统计）'], ['skin_all_count', '皮肤总数（官网统计）']]);
    return identity(data, kind, resolver) + section('资料概览', cards.length ? grid(cards) : '');
  }
  if (kind === 'force') {
    const cards = metrics(data, [['game_total', '总场次'], ['game_win', '获胜场次'], ['win_rate', '胜率', '%'], ['general_count', '拥有武将'], ['skin_count', '拥有皮肤']]);
    const rank = short(data.official, 90), artwork = staticArtwork(resolver, data.official_pic, '军阶');
    const rankCard = rank || artwork ? `<div class="panel dark rank-card">${artwork}<div><div class="label">军阶</div>${rank ? `<div class="value small">${esc(rank)}</div>` : ''}</div></div>` : '';
    return rankCard + section('对局表现', cards.length ? grid(cards) : '');
  }
  const cards = metrics(data, [['totalGame', '总场次'], ['totalMvp', '总 MVP'], ['rankWin', '排位胜场'], ['douDiZhuWin', '斗地主胜场'], ['maxDivision', '最高段位']]);
  for (const [part, total, label] of [['generalNum', 'generalTotal', '武将收藏'], ['skinNum', 'skinTotal', '皮肤收藏']]) {
    const left = short(data[part]), right = short(data[total]);
    if (left || right) cards.push(`<div class="panel metric"><div class="label">${esc(label)}</div><div class="value">${esc(left || '—')}${right ? ` <span class="minor">/ ${esc(right)}</span>` : ''}</div></div>`);
  }
  for (const [winsKey, totalKey, label] of [['rankWin', 'rankNum', '排位胜率'], ['douDiZhuWin', 'douDiZhuTotal', '斗地主胜率'], ['totalWin', 'totalGame', '总胜率']]) {
    const wins = numeric(data[winsKey]), total = numeric(data[totalKey]);
    if (wins !== null && total !== null && wins >= 0 && total > 0 && wins <= total) cards.push(`<div class="panel dark metric"><div class="label">${label}</div><div class="value">${Math.trunc(wins / total * 100)}%</div></div>`);
  }
  return identity(data, kind, resolver) + section('游戏统计', cards.length ? grid(cards) : '');
}

function profileExtraPages(kind, data, resolver) {
  const pages = [];
  const lights = kind === 'summary' ? data.light : kind === 'gameInfo' ? data.lights : null;
  const images = (Array.isArray(lights) ? lights : []).flatMap(value => {
    const picture = staticArtwork(resolver, value, kind === 'gameInfo' ? '将灯' : '资料图标');
    return picture ? [picture] : [];
  });
  for (const group of chunk(images, 12)) pages.push(section(kind === 'gameInfo' ? '将灯' : '资料图标', `<div class="panel badges">${group.join('')}</div>`));
  if (kind === 'gameInfo' && Array.isArray(data.titleList)) {
    const cards = data.titleList.flatMap(row => {
      if (!isObject(row)) return [];
      const name = short(row.name, 90), count = short(row.num, 40), artwork = staticArtwork(resolver, row.url, name || '生涯资料');
      if (!name && !count && !artwork) return [];
      const number = numeric(row.num), inactive = number !== null && number <= 0;
      return [`<div class="panel career${inactive ? ' inactive' : ''}">${artwork}<div><div class="entry-name">${esc(name || '生涯条目')}</div>${count ? `<div class="value">${esc(count)}</div>` : ''}</div></div>`];
    });
    for (const group of chunk(cards, 6)) pages.push(section('生涯资料', grid(group)));
  }
  return pages;
}

function assetPages(data, resolver, demo = false) {
  const definitions = new Map(ITEMS);
  for (const row of Array.isArray(resolver?.items) ? resolver.items : []) {
    if (isObject(row) && typeof row.key === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(row.key) && short(row.label, 30) && !definitions.has(row.key)) definitions.set(row.key, short(row.label, 30));
  }
  const cards = [...definitions].flatMap(([key, label]) => {
    const value = short(data[key]);
    return value ? [`<div class="panel item">${image(resolver, 'imageForItem', key, label, 'item-icon')}<div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div></div>`] : [];
  });
  return chunk(cards, 12).map(rows => `<p class="intro">${demo ? '道具数量为合成示例，不代表真实账户。' : '道具与数量，来自本次官方查询。'}</p>` + grid(rows, 'three'));
}

function ratePanel(name, data, fields) {
  const main = short(data.total_rate), number = numeric(data.total_rate);
  const details = fields.flatMap(([key, label, percent = true]) => short(data[key]) ? [`<div class="fact"><span>${esc(label)}</span>${esc(short(data[key]))}${percent && !short(data[key]).endsWith('%') ? '%' : ''}</div>`] : []);
  if (!main && !details.length) return '';
  return `<div class="panel"><div class="rate-head">${main ? `<div class="ring" style="--progress:${number !== null ? Math.max(0, Math.min(100, number)) : 0}%"><span>${esc(main)}${main.endsWith('%') ? '' : '%'}</span></div>` : ''}<div><div class="rate-name">${name}</div><div class="minor">官方统计</div></div></div><div class="facts">${details.join('')}</div></div>`;
}

function recordPages(data, resolver) {
  const groups = [
    ['paiweiRate', '排位赛', [['total', '场次', false]]],
    ['shenfenRate', '身份场', [['emperor_rate', '主公胜率'], ['minister_rate', '忠臣胜率'], ['rebel_rate', '反贼胜率'], ['provocateur_rate', '内奸胜率']]],
    ['guozhanRate', '国战', [['wei_rate', '魏国胜率'], ['shu_rate', '蜀国胜率'], ['wu_rate', '吴国胜率'], ['qun_rate', '群雄胜率'], ['ye_rate', '野心家胜率']]],
    ['doudizhuRate', '斗地主', [['total', '场次', false], ['lord_rate', '地主胜率'], ['peasant_rate', '农民胜率']]]
  ];
  const rates = groups.flatMap(([key, name, fields]) => isObject(data[key]) ? [ratePanel(name, data[key], fields)].filter(Boolean) : []);
  let first = rates.length ? grid(rates) : '';
  if (isObject(data.medals)) {
    const highest = [['chuanshuo', '传说'], ['wanmei', '大师'], ['feicui', '翡翠'], ['huangjin', '黄金'], ['baiyin', '白银'], ['qingtong', '青铜']].find(([key]) => numeric(data.medals[key]) > 0);
    if (highest) first = `<p class="intro">排位赛最高段位 <span class="pill">${highest[1]}</span></p>` + first;
  }
  const pages = first ? [first] : [];
  if (Array.isArray(data.g20) && data.g20.length) {
    const strips = chunk(data.g20, 20).map((values, block) => section('近期胜负', `<div class="panel"><div class="result-strip">${values.map((value, index) => {
      const code = numeric(value), name = code === 0 ? '胜' : code === 1 ? '负' : '未知', state = code === 0 ? 'win' : code === 1 ? 'lose' : '';
      return `<div class="result-cell ${state}">${name}<small>${block * 20 + index + 1}</small></div>`;
    }).join('')}</div></div>`));
    if (pages.length) pages[0] += strips.shift();
    pages.push(...strips);
  }
  if (Array.isArray(data.recent)) {
    const generals = data.recent.flatMap(row => isObject(row) && short(row.name, 60) ? [`<div class="panel general">${image(resolver, 'imageForGeneral', row.name, row.name)}<div><div class="general-name">${esc(short(row.name, 60))}</div><div class="minor">近期使用</div></div></div>`] : []);
    const groups = chunk(generals, 24).map(rows => section('近期使用武将', grid(rows, 'three')));
    if (groups.length && pages.length) pages[0] += groups.shift();
    pages.push(...groups);
  }
  return pages;
}

function recentPages(data, resolver, model, page) {
  const mode = Number.isInteger(Number(model)) && MODES[Number(model)] ? MODES[Number(model)] : MODES[0];
  const cards = data.map((row, index) => {
    if (!isObject(row)) return `<div class="panel match"><div class="match-content"><div class="match-mode">对局 ${index + 1}</div><div class="match-time">更多资料见完整导出</div></div></div>`;
    const result = short(row.result, 70), state = /^(胜|胜利|获胜)$/.test(result) ? 'win' : /^(负|失败|战败)$/.test(result) ? 'lose' : '';
    const avatar = Array.isArray(row.general_avatar) ? row.general_avatar[0] : null;
    return `<div class="panel match">${image(resolver, 'imageForGeneral', avatar, '武将')}<div class="match-content"><div class="match-mode">${esc(short(row.Model, 70) || `对局 ${index + 1}`)}</div>${short(row.begin_time, 120) ? `<div class="match-time">${esc(short(row.begin_time, 120))}</div>` : ''}</div>${result ? `<div class="match-result ${state}">${esc(result)}</div>` : '<div class="match-result">待查看</div>'}</div>`;
  });
  return chunk(cards, 9).map(rows => `<p class="intro">${esc(mode)} · 第 ${positive(page, 1)} 页 · 本页 ${data.length} 场</p>` + rows.join(''));
}

function readableValue(value) {
  const scalar = short(value, 220);
  if (scalar) return scalar;
  if (Array.isArray(value)) return `${value.length} 项资料`;
  if (isObject(value)) return `${Object.keys(value).length} 项详情`;
  return '暂无显示内容';
}

function entryCards(data) {
  const entries = [];
  const collect = (value, context = '', depth = 0) => {
    if (Array.isArray(value) && depth < 5) { for (const row of value) collect(row, context, depth + 1); return; }
    if (isObject(value) && depth < 5) {
      const fields = Object.entries(value).filter(([, item]) => !isObject(item) && !Array.isArray(item));
      if (fields.length) entries.push({ name: short(value.name, 90) || short(value.title, 90), fields });
      for (const [key, item] of Object.entries(value)) if (isObject(item) || Array.isArray(item)) collect(item, key, depth + 1);
      return;
    }
    if (value !== null && value !== undefined) entries.push({ fields: [[context || '内容', value]] });
  };
  collect(data);
  return entries.flatMap((row, index) => chunk(row.fields, 6).map((fields, part) => `<div class="panel"><div class="entry-name">${esc(row.name || `条目 ${index + 1}`)}${part ? ` · ${part + 1}` : ''}</div><div class="entry-fields">${fields.map(([key, value]) => `<div class="entry-field"><span class="key">${esc(short(key, 70))}</span>${esc(readableValue(value))}</div>`).join('')}</div></div>`));
}

export function buildPersonalCards(result, options = {}) {
  const kind = Object.hasOwn(TITLES, result?.kind) ? result.kind : 'personal';
  // queryOwn already cleans its response; never decode/strip its text twice.
  // HTML escaping below still applies to every displayed value.
  const data = options.dataAlreadyRedacted === true ? result?.data : redactOwnData(result?.data);
  const resolver = options.assetResolver;
  const mapped = result?.protocol === 'app-qr-v1';
  let pages = [];
  if (mapped && isObject(data) && ['summary', 'force', 'gameInfo'].includes(kind)) {
    const body = profileBody(kind, data, resolver);
    if (body) pages = [body];
    pages.push(...profileExtraPages(kind, data, resolver));
  } else if (mapped && kind === 'assets' && isObject(data)) pages = assetPages(data, resolver, options.demo === true);
  else if (mapped && kind === 'records' && isObject(data)) pages = recordPages(data, resolver);
  else if (mapped && kind === 'recent' && Array.isArray(data)) pages = recentPages(data, resolver, options.model, options.page);
  else pages = chunk(entryCards(data), 6).map(rows => grid(rows));
  if (!pages.length) pages = [empty('本次暂无可展示的资料。')];
  const limited = pages.length > MAX_PAGES;
  const foot = `<strong>本人资料 · 仅私聊</strong>${limited ? `<br>仅展示前 ${MAX_PAGES} 页（本次共 ${pages.length} 页）；完整资料请导出。` : ''}<br>更多字段可用 <strong>${esc(exportCommand(kind, options))}</strong>`;
  return pages.slice(0, MAX_PAGES).map((body, index) => frame(TITLES[kind], body, { kind, foot, index: index + 1, total: Math.min(pages.length, MAX_PAGES), subtitle: options.demo === true ? '脱敏排版示例 · 非真实账户数据' : undefined }));
}

function publicItemId(row, prefix, command) {
  const id = short(row?.id, 40);
  if (!id) return '';
  const target = command === '武将' ? '武将' : ['资讯', '公告', '活动'].includes(command) ? '详情' : null;
  return `<div class="pill">${target && /^[1-9]\d{0,9}$/.test(id) ? `${esc(prefixFor(prefix))}${target} ${esc(id)}` : `ID ${esc(id)}`}</div>`;
}

export function buildPublicCards(result, { prefix = '#sgs', command = '公开资料', assetResolver, dataAlreadyRedacted = false } = {}) {
  const title = short(result?.title, 90) || short(result?.name, 90) || short(command, 40) || '公开资料';
  const data = dataAlreadyRedacted === true ? result : redactOwnData(result);
  let pages = [];
  if (Array.isArray(data?.items)) {
    pages = chunk(data.items, 6).map((rows, block) => rows.map((item, index) => {
      const row = isObject(item) ? item : {};
      return `<div class="panel public-row"><div class="public-index">${block * 6 + index + 1}</div>${command === '武将' ? image(assetResolver, 'imageForGeneral', row.name || row.title || row.id, row.name || '武将') : ''}<div><div class="entry-name">${esc(short(row.title, 150) || short(row.name, 150) || '资料条目')}</div>${short(row.date, 60) ? `<div class="minor">${esc(short(row.date, 60))}</div>` : ''}${short(row.description, 240) ? `<div class="minor">${esc(short(row.description, 240))}</div>` : ''}${publicItemId(row, prefix, command)}</div></div>`;
    }).join(''));
  } else if (isObject(data)) {
    const intro = `<div class="panel identity">${command === '武将' ? image(assetResolver, 'imageForGeneral', data.name || data.id, data.name || '武将') : ''}<div><div class="name">${esc(title)}</div>${short(data.faction, 50) ? `<div class="subtitle">${esc(short(data.faction, 50))}</div>` : ''}</div></div>`;
    const sections = [['简介', data.description], ['特色', data.features], ['玩法', data.playGuide]].flatMap(([name, value]) => short(value, 6000) ? [section(name, `<div class="panel article-text">${esc(short(value, 6000))}</div>`)] : []);
    for (const row of Array.isArray(data.skills) ? data.skills : []) if (isObject(row)) sections.push(section(short(row.name, 80) || '技能', `<div class="panel article-text">${esc(short(row.description, 3000))}</div>`));
    for (const row of Array.isArray(data.sections) ? data.sections : []) if (isObject(row)) sections.push(section(short(row.name, 80) || '资料', `<div class="panel article-text">${esc(short(row.description, 3000))}</div>`));
    pages = chunk(sections, 3).map((rows, index) => (index === 0 ? intro : '') + rows.join(''));
    if (!pages.length) pages = [intro];
  }
  if (!pages.length) pages = [empty('本次暂无可展示的公开资料。')];
  const foot = '三国杀移动版 · 官方公开资料' + (pages.length > MAX_PAGES ? `<br>仅展示前 ${MAX_PAGES} 页（本次共 ${pages.length} 页）；可按名称或关键词缩小范围。` : '') + '<br>更多命令 <strong>' + esc(prefixFor(prefix)) + '帮助</strong>';
  return pages.slice(0, MAX_PAGES).map((body, index) => frame(title, body, { kind: 'public', index: index + 1, total: Math.min(pages.length, MAX_PAGES), foot }));
}
