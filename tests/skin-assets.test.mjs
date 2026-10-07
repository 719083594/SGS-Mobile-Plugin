import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {createSkinAssetResolver,isPublicSkinArtwork,SKIN_ASSET_SOURCE,SKIN_ASSET_API,SKIN_THUMBNAIL_WIDTH,SKIN_THUMBNAIL_HEIGHT} from '../lib/skin-assets.mjs';
import {downloadPublicSkin,prepareSkinThumbnail,collectSkinCatalog,buildSkinAssets} from '../scripts/build-skin-assets.mjs';

const source='https://sjwx-oss.sanguosha.cn/skins/image/skins6a27ddc4153d320260609.jpg';
const other='https://sjwx-oss.sanguosha.cn/skins/image/skins6972d8507b5e220260123.jpg';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const jpeg=await sharp({create:{width:SKIN_THUMBNAIL_WIDTH,height:SKIN_THUMBNAIL_HEIGHT,channels:3,background:'#a98454'}}).jpeg({progressive:false}).toBuffer();
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-skin-assets-')),directory=path.join(root,'resources/skin-gallery');
  fs.mkdirSync(directory,{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry={id:171,name:'合成皮肤',general:'合成武将',type:'传说',file:'skin-171.jpg',sourceUrl:source,sha256:digest(jpeg),bytes:jpeg.length,width:SKIN_THUMBNAIL_WIDTH,height:SKIN_THUMBNAIL_HEIGHT};
  const manifest={schema:1,source:SKIN_ASSET_SOURCE,api:SKIN_ASSET_API,requestedCount:1,preparedCount:1,skippedIds:[],entries:[entry]};
  const file=path.join(directory,entry.file),manifestFile=path.join(directory,'manifest.json');
  const save=()=>fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.writeFileSync(file,jpeg);save();
  return {root,directory,file,manifestFile,manifest,entry,save};
}

test('public skin reader returns exact JPEG data for an approved ID and source without network or writes',t=>{
  const f=fixture(t),before=fs.readdirSync(f.directory).sort();
  t.mock.method(globalThis,'fetch',()=>assert.fail('Reader must remain offline'));
  const resolver=createSkinAssetResolver(f.root),expected='data:image/jpeg;base64,'+jpeg.toString('base64');
  assert.equal(resolver.imageForSkin(171,source),expected);assert.equal(resolver.imageForSkin('171',source),expected);assert.equal(resolver.imageForSkin(171),expected);
  assert.equal(createSkinAssetResolver({root:f.root}).imageForSkin(171,source),expected);
  assert(Object.isFrozen(resolver));assert.deepEqual(fs.readdirSync(f.directory).sort(),before);
});

test('artwork sources have one exact public host and path; IDs and source identity are strict',t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root);
  for(const id of [0,-1,171.5,'0171','171.0',' 171','171 ','../171',{},null,9999999999])assert.equal(resolver.imageForSkin(id),null);
  for(const url of [other,source+'?token=x',source+'#x',source.replace('/skins/image/','/private/'),source.replace('https:','http:'),source.replace('sjwx-oss.sanguosha.cn','sjwx-oss.sanguosha.cn.evil.invalid'),source.replace('https://','https://name@'),source.replace('.jpg','.svg'),source.replace('skins6','skins%36'),'file:///etc/passwd','data:image/jpeg;base64,AA==',null,{}])assert.equal(resolver.imageForSkin(171,url),null);
  assert.equal(resolver.imageForSkin(172,source),null);assert(isPublicSkinArtwork(source));assert(!isPublicSkinArtwork(source+' '));
});

