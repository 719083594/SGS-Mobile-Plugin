/** Public website catalog cards. This builder has no browser, filesystem,
 * network or account API. Only bounded, prepared raster data can be embedded. */
import {catalogNextCommand} from './catalog-display.mjs';

const WIDTH=1080,MARGIN=46,GAP=20,INNER=WIDTH-MARGIN*2;
const FONT='Noto Sans CJK SC, WenQuanYi Micro Hei, DejaVu Sans';
const LIMITS=Object.freeze({heroCatalog:24,skinCatalog:12});
const TOP_KEYS=new Set(['kind','title','items','total','page','pageSize','pages','faction','sourceUrl','coverage','filters','query','general','type','notice']);
const ITEM_KEYS=new Set(['id','name','faction','generalName','general','type','grade','label','image','url','publicAssetKey']);
const FACTIONS=new Set(['全部','魏','蜀','吴','群','神','晋']);
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const CRC_TABLE=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const plain=value=>object(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const ownKeysOnly=(value,allowed)=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&allowed.has(key));
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[char]);
const clean=(value,max=240)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF\uD800-\uDFFF]/gu,' ').trim()).slice(0,max).join(''):'';
const scalar=(value,max=240)=>typeof value==='number'&&Number.isFinite(value)?String(value):clean(value,max);
const uint=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const rect=(x,y,width,height,fill='#23414c',stroke='#b9985c',radius=18)=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;

