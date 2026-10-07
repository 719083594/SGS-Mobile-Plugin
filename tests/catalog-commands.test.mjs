import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SanguoshaMobile} from '../api.mjs';
import {parseCommand} from '../lib/commands.mjs';
import {catalogNextCommand,formatCatalog} from '../lib/catalog-display.mjs';

function workspace(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-catalog-command-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new SanguoshaMobile(root,{fetch:async()=>assert.fail('unexpected network')});}
const hero=(args)=>({kind:'heroCatalog',coverage:'official-web-catalog',title:args.faction+'国武将图鉴',...args,pageSize:24,total:25,pages:2,items:[{id:12,name:'周瑜',faction:args.faction}],sourceUrl:'https://www.sanguosha.cn/pc/hero-list.html'});
const skin=(args)=>({kind:'skinCatalog',coverage:'official-skin-gallery',title:'官方皮肤绘影堂',...args,pageSize:12,total:13,pages:2,items:[{id:171,name:'合成皮肤',generalName:args.general||'周瑜',grade:args.type}],sourceUrl:'https://share.sanguosha.cn/skins/'});

test('公开武将目录别名、势力、页码可在群里查询，不读取本人授权',async t=>{
 const bot=workspace(t),calls=[];bot.vault.get=()=>assert.fail('public catalogs must not read account');bot.auth.queryOwn=()=>assert.fail('must not query own info');
 bot.public.heroCatalog=async args=>{calls.push(args);return hero(args);};
 for(const [text,faction,page] of [['全部武将','全部',1],['吴国武将','吴',1],['吴国武将 2','吴',2],['武将列表 蜀 2','蜀',2],['魏国武将','魏',1],['群雄武将','群',1],['神武将','神',1]]){
  const r=await bot.handle({text:'#sgs'+text,user_id:'100000001',group_id:'200000001',imageReply:true});
  assert.equal(r.card.type,'public');assert.equal(r.card.private,false);assert.deepEqual(calls.at(-1),{faction,page});assert.match(r.text,/官网|图鉴/);
 }
 const before=calls.length;assert.match((await bot.handle({text:'#sgs吴国武将 0'})).text,/用法/);assert.equal(calls.length,before);
 const c=bot.config.read();fs.writeFileSync(bot.config.file,JSON.stringify({...c,personalDataEnabled:false}));
 assert.equal((await bot.handle({text:'#sgs吴国武将',imageReply:true})).card.type,'public');
});

test('公开皮肤图鉴与武将皮肤简写路由独立，原有私人皮肤不被绕过',async t=>{
 const bot=workspace(t),calls=[];bot.public.skinCatalog=async args=>{calls.push(args);return skin(args);};
 bot.vault.get=()=>assert.fail('public command must not read vault');bot.auth.queryOwn=()=>assert.fail('public command must not use personal API');
 for(const [text,general,type,page] of [['皮肤图鉴','', '全部',1],['全部皮肤 2','','全部',2],['周瑜皮肤','周瑜','全部',1],['皮肤 周瑜','周瑜','全部',1],['武将周瑜皮肤 2','周瑜','全部',2],['皮肤图鉴 周瑜 至尊 2','周瑜','至尊',2],['郭嘉&戏志才皮肤','郭嘉&戏志才','全部',1]]){
  const r=await bot.handle({text:'#sgs'+text,user_id:'100000001',group_id:'200000001',imageReply:true});
  assert.equal(r.card?.type,'public',text);assert.equal(r.card.private,false);assert.deepEqual(calls.at(-1),{general,type,page});
 }
 for(const text of ['#sgs皮肤','#sgs我的皮肤','#sgs皮肤 导出']){
  const r=await bot.handle({text,user_id:'100000001',group_id:'200000001',imageReply:true});assert.equal(r.card,undefined);assert.match(r.text,/私聊/);
 }
 for(const text of ['社区授权周瑜皮肤','账户皮肤','绑定周瑜皮肤','武将收藏皮肤'])assert.equal(parseCommand(text).cmd,'');
});

test('公开目录文字后缀、自定义前缀和下一页保留筛选',async t=>{
 const bot=workspace(t);bot.public.skinCatalog=async args=>skin(args);bot.public.heroCatalog=async args=>hero(args);
 const c=bot.config.read();fs.writeFileSync(bot.config.file,JSON.stringify({...c,prefix:'#test'}));
 assert.equal((await bot.handle({text:'#sgs全部武将'})).handled,false);
 const r=await bot.handle({text:'#test吴国武将 文字',imageReply:true});assert.equal(r.card,undefined);assert.match(r.text,/#test吴国武将 2/);
 const result=skin({general:'神·周瑜',type:'至尊',page:1});assert.equal(catalogNextCommand(result,'#test'),'#test皮肤图鉴 神·周瑜 至尊 2');assert.match(formatCatalog(result,{prefix:'#test'}),/不等同本人拥有/);
 assert.equal(catalogNextCommand({...result,page:2}),'');
 assert.throws(()=>formatCatalog({...result,coverage:'private-api'}));
});
