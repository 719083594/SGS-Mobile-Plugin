/** Public item artwork only. Verified, bundled inputs become bounded PNGs in
 * RAM; neither account data nor arbitrary input paths ever reach the decoder. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ASSET_ITEMS,createAssetResolver} from './ui-assets.mjs';

const DEFAULT_ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_IMAGE=256*1024,MAX_MANIFEST=1024*1024;
const HASH=/^[a-f\d]{64}$/,FILE=/^[A-Za-z0-9_-]+\.(?:png|jpe?g|svg)$/;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=stat=>[stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs,stat.birthtimeNs].join(':');

function ordinary(file,maximum){
  let leaf;
  for(let cursor=file;;){
    const stat=fs.lstatSync(cursor,{bigint:true});
    if(stat.isSymbolicLink()||(cursor===file?(!stat.isFile()||stat.nlink!==1n||stat.size<1n||stat.size>BigInt(maximum)):!stat.isDirectory()))throw new Error('UNSAFE_PUBLIC_ITEM');
    if(cursor===file)leaf=stat;
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  return leaf;
}
function readPublic(file,maximum){
  const before=ordinary(file,maximum);let fd;
  try{
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before))throw new Error('PUBLIC_ITEM_CHANGED');
    const bytes=Buffer.alloc(Number(before.size)+1);let length=0;
    while(length<bytes.length){const count=fs.readSync(fd,bytes,length,bytes.length-length,null);if(!count)break;length+=count;}
    if(length!==Number(before.size)||fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(ordinary(file,maximum))!==fingerprint(before))throw new Error('PUBLIC_ITEM_CHANGED');
    return bytes.subarray(0,length);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function localFile(value,directory){
  if(typeof value!=='string'||value.length>4096)return null;
  try{
    const url=new URL(value),file=fileURLToPath(url);
    if(url.protocol!=='file:'||url.hostname||url.username||url.password||url.search||url.hash||url.href!==value||path.dirname(file)!==directory||!FILE.test(path.basename(file))||pathToFileURL(file).href!==value)return null;
    return file;
  }catch{return null;}
}
function inputSafe(bytes,file){
  const ext=path.extname(file);
  if(ext==='.svg')return /^<svg\s/.test(bytes.toString('utf8'))&&!/<(?:script|foreignObject|iframe|image|use)\b|<!|<\?|\bon\w+\s*=|\b(?:href|src)\s*=|url\(\s*(?!#[A-Za-z0-9_-]+\))/i.test(bytes.toString('utf8'));
  if(ext==='.png')return bytes.length>=24&&bytes.subarray(0,8).equals(PNG)&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(16)<=4096&&bytes.readUInt32BE(20)<=4096&&bytes.readUInt32BE(16)*bytes.readUInt32BE(20)<=4194304;
  return bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;
}

/** assetResolver is an optional test/integration seam, still checked against
 * the approved resolver and current manifest. Decoder failure affects one
 * public symbol only and never reveals input bytes or error messages. */
export async function prepareNativeUiAssets({root=DEFAULT_ROOT,assetResolver,loadSharp=()=>import('sharp')}={}){
  if(typeof root!=='string'||!root||typeof loadSharp!=='function')throw new TypeError('INVALID_NATIVE_UI_ASSETS');
  const directory=path.resolve(root,'resources/ui/assets'),approved=createAssetResolver(root),source=assetResolver??approved,images=new Map();
  if(typeof source?.imageForItem!=='function')throw new TypeError('INVALID_NATIVE_UI_RESOLVER');
  let manifest;
  try{manifest=JSON.parse(readPublic(path.join(directory,'manifest.json'),MAX_MANIFEST).toString('utf8'));}catch{}
  const entries=manifest?.schema===1&&Array.isArray(manifest.entries)&&manifest.entries.length<=1000?manifest.entries:[];
  let sharp;
  for(const item of ASSET_ITEMS){
    try{
      const value=source.imageForItem(item.key),file=localFile(value,directory);
      if(!file||value!==approved.imageForItem(item.key))continue;
      const matches=entries.filter(entry=>entry?.category==='item'&&entry.key===item.key&&entry.file===path.basename(file));
      if(matches.length!==1)continue;
      const entry=matches[0];
      if(!HASH.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_IMAGE)continue;
      const bytes=readPublic(file,MAX_IMAGE);
      if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256||!inputSafe(bytes,file))continue;
      if(!sharp){const module=await loadSharp();sharp=typeof module==='function'?module:module?.default;if(typeof sharp!=='function')throw new Error('NATIVE_UI_BACKEND_UNAVAILABLE');}
      const rendered=await sharp(bytes,{density:72,limitInputPixels:4194304,failOn:'warning',unlimited:false}).resize(128,128,{fit:'inside',withoutEnlargement:true}).png({compressionLevel:6}).timeout({seconds:3}).toBuffer({resolveWithObject:true});
      const output=rendered?.data,info=rendered?.info;
      if(!Buffer.isBuffer(output)||output.length<45||output.length>MAX_IMAGE||!output.subarray(0,8).equals(PNG)||info?.format!=='png'||!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<1||info.height<1||info.width>128||info.height>128||output.readUInt32BE(16)!==info.width||output.readUInt32BE(20)!==info.height)continue;
      images.set(item.key,'data:image/png;base64,'+output.toString('base64'));
    }catch{}
  }
  return Object.freeze({items:ASSET_ITEMS,imageForItem(key){return typeof key==='string'?images.get(key)??null:null;}});
}