test('changed image, hash, source, filename, duplicate ID and missing files fail closed after a valid read',t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root);assert(resolver.imageForSkin(171,source));
  fs.writeFileSync(f.file,Buffer.alloc(jpeg.length));assert.equal(resolver.imageForSkin(171,source),null);fs.writeFileSync(f.file,jpeg);
  f.entry.sha256='0'.repeat(64);f.save();assert.equal(resolver.imageForSkin(171,source),null);f.entry.sha256=digest(jpeg);
  f.entry.sourceUrl=other;f.save();assert.equal(resolver.imageForSkin(171,source),null);f.entry.sourceUrl=source;
  f.entry.file='../private.jpg';f.save();assert.equal(resolver.imageForSkin(171),null);f.entry.file='skin-171.jpg';
  f.manifest.entries.push({...f.entry});f.manifest.requestedCount=2;f.manifest.preparedCount=2;f.save();assert.equal(resolver.imageForSkin(171),null);
  f.manifest.entries.pop();f.manifest.requestedCount=1;f.manifest.preparedCount=1;f.save();assert(resolver.imageForSkin(171,source));
  fs.unlinkSync(f.file);assert.equal(resolver.imageForSkin(171),null);
});

test('manifest provenance, dimensions, shape, UTF-8 and bounds are validated',t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root),original=JSON.stringify(f.manifest);
  for(const mutate of [m=>m.source='https://evil.invalid/',m=>m.api='https://share.sanguosha.cn/api/anything',m=>m.entries[0].width=SKIN_THUMBNAIL_WIDTH+1,m=>m.entries[0].height=SKIN_THUMBNAIL_HEIGHT+1,m=>m.entries[0].type='猜测品质',m=>m.entries[0].bytes=256*1024+1,m=>m.entries[0].name='bad\0name',m=>m.entries[0].general='',m=>m.entries[0].secret='synthetic',m=>m.preparedCount=2,m=>m.skippedIds=[171],m=>m.requestedCount=-1]){
    const value=JSON.parse(original);mutate(value);fs.writeFileSync(f.manifestFile,JSON.stringify(value));assert.equal(resolver.imageForSkin(171),null);
  }
  fs.writeFileSync(f.manifestFile,Buffer.from([0xff]));assert.equal(resolver.imageForSkin(171),null);
  fs.writeFileSync(f.manifestFile,Buffer.alloc(768*1024+1,32));assert.equal(resolver.imageForSkin(171),null);
  f.save();assert(resolver.imageForSkin(171,source));
});

test('SVG, PNG, truncated JPEG, trailing data and wrong dimensions cannot masquerade as a public thumbnail',async t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root),wrongSize=await sharp({create:{width:SKIN_THUMBNAIL_WIDTH+1,height:SKIN_THUMBNAIL_HEIGHT,channels:3,background:'white'}}).jpeg().toBuffer();
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),await sharp(jpeg).png().toBuffer(),jpeg.subarray(0,jpeg.length-2),Buffer.concat([jpeg,Buffer.from('extra')]),wrongSize,Buffer.from([255,216,255,217])]){
    fs.writeFileSync(f.file,bytes);f.entry.bytes=bytes.length;f.entry.sha256=digest(bytes);f.save();assert.equal(resolver.imageForSkin(171),null);
  }
});

test('hard linked image or manifest and a symlinked ancestor are rejected',t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root),link=path.join(f.root,'linked.jpg');assert(resolver.imageForSkin(171));
  fs.linkSync(f.file,link);assert.equal(resolver.imageForSkin(171),null);fs.unlinkSync(link);
  fs.linkSync(f.manifestFile,link);assert.equal(resolver.imageForSkin(171),null);fs.unlinkSync(link);assert(resolver.imageForSkin(171));
  fs.renameSync(f.directory,f.directory+'-original');fs.symlinkSync(f.directory+'-original',f.directory,process.platform==='win32'?'junction':'dir');assert.equal(resolver.imageForSkin(171),null);
});

test('a leaf symlink is rejected even where Windows denies creating a real file symlink',t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root),original=fs.lstatSync;
  t.mock.method(fs,'lstatSync',function(file,options){const stat=original.call(fs,file,options);if(file===f.file&&options?.bigint)return Object.assign(Object.create(stat),{isSymbolicLink:()=>true});return stat;});
  assert.equal(resolver.imageForSkin(171),null);
});

