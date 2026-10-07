import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SanguoshaMobile} from '../api.mjs';
import {CommunityAuthError} from '../lib/community-auth.mjs';
import {parseCommand} from '../lib/commands.mjs';

const OWNER='100000001',OTHER='100000002';
const oldSession=()=>({token:'synthetic-old-active-token',protocol:'app-qr-v1',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true});
const newSession=()=>({token:'synthetic-new-active-token',cookieValue:'synthetic-new-active-token',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityUserId:'12345678',communityAuthenticated:true,gameAuthenticated:false});
const challenge=(id,protocol='pc-scan-v7')=>({challengeId:id,protocol,qrPayload:'synthetic-qr-'+id,scanner:protocol==='pc-scan-v7'?'微信扫一扫':'三国咸话APP扫一扫',createdAt:Date.now(),expiresAt:Date.now()+60000,status:'pending'});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function workspace(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-modern-auth-'));
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  const bot=new SanguoshaMobile(root,{fetch:async()=>assert.fail('synthetic command tests must never use network'),qr:async()=>Buffer.from('synthetic-qr-image')});
  bot.auth.start=async()=>assert.fail('unexpected authorization start');
  bot.auth.poll=async()=>assert.fail('unexpected authorization poll');
  bot.auth.logout=async()=>({discardLocalSession:true,revokedRemotely:false});
  return bot;
}
const invoke=(bot,text,owner=OWNER,extra={})=>bot.handle({text:'#sgs'+text,user_id:owner,privateChat:true,...extra});
function seed(bot,owner=OWNER,extra={}){bot.saveAuth(owner,{session:oldSession(),identities:[{channel:'official',gameId:'synthetic-game-identity'}],...extra});}
function saved(bot,owner=OWNER){return bot.vault.get(owner)||{};}
function assertOld(bot,owner=OWNER){assert.deepEqual(saved(bot,owner).session,oldSession());}
function assertNoCredentialReply(reply){
  const text=JSON.stringify(reply);
  for(const secret of ['synthetic-old-active-token','synthetic-new-active-token','12345678','synthetic-qr-','synthetic-game-identity'])assert.ok(!text.includes(secret),'authorization status exposed private state');
  assert.equal(reply.image,undefined);
}

test('ordinary authorization command names and hidden aliases parse without falling into a hero lookup',()=>{
  for(const name of ['登录','社区授权','扫码状态','授权状态','取消授权','新版授权','新版扫码状态','取消新版授权'])assert.deepEqual(parseCommand(name),{cmd:name,arg:''});
  assert.deepEqual(parseCommand('社区授权 微信'),{cmd:'社区授权',arg:'微信'});
  assert.deepEqual(parseCommand('扫码状态 微信'),{cmd:'扫码状态',arg:'微信'});
  assert.equal(parseCommand('新版授权错误').cmd,'');
});

test('starting modern authorization keeps the active old authorization and unrelated identity',async t=>{
  const bot=workspace(t);seed(bot);const previous=saved(bot);let starts=0;
  bot.auth.start=async options=>{assert.deepEqual(options,{protocol:'pc-scan-v7'});starts++;return challenge('first-new');};
  const reply=await invoke(bot,'登录');
  assert.ok(reply.image);assert.match(reply.text,/微信/);assert.equal(starts,1);
  assert.match(reply.text,/#sgs扫码状态/);assert.doesNotMatch(reply.text,/#sgs新版扫码状态/);
  assert.deepEqual(saved(bot).session,previous.session);assert.deepEqual(saved(bot).identities,previous.identities);
  assert.equal(saved(bot).modernChallenge.challengeId,'first-new');
});

test('both community authorization aliases start only modern authorization and keep the old token',async t=>{
  for(const cmd of ['社区授权','社区授权 微信']){
    const bot=workspace(t);seed(bot);
    bot.auth.start=async({protocol})=>{assert.equal(protocol,'pc-scan-v7');return challenge('alias-new');};
    await invoke(bot,cmd);assertOld(bot);assert.equal(saved(bot).modernChallenge.challengeId,'alias-new');
  }
});

test('QR image failure preserves both old authorization and an existing pending QR',async t=>{
  const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('existing-qr')});
  bot.auth.start=async()=>challenge('unrendered-qr');bot.options.qr=async()=>{throw new Error('synthetic QR image failure');};
  await invoke(bot,'登录');assertOld(bot);assert.equal(saved(bot).modernChallenge.challengeId,'existing-qr');
});

