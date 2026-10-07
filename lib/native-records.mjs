/** Original SVG-only records view. No browser, filesystem, network or account
 * persistence. Only prepared raster portraits may cross the image boundary. */
import {redactOwnData} from './community-auth.mjs';

const WIDTH=1080,MAX_HEIGHT=Math.floor(12000000/WIDTH),MAX_PAGES=8;
const MARGIN=46,GAP=20,INNER=WIDTH-MARGIN*2,FONT='Noto Sans CJK SC, WenQuanYi Micro Hei, DejaVu Sans';
const MAX_IMAGE=262144,MAX_IMAGES_TOTAL=2*1024*1024;
const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
const CRC_TABLE=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[char]);
const short=(value,max=180)=>typeof value==='number'?Number.isFinite(value)?String(value):'':typeof value==='boolean'?String(value):typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF\uD800-\uDFFF]/gu,' ').trim()).slice(0,max).join(''):'';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim())&&Number.isFinite(Number(value))?Number(value):null;
const chunks=(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));

function wrap(value,width,size){
  const lines=[];let line='',used=0;
  for(const char of Array.from(value)){
    const cost=/[\u0020-\u007e]/.test(char)?size*.58:size;
    if(line&&used+cost>width){lines.push(line);line='';used=0;}
    line+=char;used+=cost;
  }
  if(line)lines.push(line);
  return lines.length?lines:[''];
}
function text(value,x,y,{size=24,color='#f4e9d2',weight=400,width=INNER,lineHeight=Math.ceil(size*1.45),anchor='start'}={}){
  const lines=wrap(value,width,size);
  return {height:lines.length*lineHeight,svg:`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${lines.map((line,index)=>`<tspan x="${x}" dy="${index?lineHeight:0}">${escape(line)}</tspan>`).join('')}</text>`};
}
const rect=(x,y,width,height,fill='#23414c',stroke='#b9985c',radius=18)=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
function heading(label,x,y){return `<rect x="${x}" y="${y+3}" width="5" height="25" rx="2" fill="#d4ad68"/>`+text(label,x+19,y+27,{size:28,color:'#edcb88',weight:700}).svg;}
function crc32(bytes){let crc=0xffffffff;for(const value of bytes)crc=CRC_TABLE[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

function imageData(value){
  if(typeof value!=='string'||value.length>350000)return null;
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4)return null;
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length>MAX_IMAGE||bytes.toString('base64')!==match[2])return null;
  let width=0,height=0;
  if(match[1]==='png'){
    if(bytes.length<45||!bytes.subarray(0,8).equals(PNG_MAGIC))return null;
    let offset=8,header=false,data=false,ended=false;
    while(offset+12<=bytes.length){
      const length=bytes.readUInt32BE(offset),end=offset+12+length;
      if(end>bytes.length)return null;
      const kind=bytes.toString('ascii',offset+4,offset+8);
      if(!/^[A-Za-z]{4}$/.test(kind)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4)||['acTL','fcTL','fdAT'].includes(kind))return null;
      if(!header){if(kind!=='IHDR'||length!==13)return null;width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);header=true;}
      else if(kind==='IHDR')return null;
      if(kind==='IDAT')data=true;
      if(kind==='IEND'){if(length!==0||end!==bytes.length||!data)return null;ended=true;break;}
      offset=end;
    }
    if(!ended)return null;
  }else{
    if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
    let offset=2;
    while(offset<bytes.length-2){
      if(bytes[offset++]!==255)return null;while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===0xda)break;
      if(marker===0||marker===0xd8||marker===0xd9||marker>=0xd0&&marker<=0xd7||offset+2>bytes.length)return null;
      const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return null;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(width||length<8||bytes[offset+2]!==8)return null;
        height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);
        const components=bytes[offset+7];if(![1,3,4].includes(components)||length!==8+components*3)return null;
      }
      offset+=length;
    }
  }
  return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=4194304?{url:value,bytes:bytes.length,pixels:width*height}:null;
}