test('changed descriptor identity or file changed during read is rejected',t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root),originalRead=fs.readSync;let changed=false;
  t.mock.method(fs,'readSync',function(fd,buffer,...args){const count=originalRead.call(fs,fd,buffer,...args);if(!changed&&buffer.length===jpeg.length){changed=true;fs.writeFileSync(f.file,Buffer.alloc(jpeg.length));fs.utimesSync(f.file,new Date(0),new Date('2030-01-01T00:00:00Z'));}return count;});
  assert.equal(resolver.imageForSkin(171),null);assert(changed);t.mock.restoreAll();fs.writeFileSync(f.file,jpeg);
  const originalStat=fs.fstatSync;
  t.mock.method(fs,'fstatSync',function(fd,options){const stat=originalStat.call(fs,fd,options);return Object.assign(Object.create(stat),{ino:stat.ino+1n});});
  assert.equal(resolver.imageForSkin(171),null);
});

test('older Windows dev sentinel tolerates only cross-API unavailable dev and retains all other checks',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t),resolver=createSkinAssetResolver(f.root),original=fs.lstatSync;
  t.mock.method(fs,'lstatSync',function(file,options){const stat=original.call(fs,file,options);return options?.bigint?Object.assign(Object.create(stat),{dev:0n}):stat;});
  assert(resolver.imageForSkin(171,source));t.mock.restoreAll();
  t.mock.method(fs,'lstatSync',function(file,options){const stat=original.call(fs,file,options);return options?.bigint?Object.assign(Object.create(stat),{dev:stat.dev===0n?1n:stat.dev+1n}):stat;});
  assert.equal(resolver.imageForSkin(171,source),null);
});

test('public image downloader has fixed URLs, no redirects and bounded static raster responses',async()=>{
  let calls=0;
  const fetchImpl=async(url,init)=>{calls++;assert.equal(url,source);assert.equal(init.redirect,'error');assert.equal(init.method,'GET');assert(init.signal instanceof AbortSignal);return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});};
  assert.deepEqual(await downloadPublicSkin(source,{fetchImpl}),jpeg);
  const png=await sharp(jpeg).png().toBuffer();assert.deepEqual(await downloadPublicSkin(source,{fetchImpl:async()=>new Response(png,{headers:{'content-type':'image/jpeg'}})}),png);
  await assert.rejects(downloadPublicSkin(source+'?token=x',{fetchImpl}));assert.equal(calls,1);
  for(const response of [new Response('redirect',{status:302,headers:{location:other}}),new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}),new Response(jpeg,{headers:{'content-type':'image/jpeg','content-length':String(16*1024*1024+1)}}),new Response('bad',{headers:{'content-type':'image/jpeg'}})])await assert.rejects(downloadPublicSkin(source,{fetchImpl:async()=>response}));
});

test('thumbnail builder fully decodes bounded JPEG or static PNG and preserves source composition in 200x120',async()=>{
  const original=await sharp({create:{width:120,height:200,channels:3,background:'#bd4835'}}).jpeg().toBuffer(),bytes=await prepareSkinThumbnail(original,sharp),meta=await sharp(bytes).metadata();
  assert.equal(meta.format,'jpeg');assert.equal(meta.width,SKIN_THUMBNAIL_WIDTH);assert.equal(meta.height,SKIN_THUMBNAIL_HEIGHT);assert(bytes.length<=256*1024);await sharp(bytes).raw().toBuffer();
  const png=await sharp(jpeg).png().toBuffer(),pngThumb=await prepareSkinThumbnail(png,sharp);assert.equal((await sharp(pngThumb).metadata()).format,'jpeg');
  const animated=Buffer.from(png);animated.write('acTL',12,'ascii');
  for(const invalid of [Buffer.from('<svg/>'),await sharp(jpeg).gif().toBuffer(),animated,jpeg.subarray(0,40),Buffer.alloc(16*1024*1024+1)])await assert.rejects(prepareSkinThumbnail(invalid,sharp));
});

