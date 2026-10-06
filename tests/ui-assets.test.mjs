import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ASSET_ITEMS,PERSONAL_IMAGE_FIELDS,createAssetResolver} from '../lib/ui-assets.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const iconUrl='https://imagexh.sanguosha.com/sgxh-h5/dj1.png';
const generalUrl='https://www.sanguosha.cn/storage/uploads/images/pic_index/1.png';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X1cAAAAASUVORK5CYII=','base64');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-ui-')),directory=path.join(root,'resources/ui/assets');fs.mkdirSync(directory,{recursive:true});
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry=(file,url,category,extra={})=>({file,url,category,kind:'official-artwork',sha256:crypto.createHash('sha256').update(png).digest('hex'),bytes:png.length,...extra});
  const entries=[entry('yb.png',iconUrl,'item',{key:'yb'}),entry('general-1.png',generalUrl,'general',{id:1,name:'刘备'})];
  for(const row of entries)fs.writeFileSync(path.join(directory,row.file),png);
  const save=()=>fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({schema:1,entries}));save();
  return{root,directory,entries,save};
}

test('十一种道具独立本地图片，官方素材与原创示意图、截图字段证据明确分开',()=>{
  const resolver=createAssetResolver(root);
  assert.equal(resolver.items.length,11);
  for(const item of resolver.items){const url=resolver.imageForItem(item.key);assert(url?.startsWith('file:'));assert(fs.statSync(fileURLToPath(url)).isFile());}
  assert.equal(new Set(resolver.items.map(row=>resolver.imageForItem(row.key))).size,11);
  for(const key of['yb','jh','yl','zml','ylj','ssbz'])assert.equal(ASSET_ITEMS.find(row=>row.key===key).iconKind,'official-artwork');
  assert.equal(ASSET_ITEMS.find(row=>row.key==='hld').fieldVerified,true);
  for(const key of['dianj','shouq','xiny','yinb']){const row=ASSET_ITEMS.find(row=>row.key===key);assert.equal(row.fieldVerified,false);assert.equal(row.sourceUrl,null);assert.equal(row.fieldEvidence,'user-screenshot-correspondence');}
  assert.equal(resolver.imageForItem('__proto__'),null);
});

test('武将按公开目录名字、目录编号或精确官方URL解析；未知个人头像和任意URL均不读取',t=>{
  const{root}=fixture(t),resolver=createAssetResolver(root);
  const expected=resolver.imageForGeneral('刘备');assert(expected?.startsWith('file:'));
  assert.equal(resolver.imageForGeneral(1),expected);assert.equal(resolver.imageForGeneral(generalUrl),expected);
  assert.equal(resolver.imageForOfficialStatic(generalUrl),expected);assert.equal(resolver.imageForOfficialStatic(iconUrl),resolver.imageForItem('yb'));
  assert.equal(resolver.imageForOfficialStatic('https://imagexh.sanguosha.com/user-upload/synthetic-avatar.png'),null);
  for(const value of['曹操','http://www.sanguosha.cn/storage/uploads/images/pic_index/1.png',generalUrl+'?token=synthetic',generalUrl+'#private','https://www.sanguosha.cn@evil.invalid/a.png','https://imagexh.sanguosha.com/user-upload/synthetic-avatar.png','https://127.0.0.1/a.png','file:///etc/passwd','data:image/png;base64,a','../config/local.json',{},null])assert.equal(resolver.imageForGeneral(value),null);
});

test('同名不同图的目录条目不会任意挑选一种武将',t=>{
  const{root,directory,entries,save}=fixture(t);fs.writeFileSync(path.join(directory,'general-2.png'),png);
  entries.push({...entries[1],id:2,file:'general-2.png',url:'https://www.sanguosha.cn/storage/uploads/images/pic_index/2.png'});save();
  assert.equal(createAssetResolver(root).imageForGeneral('刘备'),null);
});

test('hash变化、目录逃逸、非图片及不安全manifest来源都返回空而不回退网络',t=>{
  const{root,directory,entries,save}=fixture(t);
  const resolver=createAssetResolver(root);fs.writeFileSync(path.join(directory,'yb.png'),Buffer.alloc(png.length));assert.equal(resolver.imageForItem('yb'),null);
  entries[0]={...entries[0],file:'../../secret.png'};save();assert.equal(createAssetResolver(root).imageForItem('yb'),null);
  entries[0]={...entries[1],category:'item',key:'yb',url:generalUrl+'?secret=synthetic'};save();assert.equal(createAssetResolver(root).imageForItem('yb'),null);
});

test('资源目录被junction替换时拒绝解析，外部目标不变',t=>{
  const{root,directory}=fixture(t);const elsewhere=path.join(root,'external');fs.mkdirSync(elsewhere);fs.renameSync(directory,directory+'-original');
  fs.symlinkSync(elsewhere,directory,process.platform==='win32'?'junction':'dir');
  assert.equal(createAssetResolver(root).imageForItem('yb'),null);assert.deepEqual(fs.readdirSync(elsewhere),[]);
});

test('已加载resolver仍拒绝后来被替换的硬链接图片',t=>{
  const{root,directory}=fixture(t),resolver=createAssetResolver(root),original=path.join(directory,'yb.png');
  fs.linkSync(original,path.join(root,'linked.png'));assert.equal(resolver.imageForItem('yb'),null);
});

test('原创SVG也拒绝外部引用和脚本，即使manifest哈希匹配',t=>{
  const{root,directory,entries,save}=fixture(t);
  for(const svg of['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/private"/></svg>']){
    const bytes=Buffer.from(svg);fs.writeFileSync(path.join(directory,'hld.svg'),bytes);
    entries.push({key:'hld',category:'item',kind:'original-vector-placeholder',url:null,file:'hld.svg',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});save();
    assert.equal(createAssetResolver(root).imageForItem('hld'),null);entries.pop();
  }
});

test('打包公开素材全部大小、哈希与类型通过resolver核验；没有每场MVP猜测',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'resources/ui/assets/manifest.json'),'utf8')),resolver=createAssetResolver(root);
  assert(manifest.entries.filter(row=>row.category==='general').length>=500);
  for(const entry of manifest.entries){
    assert(entry.bytes<=262144);
    const value=entry.category==='general'?resolver.imageForGeneral(entry.url):entry.category==='item'?resolver.imageForItem(entry.key):resolver.imageForDecoration(entry.key);
    assert(value,entry.file);
  }
  assert.equal(PERSONAL_IMAGE_FIELDS.recent.mvpVerified,false);assert.equal(PERSONAL_IMAGE_FIELDS.gameInfo.totalMvp,'totalMvp');assert.equal(PERSONAL_IMAGE_FIELDS.gameInfo.badges,'lights');
});
