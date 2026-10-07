import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SanguoshaMobile} from '../api.mjs';
import {CommunityAuthError} from '../lib/community-auth.mjs';
import {parseCommand} from '../lib/commands.mjs';

function workspace(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-owned-command-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return new SanguoshaMobile(root,{fetch:async()=>assert.fail('unexpected network')});
}
const source=kind=>({kind,protocol:'app-qr-v1',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',
  sourceUrl:'https://hi-gateway.sanguosha.cn/api/game/v2/general/'+(kind==='skins'?'generalSkins':'gameInfo'),
  data:kind==='skins'?{generalList:[{id:901,name:'合成武将',url:'https://www.sanguosha.cn/static/test.png'}],skinList:Array.from({length:25},(_,i)=>({id:2000+i,name:'合成皮肤'+i,url:'https://www.sanguosha.cn/static/test.png'}))}:{generalNum:60,generalTotal:90,skinNum:90,skinTotal:150}});

test('本人收藏只使用发令者的授权，保留拥有总数和响应范围',async t=>{
  const bot=workspace(t),calls=[];
  const session={syntheticOwner:'100000001'};
  bot.vault.get=owner=>{assert.equal(owner,'100000001');return {session};};
  bot.auth.queryOwn=async(kind,actual)=>{assert.equal(actual,session);calls.push(kind);return source(kind);};
  bot.public.heroCatalog=()=>assert.fail('public catalog is not an ownership source');
  for(const [command,kind] of [['我的武将','ownedGenerals'],['已拥有武将','ownedGenerals'],['我的皮肤 2','ownedSkins']]){
    const reply=await bot.handle({text:'#sgs'+command,user_id:'100000001',privateChat:true,imageReply:true});
    assert.equal(reply.card?.type,'personal',reply.text);assert.equal(reply.card.private,true);
    assert.equal(reply.card.result.kind,kind);assert.equal(reply.card.result.coverage,'official-own-response');
    assert.equal(reply.card.result.data.complete,false);assert.match(reply.text,/部分|不完整/);
    assert.equal(reply.card.result.data.ownTotal,kind==='ownedGenerals'?60:90);
  }
  assert.deepEqual(calls.sort(),['gameInfo','gameInfo','gameInfo','skins','skins','skins'].sort());
  assert.equal(parseCommand('我的武将赵云').cmd,'');
});

test('群内、关闭、未授权和非法参数都先于本人 API',async t=>{
  const bot=workspace(t);bot.auth.queryOwn=()=>assert.fail('no private query allowed');
  bot.vault.get=()=>assert.fail('group and malformed commands must not read vault');
  for(const command of ['我的武将','我的皮肤']){
    assert.match((await bot.handle({text:'#sgs'+command,user_id:'100000001',group_id:'200000001',imageReply:true})).text,/私聊/);
    for(const args of ['0','-1','10000','100000002','导出','吴','2 3'])assert.match((await bot.handle({text:'#sgs'+command+' '+args,user_id:'100000001',privateChat:true})).text,/用法/);
  }
  bot.vault.get=()=>null;
  assert.match((await bot.handle({text:'#sgs我的武将',user_id:'100000001'})).text,/社区授权/);
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),personalDataEnabled:false}));
  bot.vault.get=()=>assert.fail('disabled collections must not read vault');
  assert.match((await bot.handle({text:'#sgs我的武将',user_id:'100000001'})).text,/关闭/);
});

test('总数接口临时失败可以显示明确不完整预览，失效授权不能被另一个成功请求隐藏',async t=>{
  const bot=workspace(t);bot.vault.get=()=>({session:{synthetic:true}});
  bot.auth.queryOwn=async kind=>{if(kind==='gameInfo')throw new CommunityAuthError('TIMEOUT','合成超时');return source(kind);};
  const reply=await bot.handle({text:'#sgs我的武将',user_id:'100000001',imageReply:true});
  assert.equal(reply.card.result.data.ownTotal,null);assert.equal(reply.card.result.data.complete,false);
  bot.auth.queryOwn=async kind=>{if(kind==='gameInfo')throw new CommunityAuthError('AUTH_EXPIRED','合成授权已过期');return source(kind);};
  const expired=await bot.handle({text:'#sgs我的武将',user_id:'100000001',imageReply:true});
  assert.equal(expired.card,undefined);assert.match(expired.text,/已过期/);
});