const MODES=[
  ['paiweiRate','排位赛',[['total','场次',false]]],
  ['shenfenRate','身份场',[['emperor_rate','主公胜率'],['minister_rate','忠臣胜率'],['rebel_rate','反贼胜率'],['provocateur_rate','内奸胜率']]],
  ['guozhanRate','国战',[['wei_rate','魏国胜率'],['shu_rate','蜀国胜率'],['wu_rate','吴国胜率'],['qun_rate','群雄胜率'],['ye_rate','野心家胜率']]],
  ['doudizhuRate','斗地主',[['total','场次',false],['lord_rate','地主胜率'],['peasant_rate','农民胜率']]]
];
function rateDescriptor(name,data,fields){
  const main=short(data.total_rate),details=fields.flatMap(([key,label,percent=true])=>{
    const value=short(data[key]);return value?[{label,value:value+(percent&&!value.endsWith('%')?'%':'')}]:[];
  });
  return main||details.length?{name,main:main?main+(main.endsWith('%')?'':'%'):'',details}:null;
}
function rateHeight(rate,width){
  let height=76;
  if(rate.main)height+=wrap(rate.main,width-48,36).length*49+14;
  for(const pair of chunks(rate.details,2))height+=Math.max(...pair.map(detail=>wrap(detail.value,(width-62)/2,24).length*35))+33+14;
  return Math.max(154,height+12);
}
function drawRates(rates,x,y,width){
  const column=(width-GAP)/2;let svg='',cursor=y;
  for(const pair of chunks(rates,2)){
    const height=Math.max(...pair.map(rate=>rateHeight(rate,column)));
    pair.forEach((rate,index)=>{
      const left=x+index*(column+GAP);let top=cursor+39;
      svg+=rect(left,cursor,column,height)+text(rate.name,left+24,top,{size:28,weight:700,color:'#edd39d',width:column-48}).svg;
      top+=40;
      if(rate.main){const line=text(rate.main,left+24,top,{size:36,weight:800,width:column-48,color:'#fff3d3'});svg+=line.svg;top+=line.height+14;}
      for(const items of chunks(rate.details,2)){
        const factWidth=(column-62)/2;let tallest=0;
        items.forEach((detail,itemIndex)=>{
          const fx=left+24+itemIndex*(factWidth+14);
          svg+=text(detail.label,fx,top,{size:19,color:'#b4c7cb',width:factWidth}).svg;
          const value=text(detail.value,fx,top+33,{size:24,weight:600,width:factWidth});svg+=value.svg;tallest=Math.max(tallest,value.height);
        });
        top+=33+tallest+14;
      }
    });
    cursor+=height+GAP;
  }
  return {svg,height:cursor-y};
}
function drawResults(values,x,y,width,offset){
  let svg=heading('近期胜负',x,y);const top=y+48,cell=(width-9*10)/10;
  values.forEach((value,index)=>{
    const code=numeric(value),label=code===0?'胜':code===1?'负':'未知',fill=code===0?'#365a4b':code===1?'#65453e':'#364b54';
    const left=x+(index%10)*(cell+10),cy=top+Math.floor(index/10)*88;
    svg+=rect(left,cy,cell,76,fill,'#bca16d',12)+text(label,left+cell/2,cy+33,{size:label==='未知'?20:25,weight:700,anchor:'middle',width:cell}).svg+text(String(offset+index+1),left+cell/2,cy+59,{size:16,anchor:'middle',color:'#c9d2cb',width:cell}).svg;
  });
  return {svg,height:48+Math.ceil(values.length/10)*88+12};
}
function drawGenerals(names,x,y,width,imageForGeneral){
  const column=(width-GAP*2)/3;let svg=heading('近期使用武将',x,y),cursor=y+48,imageBytes=0,imagePixels=0,serial=0;
  for(const rows of chunks(names,3)){
    const heights=rows.map(name=>Math.max(136,wrap(name,column-134,24).length*35+44));
    const height=Math.max(...heights);
    rows.forEach((name,index)=>{
      const left=x+index*(column+GAP),avatarX=left+17,avatarY=cursor+22,clip='avatar-'+serial++;
      let portrait=null;try{portrait=imageData(imageForGeneral(name));}catch{}
      if(portrait&&(imageBytes+portrait.bytes>MAX_IMAGES_TOTAL||imagePixels+portrait.pixels>12000000))portrait=null;
      svg+=rect(left,cursor,column,height);
      if(portrait){
        imageBytes+=portrait.bytes;imagePixels+=portrait.pixels;
        svg+=`<defs><clipPath id="${clip}"><rect x="${avatarX}" y="${avatarY}" width="88" height="88" rx="14"/></clipPath></defs><image x="${avatarX}" y="${avatarY}" width="88" height="88" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" href="${portrait.url}"/>`;
      }else svg+=rect(avatarX,avatarY,88,88,'#304d56','#b9985c',14)+text('将',avatarX+44,avatarY+57,{size:35,weight:700,color:'#e8cb91',anchor:'middle',width:88}).svg;
      svg+=text(name,left+120,cursor+43,{size:24,weight:700,width:column-134}).svg;
    });
    cursor+=height+GAP;
  }
  return {svg,height:cursor-y};
}

/** app-qr-v1 records only. The backend consumes these inert SVGs in RAM.
 * imageForGeneral must be an offline resolver; no row-provided URL is used. */