test('failure or expiration of a new QR cannot remove the prior active session',async t=>{
  for(const result of ['start-failure','poll-failure','pending','expired','failed']){
    const bot=workspace(t);seed(bot);
    bot.auth.start=async()=>{if(result==='start-failure')throw new CommunityAuthError('TIMEOUT','synthetic start timeout');return challenge(result);};
    await invoke(bot,'登录');assertOld(bot);
    if(result==='start-failure')continue;
    bot.auth.poll=async()=>{if(result==='poll-failure')throw new CommunityAuthError('AUTH_EXPIRED','synthetic expired modern ticket');return {status:result};};
    await invoke(bot,'扫码状态');assertOld(bot);
    assert.ok(saved(bot).identities.length);
  }
});

test('both cancellation names preserve active authorization and cancel the modern pending QR',async t=>{
  for(const cmd of ['取消授权','取消新版授权']){
    const bot=workspace(t),legacy=challenge('legacy-pending','app-qr-v1');seed(bot,OWNER,{challenge:legacy,modernChallenge:challenge('cancel-me')});
    const reply=await invoke(bot,cmd);
    assertOld(bot);assert.equal(saved(bot).modernChallenge,undefined);assert.deepEqual(saved(bot).challenge,legacy);assertNoCredentialReply(reply);
  }
});

test('only a positively identified modern session replaces old active authorization and removes both pending QRs',async t=>{
  const bot=workspace(t),legacy=challenge('legacy-pending','app-qr-v1');seed(bot,OWNER,{challenge:legacy,modernChallenge:challenge('ready-new')});
  seed(bot,OTHER,{modernChallenge:challenge('other-pending')});const otherBefore=saved(bot,OTHER),identities=saved(bot).identities;
  bot.auth.poll=async actual=>{assert.equal(actual.challengeId,'ready-new');return {status:'authorized',session:newSession()};};
  const reply=await invoke(bot,'扫码状态');
  assert.deepEqual(saved(bot).session,newSession());assert.equal(saved(bot).challenge,undefined);assert.equal(saved(bot).modernChallenge,undefined);
  assert.deepEqual(saved(bot).identities,identities);assert.deepEqual(saved(bot,OTHER),otherBefore);
  assert.ok(!JSON.stringify(saved(bot)).includes(oldSession().token),'old credential remained retrievable after success');
  assertNoCredentialReply(reply);
});

test('an authorized label without verified modern identity never discards the old session',async t=>{
  const invalid=[undefined,{}, {...newSession(),protocol:'app-qr-v1'},...['',0,-1,'0','not-an-id',Number.MAX_SAFE_INTEGER+1,undefined].map(communityUserId=>({...newSession(),communityUserId}))];
  for(const session of invalid){
    const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('invalid-proof')});
    bot.auth.poll=async()=>({status:'authorized',session});
    await invoke(bot,'扫码状态');assertOld(bot);
  }
});

test('ordinary and explicit WeChat polling use only the modern pending challenge',async t=>{
  const bot=workspace(t);seed(bot,OWNER,{challenge:challenge('legacy','app-qr-v1'),modernChallenge:challenge('modern')});
  const calls=[];bot.auth.poll=async current=>{calls.push(current.challengeId);return {status:'pending'};};
  await invoke(bot,'扫码状态');await invoke(bot,'扫码状态 微信');assert.deepEqual(calls,['modern','modern']);
  await invoke(bot,'取消授权');await invoke(bot,'扫码状态 微信');assert.deepEqual(calls,['modern','modern']);assertOld(bot);
  await invoke(bot,'扫码状态');assert.deepEqual(calls,['modern','modern']);
  assert.equal(saved(bot).challenge.challengeId,'legacy');assertOld(bot);
});

test('a leftover APP challenge cannot be polled or mistaken for a new authorization',async t=>{
  const bot=workspace(t),legacy=challenge('never-poll-this','app-qr-v1');seed(bot,OWNER,{challenge:legacy});
  for(const cmd of ['扫码状态','扫码状态 微信','新版扫码状态']){
    const reply=await invoke(bot,cmd);
    assert.match(reply.text,/没有待确认|没有待|先.*社区授权/);
    assertOld(bot);assert.deepEqual(saved(bot).challenge,legacy);assert.equal(saved(bot).modernChallenge,undefined);
  }
});

