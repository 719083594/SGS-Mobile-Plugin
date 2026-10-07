import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createAssetResolver} from '../lib/ui-assets.mjs';
import {createNativePortraitResolver,createNativeStaticResolver} from '../lib/native-assets.mjs';
import {buildNativeRecordCards} from '../lib/native-records.mjs';

function chunk(type,data){
  const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
  for(const value of body){crc^=value;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}
  const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([size,body,sum]);
}
const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,170,120,50,255]))),chunk('IEND',Buffer.alloc(0))]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-native-assets-')),directory=path.join(root,'resources/ui/assets');
  fs.mkdirSync(directory,{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(directory,'general-1.png'),manifest=path.join(directory,'manifest.json');
  const entry={kind:'official-artwork',category:'general',name:'刘备',id:1,url:'https://www.sanguosha.cn/storage/uploads/images/pic_index/1.png',file:path.basename(file),bytes:png.length,sha256:digest(png)};
  fs.writeFileSync(file,png);
  const entries=[entry],save=()=>fs.writeFileSync(manifest,JSON.stringify({schema:1,entries}));save();
  return {root,directory,file,manifest,entry,entries,save};
}

test('public exact name resolves to canonical PNG data without a network or account dependency',t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Public asset reader must never use a network'));
  const f=fixture(t),base=createAssetResolver(f.root),resolver=createNativePortraitResolver({root:f.root,assetResolver:base});
  const expected='data:image/png;base64,'+png.toString('base64');
  assert.equal(resolver.imageForGeneral('刘备'),expected);assert.equal(resolver.imageForGeneral(' 刘备 '),expected);
  assert.equal(Buffer.from(expected.split(',')[1],'base64').toString('base64'),expected.split(',')[1]);
  assert(Object.isFrozen(resolver));assert.deepEqual(fs.readdirSync(f.directory).sort(),['general-1.png','manifest.json']);
  assert.equal(createNativePortraitResolver({root:f.root}).imageForGeneral('刘备'),expected);
});

test('unknown names, game IDs, URLs and private paths do not become public catalog names',t=>{
  const f=fixture(t),resolver=createNativePortraitResolver({root:f.root});
  for(const name of ['曹操','1',1,null,{},'../private.png','C:\\private.png','https://sjpubicres.sanguosha.cn/release/character_heads/private.png','file:///etc/passwd','data:image/png;base64,AA==','刘备\0','A'.repeat(101)])assert.equal(resolver.imageForGeneral(name),null);
});

test('five bundled variant aliases and their canonical public names produce identical RAM portraits',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),resolver=createNativePortraitResolver({root});
  for(const canonical of ['界·徐盛','势·邓艾','势·周瑜','势·魏延','势·辛宪英']){
    const expected=resolver.imageForGeneral(canonical);assert(expected,canonical);
    assert.equal(resolver.imageForGeneral(canonical.replaceAll('·','')),expected);
  }
});

test('native alias revalidation keeps variant prefixes and exact-name priority, and rejects changed manifest ambiguity',t=>{
  const f=fixture(t);f.entry.name='界·徐盛';f.save();const resolver=createNativePortraitResolver({root:f.root}),expected=resolver.imageForGeneral('界·徐盛');assert(expected);assert.equal(resolver.imageForGeneral('界徐盛'),expected);
  for(const name of ['徐盛','势徐盛','神徐盛','界 徐盛','界・徐盛','界-徐盛','界。徐盛'])assert.equal(resolver.imageForGeneral(name),null);
  fs.writeFileSync(path.join(f.directory,'general-2.png'),png);
  f.entries.push({...f.entry,id:2,name:'界徐·盛',file:'general-2.png',url:'https://www.sanguosha.cn/storage/uploads/images/pic_index/2.png'});f.save();
  assert.equal(resolver.imageForGeneral('界徐盛'),null);assert.equal(resolver.imageForGeneral('界·徐盛'),expected);
  f.entries[1].name='界徐盛';f.save();const exact=createNativePortraitResolver({root:f.root});assert.equal(exact.imageForGeneral('界徐盛'),expected);assert.equal(exact.imageForGeneral('界·徐盛'),expected);
  f.entries[1]={...f.entry,name:'界徐·盛'};f.save();assert.equal(createNativePortraitResolver({root:f.root}).imageForGeneral('界徐盛'),expected);
  f.entries[1].sha256='0'.repeat(64);f.save();assert.equal(resolver.imageForGeneral('界徐盛'),null);
});

