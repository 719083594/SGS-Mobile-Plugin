import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareNativeUiAssets} from '../lib/native-ui-assets.mjs';
import {ASSET_ITEMS,UI_ASSET_SOURCES} from '../lib/ui-assets.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="10" fill="#d5a42c"/></svg>');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-native-ui-')),directory=path.join(root,'resources/ui/assets');fs.mkdirSync(directory,{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(directory,'hld.svg'),manifest=path.join(directory,'manifest.json'),entry={kind:'original-vector-placeholder',category:'item',key:'hld',file:'hld.svg',url:null,bytes:svg.length,sha256:digest(svg),sourceUrl:UI_ASSET_SOURCES.mobile};fs.writeFileSync(file,svg);
  const save=()=>fs.writeFileSync(manifest,JSON.stringify({schema:1,entries:[entry]}));save();return {root,directory,file,manifest,entry,save};
}

test('eleven attributed offline icons become separate small PNGs and never use the network',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('item conversion may not fetch'));
  const ui=await prepareNativeUiAssets(),values=ASSET_ITEMS.map(item=>ui.imageForItem(item.key));
  assert.equal(ui.items,ASSET_ITEMS);assert.equal(values.length,11);assert.equal(new Set(values).size,11);assert(Object.isFrozen(ui));
  for(const value of values){assert.match(value,/^data:image\/png;base64,/);const bytes=Buffer.from(value.split(',')[1],'base64');assert(bytes.length<=256*1024);assert(bytes.readUInt32BE(16)<=128);assert(bytes.readUInt32BE(20)<=128);}
  for(const key of ['unknown','../data/private','file:///private',null,{}])assert.equal(ui.imageForItem(key),null);
});

test('only the direct canonical item path can reach the local decoder; no file outputs are created',async t=>{
  const f=fixture(t),before=fs.readdirSync(f.directory).sort(),ui=await prepareNativeUiAssets({root:f.root});assert(ui.imageForItem('hld'));assert.deepEqual(fs.readdirSync(f.directory).sort(),before);
  for(const value of ['https://evil.invalid/a.png','file:///private/key',pathToFileURL(f.file).href+'?token=synthetic','data:image/svg+xml;base64,'+svg.toString('base64'),pathToFileURL(path.join(f.root,'hld.svg')).href]){
    let loads=0;const unsafe=await prepareNativeUiAssets({root:f.root,assetResolver:{imageForItem:()=>value},loadSharp:()=>{loads++;throw Error('decoder must not load');}});assert.equal(unsafe.imageForItem('hld'),null);assert.equal(loads,0);
  }
});

test('changed hashes, scripts, network SVG, hard links and symbolic directories never reach the decoder',async t=>{
  const f=fixture(t);let loads=0;const options={root:f.root,loadSharp:()=>{loads++;throw Error('decoder must not load');}};
  for(const bytes of [Buffer.alloc(svg.length),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>no</script></svg>'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/private.png"/></svg>')]){
    fs.writeFileSync(f.file,bytes);f.entry.bytes=bytes.length;f.entry.sha256=digest(bytes);f.save();assert.equal((await prepareNativeUiAssets(options)).imageForItem('hld'),null);
  }
  fs.writeFileSync(f.file,svg);f.entry.bytes=svg.length;f.entry.sha256='0'.repeat(64);f.save();assert.equal((await prepareNativeUiAssets(options)).imageForItem('hld'),null);
  f.entry.sha256=digest(svg);f.save();const shared=path.join(f.root,'shared.svg');fs.linkSync(f.file,shared);assert.equal((await prepareNativeUiAssets(options)).imageForItem('hld'),null);fs.unlinkSync(shared);
  fs.renameSync(f.directory,f.directory+'-original');fs.symlinkSync(f.directory+'-original',f.directory,process.platform==='win32'?'junction':'dir');assert.equal((await prepareNativeUiAssets(options)).imageForItem('hld'),null);assert.equal(loads,0);
});

test('a verified item changed while bounded reading is rejected without decoder invocation',async t=>{
  const f=fixture(t),original=fs.readSync;let changed=false,loads=0;
  t.mock.method(fs,'readSync',function(fd,buffer,...args){const count=original.call(fs,fd,buffer,...args);if(!changed&&buffer.length===svg.length+1){changed=true;fs.writeFileSync(f.file,Buffer.alloc(svg.length));const future=new Date(Date.now()+2000);fs.utimesSync(f.file,future,future);}return count;});
  const ui=await prepareNativeUiAssets({root:f.root,loadSharp:()=>{loads++;throw Error('decoder must not load');}});assert.equal(ui.imageForItem('hld'),null);assert.equal(changed,true);assert.equal(loads,0);
});

test('missing backend or malformed manifest gives explicit symbol placeholders without secret errors',async t=>{
  const f=fixture(t),ui=await prepareNativeUiAssets({root:f.root,loadSharp:()=>{throw Error('synthetic-secret-error');}});assert.equal(ui.imageForItem('hld'),null);
  fs.writeFileSync(f.manifest,'{}');let calls=0;assert.equal((await prepareNativeUiAssets({root:f.root,loadSharp:()=>{calls++;}})).imageForItem('hld'),null);assert.equal(calls,0);
});
