/** Strict, pure arguments for public mobile-game reference catalogs. */
export const HERO_FACTIONS = Object.freeze(['全部', '魏', '蜀', '吴', '群', '神']);
export const SKIN_TYPES = Object.freeze(['全部', '至尊', '传说', '原画']);

const fail = () => { throw new RangeError('INVALID_CATALOG_ARGUMENT'); };
function tokens(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || value.length > 100) return fail();
  return value.trim() ? value.trim().split(/\s+/u) : [];
}
function pageValue(value) {
  if (!/^\d{1,4}$/u.test(value) || Number(value) < 1 || Number(value) > 1000) return fail();
  return Number(value);
}
export function normalizeFaction(value = '全部') {
  if (typeof value !== 'string') return fail();
  const alias = value.trim().replace(/(?:国|势力)$/u, '');
  const faction = ['全', '所有', '全部'].includes(alias) ? '全部' : alias;
  return HERO_FACTIONS.includes(faction) ? faction : fail();
}

export function parseHeroCatalogArgs(value = '', { faction = '全部' } = {}) {
  let selected = normalizeFaction(faction), page = 1;
  const parts = tokens(value);
  if (parts.length > 2) return fail();
  if (parts.length && !/^\d+$/u.test(parts[0])) selected = normalizeFaction(parts.shift());
  if (parts.length) page = pageValue(parts.shift());
  if (parts.length) return fail();
  return { faction: selected, page };
}

export function parseSkinCatalogArgs(value = '', { general = '' } = {}) {
  const parts = tokens(value);
  let type = '全部', page = 1;
  if (parts.length && /^\d+$/u.test(parts.at(-1))) page = pageValue(parts.pop());
  const category = parts.filter(part => SKIN_TYPES.includes(part));
  if (category.length > 1) return fail();
  if (category.length) { type = category[0]; parts.splice(parts.indexOf(type), 1); }
  if (parts.length > 1 || (general && parts.length)) return fail();
  const selected = general || parts[0] || '';
  if (selected && (!/^[\p{Script=Han}A-Za-z·•._\-&＆+＋]{2,40}$/u.test(selected) || SKIN_TYPES.includes(selected))) return fail();
  return { general: selected, type, page };
}