test('injected resolver cannot escape the direct fixed directory or bypass canonical URL checks',t=>{
  const f=fixture(t),good=pathToFileURL(f.file).href;
  const urls=[null,{},'https://evil.invalid/a.png',good+'?token=synthetic',good+'#fragment',good.replace('general-1','general%2D1'),pathToFileURL(path.join(f.root,'private.png')).href,pathToFileURL(path.join(f.directory,'nested','general-1.png')).href,'file://evil.invalid/private.png','data:image/png;base64,'+png.toString('base64')];
  for(const url of urls){const resolver=createNativePortraitResolver({root:f.root,assetResolver:{imageForGeneral:()=>url}});assert.equal(resolver.imageForGeneral('刘备'),null);}
  assert.equal(createNativePortraitResolver({root:f.root,assetResolver:{imageForGeneral(){throw new Error('synthetic private value');}}}).imageForGeneral('刘备'),null);
});

test('modified or missing portrait and manifest fail closed, even with a previously valid resolver',t=>{
  const f=fixture(t),resolver=createNativePortraitResolver({root:f.root});
  assert(resolver.imageForGeneral('刘备'));fs.writeFileSync(f.file,Buffer.alloc(png.length));assert.equal(resolver.imageForGeneral('刘备'),null);
  fs.writeFileSync(f.file,png);assert(resolver.imageForGeneral('刘备'));fs.writeFileSync(f.manifest,'{}');assert.equal(resolver.imageForGeneral('刘备'),null);
  f.save();assert(resolver.imageForGeneral('刘备'));fs.unlinkSync(f.file);assert.equal(resolver.imageForGeneral('刘备'),null);
});

test('oversized image, changed hashes, SVG and extension-mismatched magic cannot be embedded',t=>{
  const f=fixture(t);
  for(const bytes of [Buffer.alloc(256*1024+1),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid"/></svg>'),Buffer.from([255,216,255,217])]){
    fs.writeFileSync(f.file,bytes);f.entry.bytes=bytes.length;f.entry.sha256=digest(bytes);f.save();
    assert.equal(createNativePortraitResolver({root:f.root}).imageForGeneral('刘备'),null);
  }
  fs.writeFileSync(f.file,png);f.entry.bytes=png.length;f.entry.sha256='0'.repeat(64);f.save();
  assert.equal(createNativePortraitResolver({root:f.root}).imageForGeneral('刘备'),null);
});

test('hard links and a symlinked parent are rejected after prior successful reads',t=>{
  const f=fixture(t),resolver=createNativePortraitResolver({root:f.root});assert(resolver.imageForGeneral('刘备'));
  const link=path.join(f.root,'shared.png');fs.linkSync(f.file,link);assert.equal(resolver.imageForGeneral('刘备'),null);fs.unlinkSync(link);
  assert(resolver.imageForGeneral('刘备'));fs.renameSync(f.directory,f.directory+'-original');
  fs.symlinkSync(f.directory+'-original',f.directory,process.platform==='win32'?'junction':'dir');
  assert.equal(resolver.imageForGeneral('刘备'),null);
});

test('leaf symlinks are rejected without reading their targets',t=>{
  const f=fixture(t),resolver=createNativePortraitResolver({root:f.root}),target=path.join(f.root,'target.png');
  fs.renameSync(f.file,target);
  try{fs.symlinkSync(target,f.file,'file');}catch(error){
    if(!['EPERM','EACCES'].includes(error.code))throw error;
    // Windows may deny creating file symlinks. The real directory junction is
    // exercised above; here simulate the precise native leaf lstat boundary.
    t.diagnostic('File symlink creation denied; native leaf guard checked with a simulated lstat.');
    fs.renameSync(target,f.file);const original=fs.lstatSync;
    t.mock.method(fs,'lstatSync',function(file,options){const stat=original.call(fs,file,options);if(file===f.file&&options?.bigint)return Object.assign(Object.create(stat),{isSymbolicLink:()=>true});return stat;});
    assert.equal(resolver.imageForGeneral('刘备'),null);assert.deepEqual(fs.readFileSync(f.file),png);return;
  }
  assert.equal(resolver.imageForGeneral('刘备'),null);assert.deepEqual(fs.readFileSync(target),png);
});

test('a file changed during bounded reading is rejected by the before/after identity check',t=>{
  const f=fixture(t),resolver=createNativePortraitResolver({root:f.root});
  const original=fs.readSync;let changed=false;
  t.mock.method(fs,'readSync',function(fd,buffer,...args){
    const count=original.call(fs,fd,buffer,...args);
    if(!changed&&buffer.length===png.length+1){changed=true;fs.writeFileSync(f.file,Buffer.alloc(png.length));fs.utimesSync(f.file,new Date(0),new Date('2030-01-01T00:00:00Z'));}
    return count;
  });
  assert.equal(resolver.imageForGeneral('刘备'),null);assert.equal(changed,true);
});

test('bundled public JPEG portraits remain canonical and respect the per-image bound',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'resources/ui/assets/manifest.json'),'utf8'));
  const entry=manifest.entries.find(row=>row.category==='general'&&/\.jpe?g$/.test(row.file));assert(entry);
  const value=createNativePortraitResolver({root}).imageForGeneral(entry.name);assert(value?.startsWith('data:image/jpeg;base64,'));
  const encoded=value.split(',')[1],bytes=Buffer.from(encoded,'base64');
  assert.equal(bytes.length,entry.bytes);assert(bytes.length<=256*1024);assert.equal(digest(bytes),entry.sha256);assert.equal(bytes.toString('base64'),encoded);
});

