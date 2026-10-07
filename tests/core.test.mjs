import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {SanguoshaMobile} from '../api.mjs';
test('退出授权即使上游失败也清理，group_id优先拒绝混合私聊上下文',()=>workspace(async root=>{const bot=new SanguoshaMobile(root);const e={owner:'100000001',privateChat:true};bot.vault.set(e.owner,{session:{token:'synthetic-token',protocol:'pc-scan-v7'},challenge:null});bot.auth.logout=async()=>{throw new Error('unreachable')};assert.match((await bot.handle({...e,group_id:'200000001',text:'#sgs资产'})).text,/私聊/);assert.match((await bot.handle({...e,text:'#sgs退出授权'})).text,/已删除.*远程注销未成功/);assert.equal(bot.vault.get(e.owner),null)}));
async function workspace(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-core-'));try{await fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}}
test('官号华为不伪造登录，身份存储按QQ渠道隔离，群聊不泄漏账号',()=>workspace(async root=>{let calls=0;const bot=new SanguoshaMobile(root,{fetch:async()=>{calls++;throw new Error('unexpected')}});const e={owner:'100000001',privateChat:true};assert.match((await bot.handle({...e,privateChat:false,group_id:'200000001',text:'#sgs官号登录'})).text,/私聊/);assert.match((await bot.handle({...e,text:'#sgs华为登录'})).text,/华为/);await bot.handle({...e,text:'#sgs绑定 官号 123456'});await bot.handle({...e,text:'#sgs绑定 华为 123456'});assert.equal(bot.identities(e.owner).length,2);assert.equal(bot.identities('100000002').length,0);assert.match((await bot.handle({...e,privateChat:false,group_id:'200000001',text:'#sgs账户'})).text,/私聊/);assert.equal(bot.identities(e.owner).every(x=>x.authenticated===false),true);assert.match((await bot.handle({...e,text:'#sgs战绩'})).text,/尚未验证/);assert.equal(calls,0)}));
test('新闻命令使用已验证的移动版分类，未知前缀交回其他插件',()=>workspace(async root=>{const calls=[];const bot=new SanguoshaMobile(root,{fetch:async url=>{calls.push(String(url));return new Response('<html></html>',{headers:{'content-type':'text/html'}})}});await bot.handle({owner:'100000001',text:'#sgs活动'});assert.match(calls[0],/sanguosha\.cn\/pc\/news-list-1001\.html/);const out=await bot.handle({owner:'100000001',text:'#原神帮助'});assert.equal(out.handled,false)}));
test('普通扫码命令完成新版本人验证，凭据加密且其他QQ不可读',()=>workspace(async root=>{
  const response=(data,headers={})=>new Response(JSON.stringify({code:0,data}),{headers});let authorized=false;
  const bot=new SanguoshaMobile(root,{qr:async()=>Buffer.from('synthetic-qr-image'),fetch:async(url,init)=>{
    assert.equal(new URL(url).search,'');
    if(url.endsWith('/sgxh/pcScan/generateId')){assert.deepEqual(JSON.parse(init.body),{gameId:2});return response({scanId:'synthetic-scan-id',expireIn:300});}
    if(url.endsWith('/sgxh/pcScan/poll'))return response(authorized?{appletToken:'synthetic-ticket'}:{});
    if(url.endsWith('/api/auth/login'))return response({},{'set-cookie':'WEB_SESSIONID=synthetic-personal-token; Max-Age=600; Path=/web; Secure'});
    if(url.endsWith('/user/userInfo')){assert.equal(init.headers.Authorization,'synthetic-personal-token');return response({userId:'123',nickname:'测试本人'});}
    if(url.endsWith('/user/gameSummary')){assert.equal(init.headers.Authorization,'synthetic-personal-token');return response({totalGames:50,coins:100});}
    if(url.endsWith('/api/auth/logout'))return response({});
    assert.fail('unexpected modern authorization endpoint');
  }});
  const e={owner:'100000001',privateChat:true};
  const qr=await bot.handle({...e,text:'#sgs登录'});assert(Buffer.isBuffer(qr.image));assert.match(qr.text,/微信/);assert.match(qr.text,/#sgs扫码状态/);
  assert.match((await bot.handle({...e,text:'#sgs扫码状态'})).text,/尚未完成/);authorized=true;
  assert.match((await bot.handle({...e,text:'#sgs扫码状态'})).text,/已验证/);
  assert.equal(bot.vault.get(e.owner).session.protocol,'pc-scan-v7');assert.equal(bot.vault.get(e.owner).session.communityUserId,'123');
  const accountFile=path.join(root,'data/sessions.enc.json');assert.equal(fs.readFileSync(accountFile,'utf8').includes('synthetic-personal-token'),false);
  assert.match((await bot.handle({...e,text:'#sgs个人资料'})).text,/coins/);
  assert.match((await bot.handle({owner:'100000002',privateChat:true,text:'#sgs个人资料'})).text,/请先/);
  assert.match((await bot.handle({...e,privateChat:false,group_id:'200000001',text:'#sgs个人资料'})).text,/仅在私聊/);
  assert.match((await bot.handle({...e,text:'#sgs退出授权'})).text,/已删除/);assert.equal(bot.vault.get(e.owner),null);
}));

test('官号游戏登录命令仅说明未接通，不创建社区扫码或覆盖现有授权',()=>workspace(async root=>{let calls=0;const bot=new SanguoshaMobile(root,{fetch:async()=>{calls++;throw new Error('unexpected network')}});const e={owner:'100000001',privateChat:true};bot.vault.set(e.owner,{session:{protocol:'app-qr-v1',token:'synthetic-session'},identities:[]});const before=bot.vault.get(e.owner);const out=await bot.handle({...e,text:'#sgs官号登录'});assert.match(out.text,/未接通官号游戏授权协议/);assert.match(out.text,/#sgs社区授权/);assert.equal(out.image,undefined);assert.deepEqual(bot.vault.get(e.owner),before);assert.equal(calls,0)}));
