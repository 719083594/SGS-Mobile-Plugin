/** Original browser-free SVG views. The trusted local decoder accepts only
 * bounded PNG/JPEG data from prepared resolvers; official response URLs are
 * never fetched, opened, or embedded by this module. */
import {redactOwnData} from './community-auth.mjs';
import {ASSET_ITEMS} from './ui-assets.mjs';
import {ownedCollectionPageCommand} from './owned-collection.mjs';

const WIDTH=1080,MARGIN=46,INNER=WIDTH-MARGIN*2,GAP=20,MAX_PAGES=8,MAX_BODY=2180;
const FONT='Noto Sans CJK SC, WenQuanYi Micro Hei, DejaVu Sans';
const TITLES=Object.freeze({summary:'个人资料',profile:'社区资料',force:'战力资料',gameInfo:'游戏资料',assets:'我的资产',recent:'近期对局',abilities:'能力一览',bestGeneral:'擅长武将',winRate:'胜率统计',ownedGenerals:'我的武将',ownedSkins:'我的皮肤',personal:'本人资料'});
const COMMANDS=Object.freeze({summary:'个人资料',profile:'个人资料',force:'将力',gameInfo:'游戏资料',assets:'资产',recent:'近期战绩',abilities:'能力',bestGeneral:'擅长武将',winRate:'胜率',ownedGenerals:'我的武将',ownedSkins:'我的皮肤',personal:'个人资料'});
const MODES=['全部','排位赛','身份场','国战','斗地主'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[char]);
const short=(value,max=220)=>typeof value==='number'?Number.isFinite(value)?String(value):'':typeof value==='boolean'?String(value):typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\uFFFE\uFFFF\uD800-\uDFFF]/gu,' ').trim()).slice(0,max).join(''):'';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim())&&Number.isFinite(Number(value))?Number(value):null;
const chunks=(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));
const prefixFor=value=>short(value,20)||'#sgs';
const numberIn=(value,min,max,fallback)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
const rect=(x,y,width,height,fill='#23414c',stroke='#b9985c',radius=18)=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;

