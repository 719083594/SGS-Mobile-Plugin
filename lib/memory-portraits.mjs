/** Anonymous official artwork, scoped to one card render. No persistence or global cache. */
const HOST='sjpubicres.sanguosha.cn';
const HEAD_PATH=/^\/release\/character_heads\/[A-Za-z0-9_-]{1,100}\.(?:png|jpe?g)$/;
const OWNED_SKIN_PATH=/^\/release\/character_skins\/skins\/[A-Za-z0-9_-]{1,100}\.(?:png|jpe?g)$/;
const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
const SOF=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
const rejected=()=>new Error('Portrait unavailable');
function bounded(value,fallback,maximum,minimum=1){return Number.isSafeInteger(value)?Math.max(minimum,Math.min(maximum,value)):fallback;}
function trusted(value,path=HEAD_PATH){
  if(typeof value!=='string'||value.length>256||value.includes('?')||value.includes('#'))return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!==HOST||url.port||url.username||url.password||url.search||url.hash||url.href!==value||!path.test(url.pathname))return null;
    return url.href;
  }catch{return null;}
}
function imageType(bytes,maxEdge,maxPixels){
  const valid=(width,height)=>width>0&&height>0&&width<=maxEdge&&height<=maxEdge&&width*height<=maxPixels;
  if(bytes.length>=33&&bytes.subarray(0,8).equals(PNG_MAGIC)){
    if(bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR'||bytes.toString('ascii',bytes.length-8,bytes.length-4)!=='IEND')return null;
    return valid(bytes.readUInt32BE(16),bytes.readUInt32BE(20))?'image/png':null;
  }
  if(bytes.length<12||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)return null;
  let index=2;
  while(index+4<=bytes.length){
    if(bytes[index++]!==0xff)return null;
    while(bytes[index]===0xff)index++;
    const marker=bytes[index++];
    if(marker===0xda||marker===0xd9)return null; // SOF must precede scan data.
    if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
    if(index+2>bytes.length)return null;
    const length=bytes.readUInt16BE(index);
    if(length<2||index+length>bytes.length)return null;
    if(SOF.has(marker)){
      if(length<11)return null;
      const components=bytes[index+7];
      if(components<1||components>4||length!==8+3*components)return null;
      return valid(bytes.readUInt16BE(index+5),bytes.readUInt16BE(index+3))?'image/jpeg':null;
    }
    index+=length;
  }
  return null;
}

/** Returns the same synchronous asset methods, adding exact-URL RAM data images for this result only. */
export async function preparePortraitResolver(result,baseResolver,{
  fetchImpl=globalThis.fetch,concurrency=3,maxImages,maxPerImageBytes=262144,maxTotalBytes=2097152,
  maxEdge=2048,maxPixels=4194304,timeoutMs=5000,overallTimeoutMs=12000
}={}){
  const images=new Map();
  const recent=result?.kind==='recent'&&result.protocol==='pc-scan-v7'&&Array.isArray(result.data);
  const modernOwnedSkins=result?.kind==='ownedSkins'&&result.coverage==='official-own-paginated'&&result.protocol==='pc-scan-v7'&&
    (result.sourceUrl??result.source)==='https://api-xh.sanguosha.cn/user/gameGeneral/total'&&result.data?.pageSize===12&&
    Array.isArray(result.data.items)&&result.data.items.length<=12&&result.data.items.every(row=>row!==null&&typeof row==='object'&&!Array.isArray(row)&&row.isHave===true);
  const ownedSkins=modernOwnedSkins;
  const resolver=Object.freeze({...baseResolver,
    imageForGeneral(value){
      if(recent&&typeof value==='string'&&images.has(value))return images.get(value);
      return typeof baseResolver?.imageForGeneral==='function'?baseResolver.imageForGeneral.call(baseResolver,value):null;
    },
    imageForOfficialStatic(value){
      if(ownedSkins&&typeof value==='string'&&images.has(value))return images.get(value);
      return typeof baseResolver?.imageForOfficialStatic==='function'?baseResolver.imageForOfficialStatic.call(baseResolver,value):null;
    }
  });
  if((!recent&&!ownedSkins)||typeof fetchImpl!=='function')return resolver;
  const maxRows=modernOwnedSkins?12:10;
  const limit=bounded(maxImages,maxRows,maxRows,0),perImage=bounded(maxPerImageBytes,262144,262144,33),totalLimit=bounded(maxTotalBytes,2097152,2097152,33);
  const edge=bounded(maxEdge,2048,2048),pixels=bounded(maxPixels,4194304,4194304);
  // Modern iconUrl is a quality subscript, not skin artwork. Never fetch or
  // display it as a portrait, and never join internal IDs to public galleries.
  const candidates=ownedSkins?result.data.items.map(row=>trusted(row?.url,OWNED_SKIN_PATH)):
    result.data.slice(0,10).map(row=>Array.isArray(row?.general_avatar)?trusted(row.general_avatar[0]):null);
  const urls=[...new Set(candidates.filter(Boolean))].slice(0,limit);
  if(!urls.length)return resolver;
  const operation=new AbortController();let next=0,totalRead=0;
  const overallTimer=setTimeout(()=>operation.abort(),bounded(overallTimeoutMs,12000,15000));
  async function download(url){
    const request=new AbortController(),timer=setTimeout(()=>request.abort(),bounded(timeoutMs,5000,10000));
    let reader,response;
    try{
      response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
        headers:{Accept:'image/png,image/jpeg'},signal:AbortSignal.any([operation.signal,request.signal])});
      if(!response.ok||response.redirected||(response.url&&response.url!==url))throw rejected();
      const rawLength=response.headers?.get('content-length');
      if(rawLength!=null&&(!/^\d+$/.test(rawLength)||Number(rawLength)>perImage||Number(rawLength)>totalLimit-totalRead))throw rejected();
      if(typeof response.body?.getReader!=='function')throw rejected();
      reader=response.body.getReader();const chunks=[];let size=0;
      for(;;){
        if(operation.signal.aborted||request.signal.aborted)throw rejected();
        const chunk=await reader.read();if(chunk.done)break;
        if(!(chunk.value instanceof Uint8Array))throw rejected();
        if(size+chunk.value.byteLength>perImage)throw rejected();
        if(totalRead+chunk.value.byteLength>totalLimit){operation.abort();throw rejected();}
        size+=chunk.value.byteLength;totalRead+=chunk.value.byteLength;chunks.push(Buffer.from(chunk.value));
      }
      if(!size||operation.signal.aborted||request.signal.aborted)throw rejected();
      const bytes=Buffer.concat(chunks,size),type=imageType(bytes,edge,pixels);
      if(!type)throw rejected();
      images.set(url,`data:${type};base64,${bytes.toString('base64')}`);
    }catch{
      try{if(reader)await reader.cancel();else await response?.body?.cancel?.();}catch{}
    }finally{
      try{reader?.releaseLock();}catch{}
      clearTimeout(timer);
    }
  }
  async function worker(){while(!operation.signal.aborted&&next<urls.length){const url=urls[next++];await download(url);}}
  try{await Promise.all(Array.from({length:Math.min(urls.length,bounded(concurrency,3,3))},worker));}
  finally{clearTimeout(overallTimer);}
  return resolver;
}