function wrap(value,width,size,maxLines=Infinity){
  const lines=[];let line='',used=0;
  for(const char of Array.from(value)){
    const cost=/[\u0020-\u007e]/.test(char)?size*.58:size;
    if(line&&used+cost>width){lines.push(line);line='';used=0;}
    line+=char;used+=cost;
  }
  if(line)lines.push(line);
  if(lines.length>maxLines){
    lines.length=maxLines;let last=lines.at(-1);
    while(last&&Array.from(last+'…').reduce((sum,char)=>sum+(/[\u0020-\u007e]/.test(char)?size*.58:size),0)>width)last=Array.from(last).slice(0,-1).join('');
    lines[maxLines-1]=last+'…';
  }
  return lines.length?lines:[''];
}
function text(value,x,y,{size=24,color='#f4e9d2',weight=400,width=INNER,lineHeight=Math.ceil(size*1.45),anchor='start',maxLines=Infinity}={}){
  const lines=Array.isArray(value)?value:wrap(value,width,size,maxLines);
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${lines.map((line,index)=>`<tspan x="${x}" dy="${index?lineHeight:0}">${escape(line)}</tspan>`).join('')}</text>`;
}
function crc32(bytes){let crc=0xffffffff;for(const value of bytes)crc=CRC_TABLE[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function raster(value){
  if(typeof value!=='string'||value.length>350000)return null;
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4)return null;
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length>262144||bytes.toString('base64')!==match[2])return null;
  let width=0,height=0;
  if(match[1]==='png'){
    if(bytes.length<45||!bytes.subarray(0,8).equals(PNG))return null;
    let offset=8,header=false,data=false,ended=false;
    while(offset+12<=bytes.length){
      const length=bytes.readUInt32BE(offset),end=offset+12+length;
      if(end>bytes.length)return null;
      const kind=bytes.toString('ascii',offset+4,offset+8);
      if(!/^[A-Za-z]{4}$/.test(kind)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4)||['acTL','fcTL','fdAT'].includes(kind))return null;
      if(!header){
        if(kind!=='IHDR'||length!==13)return null;
        width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);
        const bitDepth=bytes[offset+16],colorType=bytes[offset+17],depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
        if(!depths[colorType]?.includes(bitDepth)||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]>1)return null;
        header=true;
      }
      else if(kind==='IHDR')return null;
      if(kind==='IDAT')data=true;
      if(kind==='IEND'){if(length||end!==bytes.length||!data)return null;ended=true;break;}
      offset=end;
    }
    if(!ended)return null;
  }else{
    if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
    let offset=2,scan=false;
    while(offset<bytes.length-2){
      if(bytes[offset++]!==255)return null;while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];
      if(marker===0xda){
        if(offset+3>bytes.length-2)return null;
        const length=bytes.readUInt16BE(offset),components=bytes[offset+2];
        if(![1,2,3,4].includes(components)||length!==6+components*2||offset+length>=bytes.length-2)return null;
        scan=true;break;
      }
      if(marker===0||marker===0xd8||marker===0xd9||marker>=0xd0&&marker<=0xd7||offset+2>bytes.length)return null;
      const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return null;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(width||length<8||bytes[offset+2]!==8)return null;
        height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);
        const components=bytes[offset+7];if(![1,3,4].includes(components)||length!==8+components*3)return null;
      }
      offset+=length;
    }
    if(!scan)return null;
  }
  return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=4194304?{url:value,bytes:bytes.length,pixels:width*height}:null;
}
function valid(result){
  if(!ownKeysOnly(result,TOP_KEYS)||!LIMITS[result.kind]||result.coverage!==(result.kind==='skinCatalog'?'official-skin-gallery':'official-web-catalog')||!Array.isArray(result.items))return false;
  if(!uint(result.pageSize,1,LIMITS[result.kind])||!uint(result.total,0,100000)||!uint(result.pages,1,100000)||!uint(result.page,1,result.pages))return false;
  if(result.pages!==Math.max(1,Math.ceil(result.total/result.pageSize)))return false;
  const expected=Math.min(result.pageSize,Math.max(0,result.total-(result.page-1)*result.pageSize));
  if(result.items.length!==expected)return false;
  if(result.faction!==undefined&&!FACTIONS.has(result.faction))return false;
  if(result.title!==undefined&&(typeof result.title!=='string'||result.title.length>1000))return false;
  if(result.notice!==undefined&&(typeof result.notice!=='string'||!clean(result.notice,240)||result.notice.length>240))return false;
  if(result.query!==undefined&&(typeof result.query!=='string'||result.query.length>100))return false;
  for(const key of ['general','type'])if(result[key]!==undefined&&(typeof result[key]!=='string'||result[key].length>100))return false;
  if(result.kind==='skinCatalog'&&result.type!==undefined&&!['全部','至尊','传说','原画'].includes(result.type))return false;
  if(result.filters!==undefined&&(!ownKeysOnly(result.filters,new Set(['general','grade']))||Object.values(result.filters).some(value=>typeof value!=='string'||!clean(value,100)||value.length>100)))return false;
  try{const url=new URL(result.sourceUrl);if(url.protocol!=='https:'||!['sanguosha.cn','www.sanguosha.cn','share.sanguosha.cn'].includes(url.hostname)||url.username||url.password||url.search||url.hash)return false;}catch{return false;}
  const ids=new Set();
  for(const row of result.items){
    if(!ownKeysOnly(row,ITEM_KEYS)||!scalar(row.id,100)||!clean(row.name,1000)||row.name.length>1000)return false;
    if(typeof row.id==='number'?!uint(row.id,0,Number.MAX_SAFE_INTEGER):typeof row.id!=='string'||row.id.length>100)return false;
    const id=scalar(row.id,100);if(ids.has(id))return false;ids.add(id);
    for(const key of ['faction','generalName','general','type','grade','label','publicAssetKey'])if(row[key]!==undefined&&(typeof row[key]!=='string'||row[key].length>240))return false;
    // Public image URLs are only provenance for the prepared skin resolver;
    // they are never opened or directly embedded. Personal keys fail above.
    for(const key of ['image','url'])if(row[key]!==undefined&&(typeof row[key]!=='string'||row[key].length>4096))return false;
  }
  return true;
}
function imageBlock(result,row,resolver,x,y,width,height,budget,index){
  let image=null;
  try{
    const method=result.kind==='heroCatalog'?'imageForGeneral':'imageForSkin';
    const key=result.kind==='heroCatalog'?row.name:row.id;
    if(typeof resolver?.[method]==='function'){
      if(result.kind==='skinCatalog')image=raster(resolver[method](key,row.image));
      else{
        // Offline static resolver accepts only exact manifest-approved URLs.
        // This disambiguates equal public names without any remote image load.
        if(typeof row.image==='string'&&row.image.startsWith('https://'))image=raster(resolver[method](row.image));
        if(!image)image=raster(resolver[method](key));
      }
    }
  }catch{}
  if(image&&(budget.bytes+image.bytes>2*1024*1024||budget.pixels+image.pixels>12000000))image=null;
  if(image){
    budget.bytes+=image.bytes;budget.pixels+=image.pixels;
    const clip='catalog-art-'+index;
    return `<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14"/></clipPath></defs><image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clip})" href="${image.url}"/>`;
  }
  const skin=result.kind==='skinCatalog';
  return rect(x,y,width,height,'#1b343e','#658186',14)+text(skin?'绘':'将',x+width/2,y+height*.48,{size:skin?62:68,color:'#beaa7d',weight:700,anchor:'middle',width:width-20})+text(skin?'原画暂未缓存':'头像暂未缓存',x+width/2,y+height*.72,{size:skin?22:20,color:'#99b2b7',anchor:'middle',width:width-20});
}
/** The input is one explicitly paginated public website projection, never an
 * authenticated collection. Returns null on mismatched scope or pagination. */
export function buildNativeCatalogCards(result,{prefix='#sgs',assetResolver}={}){
  if(!valid(result))return null;
  prefix=typeof prefix==='string'&&/^#?[\p{L}\p{N}_-]{1,18}$/u.test(prefix)?prefix:'#sgs';
  const skin=result.kind==='skinCatalog',columns=skin?3:4,width=(INNER-GAP*(columns-1))/columns;
  const rows=Math.ceil(result.items.length/columns),cellHeight=skin?366:360,gridTop=302;
  const height=Math.max(720,gridTop+rows*(cellHeight+GAP)+254);
  const faction=result.faction&&result.faction!=='全部'?result.faction:'';
  const title=clean(result.title,240)||(skin?'皮肤图鉴':faction?faction+'国武将':'全部武将');
  const titleLines=wrap(title,INNER-100,42,2),official=skin?'官方皮肤绘影堂':'官网武将图鉴';
  const budget={bytes:0,pixels:0};let body='';
  body+=`<defs><linearGradient id="catalog-background" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1b3c48"/><stop offset="100%" stop-color="#0f202a"/></linearGradient></defs>`;
  body+=rect(0,0,WIDTH,height,'url(#catalog-background)','#16313c',28)+rect(16,16,WIDTH-32,height-32,'none','#b9985c',20);
  body+=rect(MARGIN,44,68,76,'none','#c8aa70',9)+text('三\n国'.split('\n'),MARGIN+34,75,{size:25,color:'#edcf91',weight:700,anchor:'middle',width:62,lineHeight:30});
  body+=text('三国杀移动版 · '+official,MARGIN+96,67,{size:21,color:'#b8cbd0',width:INNER-100});
  body+=text(titleLines,MARGIN+96,114,{size:42,weight:700,color:'#fff0d1',width:INNER-100,lineHeight:56});
  const filter=skin?[clean(result.general||result.filters?.general||result.query,100)||'全部武将',clean(result.type||result.filters?.grade,100)||'全部分类'].join(' · '):(faction==='群'?'群雄':faction==='神'?'神将':faction?faction+'国':'全部势力');
  body+=rect(MARGIN,199,INNER,78,'#203d48','#527079',14)+text('筛选：'+filter,MARGIN+24,231,{size:24,width:INNER-270,maxLines:1})+text('共 '+result.total+' 项',WIDTH-MARGIN-24,231,{size:25,weight:700,color:'#edcf91',anchor:'end',width:220});
  body+=text('第 '+result.page+' / '+result.pages+' 页 · 本页 '+result.items.length+' 项 · 每页 '+result.pageSize+' 项',MARGIN+24,260,{size:19,color:'#b6ccd0',width:INNER-48});
  result.items.forEach((row,index)=>{
    const x=MARGIN+(index%columns)*(width+GAP),y=gridTop+Math.floor(index/columns)*(cellHeight+GAP),artWidth=width-32,artHeight=skin?180:184;
    body+=rect(x,y,width,cellHeight,'#23414c','#8b805e',16)+imageBlock(result,row,assetResolver,x+16,y+16,artWidth,artHeight,budget,index);
    const nameY=y+artHeight+54;
    body+=text(clean(row.name,1000),x+16,nameY,{size:26,weight:700,width:width-32,maxLines:2,lineHeight:36});
    if(skin){
      body+=text(clean(row.generalName,240)||'官网皮肤',x+16,y+cellHeight-67,{size:23,color:'#c3d3d3',width:width-32,maxLines:1});
      body+=text('分类：'+(scalar(row.type,240)||'官网未标明'),x+16,y+cellHeight-37,{size:19,color:'#d7bd87',width:width-32,maxLines:1});
    }else body+=text(row.faction==='群'?'群雄':row.faction==='神'?'神将':clean(row.faction,240)?clean(row.faction,240)+'国':'势力未标明',x+16,y+cellHeight-47,{size:21,color:'#d7bd87',width:width-32,maxLines:1});
    body+=text('ID '+scalar(row.id,100),x+16,y+cellHeight-17,{size:17,color:'#97b2ba',width:width-32,maxLines:1});
  });
  if(!result.items.length)body+=rect(MARGIN,gridTop,INNER,160,'#203d48','#527079',18)+text(skin&&result.notice?clean(result.notice,240):'当前筛选暂无官网收录条目',WIDTH/2,gridTop+65,{size:28,color:'#c2d4d5',anchor:'middle',width:INNER-60,maxLines:2,lineHeight:40});
  const footerY=height-218,navigationResult={...result,faction:result.faction||'全部'};
  body+=`<line x1="${MARGIN}" y1="${footerY}" x2="${WIDTH-MARGIN}" y2="${footerY}" stroke="#71827b" stroke-width="1"/>`;
  body+=text('官网公开图鉴 · 目录以官网收录为准',MARGIN,footerY+38,{size:23,color:'#e4cc98',weight:700,width:INNER});
  body+=text('公开资料，不代表本人拥有；官网收录范围可能与客户端不同。',MARGIN,footerY+74,{size:21,color:'#aec4c7',width:INNER,maxLines:2});
  const navigation=result.page<result.pages?'下一页：'+catalogNextCommand(navigationResult,prefix):result.page>1?'已到末页 · 上一页：'+catalogNextCommand({...navigationResult,page:result.page-2},prefix):'本筛选共 1 页';
  body+=text(navigation,MARGIN,footerY+123,{size:24,color:'#edcf91',weight:700,width:INNER,maxLines:2,lineHeight:34});
  body+=text('来源：三国杀移动版官网 sanguosha.cn',MARGIN,height-37,{size:19,color:'#91adb6',width:INNER});
  return [{svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><g font-family="${FONT}">${body}</g></svg>`,width:WIDTH,height,private:false}];
}
