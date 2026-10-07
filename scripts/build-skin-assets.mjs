#!/usr/bin/env node
/** Explicit offline build of public official skin-gallery thumbnails.
 * No account/configuration imports, authentication, browser or online cache. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SKIN_ASSET_SOURCE,SKIN_ASSET_API,SKIN_THUMBNAIL_WIDTH,SKIN_THUMBNAIL_HEIGHT,isPublicSkinArtwork,createSkinAssetResolver} from '../lib/skin-assets.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
// The official gallery includes a verified 13.4 MB / 16.4 MP static JPEG.
// Keep a bounded 16 MiB input allowance and an independent pixel ceiling.
const MAX_INPUT=16*1024*1024,MAX_PIXELS=32000000,MAX_ITEMS=2000,MAX_PAGES=100;
const digest=value=>createHash('sha256').update(value).digest('hex');
function rasterFormat(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<32||bytes.length>MAX_INPUT)return null;
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return 'jpeg';
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;
  let offset=8,header=false;
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    if(length>MAX_INPUT||offset+length+12>bytes.length||! /^[A-Za-z]{4}$/.test(type)||['acTL','fcTL','fdAT'].includes(type))return null;
    if(!header){if(type!=='IHDR'||length!==13)return null;header=true;}
    if(type==='IEND')return length===0&&offset+12===bytes.length?'png':null;
    offset+=length+12;
  }
  return null;
}
function directorySafe(directory){
  for(let current=directory;;){
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('UNSAFE_BUILD_DIRECTORY');
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
}
function safeWrite(directory,name,bytes){
  directorySafe(directory);const file=path.join(directory,name);
  if(fs.existsSync(file)){const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1)throw Error('UNSAFE_BUILD_FILE');}
  const temporary=path.join(directory,`.skin-build-${randomUUID()}.tmp`);let created=false;
  try{fs.writeFileSync(temporary,bytes,{flag:'wx',mode:0o644});created=true;fs.renameSync(temporary,file);created=false;}
  finally{if(created)fs.unlinkSync(temporary);}
}
export async function downloadPublicSkin(sourceUrl,{fetchImpl=globalThis.fetch}={}){
  if(!isPublicSkinArtwork(sourceUrl))throw Error('INVALID_PUBLIC_SKIN_SOURCE');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetchImpl(sourceUrl,{method:'GET',redirect:'error',signal:controller.signal,headers:{Accept:'image/jpeg'}});
    if(!response.ok||response.redirected||response.url&&response.url!==sourceUrl)throw Error('PUBLIC_SKIN_DOWNLOAD_FAILED');
    const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    // Several verified official .jpg resources contain static PNG bytes and
    // are served as image/jpeg. Decode the bounded raster magic, not its
    // filename or that inaccurate content-type; vectors/animation stay out.
    if(!['image/jpeg','image/png'].includes(type))throw Error('INVALID_PUBLIC_SKIN_IMAGE');
    const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_INPUT))throw Error('PUBLIC_SKIN_TOO_LARGE');
    if(!response.body)throw Error('INVALID_PUBLIC_SKIN_IMAGE');
    const chunks=[];let length=0;
    for await(const chunk of response.body){length+=chunk.length;if(length>MAX_INPUT)throw Error('PUBLIC_SKIN_TOO_LARGE');chunks.push(Buffer.from(chunk));}
    const bytes=Buffer.concat(chunks,length);
    if(!rasterFormat(bytes))throw Error('INVALID_PUBLIC_SKIN_IMAGE');
    return bytes;
  }finally{clearTimeout(timer);}
}
export async function prepareSkinThumbnail(bytes,sharp){
  const format=rasterFormat(bytes);if(!format)throw Error('INVALID_PUBLIC_SKIN_IMAGE');
  const input=sharp(bytes,{limitInputPixels:MAX_PIXELS,failOn:'warning'}),metadata=await input.metadata();
  if(metadata.format!==format||metadata.pages!==undefined&&metadata.pages!==1||!Number.isSafeInteger(metadata.width)||!Number.isSafeInteger(metadata.height)||metadata.width<1||metadata.height<1||metadata.width*metadata.height>MAX_PIXELS)throw Error('INVALID_PUBLIC_SKIN_IMAGE');
  // Contain preserves the original composition instead of inventing a
  // different portrait. JPEG has no active content or animation.
  const output=await input.rotate().resize(SKIN_THUMBNAIL_WIDTH,SKIN_THUMBNAIL_HEIGHT,{fit:'contain',background:'#102834'}).jpeg({quality:86,progressive:false,chromaSubsampling:'4:4:4'}).toBuffer();
  if(output.length>256*1024)throw Error('PUBLIC_SKIN_TOO_LARGE');
  return output;
}
export async function collectSkinCatalog(client){
  const rows=[],seen=new Set();let total,pages;
  for(let page=1;page<=MAX_PAGES;page++){
    const result=await client.skinCatalog({type:'全部',page,pageSize:24});
    if(!Array.isArray(result.items)||!Number.isSafeInteger(result.total)||result.total<0||result.total>MAX_ITEMS||!Number.isSafeInteger(result.pages)||result.pages<1||result.pages>MAX_PAGES||result.page!==page)throw Error('INVALID_PUBLIC_SKIN_CATALOG');
    if(page===1){total=result.total;pages=result.pages;}else if(result.total!==total||result.pages!==pages)throw Error('PUBLIC_SKIN_CATALOG_CHANGED');
    for(const row of result.items){
      if(!Number.isSafeInteger(row.id)||row.id<1||row.id>999999999||seen.has(row.id)||!isPublicSkinArtwork(row.image))throw Error('INVALID_PUBLIC_SKIN_CATALOG');
      seen.add(row.id);rows.push(row);
    }
    if(page===pages){if(rows.length!==total)throw Error('INCOMPLETE_PUBLIC_SKIN_CATALOG');return rows;}
    if(!result.items.length)throw Error('INCOMPLETE_PUBLIC_SKIN_CATALOG');
  }
  throw Error('PUBLIC_SKIN_CATALOG_LIMIT');
}
export async function buildSkinAssets({root=ROOT,client,sharp,fetchImpl=globalThis.fetch,onResult=()=>{},reuseApproved=false}={}){
  if(!client||typeof client.skinCatalog!=='function'||typeof sharp!=='function'||typeof reuseApproved!=='boolean')throw TypeError('INVALID_PUBLIC_SKIN_BUILDER');
  const directory=path.resolve(root,'resources/skin-gallery');
  directorySafe(root);
  const resources=path.join(root,'resources');if(!fs.existsSync(resources))fs.mkdirSync(resources);directorySafe(resources);
  if(!fs.existsSync(directory))fs.mkdirSync(directory);directorySafe(directory);
  const rows=await collectSkinCatalog(client),entries=[],skippedIds=[],existing=reuseApproved?createSkinAssetResolver(root):null;let cursor=0,reused=0;
  const worker=async()=>{
    while(cursor<rows.length){
      const row=rows[cursor++];
      try{
        const approved=existing?.imageForSkin(row.id,row.image),bytes=approved?Buffer.from(approved.slice('data:image/jpeg;base64,'.length),'base64'):await prepareSkinThumbnail(await downloadPublicSkin(row.image,{fetchImpl}),sharp);
        const entry={id:row.id,name:row.name,general:row.generalName||row.general,type:row.type,file:`skin-${row.id}.jpg`,sourceUrl:row.image,sha256:digest(bytes),bytes:bytes.length,width:SKIN_THUMBNAIL_WIDTH,height:SKIN_THUMBNAIL_HEIGHT};
        if(typeof entry.name!=='string'||!entry.name||typeof entry.general!=='string'||!entry.general||!['至尊','传说','原画'].includes(entry.type))throw Error('INVALID_PUBLIC_SKIN_CATALOG');
        if(approved)reused++;else safeWrite(directory,entry.file,bytes);
        entries.push(entry);onResult({id:row.id,prepared:true});
      }catch{skippedIds.push(row.id);onResult({id:row.id,prepared:false});}
    }
  };
  await Promise.all([worker(),worker()]);entries.sort((a,b)=>a.id-b.id);skippedIds.sort((a,b)=>a-b);
  const manifest={schema:1,source:SKIN_ASSET_SOURCE,api:SKIN_ASSET_API,requestedCount:rows.length,preparedCount:entries.length,skippedIds,entries};
  safeWrite(directory,'manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n','utf8'));
  const resolver=createSkinAssetResolver(root);
  for(const entry of entries)if(!resolver.imageForSkin(entry.id,entry.sourceUrl))throw Error('PUBLIC_SKIN_BUILD_VERIFY_FAILED');
  return {requested:rows.length,prepared:entries.length,skipped:skippedIds.length,reused,imageBytes:entries.reduce((sum,row)=>sum+row.bytes,0),maxImageBytes:Math.max(0,...entries.map(row=>row.bytes)),privateDataUsed:false};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length>3||process.argv.length===3&&process.argv[2]!=='--reuse-approved')throw Error('INVALID_BUILD_ARGUMENT');
    const {MobilePublicClient}=await import('../lib/public.mjs'),{default:sharp}=await import('sharp');
    const result=await buildSkinAssets({client:new MobilePublicClient(),sharp,reuseApproved:process.argv[2]==='--reuse-approved',onResult:value=>{if(!value.prepared)console.log(JSON.stringify({publicSkinId:value.id,skipped:true}));}});
    console.log(JSON.stringify(result));if(result.skipped)process.exitCode=1;
  }catch{console.error(JSON.stringify({publicSkinBuildFailed:true,privateDataUsed:false}));process.exitCode=1;}
}
