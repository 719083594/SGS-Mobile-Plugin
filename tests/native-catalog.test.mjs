import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import sharp from 'sharp';
import {buildNativeCatalogCards} from '../lib/native-catalog.mjs';
import {createNativeCardRenderer} from '../lib/native-card-renderer.mjs';

// Public synthetic rows and raster data only. No accounts, files or network.
const hero=(number=24,extra={})=>({kind:'heroCatalog',title:'全部武将',items:Array.from({length:number},(_,i)=>({id:i+1,name:'合成武将'+(i+1),faction:'吴'})),total:number,page:1,pageSize:24,pages:Math.max(1,Math.ceil(number/24)),sourceUrl:'https://www.sanguosha.cn/hero',coverage:'official-web-catalog',...extra});
const skins=(number=12,extra={})=>({kind:'skinCatalog',title:'皮肤图鉴',items:Array.from({length:number},(_,i)=>({id:i+1,name:'合成皮肤'+(i+1),generalName:'合成武将',grade:'原画'})),total:number,page:1,pageSize:12,pages:Math.max(1,Math.ceil(number/12)),sourceUrl:'https://www.sanguosha.cn/skin',coverage:'official-skin-gallery',...extra});
const svgFor=result=>buildNativeCatalogCards(result)?.map(card=>card.svg).join('\n');
const decode=value=>value.replace(/&(amp|lt|gt|quot|apos);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name]);
const labels=svg=>[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>decode(match[1].replace(/<[^>]+>/g,'')));
function chunk(type,bytes){
  const content=Buffer.concat([Buffer.from(type),bytes]);let crc=0xffffffff;
  for(const value of content){crc^=value;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}
  const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(bytes.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([size,content,sum]);
}
function png(width=1,height=1,padding=0){
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,40,120,150,255]))),...(padding?[chunk('tEXt',Buffer.concat([Buffer.from('QA\0'),Buffer.alloc(padding,65)]))]:[]),chunk('IEND',Buffer.alloc(0))]);
}
const data=(bytes,type='png')=>'data:image/'+type+';base64,'+bytes.toString('base64');

test('catalog pages are public, keep every current-page row, and declare their exact website scope',()=>{
  for(const result of [hero(),skins()]){
    const original=structuredClone(result),cards=buildNativeCatalogCards(result),values=labels(cards[0].svg);
    assert.equal(cards.length,1);assert.deepEqual(Object.keys(cards[0]),['svg','width','height','private']);
    assert.equal(cards[0].private,false);assert.equal(cards[0].width,1080);
    assert(cards[0].width*cards[0].height<=12000000);assert(cards[0].height<=12000);
    assert.deepEqual(values.filter(value=>/^合成(?:武将|皮肤)\d+$/.test(value)),result.items.map(row=>row.name));
    assert(values.includes('公开资料，不代表本人拥有；官网收录范围可能与客户端不同。'));
    assert(values.includes('共 '+result.total+' 项'));assert(values.includes('本筛选共 1 页'));
    assert(values.includes('三国杀移动版 · '+(result.kind==='heroCatalog'?'官网武将图鉴':'官方皮肤绘影堂')));
    assert.deepEqual(result,original);
  }
});

test('first, intermediate, last and empty pages disclose counts and navigation without losing faction filters',()=>{
  const first=hero(24,{total:588,pages:25}),middle=hero(24,{faction:'吴',title:'吴国武将',total:127,page:2,pages:6}),last=hero(7,{faction:'吴',total:127,page:6,pages:6});
  assert(labels(svgFor(first)).includes('下一页：#sgs全部武将 2'));
  assert(labels(svgFor(middle)).includes('下一页：#sgs吴国武将 3'));
  assert(labels(svgFor(last)).includes('已到末页 · 上一页：#sgs吴国武将 5'));
  assert(labels(svgFor(last)).includes('第 6 / 6 页 · 本页 7 项 · 每页 24 项'));
  const empty=buildNativeCatalogCards(hero(0,{faction:'吴'}))[0];
  assert(labels(empty.svg).includes('当前筛选暂无官网收录条目'));assert(empty.height>=720);
  const custom=buildNativeCatalogCards(first,{prefix:'#三国'})[0];assert(labels(custom.svg).includes('下一页：#三国全部武将 2'));
});

test('skin pagination keeps verified general and gallery type, never treats the gallery as all client skins',()=>{
  const input=skins(12,{total:141,pages:12,general:'周瑜',type:'传说'}),svg=svgFor(input),values=labels(svg);
  assert(values.includes('筛选：周瑜 · 传说'));assert(values.includes('下一页：#sgs皮肤图鉴 周瑜 传说 2'));
  assert.match(svg,/官方皮肤绘影堂/);assert.doesNotMatch(svg,/全部皮肤|已拥有|我的收藏/);
  const last=skins(9,{total:141,page:12,pages:12});assert(labels(svgFor(last)).includes('第 12 / 12 页 · 本页 9 项 · 每页 12 项'));
});

