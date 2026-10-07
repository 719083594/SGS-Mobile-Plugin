/** Public, offline portraits for the native SVG renderer. Never reads accounts. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createAssetResolver} from './ui-assets.mjs';

const DEFAULT_ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_IMAGE=256*1024,MAX_MANIFEST=1024*1024;
const FILE=/^[A-Za-z0-9_-]+\.(?:png|jpe?g)$/;
const HASH=/^[a-f\d]{64}$/;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=stat=>[stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs,stat.birthtimeNs].join(':');

function ordinary(file,maximum){
  let leaf;
  for(let cursor=file;;){
    const stat=fs.lstatSync(cursor,{bigint:true});
    if(stat.isSymbolicLink()||(cursor===file?(!stat.isFile()||stat.nlink!==1n||stat.size<1n||stat.size>BigInt(maximum)):!stat.isDirectory()))throw new Error('UNSAFE_PUBLIC_ASSET');
    if(cursor===file)leaf=stat;
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  return leaf;
}

function readPublic(file,maximum){
  const before=ordinary(file,maximum);
  let fd;
  try{
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const opened=fs.fstatSync(fd,{bigint:true});
    if(fingerprint(opened)!==fingerprint(before))throw new Error('PUBLIC_ASSET_CHANGED');
    const bytes=Buffer.alloc(Number(before.size)+1);let length=0;
    while(length<bytes.length){const count=fs.readSync(fd,bytes,length,bytes.length-length,null);if(!count)break;length+=count;}
    if(length!==Number(before.size)||fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(ordinary(file,maximum))!==fingerprint(before))throw new Error('PUBLIC_ASSET_CHANGED');
    return bytes.subarray(0,length);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}

function publicImageFile(value,directory){
  if(typeof value!=='string'||value.length>4096)return null;
  const url=new URL(value);
  if(url.protocol!=='file:'||url.hostname||url.username||url.password||url.search||url.hash||url.href!==value)return null;
  const file=fileURLToPath(url);
  if(path.dirname(file)!==directory||!FILE.test(path.basename(file))||pathToFileURL(file).href!==value)return null;
  return file;
}

function imageType(bytes,file){
  if(path.extname(file)==='.png'){
    if(bytes.length<24||!bytes.subarray(0,8).equals(PNG)||bytes.toString('ascii',12,16)!=='IHDR')return null;
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=4194304?'png':null;
  }
  return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217?'jpeg':null;
}

/** Only exact public names are accepted; game IDs and personal portrait URLs
 * are deliberately not interpreted as public catalog identifiers. No cache,
 * network, image decoder, temporary files or private-response state is used. */
export function createNativePortraitResolver({root=DEFAULT_ROOT,assetResolver}={}){
  if(typeof root!=='string'||!root)throw new TypeError('INVALID_NATIVE_ASSET_ROOT');
  const directory=path.resolve(root,'resources/ui/assets'),approved=createAssetResolver(root);
  const source=assetResolver===undefined?approved:assetResolver;
  if(!source||typeof source.imageForGeneral!=='function')throw new TypeError('INVALID_PUBLIC_ASSET_RESOLVER');
  return Object.freeze({imageForGeneral(name){
    if(typeof name!=='string'||name.length>100)return null;
    const key=name.trim();if(!key||/[\u0000-\u001f\u007f/\\:]/.test(key)||/^\d+$/.test(key))return null;
    try{
      const value=source.imageForGeneral(key),file=publicImageFile(value,directory);
      if(!file||value!==approved.imageForGeneral(key))return null;
      const manifest=JSON.parse(readPublic(path.join(directory,'manifest.json'),MAX_MANIFEST).toString('utf8'));
      if(manifest?.schema!==1||!Array.isArray(manifest.entries)||manifest.entries.length>1000)return null;
      const matches=manifest.entries.filter(entry=>entry?.kind==='official-artwork'&&entry.category==='general'&&entry.name===key);
      if(!matches.length||matches.some(entry=>entry.file!==path.basename(file)||!FILE.test(entry.file)||!HASH.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_IMAGE))return null;
      const entry=matches[0];if(matches.some(row=>row.sha256!==entry.sha256||row.bytes!==entry.bytes))return null;
      const bytes=readPublic(file,MAX_IMAGE),type=imageType(bytes,file);
      if(!type||bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)return null;
      return `data:image/${type};base64,${bytes.toString('base64')}`;
    }catch{return null;}
  }});
}