function wrap(value,width,size){
  const lines=[];let line='',used=0;
  for(const char of Array.from(value)){
    const cost=/[\u0020-\u007e]/.test(char)?size*.58:size;
    if(line&&used+cost>width){lines.push(line);line='';used=0;}line+=char;used+=cost;
  }
  if(line)lines.push(line);return lines.length?lines:[''];
}
function text(value,x,y,{size=25,color='#f4e9d2',weight=400,width=INNER,lineHeight=Math.ceil(size*1.45),anchor='start'}={}){
  const lines=Array.isArray(value)?value:wrap(value,width,size);
  return {height:lines.length*lineHeight,svg:`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${lines.map((line,index)=>`<tspan x="${x}" dy="${index?lineHeight:0}">${escape(line)}</tspan>`).join('')}</text>`};
}
function heading(value,y){return `<rect x="${MARGIN}" y="${y+2}" width="5" height="26" rx="2" fill="#d4ad68"/>`+text(value,MARGIN+19,y+26,{size:28,color:'#edcb88',weight:700}).svg;}
function imageData(value){
  if(typeof value!=='string'||value.length>350000)return null;
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match||match[2].length%4)return null;
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>262144||bytes.toString('base64')!==match[2])return null;
  if(match[1]==='png'){
    if(bytes.length<45||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(!width||!height||width>4096||height>4096||width*height>4194304)return null;
    return {url:value,bytes:bytes.length,pixels:width*height};
  }
  if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
  let offset=2,width=0,height=0;
  while(offset<bytes.length-2){
    if(bytes[offset++]!==255)return null;while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];if(marker===0xda)break;
    if(marker===0||marker===0xd8||marker===0xd9||marker>=0xd0&&marker<=0xd7||offset+2>bytes.length)return null;
    const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return null;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      if(width||length<8||bytes[offset+2]!==8)return null;
      height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);
      const components=bytes[offset+7];if(![1,3,4].includes(components)||length!==8+components*3)return null;
    }offset+=length;
  }
  return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=4194304?{url:value,bytes:bytes.length,pixels:width*height}:null;
}
function imageBlock(resolver,method,key,label,x,y,size,budget){
  let image=null;
  try{if(typeof resolver?.[method]==='function'&&key!==null&&key!==undefined)image=imageData(resolver[method](key));}catch{}
  if(image&&(budget.bytes+image.bytes>2*1024*1024||budget.pixels+image.pixels>12000000||budget.images>=64))image=null;
  if(image){budget.bytes+=image.bytes;budget.pixels+=image.pixels;budget.images++;const clip='portrait-'+budget.images;return `<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="14"/></clipPath></defs><image x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clip})" href="${image.url}"/>`;}
  return rect(x,y,size,size,'#304d56','#b9985c',14)+text(short(label,1)||'将',x+size/2,y+size*.65,{size:Math.floor(size*.4),weight:700,color:'#e8cb91',anchor:'middle',width:size}).svg;
}
function staticImage(resolver,value){
  if(typeof value!=='string'||!value||value.length>4096)return null;
  try{return imageData(resolver?.imageForOfficialStatic?.(value))?.url??null;}catch{return null;}
}
const panel=(draw,height)=>({height,draw});
function paragraphPanel(label,value){
  const lines=wrap(short(value,6000),INNER-56,27),parts=chunks(lines,32);
  return parts.map((part,index)=>{
    const title=short(label,80)+(index?' · 续':''),headingHeight=wrap(title,INNER-19,28).length*41+5;
    return panel((y)=>{
    let svg=heading(title,y);const top=y+headingHeight,height=part.length*40+42;
    svg+=rect(MARGIN,top,INNER,height)+text(part,MARGIN+28,top+43,{size:27,width:INNER-56,lineHeight:40}).svg;
    return svg;
  },headingHeight+part.length*40+42+GAP);});
}
function metricsPanels(rows){
  return chunks(rows,2).map(pair=>{
    const column=(INNER-GAP)/2,height=Math.max(150,...pair.map(row=>wrap(row.value,column-48,34).length*46+91));
    return panel(y=>pair.map((row,index)=>{
      const x=MARGIN+index*(column+GAP);
      return rect(x,y,column,height)+text(row.label,x+24,y+40,{size:22,color:'#bdd0cf',width:column-48}).svg+text(row.value,x+24,y+96,{size:34,weight:700,width:column-48,lineHeight:46}).svg;
    }).join(''),height+GAP);
  });
}
function knownMetrics(data,fields){return fields.flatMap(([key,label,suffix=''])=>{const value=short(data[key]);return value?[{label,value:value+(suffix&&!(suffix==='%'&&value.endsWith('%'))?suffix:'')}]:[];});}
function identityPanels(kind,data,resolver){
  const name=short(kind==='summary'?data.nick_name:data.nick,70),values=knownMetrics(data,[['lv','等级'],['vip','VIP'],['nowDivision','当前段位'],['maxTitle','称号']]);
  const avatar=kind==='summary'?data.avatar:data.head;
  if(!name&&!values.length&&!avatar)return [];
  const lines=wrap(values.map(row=>row.label+' '+row.value).join(' · '),INNER-174,23),height=Math.max(158,110+lines.length*33);
  return [panel((y,budget)=>rect(MARGIN,y,INNER,height)+imageBlock(resolver,'imageForGeneral',avatar,name||'角色',MARGIN+23,y+24,102,budget)+text(name||TITLES[kind],MARGIN+148,y+51,{size:32,weight:700,width:INNER-174}).svg+text(lines,MARGIN+148,y+96,{size:23,lineHeight:33,width:INNER-174,color:'#bdd0cf'}).svg,height+GAP)];
}
function assetsPanels(data,resolver){
  const panels=[panel(y=>text('包裹道具 · 数量来自本次官方查询',MARGIN,y+28,{size:24,color:'#c8d4d0'}).svg,60)];
  for(const rows of chunks(ASSET_ITEMS,4)){
    const column=(INNER-GAP*3)/4,height=288;
    panels.push(panel((y,budget)=>rows.map((item,index)=>{
      const x=MARGIN+index*(column+GAP),value=short(data[item.key],18),amount=value||'未返回';
      let svg=rect(x,y,column,height,'#fff6d8','#d7bb78',18)+text(item.label,x+column/2,y+37,{size:24,color:'#71654a',anchor:'middle',width:column-20}).svg;
      svg+=imageBlock(resolver,'imageForItem',item.key,item.label,x+(column-104)/2,y+57,104,budget);
      svg+=rect(x+1,y+178,column-2,height-179,'#f0dfa8','#f0dfa8',16)+text(amount,x+column/2,y+222,{size:amount.length>9?23:31,weight:700,color:value?'#3d3a2f':'#8b826c',anchor:'middle',width:column-22,lineHeight:33}).svg;
      return svg;
    }).join(''),height+GAP));
  }
  const unknown=Object.keys(data).filter(key=>!ASSET_ITEMS.some(row=>row.key===key)&&key!=='baseResp');
  if(unknown.length)panels.push(...paragraphPanel('其他字段','另有 '+unknown.length+' 个官方字段未映射；完整资料请使用下方导出命令。'));
  return panels;
}
function profilePanels(kind,data,resolver){
  const panels=identityPanels(kind,data,resolver);let metrics=[];
  if(kind==='summary')metrics=knownMetrics(data,[['generalCount','拥有武将'],['skinCount','拥有皮肤'],['general_all_count','武将总数（官网统计）'],['skin_all_count','皮肤总数（官网统计）']]);
  else if(kind==='force'){
    metrics=object(data.game_force)?knownMetrics(data.game_force,[['totalForce','综合战力'],['doudizhuForce','斗地主战力'],['paiweiForce','排位战力'],['guozhanForce','国战战力'],['shenfenForce','身份战力']]):[];
    if(short(data.general_power))metrics.unshift({label:'general_power · 官方字段',value:short(data.general_power)});
  }else{
    metrics=knownMetrics(data,[['totalGame','总场次'],['totalMvp','总 MVP'],['rankWin','排位胜场'],['douDiZhuWin','斗地主胜场'],['maxDivision','最高段位']]);
    for(const [part,total,label] of [['generalNum','generalTotal','武将收藏'],['skinNum','skinTotal','皮肤收藏']]){const left=short(data[part]),right=short(data[total]);if(left||right)metrics.push({label,value:(left||'未返回')+(right?' / '+right:'')});}
    for(const [winsKey,totalKey,label] of [['rankWin','rankNum','排位胜率'],['douDiZhuWin','douDiZhuTotal','斗地主胜率'],['totalWin','totalGame','总胜率']]){const wins=numeric(data[winsKey]),total=numeric(data[totalKey]);if(wins!==null&&total!==null&&wins>=0&&total>0&&wins<=total)metrics.push({label,value:Math.trunc(wins/total*100)+'%'});}
  }
  panels.push(...metricsPanels(metrics));
  const lights=kind==='summary'?data.light:kind==='gameInfo'?data.lights:null;
  const available=(Array.isArray(lights)?lights:[]).slice(0,1000).filter(value=>!!staticImage(resolver,value));
  if(available.length){
    for(const group of chunks(available,8))panels.push(panel((y,budget)=>heading(kind==='gameInfo'?'将灯':'资料图标',y)+group.map((key,index)=>imageBlock(resolver,'imageForOfficialStatic',key,'灯',MARGIN+index*124,y+48,94,budget)).join(''),166));
  }
  if(kind==='gameInfo'&&Array.isArray(data.titleList))for(const row of data.titleList.slice(0,1000))if(object(row)){
    const label=short(row.name,90),value=short(row.num,80),picture=!!staticImage(resolver,row.url);
    if(picture){
      const name=label||'生涯条目',titleLines=wrap(name,INNER-174,27),valueLines=wrap(value||'未返回',INNER-174,32),height=Math.max(162,68+titleLines.length*39+valueLines.length*43);
      panels.push(panel((y,budget)=>rect(MARGIN,y,INNER,height)+imageBlock(resolver,'imageForOfficialStatic',row.url,name,MARGIN+23,y+25,102,budget)+text(titleLines,MARGIN+148,y+42,{size:27,weight:700,width:INNER-174,lineHeight:39}).svg+text(valueLines,MARGIN+148,y+58+titleLines.length*39,{size:32,weight:700,color:'#edcf94',width:INNER-174,lineHeight:43}).svg,height+GAP));
    }else if(label||value)panels.push(...metricsPanels([{label:label||'生涯条目',value:value||'未返回'}]));
  }
  return panels;
}
function recentPanels(data,resolver,options){
  const mode=MODES[numberIn(options.model,0,4,0)],page=numberIn(options.page,1,1000,1);
  const shown=Math.min(data.length,10),note=(shown?'本次展示前'+shown+'条':'本批暂无可展示记录')+' · 本人私聊可导出本批 JSON · 不代表完整历史';
  const panels=[panel(y=>text(mode+' · 第 '+page+' 页 · 本批返回 '+data.length+' 条',MARGIN,y+29,{size:25,color:'#c8d4d0'}).svg+text(note,MARGIN,y+72,{size:22,color:'#b9cacd',lineHeight:32}).svg,78+wrap(note,INNER,22).length*32)];
  for(const [index,value] of data.slice(0,10).entries()){
    const row=object(value)?value:{},modeLabel=short(row.Model,90)||'对局 '+(index+1),time=short(row.begin_time,120),result=short(row.result,70)||'待查看',avatar=Array.isArray(row.general_avatar)?row.general_avatar[0]:null;
    const names=Array.isArray(row.general_names)?row.general_names.slice(0,3).map(name=>short(name,60)).filter(Boolean).join('、'):'';
    const outcome=result+(row.mvp===true?' · MVP':'')+(row.run===true?' · 逃跑':'');
    const resultWidth=190,height=Math.max(158,77+wrap(modeLabel,INNER-178-resultWidth,27).length*39+(names?wrap(names,INNER-178-resultWidth,23).length*33:0)+(time?wrap(time,INNER-178-resultWidth,21).length*31:0),44+wrap(outcome,resultWidth,29).length*43);
    panels.push(panel((y,budget)=>{
      let svg=rect(MARGIN,y,INNER,height)+imageBlock(resolver,'imageForGeneral',avatar,'武将',MARGIN+22,y+24,102,budget);
      const label=text(modeLabel,MARGIN+148,y+48,{size:27,weight:700,width:INNER-178-resultWidth,lineHeight:39});svg+=label.svg;
      const namesText=names?text(names,MARGIN+148,y+60+label.height,{size:23,width:INNER-178-resultWidth,color:'#edcb88',lineHeight:33}):{height:0,svg:''};svg+=namesText.svg;
      if(time)svg+=text(time,MARGIN+148,y+60+label.height+namesText.height,{size:21,width:INNER-178-resultWidth,color:'#b9cacd',lineHeight:31}).svg;
      const resultLines=wrap(outcome,resultWidth,29);
      return svg+text(resultLines,WIDTH-MARGIN-22,y+(height-resultLines.length*43)/2+32,{size:29,weight:700,anchor:'end',width:resultWidth,lineHeight:43,color:/^(胜|胜利|获胜)$/.test(result)?'#a7dbb5':/^(负|失败|战败)$/.test(result)?'#efb3a4':'#ddd3b5'}).svg;
    },height+GAP));
  }
  return panels;
}
function entryPanels(data){
  const entries=[];let visits=0;
  const collect=(value,context='',depth=0)=>{
    if(++visits>6000||depth>5)return;
    if(Array.isArray(value)){for(const row of value.slice(0,6000))collect(row,context,depth+1);return;}
    if(object(value)){
      const fields=Object.entries(value).filter(([,item])=>!object(item)&&!Array.isArray(item)).map(([key,item])=>[short(key,70),short(item,220)]).filter(([key,value])=>key&&value);
      if(fields.length)entries.push({name:short(value.name,90)||short(value.title,90)||context,fields});
      for(const [key,item] of Object.entries(value))if(object(item)||Array.isArray(item))collect(item,short(key,70),depth+1);
      return;
    }
    const label=short(value,220);if(label)entries.push({name:context,fields:[['内容',label]]});
  };
  collect(data);
  return entries.flatMap((entry,index)=>chunks(entry.fields,6).map((fields,part)=>{
    const title=(entry.name||'条目 '+(index+1))+(part?' · 续':''),lines=fields.flatMap(([key,value])=>wrap(key+'：'+value,INNER-56,24)),titleHeight=wrap(title,INNER-56,27).length*40,height=54+titleHeight+lines.length*35;
    return panel(y=>rect(MARGIN,y,INNER,height)+text(title,MARGIN+28,y+41,{size:27,weight:700,width:INNER-56,color:'#eed3a0',lineHeight:40}).svg+text(lines,MARGIN+28,y+52+titleHeight,{size:24,width:INNER-56,lineHeight:35}).svg,height+GAP);
  }));
}
function winRatePanels(data,resolver){
  const panels=[];
  if(short(data.scope,120))panels.push(...paragraphPanel('统计范围',short(data.scope,120)));
  for(const group of chunks(Array.isArray(data.entries)?data.entries.slice(0,1000):[],2)){
    const rows=group.filter(object),column=(INNER-GAP)/2;
    const height=Math.max(180,...rows.map(row=>56+wrap(short(row.label,90)||'官方统计',column-48,23).length*34+wrap(short(row.value,100)||'未返回',column-48,36).length*48+wrap(short(row.detail,220),column-48,21).length*31));
    if(rows.length)panels.push(panel(y=>rows.map((row,index)=>{
      const x=MARGIN+index*(column+GAP),label=short(row.label,90)||'官方统计',labelHeight=wrap(label,column-48,23).length*34,value=short(row.value,100)||'未返回',valueHeight=wrap(value,column-48,36).length*48;
      return rect(x,y,column,height)+text(label,x+24,y+37,{size:23,color:'#bdd0cf',width:column-48,lineHeight:34}).svg+text(value,x+24,y+57+labelHeight,{size:36,weight:700,width:column-48,lineHeight:48}).svg+text(short(row.detail,220),x+24,y+68+labelHeight+valueHeight,{size:21,color:'#bfd0ce',width:column-48,lineHeight:31}).svg;
    }).join(''),height+GAP));
  }
  for(const row of Array.isArray(data.generals)?data.generals.slice(0,1000):[])if(object(row)){
    const name=short(row.name,90)||'武将',label=short(row.label,90)||'官方模式',value=short(row.value,100)||'未返回',detail=short(row.detail,220);
    const height=Math.max(176,76+wrap(name+' · '+label,INNER-174,27).length*39+wrap(value+(detail?' · '+detail:''),INNER-174,27).length*39);
    panels.push(panel((y,budget)=>{
      const title=text(name+' · '+label,MARGIN+148,y+46,{size:27,weight:700,width:INNER-174,lineHeight:39});
      return rect(MARGIN,y,INNER,height)+imageBlock(resolver,'imageForGeneral',name,name,MARGIN+22,y+24,102,budget)+title.svg+text(value+(detail?' · '+detail:''),MARGIN+148,y+60+title.height,{size:27,color:'#edcf94',width:INNER-174,lineHeight:39}).svg;
    },height+GAP));
  }
  if(short(data.notice,1000))panels.push(...paragraphPanel('统计说明',short(data.notice,1000)));
  return panels;
}
function ownedCollectionPanels(kind,data,resolver,prefix,result){
  const unit=kind==='ownedGenerals'?'武将':'皮肤',panels=metricsPanels([
    {label:'官方拥有'+unit+(kind==='ownedGenerals'?' · 全部势力':''),value:String(data.ownTotal)},
    {label:'筛选匹配'+unit+' · '+data.countryLabel,value:String(data.filteredTotal)}
  ]);
  panels.push(panel(y=>text('官方分页 · '+data.countryLabel+' · 第 '+data.page+' / '+data.pages+' 页 · 本页 '+data.items.length+' 项 · 每页 '+data.pageSize+' 项 · 游戏总数 '+data.catalogTotal,MARGIN,y+28,{size:23,color:'#c8d4d0',width:INNER,lineHeight:34}).svg,84));
  const column=(INNER-GAP*2)/3,start=(data.page-1)*data.pageSize;
  for(const [groupIndex,rows] of chunks(data.items,3).entries()){
    const names=rows.map(row=>short(row.name,24)+(Array.from(row.name||'').length>24?'…':''));
    const height=Math.max(156,...names.map(name=>48+wrap(name,column-122,23).length*32));
    panels.push(panel((y,budget)=>rows.map((row,index)=>{
      const x=MARGIN+index*(column+GAP),method=kind==='ownedGenerals'?'imageForGeneral':'imageForOfficialStatic';
      const artwork=kind==='ownedGenerals'?{imageForGeneral(){
        // The prepared resolver accepts only a unique exact public name. This
        // supplements artwork, never ownership or an internal/public ID join.
        try{return resolver?.imageForGeneral?.(row.name)??null;}catch{return null;}
      }}:resolver;
      return rect(x,y,column,height)+imageBlock(artwork,method,row.url??row.name,kind==='ownedGenerals'?'将':'肤',x+14,y+25,84,budget)+
        text(names[index],x+112,y+41,{size:23,weight:700,width:column-126,lineHeight:32}).svg+
        text('#'+(start+groupIndex*3+index+1),x+112,y+height-18,{size:19,color:'#b8c9cb',width:column-126}).svg;
    }).join(''),height+GAP));
  }
  if(!data.items.length)panels.push(...paragraphPanel('本次返回','本次官方接口未返回可展示条目。'));
  panels.push(...paragraphPanel('返回范围',data.notice));
  const pageCommand=page=>ownedCollectionPageCommand(result,page,{prefix});
  const navigation=data.page<data.pages?'下一页：'+pageCommand(data.page+1):data.page>1?'已到末页 · 上一页：'+pageCommand(data.page-1):'本次返回共 1 页';
  panels.push(panel(y=>text(navigation,MARGIN,y+28,{size:23,color:'#edcb88',width:INNER}).svg,60));
  return panels;
}
function preparePages(panels){
  if(!panels.length)panels=[panel(y=>rect(MARGIN,y,INNER,135)+text('本次暂无可展示的资料。',MARGIN+28,y+77,{size:28}).svg,155)];
  const pages=[];let rows=[],height=0;
  for(const item of panels){if(rows.length&&height+item.height>MAX_BODY){pages.push(rows);rows=[];height=0;}rows.push(item);height+=item.height;}
  if(rows.length)pages.push(rows);return pages;
}
function renderPages(title,panels,{privatePage,foot,subtitle='三国杀移动版 · 三国咸话'}={}){
  const pages=preparePages(panels),limited=pages.length>MAX_PAGES,total=Math.min(pages.length,MAX_PAGES);
  const cards=pages.slice(0,MAX_PAGES).map((rows,index)=>{
    const headerSize=wrap(short(title,90),INNER-114,43).length>1?32:43;
    const headerHeight=Math.max(190,118+wrap(short(title,90),INNER-114,headerSize).length*44+28);
    const budget={bytes:0,pixels:0,images:0};let y=headerHeight,body='';
    for(const item of rows){body+=item.draw(y,budget);y+=item.height;}
    body+=`<line x1="${MARGIN}" y1="${y+10}" x2="${WIDTH-MARGIN}" y2="${y+10}" stroke="#8f805d" stroke-width="1"/>`;y+=46;
    const footer=[...foot,...(limited?[`节选前 ${MAX_PAGES} 页（本次共 ${pages.length} 页）；完整资料请导出或缩小范围。`]:[])];
    for(const value of footer){const row=text(value,MARGIN,y,{size:20,color:'#b8c9cb',width:INNER,lineHeight:30});body+=row.svg;y+=row.height+4;}
    const height=Math.ceil(y+24);if(height*WIDTH>12000000)return null;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><defs><linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3b48"/><stop offset="1" stop-color="#10232e"/></linearGradient></defs><rect x="0" y="0" width="${WIDTH}" height="${height}" fill="url(#background)"/><rect x="18" y="18" width="${WIDTH-36}" height="${height-36}" rx="12" fill="none" stroke="#9a8150" stroke-width="1"/><g font-family="${FONT}">${rect(MARGIN,42,74,82,'#193641','#d4ad68',7)}${text('三',MARGIN+37,76,{size:28,weight:700,color:'#edcf94',anchor:'middle',width:74}).svg}${text('国',MARGIN+37,109,{size:28,weight:700,color:'#edcf94',anchor:'middle',width:74}).svg}${text(short(subtitle,80),144,65,{size:20,color:'#c9b895',width:INNER-114}).svg}${text(short(title,90),144,118,{size:headerSize,weight:800,color:'#f7e9cc',width:INNER-114,lineHeight:44}).svg}${total>1?text(`${index+1} / ${total}`,WIDTH-MARGIN,headerHeight-18,{size:20,anchor:'end',color:'#e1c591',width:180}).svg:''}${body}</g></svg>`;
    return Buffer.byteLength(svg)<=4*1024*1024?{svg,width:WIDTH,height,private:privatePage}:null;
  });
  return cards.every(card=>card!==null)?cards:null;
}

