/** Strict projection of the official current-user collection response.
 * No accounts, files, downloads, public/game ID joins or persistence. */
import {CommunityAuthError,MODERN_OWNED_COLLECTION_SOURCE,MODERN_OWNED_COLLECTION_PAGE_SIZE,validateModernOwnedPage} from './community-auth.mjs';
export {MODERN_OWNED_COLLECTION_SOURCE,MODERN_OWNED_COLLECTION_PAGE_SIZE} from './community-auth.mjs';

const MAX_PAGE=1000;
const kinds=Object.freeze({ownedGenerals:{title:'我的武将',unit:'武将'},ownedSkins:{title:'我的皮肤',unit:'皮肤'}});
const countries=Object.freeze(['全部','魏国','蜀国','吴国','群雄','神将']);
const countryCommands=Object.freeze(['','魏','蜀','吴','群','神']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const changed=()=>{throw new CommunityAuthError('SOURCE_CHANGED','官方本人收藏响应结构发生变化，暂未生成拥有列表。');};
const badPage=()=>{throw new CommunityAuthError('INVALID_ARGUMENT','本人收藏页码须为1～1000的有效页码，每页12项。');};
function pageNumber(value){
  if(typeof value!=='number'&&typeof value!=='string')return badPage();
  if(typeof value==='string'&&!/^\d{1,4}$/u.test(value))return badPage();
  const page=Number(value);if(!Number.isInteger(page)||page<1||page>MAX_PAGE)return badPage();return page;
}
function label(value,max=100){
  if(typeof value!=='string'||!value.trim()||Array.from(value).length>max||/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF\uD800-\uDFFF]/u.test(value))return null;
  return value.trim();
}
function artwork(value){
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.href===value&&
      /(?:^|\.)sanguosha\.(?:cn|com)$/u.test(url.hostname)?value:null;
  }catch{return null;}
}
function buildModernOwnedCollection(result,kind,page,countryType){
  if(!object(result)||result.kind!==kind||result.protocol!=='pc-scan-v7'||result.scope!=='sanguosha-community'||result.gameVersion!=='sanguosha-mobile'||
     result.communityAuthenticated!==true||(result.sourceUrl??result.source)!==MODERN_OWNED_COLLECTION_SOURCE||!object(result.query)||result.query.skin!==(kind==='ownedSkins'))return changed();
  const checked=validateModernOwnedPage(result.data,result.query),query=result.query;
  if(page!==undefined&&pageNumber(page)!==query.page)return changed();
  if(countryType!==undefined&&countryType!==query.countryType)return changed();
  const selected=kinds[kind],raw=checked.data[query.skin?'skins':'generals'];
  const rows=raw.map(row=>({...row,url:artwork(row.url),iconUrl:artwork(row.iconUrl)}));
  const ownTotal=checked.data.have,catalogTotal=checked.data.total,filteredTotal=checked.data.searchNum;
  const complete=query.page===1&&filteredTotal<=query.pageSize&&rows.length===filteredTotal;
  const notice='官方本人拥有列表按每页12项分页返回；当前获取第 '+query.page+' / '+checked.pages+' 页。'+
    (complete?' 本次匹配条目均在当前一页内。':' 本次未一次获取全部匹配条目；未展示的其他页条目不表示未拥有。');
  return {kind,coverage:'official-own-paginated',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',
    sourceUrl:MODERN_OWNED_COLLECTION_SOURCE,source:MODERN_OWNED_COLLECTION_SOURCE,communityAuthenticated:true,gameAuthenticated:false,channelVerified:false,
    query:{page:query.page,pageSize:query.pageSize,countryType:query.countryType,skin:query.skin},
    data:{title:selected.title,items:rows,returnedCount:rows.length,total:filteredTotal,filteredTotal,invalidCount:0,duplicateCount:0,ownTotal,catalogTotal,
      complete,page:query.page,pageSize:MODERN_OWNED_COLLECTION_PAGE_SIZE,pages:checked.pages,countryType:query.countryType,countryLabel:countries[query.countryType],notice}};
}

export function buildOwnedCollection({collectionResult,kind,page,countryType}={}){
  if(!Object.hasOwn(kinds,kind)||collectionResult?.protocol!=='pc-scan-v7')return changed();
  return buildModernOwnedCollection(collectionResult,kind,page,countryType);
}

export function ownedCollectionPageCommand(result,page,{prefix='#sgs'}={}){
  if(!object(result)||!Object.hasOwn(kinds,result.kind)||!object(result.data)||result.coverage!=='official-own-paginated')return changed();
  const current=pageNumber(page),data=result.data,p=label(prefix,20)||'#sgs';
  if(!Number.isInteger(data.pages)||data.pages<1||current>data.pages)throw new CommunityAuthError('INVALID_ARGUMENT','本人收藏页码超出当前筛选的有效范围。');
  let filter='';
  if(result.coverage==='official-own-paginated'){
    if(result.protocol!=='pc-scan-v7'||data.pageSize!==MODERN_OWNED_COLLECTION_PAGE_SIZE||!Number.isInteger(data.countryType)||data.countryType<0||data.countryType>5||
       (result.kind==='ownedSkins'&&data.countryType!==0))return changed();
    if(result.kind==='ownedGenerals'&&data.countryType!==0)filter=' '+countryCommands[data.countryType];
  }
  return p+kinds[result.kind].title+filter+' '+current;
}

function formatModernOwnedCollection(result,{prefix='#sgs'}={}){
  const data=result.data,selected=kinds[result.kind];
  if(result.protocol!=='pc-scan-v7'||data.pageSize!==MODERN_OWNED_COLLECTION_PAGE_SIZE||!Number.isInteger(data.countryType)||data.countryType<0||data.countryType>5||
     data.countryLabel!==countries[data.countryType]||data.total!==data.filteredTotal||data.returnedCount!==data.items.length)return changed();
  const start=(data.page-1)*data.pageSize,lines=[selected.title+(result.kind==='ownedGenerals'?' · '+data.countryLabel:''),
    '官方拥有：'+data.ownTotal+' 项 · 游戏总数（官方统计）：'+data.catalogTotal+' 项',
    '当前筛选 '+data.filteredTotal+' 项 · 第 '+data.page+' / '+data.pages+' 页 · 本页 '+data.items.length+' 项'];
  for(const [index,row] of data.items.entries())lines.push((start+index+1)+'. '+row.name);
  if(!data.items.length)lines.push('官方本人接口没有返回当前筛选的已拥有条目。');
  lines.push(data.notice);
  if(data.page<data.pages)lines.push('下一页：'+ownedCollectionPageCommand(result,data.page+1,{prefix}));
  else if(data.page>1)lines.push('已到末页 · 上一页：'+ownedCollectionPageCommand(result,data.page-1,{prefix}));
  lines.push('范围：本人已授权的官方分页拥有列表；武将支持魏、蜀、吴、群、神势力筛选。');
  return lines.join('\n');
}

export function formatOwnedCollection(result,{prefix='#sgs'}={}){
  if(!object(result)||!Object.hasOwn(kinds,result.kind)||!object(result.data)||!Array.isArray(result.data.items)||result.coverage!=='official-own-paginated')return changed();
  return formatModernOwnedCollection(result,{prefix});
}
