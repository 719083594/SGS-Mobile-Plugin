/** Display only normalized public catalog fields; no accounts or raw payloads. */
const text=(value,max=100)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f]/gu,' ').trim()).slice(0,max).join(''):'';
export function catalogNextCommand(result,prefix='#sgs'){
 const page=Number(result?.page),pages=Number(result?.pages);if(!Number.isInteger(page)||!Number.isInteger(pages)||page>=pages)return '';
 const p=text(prefix,20)||'#sgs';
 if(result.kind==='heroCatalog')return p+(result.faction==='全部'?'全部武将':result.faction==='群'?'群雄武将':result.faction==='神'?'神武将':result.faction+'国武将')+' '+(page+1);
 return p+'皮肤图鉴'+(text(result.general,60)?' '+text(result.general,60):'')+(text(result.type,20)&&result.type!=='全部'?' '+text(result.type,20):'')+' '+(page+1);
}
export function formatCatalog(result,{prefix='#sgs'}={}){
 if(!['heroCatalog','skinCatalog'].includes(result?.kind)||result.coverage!==(result.kind==='heroCatalog'?'official-web-catalog':'official-skin-gallery')||!Array.isArray(result.items))throw new TypeError('INVALID_PUBLIC_CATALOG');
 const lines=[text(result.title,100)||'三国杀移动版公开图鉴','共 '+result.total+' 项 · 第 '+result.page+' / '+result.pages+' 页 · 本页 '+result.items.length+' 项'];
 const start=(result.page-1)*result.pageSize;
 for(const [i,row] of result.items.entries())lines.push((start+i+1)+'. '+text(row.name)+(text(row.faction,20)?' · '+text(row.faction,20):'')+(text(row.generalName,60)?' · '+text(row.generalName,60):'')+(text(row.grade,30)?' · '+text(row.grade,30):'')+' · ID '+row.id);
 if(!result.items.length)lines.push(text(result.notice,240)||(result.kind==='skinCatalog'?'绘影堂未收录该筛选，不代表游戏中没有对应皮肤。':'没有找到符合条件的公开条目。'));
 const next=catalogNextCommand(result,prefix);if(next)lines.push('下一页：'+next);
 lines.push(result.kind==='heroCatalog'?'范围：移动版官网已收录武将；不等同本人拥有或客户端全集。':'范围：移动版官方皮肤绘影堂；不等同本人拥有。');
 return lines.join('\n');
}