test('an APP challenge in the modern slot is rejected before sending any poll',async t=>{
  const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('invalid-modern-slot','app-qr-v1')});
  const before=saved(bot),reply=await invoke(bot,'扫码状态');
  assert.match(reply.text,/协议|新版|无效|不支持|无法/);assertOld(bot);assert.deepEqual(saved(bot),before);
});

test('hidden modern start and poll aliases remain compatible with the ordinary flow',async t=>{
  const bot=workspace(t);seed(bot);
  bot.auth.start=async options=>{assert.deepEqual(options,{protocol:'pc-scan-v7'});return challenge('hidden-alias');};
  const qr=await invoke(bot,'新版授权');assert.ok(qr.image);assert.match(qr.text,/#sgs扫码状态/);
  bot.auth.poll=async current=>{assert.equal(current.challengeId,'hidden-alias');return {status:'authorized',session:newSession()};};
  const reply=await invoke(bot,'新版扫码状态');
  assert.deepEqual(saved(bot).session,newSession());assert.equal(saved(bot).modernChallenge,undefined);assertNoCredentialReply(reply);
});

test('an old in-flight modern poll cannot replace a newer QR or discard its old session',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('previous')});
  const answer=deferred(),entered=deferred();bot.auth.poll=async current=>{assert.equal(current.challengeId,'previous');entered.resolve();return answer.promise;};
  const pending=invoke(bot,'扫码状态');await entered.promise;
  bot.auth.start=async()=>challenge('replacement');await invoke(bot,'登录');
  answer.resolve({status:'authorized',session:newSession()});await pending;
  assertOld(bot);assert.equal(saved(bot).modernChallenge.challengeId,'replacement');
});

test('canceling a QR while its poll is running prevents a late successful result from binding',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('canceled-poll')});
  const answer=deferred(),entered=deferred();bot.auth.poll=async()=>{entered.resolve();return answer.promise;};
  const pending=invoke(bot,'扫码状态');await entered.promise;await invoke(bot,'取消授权');
  answer.resolve({status:'authorized',session:newSession()});await pending;
  assertOld(bot);assert.equal(saved(bot).modernChallenge,undefined);
});

test('a poll finishing after explicit logout cannot resurrect any authorization',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('logging-out')});
  const answer=deferred(),entered=deferred();bot.auth.poll=async()=>{entered.resolve();return answer.promise;};
  const pending=invoke(bot,'扫码状态');await entered.promise;await invoke(bot,'退出授权');
  answer.resolve({status:'authorized',session:newSession()});await pending;
  assert.equal(saved(bot).session,undefined);assert.equal(saved(bot).challenge,undefined);assert.equal(saved(bot).modernChallenge,undefined);
});

test('a start finishing after cancellation cannot resurrect a canceled pending QR',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot,OWNER,{modernChallenge:challenge('previous-start')});
  const answer=deferred(),entered=deferred();bot.auth.start=async()=>{entered.resolve();return answer.promise;};
  const pending=invoke(bot,'登录');await entered.promise;await invoke(bot,'取消授权');
  answer.resolve(challenge('late-start'));await pending;
  assertOld(bot);assert.equal(saved(bot).modernChallenge,undefined);
});

test('a start finishing after logout cannot recreate a pending authorization',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot);
  const answer=deferred(),entered=deferred();bot.auth.start=async()=>{entered.resolve();return answer.promise;};
  const pending=invoke(bot,'登录');await entered.promise;await invoke(bot,'退出授权');
  answer.resolve(challenge('late-logged-out-start'));await pending;
  assert.equal(saved(bot).session,undefined);assert.equal(saved(bot).challenge,undefined);assert.equal(saved(bot).modernChallenge,undefined);
});

test('two starts resolving out of order keep the most recently requested QR',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot);
  const first=deferred(),entered=deferred();let calls=0;bot.auth.start=async()=>{if(++calls===1){entered.resolve();return first.promise;}return challenge('newest-request');};
  const previous=invoke(bot,'登录');await entered.promise;await invoke(bot,'登录');
  first.resolve(challenge('older-request'));await previous;
  assertOld(bot);assert.equal(saved(bot).modernChallenge.challengeId,'newest-request');
});

