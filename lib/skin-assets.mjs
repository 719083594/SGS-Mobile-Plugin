/** Offline public skin-gallery thumbnails. Reads only exact, hash-bound files;
 * it never downloads artwork, reads accounts or writes an online cache. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const DEFAULT_ROOT=fileURLToPath(new URL('../',import.meta.url));
export const SKIN_ASSET_SOURCE='https://share.sanguosha.cn/skins/';
export const SKIN_ASSET_API='https://share.sanguosha.cn/api/skins/list';
const SOURCE=/^https:\/\/sjwx-oss\.sanguosha\.cn\/skins\/image\/skins[A-Za-z0-9]+\.jpg$/;
const HASH=/^[a-f0-9]{64}$/;
const TYPES=new Set(['至尊','传说','原画']);
const MAX_IMAGE=256*1024,MAX_MANIFEST=768*1024,MAX_ENTRIES=2000;
export const SKIN_THUMBNAIL_WIDTH=200,SKIN_THUMBNAIL_HEIGHT=120;
const WIDTH=SKIN_THUMBNAIL_WIDTH,HEIGHT=SKIN_THUMBNAIL_HEIGHT;
const digest=value=>createHash('sha256').update(value).digest('hex');
const fingerprint=stat=>[stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const publicText=value=>typeof value==='string'&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
function publicId(value){
  if(typeof value==='string'&&/^[1-9]\d{0,8}$/.test(value))value=Number(value);
  return Number.isSafeInteger(value)&&value>0&&value<=999999999?value:null;
}
export function isPublicSkinArtwork(value){return typeof value==='string'&&SOURCE.test(value);}
function sameOpenedFile(before,opened){
  // Older Windows libuv uses dev=0 for path stats but a real volume serial
  // for descriptors. Only this cross-API sentinel is compatible; neither
  // independent before/after fingerprint drops identity or time fields.
  const sameDevice=before.dev===opened.dev||process.platform==='win32'&&before.dev===0n&&opened.dev>0n;
  return sameDevice&&['ino','mode','nlink','size','mtimeNs','ctimeNs'].every(key=>before[key]===opened[key]);
}
function ordinary(file,maxBytes){
  let leaf;
  for(let current=file;;){
    const stat=fs.lstatSync(current,{bigint:true});
    if(stat.isSymbolicLink()||(current===file?(!stat.isFile()||stat.nlink!==1n||stat.size<1n||stat.size>BigInt(maxBytes)):!stat.isDirectory()))throw Error('INVALID_PUBLIC_SKIN_FILE');
    if(current===file)leaf=stat;
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
  return leaf;
}
function readOrdinary(file,maxBytes){
  const before=ordinary(file,maxBytes);let fd;
  try{
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
    const opened=fs.fstatSync(fd,{bigint:true});
    if(!opened.isFile()||opened.nlink!==1n||!sameOpenedFile(before,opened))throw Error('PUBLIC_SKIN_CHANGED');
    const bytes=Buffer.alloc(Number(opened.size));let offset=0;
    while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!count)throw Error('PUBLIC_SKIN_CHANGED');offset+=count;}
    if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(opened)||fingerprint(ordinary(file,maxBytes))!==fingerprint(before))throw Error('PUBLIC_SKIN_CHANGED');
    return bytes;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
/** The offline builder emits ordinary 8-bit baseline JPEG, exactly 200x120.
 * Check segment boundaries and a complete scan before exposing its data URI. */
function jpegDimensions(bytes){
  if(bytes.length<32||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
  let offset=2,dimensions=null;
  while(offset<bytes.length-2){
    if(bytes[offset++]!==255)return null;while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===0||marker===0xd8||marker===0xd9||marker>=0xd0&&marker<=0xd7||offset+2>bytes.length)return null;
    const size=bytes.readUInt16BE(offset);if(size<2||offset+size>bytes.length)return null;
    if(marker===0xc0){
      if(dimensions||size<8||bytes[offset+2]!==8)return null;
      const components=bytes[offset+7];if(![1,3].includes(components)||size!==8+3*components)return null;
      dimensions={width:bytes.readUInt16BE(offset+5),height:bytes.readUInt16BE(offset+3),components};
    }else if(marker>=0xc1&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return null;
    if(marker===0xda){
      if(!dimensions||size<6||bytes[offset+2]!==dimensions.components||size!==6+2*dimensions.components)return null;
      offset+=size;let entropy=false;
      while(offset<bytes.length){
        if(bytes[offset++]!==255){entropy=true;continue;}
        if(offset>=bytes.length)return null;
        const next=bytes[offset++];
        if(next===0){entropy=true;continue;}
        if(next>=0xd0&&next<=0xd7)continue;
        if(next===0xd9&&entropy&&offset===bytes.length)return {width:dimensions.width,height:dimensions.height};
        return null;
      }
      return null;
    }
    offset+=size;
  }
  return null;
}
function validateManifest(value){
  if(!plain(value)||!keys(value,['schema','source','api','requestedCount','preparedCount','skippedIds','entries'])||value.schema!==1||value.source!==SKIN_ASSET_SOURCE||value.api!==SKIN_ASSET_API||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES||!Array.isArray(value.skippedIds)||value.skippedIds.length>MAX_ENTRIES||value.preparedCount!==value.entries.length||value.requestedCount!==value.entries.length+value.skippedIds.length)throw Error('INVALID_PUBLIC_SKIN_MANIFEST');
  const ids=new Set();
  for(const entry of value.entries){
    if(!plain(entry)||!keys(entry,['id','name','general','type','file','sourceUrl','sha256','bytes','width','height'])||publicId(entry.id)!==entry.id||entry.file!==`skin-${entry.id}.jpg`||!publicText(entry.name)||!publicText(entry.general)||!TYPES.has(entry.type)||!isPublicSkinArtwork(entry.sourceUrl)||!HASH.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<32||entry.bytes>MAX_IMAGE||entry.width!==WIDTH||entry.height!==HEIGHT||ids.has(entry.id))throw Error('INVALID_PUBLIC_SKIN_MANIFEST');
    ids.add(entry.id);
  }
  for(const id of value.skippedIds){if(publicId(id)!==id||ids.has(id))throw Error('INVALID_PUBLIC_SKIN_MANIFEST');ids.add(id);}
  if(ids.size>MAX_ENTRIES)throw Error('INVALID_PUBLIC_SKIN_MANIFEST');
  return value;
}

/** An optional source URL must exactly match the current public catalog row.
 * IDs alone never authorize arbitrary files or remote URLs. */
export function createSkinAssetResolver(root=DEFAULT_ROOT){
  if(plain(root))root=root.root;
  if(typeof root!=='string'||!root)throw new TypeError('INVALID_PUBLIC_SKIN_ROOT');
  const directory=path.resolve(root,'resources/skin-gallery');
  return Object.freeze({imageForSkin(id,sourceUrl){
    id=publicId(id);if(id===null||sourceUrl!==undefined&&!isPublicSkinArtwork(sourceUrl))return null;
    try{
      const manifest=validateManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readOrdinary(path.join(directory,'manifest.json'),MAX_MANIFEST))));
      const entry=manifest.entries.find(row=>row.id===id);
      if(!entry||sourceUrl!==undefined&&sourceUrl!==entry.sourceUrl)return null;
      const bytes=readOrdinary(path.join(directory,entry.file),MAX_IMAGE),dimensions=jpegDimensions(bytes);
      if(!dimensions||dimensions.width!==entry.width||dimensions.height!==entry.height||bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)return null;
      return 'data:image/jpeg;base64,'+bytes.toString('base64');
    }catch{return null;}
  }});
}
