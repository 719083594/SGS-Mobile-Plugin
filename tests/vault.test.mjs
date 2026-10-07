import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { SessionVault, VaultError } from '../lib/vault.mjs';
import { SanguoshaMobile } from '../lib/core.mjs';

const OWNER = '100000001', OTHER = '100000002';
function workspace(t, options = {}) {
  const base = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(base, 'sgs-vault-'));
  t.after(() => {
    const absolute = path.resolve(root);
    assert.ok(absolute.startsWith(base + path.sep) && path.basename(absolute).startsWith('sgs-vault-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  const key = randomBytes(32).toString('hex');
  return { root, key, vault: new SessionVault(root, key, options) };
}
const errorCode = code => error => error instanceof VaultError && error.code === code;

test('identities/session/challenge and QQ are wholly encrypted and owners isolated', t => {
  const { vault } = workspace(t);
  vault.set(OWNER, { identities: [{ channel: 'official', gameId: 'synthetic-game-identity' }],
    session: { token: 'synthetic-community-token' }, challenge: { challengeId: 'synthetic-qr' } });
  assert.equal(vault.get(OTHER), null);
  assert.equal(vault.get(OWNER).session.token, 'synthetic-community-token');
  const encoded = fs.readFileSync(vault.file, 'utf8');
  for (const secret of [OWNER, 'synthetic-game-identity', 'synthetic-community-token', 'synthetic-qr']) assert.equal(encoded.includes(secret), false);
  assert.equal(vault.key, undefined);
  assert.throws(() => vault.get('../../escape'), /QQ/);
  assert.throws(() => vault.get('owner:stream'), /QQ/);
});

test('historical v1 AAD survives the public project/prefix rename without changing the key or rewriting existing ciphertext', async t => {
  const {root,key}=workspace(t),oldRoot=path.join(root,'SanguoshaMobile-Plugin'),newRoot=path.join(root,'SGS-Mobile-Plugin');
  for(const target of [oldRoot,newRoot])assert.ok(path.resolve(target).startsWith(path.resolve(root)+path.sep));
  fs.mkdirSync(path.join(oldRoot,'config'),{recursive:true});fs.mkdirSync(path.join(oldRoot,'data'));
  // These legacy literals are protocol fixtures, not current branding/defaults.
  const config={credentialsKey:key,prefix:'#三国'},state={[OWNER]:{identities:[{channel:'official',identityKey:'official:synthetic-legacy',gameId:'synthetic-legacy'}],session:{protocol:'app-qr-v1',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',token:'synthetic-legacy-token'}}};
  const aad=Buffer.from('SanguoshaMobile-Plugin/v1'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(aad);
  const data=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(state))),cipher.final()]);
  const ciphertext=JSON.stringify({version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})+'\n';
  fs.writeFileSync(path.join(oldRoot,'config/local.json'),JSON.stringify(config));fs.writeFileSync(path.join(oldRoot,'data/sessions.enc.json'),ciphertext);
  assert.deepEqual(new SanguoshaMobile(oldRoot).vault.get(OWNER),state[OWNER]);
  fs.renameSync(oldRoot,newRoot);config.prefix='#sgs';fs.writeFileSync(path.join(newRoot,'config/local.json'),JSON.stringify(config));
  const bot=new SanguoshaMobile(newRoot,{fetch:()=>assert.fail('rename must not contact any account service')});
  assert.deepEqual(bot.vault.get(OWNER),state[OWNER]);assert.equal(bot.config.read().credentialsKey,key);assert.equal(bot.config.read().prefix,'#sgs');
  assert.equal(fs.readFileSync(bot.vault.file,'utf8'),ciphertext);assert.equal((await bot.handle({owner:OWNER,privateChat:true,text:'#三国账户'})).handled,false);
  assert.match((await bot.handle({owner:OWNER,privateChat:true,text:'#sgs账户'})).text,/synthetic-legacy/);
  bot.vault.update(OWNER,current=>({...current,migrationVerified:true}));
  const envelope=JSON.parse(fs.readFileSync(bot.vault.file,'utf8')),decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(envelope.iv,'base64'));decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const written=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString());
  assert.deepEqual(written,{[OWNER]:{...state[OWNER],migrationVerified:true}});
});

test('wrong key preserves original data for read, set and direct full-map write', t => {
  const { root, vault } = workspace(t);
  vault.set(OWNER, { session: { token: 'synthetic-preserved' } });
  const before = fs.readFileSync(vault.file, 'utf8'), other = new SessionVault(root, randomBytes(32).toString('hex'));
  for (const action of [() => other.get(OWNER), () => other.set(OTHER, { identities: [] }), () => other.write({ [OTHER]: { session: {} } })]) {
    assert.throws(action, errorCode('DECRYPT_FAILED'));
    assert.equal(fs.readFileSync(vault.file, 'utf8'), before);
    assert.equal(fs.existsSync(vault.lockFile), false);
  }
});

test('tampered envelope cannot be overwritten, legacy v1 without algorithm remains readable', t => {
  const { vault } = workspace(t);
  vault.set(OWNER, { identities: [] });
  const envelope = JSON.parse(fs.readFileSync(vault.file, 'utf8'));
  delete envelope.algorithm;
  fs.writeFileSync(vault.file, JSON.stringify(envelope));
  assert.deepEqual(vault.get(OWNER), { identities: [] });
  envelope.tag = randomBytes(16).toString('base64');
  const corrupt = JSON.stringify(envelope); fs.writeFileSync(vault.file, corrupt);
  assert.throws(() => vault.set(OTHER, { session: {} }), errorCode('DECRYPT_FAILED'));
  assert.equal(fs.readFileSync(vault.file, 'utf8'), corrupt);
});

test('updates retain identity while clearing auth and preserve other owners', t => {
  const { vault } = workspace(t);
  const identities = [{ channel: 'huawei', gameId: 'synthetic-identity' }];
  vault.set(OWNER, { identities, session: { token: 'synthetic-token' }, challenge: {} });
  vault.set(OTHER, { identities: [] });
  vault.update(OWNER, current => { const next = { ...current }; delete next.session; delete next.challenge; return next; });
  assert.deepEqual(vault.get(OWNER), { identities });
  assert.deepEqual(vault.get(OTHER), { identities: [] });
  const before = fs.readFileSync(vault.file, 'utf8');
  assert.throws(() => vault.update(OWNER, async current => current), errorCode('INVALID_DATA'));
  assert.equal(fs.readFileSync(vault.file, 'utf8'), before);
});

test('core logout clears only auth and retains encrypted identity even when upstream fails', async t => {
  const { root } = workspace(t), bot = new SanguoshaMobile(root);
  const identities = [{ channel: 'official', gameId: 'synthetic-retained-identity' }];
  bot.saveIdentities(OWNER, identities);
  bot.saveAuth(OWNER, { session: { token: 'synthetic-test-token' }, challenge: null });
  bot.auth.logout = async () => { throw new Error('Synthetic upstream outage'); };
  const reply = await bot.handle({ owner: OWNER, privateChat: true, text: '#sgs退出授权' });
  assert.match(reply.text, /已删除/);
  assert.deepEqual(bot.vault.get(OWNER), { identities });
  assert.equal(fs.readFileSync(bot.vault.file, 'utf8').includes('synthetic-retained-identity'), false);
});

test('existing lock fails closed without deleting the lock or changing data', t => {
  const { vault } = workspace(t);
  vault.set(OWNER, { identities: [] });
  const before = fs.readFileSync(vault.file, 'utf8'); fs.writeFileSync(vault.lockFile, 'existing-process');
  assert.throws(() => vault.set(OTHER, { session: {} }), errorCode('STORAGE_BUSY'));
  assert.equal(fs.readFileSync(vault.lockFile, 'utf8'), 'existing-process');
  assert.equal(fs.readFileSync(vault.file, 'utf8'), before);
});

test('plaintext/file limits preserve original ciphertext and remove own temporary locks', t => {
  const { root, key, vault } = workspace(t, { maxPlaintextBytes: 200, maxFileBytes: 1024 });
  vault.set(OWNER, { identities: [] });
  const before = fs.readFileSync(vault.file, 'utf8');
  assert.throws(() => vault.set(OWNER, { session: { token: 'x'.repeat(1000) } }), errorCode('SIZE_LIMIT'));
  assert.equal(fs.readFileSync(vault.file, 'utf8'), before);
  assert.equal(fs.existsSync(vault.lockFile), false);
  const tiny = new SessionVault(root, key, { maxFileBytes: 128 });
  assert.throws(() => tiny.get(OWNER), errorCode('SIZE_LIMIT'));
  assert.equal(fs.readFileSync(vault.file, 'utf8'), before);
});

test('directory symlink/junction is refused without touching its external target', t => {
  const { root, vault } = workspace(t), target = path.join(root, 'outside-data');
  fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'sentinel'), 'preserve');
  try { fs.symlinkSync(target, vault.directory, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host does not permit junction/symlink creation'); return; } throw error; }
  assert.throws(() => vault.get(OWNER), errorCode('UNSAFE_PATH'));
  assert.throws(() => vault.set(OWNER, { session: {} }), errorCode('UNSAFE_PATH'));
  assert.deepEqual(fs.readdirSync(target), ['sentinel']);
  assert.equal(fs.readFileSync(path.join(target, 'sentinel'), 'utf8'), 'preserve');
  fs.unlinkSync(vault.directory);
});

test('encrypted-file symlink is refused for reading and writing', t => {
  const { root, vault } = workspace(t); fs.mkdirSync(vault.directory);
  const target = path.join(root, 'outside-file.json'); fs.writeFileSync(target, 'preserve');
  try { fs.symlinkSync(target, vault.file, 'file'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host does not permit file symlinks'); return; } throw error; }
  assert.throws(() => vault.get(OWNER), errorCode('UNSAFE_PATH'));
  assert.throws(() => vault.set(OWNER, { identities: [] }), errorCode('UNSAFE_PATH'));
  assert.equal(fs.readFileSync(target, 'utf8'), 'preserve'); fs.unlinkSync(vault.file);
});

test('independent processes atomically update the same encrypted owner map', async t => {
  const { root, key, vault } = workspace(t); vault.set(OWNER, { identities: [], counter: 0 });
  const moduleUrl = new URL('../lib/vault.mjs', import.meta.url).href;
  const script = `import { SessionVault } from ${JSON.stringify(moduleUrl)};
const vault = new SessionVault(process.argv[1], process.argv[2]);
for(let n=0;n<6;n++){let written=false;for(let attempt=0;attempt<500;attempt++){try{vault.update(process.argv[3], current=>({...current,counter:current.counter+1}));written=true;break}catch(error){if(error.code!=='STORAGE_BUSY')throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5)}}if(!written)throw new Error('Lock never released')}`;
  await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, root, key, OWNER], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'Child update failed')));
  })));
  assert.equal(vault.get(OWNER).counter, 18);
  assert.deepEqual(vault.get(OWNER).identities, []);
  assert.equal(fs.existsSync(vault.lockFile), false);
});

