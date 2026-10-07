/** Offline, exact-match resolver for attributed public artwork. No account or network access. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const UI_ASSET_SOURCES=Object.freeze({
  items:'https://xianhua.sanguosha.cn/_nuxt/obtain.cb450439.js',
  desktop:'https://xianhua.sanguosha.cn/_nuxt/record.70e69d2f.js',
  mobile:'https://xianhua.sanguosha.cn/_nuxt/record.5e722f27.js',
  generals:'https://www.sanguosha.cn/pc/hero-list.html',
  itemNames:'https://www.sanguosha.cn/news-info.html?from=guide&id=87',
  wishPoints:'https://www.sanguosha.cn/pc/news-detail-2298.html'
});

const item=(key,label,index)=>Object.freeze({key,label,fieldVerified:true,
  fieldEvidence:'official-ui-binding',sourceUrl:UI_ASSET_SOURCES.items,
  iconKind:'official-artwork',iconUrl:`https://imagexh.sanguosha.com/sgxh-h5/dj${index}.png`});
const placeholder=(key,label,fieldVerified=false)=>Object.freeze({key,label,fieldVerified,
  fieldEvidence:fieldVerified?'official-ui-binding':'user-screenshot-correspondence',
  sourceUrl:fieldVerified?UI_ASSET_SOURCES.mobile:null,
  iconKind:'original-vector-placeholder',iconUrl:null});
export const ASSET_ITEMS=Object.freeze([
  item('yb','元宝',1),item('jh','将魂',2),item('yl','雁翎',3),item('zml','招募令',4),item('ylj','雁翎甲',5),item('ssbz','史诗宝珠',6),
  placeholder('hld','欢乐豆',true),placeholder('dianj','点将卡'),placeholder('shouq','手气卡'),placeholder('xiny','心愿积分'),placeholder('yinb','银币')
]);

export const PERSONAL_IMAGE_FIELDS=Object.freeze({
  summary:Object.freeze({avatar:'avatar',badges:'light',sourceUrl:UI_ASSET_SOURCES.desktop}),
  force:Object.freeze({rankImage:'official_pic',rankText:'official',sourceUrl:UI_ASSET_SOURCES.desktop,
    note:'官方页面展示此文字和图片，但未据此把任意字段猜成军阶分值。'}),
  gameInfo:Object.freeze({avatar:'head',badges:'lights',detailItems:'titleList',detailImage:'url',detailCount:'num',detailName:'name',totalMvp:'totalMvp',
    sourceUrl:UI_ASSET_SOURCES.mobile,note:'totalMvp是生涯MVP统计，不是最近单场MVP标志。'}),
  recent:Object.freeze({avatars:'general_avatar',displayAvatarIndex:0,mode:'Model',time:'begin_time',result:'result',
    mvpVerified:false,sourceUrl:UI_ASSET_SOURCES.desktop})
});

const DEFAULT_ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_IMAGE_BYTES=262144;
const BASENAME=/^[A-Za-z0-9_-]+\.(?:png|jpe?g|svg)$/;
// The official catalog separates variant prefixes with U+00B7; the game may
// omit that character. Keep every other character, including the prefix.
export const generalNameKey=value=>typeof value==='string'?value.replaceAll('·',''):'';
function ordinaryChain(file,directory=false){
  const target=path.resolve(file);
  for(let current=target;;){
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||(current===target&&!directory?(!stat.isFile()||stat.nlink!==1):!stat.isDirectory()))throw new Error('Unsafe UI asset path');
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
}
function artworkUrl(value){
  if(typeof value!=='string'||value.length>1000)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.href!==value)return null;
    if(url.hostname==='www.sanguosha.cn'&&/^\/storage\/uploads\/images\/(?:pic_index\/)?[A-Za-z0-9_-]+\.(png|jpe?g)$/.test(url.pathname))return url.href;
    if(url.hostname==='imagexh.sanguosha.com'&&/^\/(?:sgxh-h5\/dj[1-6]\.png|sgxh-pc\/default_avatar\.png|war_(?:victory|lose)\.png)$/.test(url.pathname))return url.href;
  }catch{}
  return null;
}
function imageBytesValid(bytes,extension){
  if(extension==='.png')return bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=4096&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=4096;
  if(extension==='.jpg'||extension==='.jpeg')return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;
  if(extension==='.svg'){
    const text=bytes.toString('utf8');
    return /^<svg\s/.test(text)&&!/<(?:script|foreignObject|iframe|image|use)\b|<!|\bon\w+\s*=|\b(?:href|src)\s*=|url\(\s*(?!#[A-Za-z0-9_-]+\))/i.test(text);
  }
  return false;
}

/** Only already-bundled files can be resolved. Game IDs are not assumed to be website catalog IDs. */
export function createAssetResolver(root=DEFAULT_ROOT){
  const directory=path.resolve(root,'resources/ui/assets');
  const entries=[];
  try{
    ordinaryChain(directory,true);const file=path.join(directory,'manifest.json');ordinaryChain(file);
    if(fs.statSync(file).size>1024*1024)throw new Error('Asset manifest too large');
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    if(manifest.schema!==1||!Array.isArray(manifest.entries)||manifest.entries.length>1000)throw new Error('Invalid asset manifest');
    for(const entry of manifest.entries){
      if(!entry||!BASENAME.test(entry.file)||!/^[a-f\d]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_IMAGE_BYTES)continue;
      if(entry.kind!=='original-vector-placeholder'&&!artworkUrl(entry.url))continue;
      if(entry.kind==='original-vector-placeholder'&&(entry.category!=='item'||entry.url!==null||!ASSET_ITEMS.some(x=>x.key===entry.key&&x.iconKind===entry.kind)||entry.file!==entry.key+'.svg'))continue;
      if(entry.kind!=='original-vector-placeholder'){
        if(entry.kind!=='official-artwork')continue;
        if(entry.category==='item'&&!ASSET_ITEMS.some(x=>x.key===entry.key&&x.iconUrl===entry.url))continue;
        if(entry.category==='general'&&(!Number.isSafeInteger(entry.id)||entry.id<1||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>100||!entry.url.startsWith('https://www.sanguosha.cn/storage/uploads/images/')))continue;
        if(!['item','general','decoration'].includes(entry.category))continue;
      }
      entries.push(Object.freeze({...entry}));
    }
  }catch{}
  const resolve=entry=>{
    if(!entry)return null;
    try{
      ordinaryChain(directory,true);const file=path.join(directory,entry.file);ordinaryChain(file);
      if(fs.statSync(file).size!==entry.bytes)return null;
      const bytes=fs.readFileSync(file);
      if(bytes.length!==entry.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256||!imageBytesValid(bytes,path.extname(file)))return null;
      return pathToFileURL(file).href;
    }catch{return null;}
  };
  const generalEntries=entries.filter(entry=>entry.category==='general');
  return Object.freeze({
    items:ASSET_ITEMS,
    imageForItem(key){if(typeof key!=='string'||!ASSET_ITEMS.some(item=>item.key===key))return null;return resolve(entries.find(entry=>entry.category==='item'&&entry.key===key));},
    imageForGeneral(value){
      if(typeof value!=='string'&&typeof value!=='number')return null;
      if(typeof value==='number'&&!Number.isSafeInteger(value))return null;
      const key=String(value).trim();if(!key||key.length>1000)return null;
      let matches;
      if(key.startsWith('https://')){const url=artworkUrl(key);if(!url)return null;matches=generalEntries.filter(entry=>entry.url===url);}
      else if(/^\d{1,6}$/.test(key))matches=generalEntries.filter(entry=>entry.id===Number(key));
      else {
        matches=generalEntries.filter(entry=>entry.name===key);
        if(!matches.length){const normalized=generalNameKey(key);if(normalized)matches=generalEntries.filter(entry=>generalNameKey(entry.name)===normalized);}
      }
      if(!matches?.length||new Set(matches.map(entry=>entry.file+'|'+entry.sha256+'|'+entry.bytes)).size!==1)return null;
      return resolve(matches[0]);
    },
    imageForDecoration(key){if(!['default-avatar','victory','lose'].includes(key))return null;return resolve(entries.find(entry=>entry.category==='decoration'&&entry.key===key));},
    imageForOfficialStatic(value){const url=artworkUrl(value);if(!url)return null;return resolve(entries.find(entry=>entry.kind==='official-artwork'&&entry.url===url));}
  });
}