test('native public portrait reader interoperates with strict SVG image validation',t=>{
  const f=fixture(t),{imageForGeneral}=createNativePortraitResolver({root:f.root});
  const cards=buildNativeRecordCards({kind:'records',protocol:'app-qr-v1',data:{recent:[{name:'刘备'}]}},{imageForGeneral,dataAlreadyRedacted:true});
  assert.equal(cards.length,1);assert.equal(cards[0].private,true);
  assert.match(cards[0].svg,/<image\b/);assert(cards[0].svg.includes(imageForGeneral('刘备')));
  assert.doesNotMatch(cards[0].svg,/href="(?:file:|https?:)/);
});

test('static adapter accepts only exact approved raster URLs and their canonical bundled file URLs',t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Static native assets must never use a network'));
  const f=fixture(t),resolver=createNativeStaticResolver({root:f.root}),file=pathToFileURL(f.file).href,expected='data:image/png;base64,'+png.toString('base64');
  for(const value of [f.entry.url,file]){
    assert.equal(resolver.imageForGeneral(value),expected);
    assert.equal(resolver.imageForOfficialStatic(value),expected);
  }
  assert(Object.isFrozen(resolver));
  for(const value of ['刘备','1',1,null,{},' '+f.entry.url,f.entry.url+' ',f.entry.url+'?synthetic=1',f.entry.url+'#fragment',f.entry.url.replace('https://','https://name@'),f.entry.url.replace('/1.png','/%31.png'),'https://untrusted.invalid/1.png','https://sjpubicres.sanguosha.cn/release/character_heads/1.png',expected]){
    assert.equal(resolver.imageForGeneral(value),null);
    assert.equal(resolver.imageForOfficialStatic(value),null);
  }
  assert.equal(createNativePortraitResolver({root:f.root}).imageForGeneral(f.entry.url),null);
  assert.deepEqual(fs.readdirSync(f.directory).sort(),['general-1.png','manifest.json']);
});

test('static item and decoration artwork is separate from approved general portraits',t=>{
  const f=fixture(t),item={...f.entry,category:'item',key:'yb',url:'https://imagexh.sanguosha.com/sgxh-h5/dj1.png',file:'item-yb.png'},decoration={...f.entry,category:'decoration',key:'victory',url:'https://imagexh.sanguosha.com/war_victory.png',file:'victory.png'};
  for(const entry of [item,decoration]){fs.writeFileSync(path.join(f.directory,entry.file),png);f.entries.push(entry);}f.save();
  const resolver=createNativeStaticResolver({root:f.root});
  for(const entry of [item,decoration]){
    assert.equal(resolver.imageForOfficialStatic(entry.url),'data:image/png;base64,'+png.toString('base64'));
    assert.equal(resolver.imageForOfficialStatic(pathToFileURL(path.join(f.directory,entry.file)).href),'data:image/png;base64,'+png.toString('base64'));
    assert.equal(resolver.imageForGeneral(entry.url),null);
  }
});

test('static adapter rejects file traversal, remote files and injected resolver overrides',t=>{
  const f=fixture(t),good=pathToFileURL(f.file).href;
  const bad=[good+'?synthetic=1',good+'#fragment',good.replace('general-1','general%2D1'),pathToFileURL(path.join(f.root,'private.png')).href,pathToFileURL(path.join(f.directory,'nested','general-1.png')).href,'file://untrusted.invalid/general-1.png','file:///etc/passwd'];
  const resolver=createNativeStaticResolver({root:f.root});
  for(const value of bad){assert.equal(resolver.imageForGeneral(value),null);assert.equal(resolver.imageForOfficialStatic(value),null);}
  for(const value of [...bad,null,'data:image/png;base64,'+png.toString('base64')]){
    const injected=createNativeStaticResolver({root:f.root,assetResolver:{imageForGeneral:()=>value,imageForOfficialStatic:()=>value}});
    assert.equal(injected.imageForGeneral(f.entry.url),null);assert.equal(injected.imageForOfficialStatic(f.entry.url),null);
  }
  const throwing=createNativeStaticResolver({root:f.root,assetResolver:{imageForGeneral(){throw new Error('synthetic sensitive value');},imageForOfficialStatic(){throw new Error('synthetic sensitive value');}}});
  assert.equal(throwing.imageForGeneral(f.entry.url),null);assert.equal(throwing.imageForOfficialStatic(f.entry.url),null);
});