test('skin classification uses the verified gallery type rather than an artwork label',()=>{
  const input=skins(1);input.items[0].type='传说';input.items[0].grade='龙生九子';
  const values=labels(svgFor(input));assert(values.includes('分类：传说'));assert(!values.includes('分类：龙生九子'));
  delete input.items[0].type;assert(labels(svgFor(input)).includes('分类：官网未标明'));
});

test('scope, malformed pagination and private data are rejected before consulting any resolver',()=>{
  let calls=0;const options={assetResolver:{imageForGeneral(){calls++;throw Error('must not run');},imageForSkin(){calls++;throw Error('must not run');}}};
  const bad=[null,{},[],{...hero(),kind:'records'},{...hero(),coverage:'official-skin-gallery'},{...skins(),coverage:'official-web-catalog'},
    {...hero(),private:true},{...hero(),data:{}},{...hero(),protocol:'app-qr-v1'},{...hero(),owner:'synthetic-owner'},
    {...hero(),share:{scope:'own-gameplay'}},{...hero(),token:'synthetic-token'},{...hero(),filters:{cookie:'synthetic-cookie'}},
    {...hero(),items:[{id:1,name:'合成武将',uid:'synthetic-uid'}],total:1},{...hero(),items:[{id:1,name:'合成武将',owned:true}],total:1},
    {...hero(),total:25,pages:1},{...hero(),total:24,page:2},{...hero(),page:0},{...hero(),page:'1'},
    {...hero(),pageSize:25},{...skins(),pageSize:13},{...hero(),total:100001},{...hero(),items:hero().items.slice(1)},
    {...hero(),items:[...hero().items,{id:25,name:'不应被默默截掉'}]},{...hero(),faction:'secret'},
    {...hero(),items:hero().items.map((row,i)=>({...row,id:i===1?1:row.id}))},
    {...hero(),sourceUrl:'https://evil.invalid/catalog'},{...hero(),sourceUrl:'https://www.sanguosha.cn/hero?token=synthetic-token'},
    {...hero(),sourceUrl:'https://u:p@www.sanguosha.cn/hero'},{...hero(),sourceUrl:'file:///private.json'},
    {...hero(),filters:{general:{name:'invalid'}}},{...skins(),type:'unverified-type'},
    {...skins(),notice:[]},{...skins(),notice:' '},{...skins(),notice:'A'.repeat(241)},
    {...hero(),items:[{id:1.5,name:'合成武将'}],total:1},{...hero(),items:[{id:'A'.repeat(101),name:'合成武将'}],total:1}];
  for(const input of bad)assert.equal(buildNativeCatalogCards(input,options),null);
  assert.equal(calls,0);
});

test('long names wrap with a visible ellipsis, XML text is escaped, and arbitrary data cannot create markup',()=>{
  const name='长名字'.repeat(100)+'<image href="https://evil.invalid/private"/>&"\'',input=hero(1,{title:'很长的目录标题'.repeat(60)+'<script>bad</script>'});
  input.items[0].name=name;input.items[0].id='id<&"\'';
  const svg=buildNativeCatalogCards(input,{prefix:'"><script>prefix</script>'})[0].svg;
  assert.doesNotMatch(svg,/<script|<image\b|https:\/\/evil\.invalid/);assert.match(svg,/…/);assert.match(svg,/ID id&lt;&amp;&quot;&apos;/);
  assert.equal((svg.match(/<svg\b/g)||[]).length,1);assert.equal((svg.match(/<\/svg>/g)||[]).length,1);
  for(const match of svg.matchAll(/<(?:rect|image)\b[^>]*\bx="([\d.]+)"[^>]*\bwidth="([\d.]+)"/g))assert(Number(match[1])+Number(match[2])<=1080);
});