/** Current authenticated protocol only. Record cards use the separate builder. */
export function buildNativePersonalCards(result,options={}){
  if(result?.protocol!=='pc-scan-v7'||['records','skins','favorites'].includes(result.kind))return null;
  const kind=Object.hasOwn(TITLES,result?.kind)?result.kind:'personal',data=options.dataAlreadyRedacted===true?result?.data:redactOwnData(result?.data),resolver=options.assetResolver??(typeof options.imageForGeneral==='function'?{imageForGeneral:options.imageForGeneral}:null);
  if(['ownedGenerals','ownedSkins'].includes(kind)){
      const countries=['全部','魏国','蜀国','吴国','群雄','神将'],count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000;
      if(result.coverage!=='official-own-paginated'||(result.sourceUrl??result.source)!=='https://api-xh.sanguosha.cn/user/gameGeneral/total'||!object(data)||!Array.isArray(data.items)||data.items.length>12||
        data.pageSize!==12||!Number.isInteger(data.page)||data.page<1||data.page>1000||!Number.isInteger(data.pages)||data.pages!==Math.max(1,Math.ceil(data.total/12))||data.page>data.pages||
        !count(data.total)||data.filteredTotal!==data.total||!count(data.ownTotal)||!count(data.catalogTotal)||data.returnedCount!==data.items.length||data.returnedCount>data.total||
        !Number.isInteger(data.countryType)||data.countryType<0||data.countryType>5||data.countryLabel!==countries[data.countryType]||kind==='ownedSkins'&&data.countryType!==0||
        typeof data.complete!=='boolean'||data.complete!==(data.pages===1&&data.items.length===data.total)||typeof data.notice!=='string'||!data.notice.trim()||data.notice.length>1200||
        data.items.some(row=>!object(row)||!Number.isSafeInteger(row.id)||row.id<1||row.isHave!==true||typeof row.name!=='string'||!row.name.trim()||Array.from(row.name).length>100)||new Set(data.items.map(row=>row.id)).size!==data.items.length)return null;
      const prefix=prefixFor(options.prefix),title=TITLES[kind]+(kind==='ownedGenerals'&&data.countryType?' · '+data.countryLabel:'');
      const cards=renderPages(title,ownedCollectionPanels(kind,data,resolver,prefix,result),{privatePage:true,foot:['本人资料 · 仅私聊','官方本人拥有列表 · 本次展示当前页，不等于公开图鉴。','武将支持官方势力筛选；本人皮肤暂不支持按武将搜索。']});
      return cards?.length===1?cards:null;
  }
  let panels=[];
  if(object(data)&&kind==='assets')panels=assetsPanels(data,resolver);
  else if(object(data)&&['summary','force','gameInfo'].includes(kind))panels=profilePanels(kind,data,resolver);
  else if(Array.isArray(data)&&kind==='recent')panels=recentPanels(data,resolver,options);
  else if(kind==='winRate'&&object(data))panels=winRatePanels(data,resolver);
  else panels=entryPanels(data);
  const prefix=prefixFor(options.prefix),command=short(options.command,40)||COMMANDS[kind],extra=kind==='recent'?' '+numberIn(options.model,0,4,0)+' '+numberIn(options.page,1,1000,1):'';
  return renderPages(kind==='winRate'?short(data?.title,90)||TITLES[kind]:TITLES[kind],panels,{privatePage:true,foot:[options.groupShare?'发送者本人战绩 · 群内展示':'本人资料 · 仅私聊',(options.groupShare?'本人私聊导出：':'更多字段：')+prefix+command+extra+' 导出','三国杀移动助手 · 官方移动版与三国咸话']});
}

