/** Strict projection of the official current-user collection response.
 * No accounts, files, downloads, public/game ID joins or persistence. */
import {CommunityAuthError} from './community-auth.mjs';

export const OWNED_COLLECTION_SOURCE='https://hi-gateway.sanguosha.cn/api/game/v2/general/generalSkins';
export const OWNED_GAME_INFO_SOURCE='https://hi-gateway.sanguosha.cn/api/game/v2/general/gameInfo';
export const OWNED_COLLECTION_PAGE_SIZE=24;
const MAX_ROWS=6000,MAX_PAGE=1000;
const kinds=Object.freeze({ownedGenerals:{key:'generalList',own:'generalNum',catalog:'generalTotal',title:'我的武将',unit:'武将'},ownedSkins:{key:'skinList',own:'skinNum',catalog:'skinTotal',title:'我的皮肤',unit:'皮肤'}});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const changed=()=>{throw new CommunityAuthError('SOURCE_CHANGED','官方本人收藏响应结构发生变化，暂未生成拥有列表。');};
const badPage=()=>{throw new CommunityAuthError('INVALID_ARGUMENT','本人收藏页码须为有效页码；每页24项，不支持势力或皮肤品质筛选。');};
function pageNumber(value){
  if(typeof value!=='number'&&typeof value!=='string')return badPage();
  if(typeof value==='string'&&!/^\d{1,4}$/u.test(value))return badPage();
  const page=Number(value);if(!Number.isInteger(page)||page<1||page>MAX_PAGE)return badPage();return page;
}
function label(value,max=100){
  if(typeof value!=='string'||!value.trim()||Array.from(value).length>max||/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF\uD800-\uDFFF]/u.test(value))return null;
  return value.trim();
}
function amount(value){
  if(typeof value==='string'&&!/^\d{1,7}$/u.test(value))return null;
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const number=Number(value);return Number.isSafeInteger(number)&&number>=0&&number<=1000000?number:null;
}
function artwork(value){
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.href===value&&
      /(?:^|\.)sanguosha\.(?:cn|com)$/u.test(url.hostname)?value:null;
  }catch{return null;}
}
function evidence(result,kind,source){
  if(!object(result)||result.kind!==kind||result.protocol!=='app-qr-v1'||
     (result.sourceUrl??result.source)!==source||!object(result.data))return changed();
  return result.data;
}

export function buildOwnedCollection({collectionResult,gameInfoResult,kind,page=1}={}){
  if(!Object.hasOwn(kinds,kind))return changed();
  const selected=kinds[kind],current=pageNumber(page),collection=evidence(collectionResult,'skins',OWNED_COLLECTION_SOURCE),raw=collection[selected.key];
  if(!Array.isArray(raw)||raw.length>MAX_ROWS)return changed();
  const info=gameInfoResult===undefined||gameInfoResult===null?null:evidence(gameInfoResult,'gameInfo',OWNED_GAME_INFO_SOURCE);
  const ownTotal=info?amount(info[selected.own]):null,catalogTotal=info?amount(info[selected.catalog]):null,seen=new Set(),rows=[];
  let invalidCount=0,duplicateCount=0;
  for(const row of raw){
    const name=object(row)?label(row.name,100):null;
    if(!object(row)||!Number.isSafeInteger(row.id)||row.id<1||!name){invalidCount++;continue;}
    if(seen.has(row.id)){duplicateCount++;continue;}
    seen.add(row.id);
    const grade=typeof row.grade==='number'&&Number.isFinite(row.grade)?row.grade:label(row.grade,60);
    rows.push({id:row.id,name,url:artwork(row.url),...(grade!==null?{grade}:{}),iconUrl:artwork(row.iconUrl)});
  }
  const returnedCount=raw.length,total=rows.length,pages=Math.max(1,Math.ceil(total/OWNED_COLLECTION_PAGE_SIZE));
  if(current>pages)return badPage();
  // Equality applies only to this official response and its aggregate. It does
  // not prove a permanently complete client inventory or another game role.
  const complete=ownTotal!==null&&returnedCount===ownTotal&&total===returnedCount&&invalidCount===0&&duplicateCount===0;
  let notice=complete?'本次返回数量与官方拥有统计一致，展示本次官方本人接口返回的条目；统计以当前响应为准。':'本次只返回部分，未展示不表示未拥有。';
  if(ownTotal===null)notice+=' 官方拥有总数暂未取得，不能确认本次返回是否完整。';
  if(invalidCount||duplicateCount)notice+=' 已忽略 '+(invalidCount+duplicateCount)+' 条无效或重复条目。';
  if(ownTotal!==null&&returnedCount>ownTotal)notice+=' 本次返回数量与官方拥有统计不一致，不能据此确认完整。';
  return {kind,coverage:'official-own-response',protocol:'app-qr-v1',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',
    sourceUrl:OWNED_COLLECTION_SOURCE,source:OWNED_COLLECTION_SOURCE,communityAuthenticated:true,gameAuthenticated:false,channelVerified:false,
    data:{title:selected.title,items:rows.slice((current-1)*OWNED_COLLECTION_PAGE_SIZE,current*OWNED_COLLECTION_PAGE_SIZE),
      returnedCount,total,invalidCount,duplicateCount,ownTotal,catalogTotal,complete,page:current,pageSize:OWNED_COLLECTION_PAGE_SIZE,pages,notice}};
}

export function formatOwnedCollection(result,{prefix='#sgs'}={}){
  if(!object(result)||!Object.hasOwn(kinds,result.kind)||result.coverage!=='official-own-response'||!object(result.data)||!Array.isArray(result.data.items))return changed();
  const data=result.data,selected=kinds[result.kind],p=label(prefix,20)||'#sgs',start=(data.page-1)*OWNED_COLLECTION_PAGE_SIZE;
  const lines=[selected.title,'官方拥有：'+(data.ownTotal===null?'暂未取得':data.ownTotal+' 项')+(data.catalogTotal===null?'':' · 游戏总数（官方统计）：'+data.catalogTotal+' 项'),
    '本次返回 '+data.returnedCount+' 项 · 可展示 '+data.total+' 项 · 第 '+data.page+' / '+data.pages+' 页 · 本页 '+data.items.length+' 项'];
  for(const [index,row] of data.items.entries())lines.push((start+index+1)+'. '+row.name);
  if(!data.items.length)lines.push('本次官方接口未返回可展示条目。');
  lines.push(data.notice);
  if(data.page<data.pages)lines.push('下一页：'+p+selected.title+' '+(data.page+1));
  else if(data.page>1)lines.push('已到末页 · 上一页：'+p+selected.title+' '+(data.page-1));
  lines.push('范围：本人已授权的官方社区响应；不等于公开图鉴，暂不支持势力、武将名或品质筛选。');
  return lines.join('\n');
}