test('catalog collection requires complete, stable, uniquely paginated public rows',async()=>{
  const row=id=>({id,name:'合成皮肤'+id,generalName:'合成武将',type:'传说',image:source});
  assert.equal((await collectSkinCatalog({skinCatalog:async({page})=>({items:[row(page)],page,pages:2,total:2})})).length,2);
  for(const client of [
    {skinCatalog:async({page})=>({items:[row(1)],page,pages:2,total:2})},
    {skinCatalog:async({page})=>({items:page===1?[row(1)]:[],page,pages:2,total:2})},
    {skinCatalog:async({page})=>({items:[row(page)],page,pages:page===1?2:3,total:2})},
    {skinCatalog:async({page})=>({items:[{...row(1),image:'https://evil.invalid/image.jpg'}],page,pages:1,total:1})},
    {skinCatalog:async({page})=>({items:[row(1)],page,pages:101,total:2001})}
  ])await assert.rejects(collectSkinCatalog(client));
});

test('explicit offline build uses at most two downloads and records skips without assigning wrong artwork',async t=>{
  const f=fixture(t),rows=[171,172,173,174].map(id=>({id,name:'合成皮肤'+id,generalName:'合成武将',type:'传说',image:id===174?other:source}));
  let active=0,peak=0;const fetchImpl=async url=>{active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,3));return new Response(url===other?'bad':jpeg,{headers:{'content-type':'image/jpeg'}});}finally{active--;}};
  const summary=await buildSkinAssets({root:f.root,client:{skinCatalog:async()=>({items:rows,page:1,pages:1,total:rows.length})},sharp,fetchImpl});
  assert.equal(summary.requested,4);assert.equal(summary.prepared,3);assert.equal(summary.skipped,1);assert.equal(peak,2);assert.equal(summary.privateDataUsed,false);
  const manifest=JSON.parse(fs.readFileSync(f.manifestFile,'utf8'));assert.deepEqual(manifest.skippedIds,[174]);assert.equal(manifest.entries.length,3);
  const resolver=createSkinAssetResolver(f.root);for(const id of [171,172,173])assert(resolver.imageForSkin(id,source));assert.equal(resolver.imageForSkin(174,other),null);
});

test('explicit reuse keeps only hash-verified same-ID and same-source thumbnails and redownloads changed sources',async t=>{
  const f=fixture(t);let calls=0;
  const build=image=>buildSkinAssets({root:f.root,reuseApproved:true,client:{skinCatalog:async()=>({items:[{id:171,name:'合成皮肤',generalName:'合成武将',type:'传说',image}],page:1,pages:1,total:1})},sharp,fetchImpl:async()=>{calls++;return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});}});
  assert.equal((await build(source)).reused,1);assert.equal(calls,0);
  assert.equal((await build(other)).reused,0);assert.equal(calls,1);assert(createSkinAssetResolver(f.root).imageForSkin(171,other));
  fs.writeFileSync(f.file,Buffer.alloc(jpeg.length));assert.equal((await build(other)).reused,0);assert.equal(calls,2);
});

test('all bundled public skin thumbnails match manifest hashes and fully decode',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),file=path.join(root,'resources/skin-gallery/manifest.json');
  if(!fs.existsSync(file))assert.fail('Run the explicit public skin-assets builder before committing the bundle');
  const manifest=JSON.parse(fs.readFileSync(file,'utf8')),resolver=createSkinAssetResolver(root);
  assert(manifest.entries.length>0);assert.equal(manifest.preparedCount,manifest.entries.length);assert.equal(manifest.requestedCount,manifest.entries.length+manifest.skippedIds.length);
  for(const row of manifest.entries){
    const encoded=resolver.imageForSkin(row.id,row.sourceUrl);assert(encoded,'public skin '+row.id);const bytes=Buffer.from(encoded.split(',')[1],'base64');
    assert.equal(digest(bytes),row.sha256);const {info}=await sharp(bytes,{failOn:'warning'}).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,SKIN_THUMBNAIL_WIDTH);assert.equal(info.height,SKIN_THUMBNAIL_HEIGHT);
  }
});
