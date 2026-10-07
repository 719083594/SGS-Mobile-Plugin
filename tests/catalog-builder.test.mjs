import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {createReplyCardBuilder} from '../lib/reply-cards.mjs';
import {createSharedNativeCardRenderer} from '../lib/shared-renderer.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assetManifest=JSON.parse(fs.readFileSync(new URL('../resources/ui/assets/manifest.json',import.meta.url),'utf8'));
const galleryManifest=()=>JSON.parse(fs.readFileSync(new URL('../resources/skin-gallery/manifest.json',import.meta.url),'utf8'));
function fixtures(){
 const heroes=assetManifest.entries.filter(row=>row.category==='general'&&row.kind==='official-artwork').slice(0,24);
 assert.equal(heroes.length,24);
 const skins=galleryManifest().entries.slice(0,12);assert.equal(skins.length,12);
 return [
  {kind:'heroCatalog',title:'合成武将目录',coverage:'official-web-catalog',faction:'吴',sourceUrl:'https://www.sanguosha.cn/pc/hero-list.html',total:25,page:1,pages:2,pageSize:24,items:heroes.map((row,index)=>({id:index+1,name:row.name,faction:'吴'}))},
  {kind:'skinCatalog',title:'官方公开素材测试',coverage:'official-skin-gallery',general:'',type:'全部',notice:'仅含官网皮肤绘影堂公开展示，非游戏全部皮肤。',sourceUrl:'https://share.sanguosha.cn/skins/',total:13,page:1,pages:2,pageSize:12,items:skins.map(row=>({id:row.id,name:row.name,generalName:row.general,type:row.type,grade:row.type,image:row.sourceUrl}))}
 ];
}

test('生产目录builder使用真实离线头像和12张皮肤，生成单张可解码JPEG',async()=>{
 const build=createReplyCardBuilder({root});
 for(const result of fixtures()){
  const cards=await build({type:'public',private:false,result,params:{command:result.kind==='heroCatalog'?'武将列表':'皮肤图鉴'}});
  assert.equal(cards.length,1);const card=cards[0];assert.equal(card.private,false);
  assert.equal((card.svg.match(/<image /g)||[]).length,result.items.length);
  assert.doesNotMatch(card.svg,/暂未缓存|href="(?:https?:|file:)/);
  assert.match(card.svg,/下一页/);
  const image=await sharp(Buffer.from(card.svg),{limitInputPixels:12000000}).jpeg({progressive:false}).toBuffer(),meta=await sharp(image).metadata();
  assert.equal(meta.format,'jpeg');assert.equal(meta.width,1080);assert.equal(meta.height,card.height);
  assert.equal((await sharp(image).raw().toBuffer()).length,meta.width*meta.height*3);
 }
});

test('目录生产builder与AI共享服务实际协议兼容，不启动浏览器',async t=>{
 if(!fs.existsSync(new URL('../../AI-Plugin/src/rendering/index.mjs',import.meta.url))){t.skip('独立仓库由宿主执行共享渲染集成验证');return;}
 const build=createReplyCardBuilder({root}),render=createSharedNativeCardRenderer();
 for(const result of fixtures()){
  const [card]=await build({type:'public',result});
  const image=await render(card);assert.equal((await sharp(image).metadata()).height,card.height);
 }
});