test('hero portraits only come from the prepared resolver; raw URLs, source URLs and private query values never reach SVG',()=>{
  const input=hero(2),seen=[];input.items[0].image='https://evil.invalid/synthetic-private.png';input.items[0].url='file:///synthetic-private-file';
  input.items[1].image=data(png());
  const result=buildNativeCatalogCards(input,{assetResolver:{imageForGeneral(name){seen.push(name);return name.startsWith('https://')?null:data(png());}}})[0];
  assert.deepEqual(seen,[input.items[0].image,...input.items.map(row=>row.name)]);assert.equal((result.svg.match(/<image\b/g)||[]).length,2);
  assert.doesNotMatch(result.svg,/synthetic-private|href="(?:https?|file):/);
  assert(!svgFor(input).includes('<image '));
});

test('equal general names use their own exact approved offline image URL before the ambiguous name',()=>{
  const input=hero(2),seen=[];
  input.items.forEach((row,index)=>{row.name='同名合成武将';row.image='https://www.sanguosha.cn/storage/uploads/images/pic_index/'+(index+1)+'.png';});
  const approved=new Set(input.items.map(row=>row.image));
  const cards=buildNativeCatalogCards(input,{assetResolver:{imageForGeneral(key){seen.push(key);return approved.has(key)?data(png()):null;}}});
  assert.deepEqual(seen,input.items.map(row=>row.image));assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,2);
  assert.doesNotMatch(cards[0].svg,/href="https:/);
});

test('skin art calls only imageForSkin with the public skin ID and never uses a general portrait as skin artwork',()=>{
  const seen=[],input=skins(2);input.items[0].publicAssetKey='ignored-public-asset-key';input.items[0].image='https://public.invalid/synthetic-art.jpg';
  const cards=buildNativeCatalogCards(input,{assetResolver:{imageForGeneral(){assert.fail('a hero avatar is not a skin artwork');},imageForSkin(id,url){seen.push([id,url]);return data(png());}}});
  assert.deepEqual(seen,[[1,input.items[0].image],[2,undefined]]);assert.equal((cards[0].svg.match(/<image\b/g)||[]).length,2);
  assert.match(svgFor(input),/原画暂未缓存/);assert.doesNotMatch(svgFor(input),/<image\b/);
});

test('invalid raster values fall back to a deliberate placeholder without leaking resolver errors',()=>{
  const bytes=png(),wrongCrc=Buffer.from(bytes);wrongCrc[29]^=1;
  const bad=['https://www.sanguosha.cn/image.png','file:///safe/image.png','data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64'),
    'data:image/webp;base64,AAAA','data:image/png;base64,AA==',data(wrongCrc),data(Buffer.concat([bytes,Buffer.from('x')])),
    data(png(4097,1)),data(png(3000,3000)),data(png(1,1,262144)),data(bytes).replace(/=$/,'')];
  for(const value of bad){const svg=buildNativeCatalogCards(hero(1),{assetResolver:{imageForGeneral:()=>value}})[0].svg;assert.doesNotMatch(svg,/<image\b/);assert.match(svg,/头像暂未缓存/);}
  const thrown=buildNativeCatalogCards(skins(1),{assetResolver:{imageForSkin(){throw Error('synthetic-private-error');}}})[0].svg;
  assert.match(thrown,/原画暂未缓存/);assert.doesNotMatch(thrown,/synthetic-private-error/);
});

test('aggregate image bytes and pixels remain within shared renderer limits',()=>{
  const bytes=png(1,1,130000),result=buildNativeCatalogCards(hero(),{assetResolver:{imageForGeneral:()=>data(bytes)}})[0];
  const urls=[...result.svg.matchAll(/href="data:image\/png;base64,([^"]+)"/g)];
  assert.equal(urls.length,16);assert(urls.length*bytes.length<=2*1024*1024);assert(Buffer.byteLength(result.svg)<=4*1024*1024);
  const large=buildNativeCatalogCards(hero(),{assetResolver:{imageForGeneral:()=>data(png(2000,2000))}})[0];
  assert.equal((large.svg.match(/<image\b/g)||[]).length,3);assert.match(large.svg,/头像暂未缓存/);
});

test('catalog SVG geometry and assets pass the production validator and decode to one real JPEG in RAM',async()=>{
  const portrait=await sharp({create:{width:32,height:48,channels:3,background:{r:70,g:160,b:150}}}).png().toBuffer();
  const artwork=await sharp({create:{width:200,height:120,channels:3,background:{r:120,g:160,b:70}}}).jpeg().toBuffer();
  for(const input of [hero(1),skins(1),hero(0),skins(0,{notice:'绘影堂未收录该将，不代表游戏中没有对应皮肤。',general:'合成将'})]){
    const cards=buildNativeCatalogCards(input,{assetResolver:{imageForGeneral:()=>data(portrait),imageForSkin:()=>data(artwork,'jpeg')}}),card=cards[0];
    if(input.items.length)assert.match(card.svg,/<image\b/);
    if(input.kind==='skinCatalog'&&input.items.length){
      assert.match(card.svg,/<image\b[^>]*\bheight="180"/);
      assert(labels(card.svg).includes(input.items[0].name));
      assert(labels(card.svg).includes(input.items[0].generalName));
    }
    // The older local renderer only accepts private cards. Its SVG validator is
    // shared in shape with AI-Plugin; copying the flag does not change the SVG.
    const render=createNativeCardRenderer({loadSharp:()=>sharp});
    const jpeg=await render({...card,private:true}),meta=await sharp(jpeg).metadata();
    assert.equal(meta.format,'jpeg');assert.equal(meta.width,1080);assert.equal(meta.height,card.height);assert.equal(card.private,false);
    if(input.notice)assert(labels(card.svg).includes(input.notice));
  }
});