test('static adapter revalidates file and current manifest without trusting stale approvals',t=>{
  const f=fixture(t),resolver=createNativeStaticResolver({root:f.root});assert(resolver.imageForOfficialStatic(f.entry.url));
  fs.writeFileSync(f.file,Buffer.alloc(png.length));assert.equal(resolver.imageForOfficialStatic(f.entry.url),null);
  fs.writeFileSync(f.file,png);assert(resolver.imageForOfficialStatic(f.entry.url));
  f.entry.sha256='0'.repeat(64);f.save();assert.equal(resolver.imageForOfficialStatic(f.entry.url),null);
  f.entry.sha256=digest(png);f.save();assert(resolver.imageForOfficialStatic(f.entry.url));
  f.entry.url='https://untrusted.invalid/1.png';f.save();assert.equal(resolver.imageForOfficialStatic(f.entry.url),null);assert.equal(resolver.imageForOfficialStatic(pathToFileURL(f.file).href),null);
});

test('duplicate static URL or file mappings fail closed when artwork identity disagrees',t=>{
  const f=fixture(t),resolver=createNativeStaticResolver({root:f.root});assert(resolver.imageForOfficialStatic(f.entry.url));
  fs.writeFileSync(path.join(f.directory,'other.png'),png);f.entries.push({...f.entry,file:'other.png'});f.save();
  assert.equal(resolver.imageForOfficialStatic(f.entry.url),null);assert.equal(resolver.imageForGeneral(f.entry.url),null);
  f.entries[1]={...f.entry,url:'https://www.sanguosha.cn/storage/uploads/images/pic_index/2.png',sha256:'0'.repeat(64)};f.save();
  assert.equal(resolver.imageForOfficialStatic(pathToFileURL(f.file).href),null);
});

test('static adapter rejects hard links, changed reads and extension-mismatched image bytes',t=>{
  const f=fixture(t),resolver=createNativeStaticResolver({root:f.root}),link=path.join(f.root,'shared.png');
  fs.linkSync(f.file,link);assert.equal(resolver.imageForOfficialStatic(f.entry.url),null);fs.unlinkSync(link);
  assert(resolver.imageForOfficialStatic(f.entry.url));
  const original=fs.readSync;let changed=false;
  t.mock.method(fs,'readSync',function(fd,buffer,...args){const count=original.call(fs,fd,buffer,...args);if(!changed&&buffer.length===png.length+1){changed=true;fs.writeFileSync(f.file,Buffer.alloc(png.length));fs.utimesSync(f.file,new Date(0),new Date('2030-01-01T00:00:00Z'));}return count;});
  assert.equal(resolver.imageForOfficialStatic(f.entry.url),null);assert.equal(changed,true);t.mock.restoreAll();
  const vector=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');fs.writeFileSync(f.file,vector);f.entry.bytes=vector.length;f.entry.sha256=digest(vector);f.save();
  assert.equal(createNativeStaticResolver({root:f.root}).imageForOfficialStatic(f.entry.url),null);
});

test('static JPEG adapter preserves approved bytes as canonical bounded data images',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),manifest=JSON.parse(fs.readFileSync(path.join(root,'resources/ui/assets/manifest.json'),'utf8'));
  const entry=manifest.entries.find(row=>row.category==='general'&&/\.jpe?g$/.test(row.file));assert(entry);
  const resolver=createNativeStaticResolver({root}),value=resolver.imageForGeneral(entry.url);assert(value?.startsWith('data:image/jpeg;base64,'));
  assert.equal(value,resolver.imageForOfficialStatic(entry.url));assert.equal(value,resolver.imageForGeneral(pathToFileURL(path.join(root,'resources/ui/assets',entry.file)).href));
  const bytes=Buffer.from(value.split(',')[1],'base64');assert.equal(bytes.length,entry.bytes);assert.equal(digest(bytes),entry.sha256);assert(bytes.length<=256*1024);
});