test('Windows access error with a currently ordinary lock is busy and preserves lock/ciphertext', {skip:process.platform!=='win32'}, t => {
  for(const code of ['EPERM','EACCES']){
    const {vault}=workspace(t);vault.set(OWNER,{counter:1});
    const before=fs.readFileSync(vault.file,'utf8');fs.writeFileSync(vault.lockFile,'synthetic-existing-lock');
    const actualOpen=fs.openSync;
    try{
      fs.openSync=(target,...args)=>{if(target===vault.lockFile)throw Object.assign(new Error('Synthetic exclusive-open error'),{code});return actualOpen.call(fs,target,...args);};
      assert.throws(()=>vault.update(OWNER,current=>({...current,counter:2})),errorCode('STORAGE_BUSY'));
    }finally{fs.openSync=actualOpen;}
    assert.equal(fs.readFileSync(vault.lockFile,'utf8'),'synthetic-existing-lock');
    assert.equal(fs.readFileSync(vault.file,'utf8'),before);
  }
});

test('Windows access error without a current lock remains a storage failure', {skip:process.platform!=='win32'}, t => {
  for(const code of ['EPERM','EACCES']){
    const {vault}=workspace(t);vault.set(OWNER,{counter:1});const before=fs.readFileSync(vault.file,'utf8');
    const actualOpen=fs.openSync;
    try{
      fs.openSync=(target,...args)=>{if(target===vault.lockFile)throw Object.assign(new Error('Synthetic exclusive-open error'),{code});return actualOpen.call(fs,target,...args);};
      assert.throws(()=>vault.update(OWNER,current=>({...current,counter:2})),errorCode('STORAGE_FAILED'));
    }finally{fs.openSync=actualOpen;}
    assert.equal(fs.existsSync(vault.lockFile),false);assert.equal(fs.readFileSync(vault.file,'utf8'),before);
  }
});

test('Windows lock replacement by a junction after path preparation is rejected without deleting it', {skip:process.platform!=='win32'}, t => {
  const {root,vault}=workspace(t);vault.set(OWNER,{counter:1});const before=fs.readFileSync(vault.file,'utf8');
  const outside=path.join(root,'synthetic-outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'sentinel'),'preserve');
  const actualOpen=fs.openSync;
  try{
    fs.openSync=(target,...args)=>{if(target===vault.lockFile){fs.symlinkSync(outside,vault.lockFile,'junction');throw Object.assign(new Error('Synthetic exclusive-open error'),{code:'EPERM'});}return actualOpen.call(fs,target,...args);};
    assert.throws(()=>vault.update(OWNER,current=>({...current,counter:2})),errorCode('UNSAFE_PATH'));
  }finally{fs.openSync=actualOpen;}
  assert.equal(fs.lstatSync(vault.lockFile).isSymbolicLink(),true);
  assert.equal(fs.readFileSync(path.join(outside,'sentinel'),'utf8'),'preserve');assert.equal(fs.readFileSync(vault.file,'utf8'),before);
});
