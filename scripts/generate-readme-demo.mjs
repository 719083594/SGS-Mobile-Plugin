/** Rebuild public README examples offline. Every game statistic below is made
 * up; only the already-bundled public general artwork and catalog IDs are used.
 * This script never reads config/, data/, accounts, sessions or network APIs. */
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildNativePublicCards} from '../lib/native-views.mjs';
import {buildNativeRecordCards} from '../lib/native-records.mjs';
import {createNativePortraitResolver} from '../lib/native-assets.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';

const output = new URL('../docs/images/', import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await fs.readFile(new URL('../resources/ui/assets/manifest.json', import.meta.url), 'utf8'));
const names = ['刘备', '关羽', '诸葛亮', '赵云', '曹操', '孙权'];
const entries = names.map(name => manifest.entries.find(row => row.category === 'general' && row.kind === 'official-artwork' && row.name === name));
if (entries.some(row => !row)) throw new Error('Bundled public general is missing');
const portraits = createNativePortraitResolver({root});
const render = createNativeCardRenderer();

// Keep the production card layout. Only use a local CJK font fallback and add
// an unmistakable documentation watermark above the original header artwork.
function markDemo(card) {
  const svg = card.svg.replaceAll('Noto Sans CJK SC, WenQuanYi Micro Hei, DejaVu Sans', 'Microsoft YaHei,Noto Sans CJK SC,sans-serif')
    .replace('</svg>', '<g font-family="Microsoft YaHei,Noto Sans CJK SC,sans-serif"><rect x="802" y="40" width="230" height="48" rx="12" fill="#efd6a0"/><text x="917" y="72" text-anchor="middle" font-size="24" font-weight="700" fill="#17313d">演示数据</text></g></svg>');
  return {...card, svg};
}

const catalog = buildNativePublicCards({
  title: '武将检索',
  items: entries.slice(0, 4).map(row => ({id: row.id, name: row.name})),
}, {command: '武将', assetResolver: portraits});

const model = 1, wireMode = 4;
const records = buildNativeRecordCards({
  kind: 'records', protocol: 'pc-scan-v7', scope: 'sanguosha-community',
  gameVersion: 'sanguosha-mobile', communityAuthenticated: true,
  sourceUrl: 'https://api-xh.sanguosha.cn/user/gameCareerUserInfo',
  query: {model, wireMode},
  data: {winGames: 126, totalGames: 200, mvp: 42, nowRank: '演示段位', rates: [{name: '主公', rate: 0.65}, {name: '忠臣', rate: 0.60}]},
  recentRecords: {
    kind: 'recent', protocol: 'pc-scan-v7',
    sourceUrl: 'https://api-xh.sanguosha.cn/user/gameRecordList/total',
    query: {model, wireMode, page: 1, pageSize: 10},
    data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0].map((outcomeCode, index) => ({outcomeCode, general_names: [names[index % names.length]]})),
  },
}, {model, imageForGeneral: portraits.imageForGeneral});

await fs.mkdir(output, {recursive: true});
for (const [filename, cards] of [['catalog-demo.jpg', catalog], ['records-demo.jpg', records]]) {
  if (!cards?.[0]) throw new Error('Native demo builder returned no card');
  const bytes = await render(markDemo(cards[0]));
  await fs.writeFile(new URL(filename, output), bytes);
  console.log(`${filename}: ${cards[0].width} x ${cards[0].height}, ${bytes.length} bytes`);
}