/** Public heroes, articles and list cards. Only the repository's prepared
 * resolver supplies optional portraits; row URLs remain inert lookup keys. */
export function buildNativePublicCards(result,options={}){
  const data=options.dataAlreadyRedacted===true?result:redactOwnData(result),command=short(options.command,40)||'公开资料',prefix=prefixFor(options.prefix),resolver=options.assetResolver??(typeof options.imageForGeneral==='function'?{imageForGeneral:options.imageForGeneral}:null);
  const title=short(data?.title,90)||short(data?.name,90)||command,panels=[];
  if(Array.isArray(data?.items))for(const [index,item] of data.items.slice(0,6000).entries()){
    const row=object(item)?item:{},name=short(row.title,150)||short(row.name,150)||'资料条目',date=short(row.date,60),description=short(row.description,240),id=short(row.id,40),hero=command==='武将';
    const width=INNER-(hero?174:56),nameLines=wrap((index+1)+'. '+name,width,28),details=[date,description].filter(Boolean).flatMap(value=>wrap(value,width,23)),target=hero?'武将':['资讯','公告','活动'].includes(command)?'详情':null;
    const idLabel=id?(target&&/^[1-9]\d{0,9}$/.test(id)?prefix+target+' '+id:'ID '+id):'',height=Math.max(hero?160:130,44+nameLines.length*40+details.length*34+(idLabel?40:0));
    panels.push(panel((y,budget)=>{
      const x=MARGIN+(hero?148:28);let svg=rect(MARGIN,y,INNER,height);
      if(hero)svg+=imageBlock(resolver,'imageForGeneral',row.name||row.title||row.id,name,MARGIN+22,y+24,102,budget);
      svg+=text(nameLines,x,y+43,{size:28,weight:700,width,lineHeight:40}).svg;
      if(details.length)svg+=text(details,x,y+51+nameLines.length*40,{size:23,width,lineHeight:34,color:'#bfcece'}).svg;
      if(idLabel)svg+=text(idLabel,x,y+height-19,{size:21,width,color:'#eacb8d'}).svg;
      return svg;
    },height+GAP));
  }else if(object(data)){
    const name=short(data.name,100)||title,faction=short(data.faction,100),hero=command==='武将';
    panels.push(panel((y,budget)=>rect(MARGIN,y,INNER,156)+(hero?imageBlock(resolver,'imageForGeneral',data.name||data.id,name,MARGIN+22,y+25,102,budget):'')+text(name,MARGIN+(hero?148:28),y+52,{size:32,weight:700,width:INNER-(hero?174:56)}).svg+(faction?text(faction,MARGIN+(hero?148:28),y+104,{size:24,color:'#c8d4d0',width:INNER-(hero?174:56)}).svg:''),176));
    for(const [name,value] of [['简介',data.description],['特色',data.features],['玩法',data.playGuide]])if(short(value,6000))panels.push(...paragraphPanel(name,value));
    for(const rows of [data.skills,data.sections])for(const row of Array.isArray(rows)?rows.slice(0,1000):[])if(object(row)&&short(row.description,3000))panels.push(...paragraphPanel(short(row.name,80)||'资料',short(row.description,3000)));
  }
  return renderPages(title,panels,{privatePage:false,subtitle:'三国杀移动版 · 官方公开资料',foot:['三国杀移动版 · 官方公开资料','更多命令：'+prefix+'帮助']});
}