test('private status distinguishes old, new and absent authorization without returning identifiers or credentials',async t=>{
  const bot=workspace(t);seed(bot);
  const old=await invoke(bot,'授权状态');assert.match(old.text,/旧|APP|app-qr/i);assertNoCredentialReply(old);
  bot.saveAuth(OWNER,{session:newSession(),modernChallenge:challenge('visible-only-as-status')});
  const modern=await invoke(bot,'授权状态');assert.match(modern.text,/新|网页|pc-scan/i);assertNoCredentialReply(modern);
  await invoke(bot,'退出授权');const none=await invoke(bot,'授权状态');assert.match(none.text,/无|未|尚/);assertNoCredentialReply(none);
});

test('group authorization actions are rejected before reading the vault or making requests',async t=>{
  const bot=workspace(t);bot.vault.get=()=>assert.fail('group authorization must not read private vault');bot.vault.update=()=>assert.fail('group authorization must not mutate private vault');
  for(const cmd of ['登录','社区授权','扫码状态','取消授权','新版授权','新版扫码状态','授权状态','取消新版授权','社区授权 微信','扫码状态 微信','退出授权']){
    const reply=await invoke(bot,cmd,OWNER,{group_id:'200000001',isGroup:true});assert.match(reply.text,/私聊/);assertNoCredentialReply(reply);
  }
});

test('unknown authorization arguments never silently select the old login flow',async t=>{
  const bot=workspace(t);seed(bot);
  for(const cmd of ['登录 微信','登录 APP','登录 typo','登录 123','社区授权 APP','社区授权 app','扫码状态 APP','扫码状态 app','社区授权 typo','社区授权 微信 错误','新版授权 typo','扫码状态 typo','扫码状态 微信 错误','新版扫码状态 typo','授权状态 typo','取消授权 typo','取消新版授权 typo','退出授权 typo']){
    const before=saved(bot),reply=await invoke(bot,cmd);assert.match(reply.text,/用法|参数|不支持|不能|未知/);assert.deepEqual(saved(bot),before);
  }
});

test('disabled personal data blocks starting and polling but allows local cancellation and complete logout',async t=>{
  const bot=workspace(t);seed(bot,OWNER,{challenge:challenge('old-pending','app-qr-v1'),modernChallenge:challenge('new-pending')});
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),personalDataEnabled:false}));
  for(const cmd of ['登录','社区授权','扫码状态','新版授权','新版扫码状态','授权状态','社区授权 微信','扫码状态 微信'])assert.match((await invoke(bot,cmd)).text,/关闭/);
  await invoke(bot,'取消授权');assertOld(bot);assert.equal(saved(bot).modernChallenge,undefined);
  bot.saveAuth(OWNER,{modernChallenge:challenge('logout-pending')});
  bot.auth.logout=async()=>{throw new CommunityAuthError('NETWORK_ERROR','synthetic remote logout failure');};
  const reply=await invoke(bot,'退出授权');
  assert.equal(saved(bot).session,undefined);assert.equal(saved(bot).challenge,undefined);assert.equal(saved(bot).modernChallenge,undefined);assert.ok(saved(bot).identities.length);assertNoCredentialReply(reply);
});

test('new authorization state and cancellation are scoped to the sending owner',async t=>{
  const bot=workspace(t);seed(bot);seed(bot,OTHER);let sequence=0;
  bot.auth.start=async()=>challenge('owner-'+(++sequence));
  await invoke(bot,'登录',OWNER);await invoke(bot,'登录',OTHER);
  const otherBefore=saved(bot,OTHER);await invoke(bot,'取消授权',OWNER);
  assert.equal(saved(bot).modernChallenge,undefined);assert.deepEqual(saved(bot,OTHER),otherBefore);assertOld(bot,OWNER);assertOld(bot,OTHER);
});

test('overlapping starts for distinct owners cannot cancel or overwrite each other',{timeout:5000},async t=>{
  const bot=workspace(t);seed(bot);seed(bot,OTHER);
  const first=deferred(),entered=deferred();let calls=0;bot.auth.start=async()=>{if(++calls===1){entered.resolve();return first.promise;}return challenge('second-owner');};
  const pending=invoke(bot,'登录',OWNER);await entered.promise;await invoke(bot,'登录',OTHER);
  first.resolve(challenge('first-owner'));await pending;
  assert.equal(saved(bot,OWNER).modernChallenge.challengeId,'first-owner');assert.equal(saved(bot,OTHER).modernChallenge.challengeId,'second-owner');assertOld(bot,OWNER);assertOld(bot,OTHER);
});