export function buildNativeRecordCards(result,{prefix='#sgs',imageForGeneral=()=>null,dataAlreadyRedacted=false,model=0,command='战绩'}={}){
  if(result?.kind!=='records'||result?.protocol!=='app-qr-v1'||!isObject(result.data))return null;
  const data=dataAlreadyRedacted===true?result.data:redactOwnData(result.data);
  if(!isObject(data))return null;
  const rates=MODES.flatMap(([key,label,fields])=>isObject(data[key])?[rateDescriptor(label,data[key],fields)].filter(Boolean):[]);
  const medal=isObject(data.medals)?[['chuanshuo','传说'],['wanmei','大师'],['feicui','翡翠'],['huangjin','黄金'],['baiyin','白银'],['qingtong','青铜']].find(([key])=>numeric(data.medals[key])>0)?.[1]:null;
  const pages=rates.length||medal?[{rates,medal}]:[];
  if(Array.isArray(data.g20)&&data.g20.length){
    const strips=chunks(data.g20,20).map((values,index)=>({results:values,resultOffset:index*20}));
    if(pages.length)Object.assign(pages[0],strips.shift());pages.push(...strips);
  }
  if(Array.isArray(data.recent)){
    const names=data.recent.flatMap(row=>isObject(row)&&short(row.name,60)?[short(row.name,60)]:[]);
    const generals=chunks(names,24).map(names=>({names}));
    if(pages.length&&generals.length)Object.assign(pages[0],generals.shift());pages.push(...generals);
  }
  if(!pages.length)pages.push({empty:true});
  const total=pages.length,limited=total>MAX_PAGES;
  const safePrefix=short(prefix,20)||'#sgs',mode=Number.isInteger(Number(model))&&Number(model)>=0&&Number(model)<=4?Number(model):0;
  const exportLine=safePrefix+(short(command,30)||'战绩')+' '+mode+' 导出';
  const cards=pages.slice(0,MAX_PAGES).map((page,index)=>{
    let body='',y=194;
    if(page.medal){const line=text('排位赛最高段位 · '+page.medal,MARGIN,y,{size:25,color:'#e9ca8a',weight:600});body+=line.svg;y+=line.height+22;}
    if(page.rates?.length){const block=drawRates(page.rates,MARGIN,y,INNER);body+=block.svg;y+=block.height+8;}
    if(page.results?.length){const block=drawResults(page.results,MARGIN,y,INNER,page.resultOffset);body+=block.svg;y+=block.height+10;}
    if(page.names?.length){const block=drawGenerals(page.names,MARGIN,y,INNER,typeof imageForGeneral==='function'?imageForGeneral:()=>null);body+=block.svg;y+=block.height;}
    if(page.empty){body+=rect(MARGIN,y,INNER,125)+text('本次暂无可展示的资料。',MARGIN+28,y+72,{size:28}).svg;y+=155;}
    const footer=['本人资料 · 仅私聊',...(limited?[`节选前 ${MAX_PAGES} 页（本次共 ${total} 页）；完整资料请导出。`]:[]),'更多字段：'+exportLine,'三国杀移动助手 · 官方移动版与三国咸话'];
    body+=`<line x1="${MARGIN}" y1="${y+10}" x2="${WIDTH-MARGIN}" y2="${y+10}" stroke="#8f805d" stroke-width="1"/>`;y+=44;
    for(const label of footer){const line=text(label,MARGIN,y,{size:20,color:'#b8c9cb',width:INNER,lineHeight:30});body+=line.svg;y+=line.height+4;}
    const height=Math.ceil(y+22);
    if(height>MAX_HEIGHT)return null;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><defs><linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3b48"/><stop offset="1" stop-color="#10232e"/></linearGradient></defs><rect x="0" y="0" width="${WIDTH}" height="${height}" fill="url(#background)"/><rect x="18" y="18" width="${WIDTH-36}" height="${height-36}" rx="12" fill="none" stroke="#9a8150" stroke-width="1"/><g font-family="${FONT}">${rect(MARGIN,42,74,82,'#193641','#d4ad68',7)}${text('三',MARGIN+37,76,{size:28,weight:700,color:'#edcf94',anchor:'middle',width:74}).svg}${text('国',MARGIN+37,109,{size:28,weight:700,color:'#edcf94',anchor:'middle',width:74}).svg}${text('三国杀移动版 · 三国咸话',144,65,{size:20,color:'#c9b895'}).svg}${text('战绩统计',144,124,{size:46,weight:800,color:'#f7e9cc'}).svg}${total>1?text(`${index+1} / ${Math.min(total,MAX_PAGES)}`,WIDTH-MARGIN,70,{size:22,anchor:'end',color:'#e1c591',width:180}).svg:''}${body}</g></svg>`;
    if(Buffer.byteLength(svg)>4*1024*1024)return null;
    return {svg,width:WIDTH,height,private:true};
  });
  return cards.some(card=>card===null)?null:cards;
}
