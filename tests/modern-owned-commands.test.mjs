import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SanguoshaMobile} from '../api.mjs';
import {CommunityAuthError} from '../lib/community-auth.mjs';
import {parseCommand} from '../lib/commands.mjs';

// Synthetic owners, sessions and official-response fixtures only. Every engine
// uses a fresh temporary directory; no real account, network or image is read.
const OWNER='100000001',OTHER='100000002';
const SOURCE='https://api-xh.sanguosha.cn/user/gameGeneral/total';
const modernSession=(other=false)=>({
  token:other?'synthetic-owner-b-token':'synthetic-owner-a-token',
  cookieValue:other?'synthetic-owner-b-cookie':'synthetic-owner-a-cookie',
  protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',
  communityUserId:other?'23456789':'12345678',communityAuthenticated:true,
  gameAuthenticated:false,channelVerified:false
});
function workspace(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-modern-owned-'));
  t.after(()=>{
    const relative=path.relative(path.resolve(os.tmpdir()),path.resolve(root));
    assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    fs.rmSync(root,{recursive:true,force:true});
  });
  const bot=new SanguoshaMobile(root,{fetch:async()=>assert.fail('synthetic owned command tests must never use network')});
  bot.auth.start=async()=>assert.fail('owned commands must not start authorization');
  bot.auth.poll=async()=>assert.fail('owned commands must not poll authorization');
  bot.auth.queryOwn=async()=>assert.fail('unexpected owned data query');
  return bot;
}
const invoke=(bot,text,{owner=OWNER,...extra}={})=>bot.handle({text:'#sgs'+text,user_id:owner,privateChat:true,...extra});
const seed=(bot,owner=OWNER)=>bot.saveAuth(owner,{session:modernSession(owner===OTHER)});
function fixture(kind,{page=1,countryType=0,filteredTotal=12000,label='合成'}={}){
  const count=Math.max(0,Math.min(12,filteredTotal-(page-1)*12));
  const rows=Array.from({length:count},(_,index)=>{
    const id=(page-1)*12+index+1;
    return {id,name:label+(kind==='ownedGenerals'?'武将':'皮肤')+id,
      url:'https://sjpubicres.sanguosha.cn/release/character_heads/synthetic-'+id+'.png',
      isHave:true,grade:1,...(kind==='ownedGenerals'?{country:countryType||1,country2:0}:{})};
  });
  return {kind,protocol:'pc-scan-v7',sourceUrl:SOURCE,source:SOURCE,
    scope:'sanguosha-community',gameVersion:'sanguosha-mobile',
    communityAuthenticated:true,gameAuthenticated:false,channelVerified:false,
    query:{page,pageSize:12,countryType,skin:kind==='ownedSkins'},
    data:{[kind==='ownedGenerals'?'generals':'skins']:rows,have:12000,total:15000,searchNum:filteredTotal}};
}
function mockModern(bot){
  const calls=[];
  bot.auth.queryOwn=async(kind,session,params)=>{
    assert.ok(['ownedGenerals','ownedSkins'].includes(kind),'modern ownership must not request legacy skins/gameInfo');
    assert.deepEqual(Object.keys(params).sort(),['countryType','page']);
    assert.equal(session.protocol,'pc-scan-v7');
    calls.push({kind,session:structuredClone(session),params:structuredClone(params)});
    return fixture(kind,params);
  };
  return calls;
}
function noCardOrFile(reply){assert.equal(reply.card,undefined);assert.equal(reply.image,undefined);assert.equal(reply.file,undefined);}
function noCredentialReply(reply){
  const serialized=JSON.stringify(reply);
  for(const value of ['synthetic-owner-a-token','synthetic-owner-b-token','synthetic-owner-a-cookie','synthetic-owner-b-cookie','12345678','23456789'])assert.ok(!serialized.includes(value),'reply exposed a synthetic private session value');
}

test('modern own-list commands and country shortcuts reserve their own command namespace',()=>{
  for(const [input,cmd,arg] of [['皮肤','我的皮肤',''],['皮肤 2','我的皮肤','2'],['皮肤 导出','我的皮肤','导出'],['武将收藏 吴 2','我的武将','吴 2'],['皮肤 关羽','皮肤图鉴','关羽']])assert.deepEqual(parseCommand(input),{cmd,arg});
  for(const name of ['我的武将','我的皮肤'])assert.deepEqual(parseCommand(name+' 2'),{cmd:name,arg:'2'});
  for(const name of ['我的全部武将','我的魏国武将','我的蜀国武将','我的吴国武将','我的群雄武将','我的群国武将','我的神武将','我的神国武将']){
    const parsed=parseCommand(name+' 2');assert.ok(parsed.cmd==='我的武将'||parsed.cmd===name);assert.ok(parsed.arg.endsWith('2'));
  }
});

test('modern ownership requests the requested API page once and never fetches the legacy preview',async t=>{
  const bot=workspace(t);seed(bot);const calls=mockModern(bot);
  const defaultPage=await invoke(bot,'我的武将',{imageReply:true});assert.equal(defaultPage.card.result.data.page,1);assert.deepEqual(calls[0].params,{page:1,countryType:0});
  for(const page of [1,2,1000]){
    const before=calls.length,reply=await invoke(bot,'我的武将 '+page,{imageReply:true});
    assert.equal(calls.length,before+1);assert.equal(calls.at(-1).kind,'ownedGenerals');
    assert.deepEqual(calls.at(-1).params,{page,countryType:0});
    assert.equal(reply.card.type,'personal');assert.equal(reply.card.private,true);
    assert.equal(reply.card.result.kind,'ownedGenerals');assert.equal(reply.card.result.coverage,'official-own-paginated');
    assert.equal(reply.card.result.data.page,page);assert.equal(reply.card.result.data.pageSize,12);
    assert.equal(reply.card.result.data.items.length,12);assert.equal(reply.card.result.data.countryType,0);
    assert.equal(reply.file,undefined);noCredentialReply(reply);
  }
});

test('all documented country names translate to the fixed official numeric country filter',async t=>{
  const bot=workspace(t);seed(bot);const calls=mockModern(bot);
  for(const [name,countryType] of [['全部',0],['魏',1],['魏国',1],['蜀',2],['蜀国',2],['吴',3],['吴国',3],['群',4],['群雄',4],['群国',4],['神',5],['神国',5]]){
    const reply=await invoke(bot,'我的武将 '+name+' 2',{imageReply:true});
    assert.deepEqual(calls.at(-1).params,{page:2,countryType});
    assert.equal(reply.card.result.data.countryType,countryType);assert.equal(reply.card.result.data.page,2);
    const first=await invoke(bot,'我的武将 '+name,{imageReply:true});
    assert.deepEqual(calls.at(-1).params,{page:1,countryType});assert.equal(first.card.result.data.page,1);
  }
});

test('country shortcuts query only owned generals and preserve page selection',async t=>{
  const bot=workspace(t);seed(bot);const calls=mockModern(bot);
  for(const [name,countryType] of [['我的全部武将',0],['我的魏国武将',1],['我的蜀国武将',2],['我的吴国武将',3],['我的群雄武将',4],['我的群国武将',4],['我的神武将',5],['我的神国武将',5]]){
    const reply=await invoke(bot,name+' 2',{imageReply:true});
    assert.equal(calls.at(-1).kind,'ownedGenerals');assert.deepEqual(calls.at(-1).params,{page:2,countryType});
    assert.equal(reply.card.private,true);assert.equal(reply.card.result.data.countryType,countryType);
  }
});

test('modern owned skins have an independent paginated API kind and no country filter',async t=>{
  const bot=workspace(t);seed(bot);const calls=mockModern(bot);
  for(const page of [1,2,1000]){
    const reply=await invoke(bot,page===1?'我的皮肤':'我的皮肤 '+page,{imageReply:true});
    assert.equal(calls.at(-1).kind,'ownedSkins');assert.deepEqual(calls.at(-1).params,{page,countryType:0});
    assert.equal(reply.card.private,true);assert.equal(reply.card.result.kind,'ownedSkins');
    assert.equal(reply.card.result.data.page,page);assert.equal(reply.card.result.data.pageSize,12);noCredentialReply(reply);
  }
});

test('invalid pages and extra ownership arguments are rejected before private storage or API access',async t=>{
  const bot=workspace(t);seed(bot);
  bot.vault.get=()=>assert.fail('invalid arguments must not read a private session');
  const wrongPages=['0','-1','1001','1.5','1e3','+1','NaN','Infinity','12345678'];
  const unsafe=['@100000002','userId=100000001','toUserId=100000001','countryType=3','token=synthetic-token','https://evil.invalid/owned','{"page":1}','吴 1 2','1 吴','吴国 全部','传说','原画','至尊'];
  for(const arg of [...wrongPages,...unsafe]){
    const reply=await invoke(bot,'我的武将 '+arg,{imageReply:true});
    assert.match(reply.text,/用法|参数|页码|不支持/);noCardOrFile(reply);
  }
  for(const arg of [...wrongPages,'吴','吴 2','关羽','关羽 2','传说','至尊','原画','2 extra','token=synthetic-token','{"page":1}']){
    const reply=await invoke(bot,'我的皮肤 '+arg,{imageReply:true});
    assert.match(reply.text,/用法|参数|页码|不支持/);noCardOrFile(reply);
  }
});

test('owned commands do not silently treat an unsupported export as an API query',async t=>{
  const bot=workspace(t);seed(bot);bot.vault.get=()=>assert.fail('unsupported export must not read a private session');
  for(const command of ['我的武将 导出','我的武将 吴 2 导出','我的吴国武将 2 导出','我的皮肤 导出','我的皮肤 2 导出']){
    const reply=await invoke(bot,command,{imageReply:true});assert.match(reply.text,/用法|不支持|参数/);noCardOrFile(reply);
  }
});

test('all owned shortcuts reject groups before reading any vault or making any API request',async t=>{
  const bot=workspace(t);seed(bot);
  bot.vault.get=()=>assert.fail('group ownership must not read the private vault');
  for(const command of ['我的武将','我的武将 吴 2','我的皮肤','我的全部武将','我的魏国武将','我的蜀国武将','我的吴国武将','我的群雄武将','我的群国武将','我的神武将','我的神国武将']){
    for(const groupContext of [{group_id:'200000001',privateChat:true},{isGroup:true,privateChat:true},{privateChat:false}]){
      const reply=await invoke(bot,command,{imageReply:true,...groupContext});assert.match(reply.text,/私聊/);noCardOrFile(reply);noCredentialReply(reply);
    }
  }
});

test('the personal-data switch blocks owned aliases before vault and API access',async t=>{
  const bot=workspace(t);seed(bot);
  fs.writeFileSync(bot.config.file,JSON.stringify({...bot.config.read(),personalDataEnabled:false}));
  bot.vault.get=()=>assert.fail('disabled personal data must not read the private vault');
  for(const command of ['我的武将','我的武将 吴 2','我的皮肤','我的全部武将','我的魏国武将','我的蜀国武将','我的吴国武将','我的群雄武将','我的神武将']){
    const reply=await invoke(bot,command,{imageReply:true});assert.match(reply.text,/关闭/);noCardOrFile(reply);
  }
});

test('a sender without an active session is directed to ordinary login, never another owner session',async t=>{
  const bot=workspace(t);seed(bot,OWNER);
  for(const command of ['我的武将','我的吴国武将','我的皮肤']){
    const reply=await invoke(bot,command,{owner:OTHER,imageReply:true});assert.match(reply.text,/#sgs登录/);noCardOrFile(reply);noCredentialReply(reply);
  }
  bot.saveAuth(OTHER,{identities:[{channel:'official',gameId:'synthetic-registered-identity'}]});
  const identityOnly=await invoke(bot,'我的武将',{owner:OTHER,imageReply:true});assert.match(identityOnly.text,/#sgs登录/);noCardOrFile(identityOnly);
});

test('concurrent owners use only their own current modern session and keep result data isolated',async t=>{
  const bot=workspace(t);seed(bot);seed(bot,OTHER);const calls=[];
  bot.auth.queryOwn=async(kind,session,params)=>{
    calls.push({kind,session:structuredClone(session),params:structuredClone(params)});
    const other=session.token===modernSession(true).token;
    assert.deepEqual(session,modernSession(other));
    return fixture(kind,{...params,label:other?'合成乙':'合成甲'});
  };
  const beforeA=bot.vault.get(OWNER),beforeB=bot.vault.get(OTHER);
  const [a,b]=await Promise.all([invoke(bot,'我的武将 吴',{imageReply:true}),invoke(bot,'我的武将 蜀',{owner:OTHER,imageReply:true})]);
  assert.equal(calls.length,2);assert.ok(calls.some(call=>call.session.token===modernSession().token&&call.params.countryType===3));
  assert.ok(calls.some(call=>call.session.token===modernSession(true).token&&call.params.countryType===2));
  assert.ok(a.card.result.data.items.every(row=>row.name.startsWith('合成甲')));assert.ok(b.card.result.data.items.every(row=>row.name.startsWith('合成乙')));
  assert.deepEqual(bot.vault.get(OWNER),beforeA);assert.deepEqual(bot.vault.get(OTHER),beforeB);noCredentialReply(a);noCredentialReply(b);
});

test('image replies are private and the adapter text suffix bypasses image cards without changing the requested API page',async t=>{
  const bot=workspace(t);seed(bot);const calls=mockModern(bot);
  const image=await invoke(bot,'我的武将 吴 2',{imageReply:true});assert.equal(image.card.private,true);assert.equal(image.card.type,'personal');
  const text=await invoke(bot,'我的武将 吴 2 文字',{imageReply:true});noCardOrFile(text);assert.equal(typeof text.text,'string');assert.match(text.text,/合成武将/);
  assert.deepEqual(calls.at(-1).params,{page:2,countryType:3});
  const count=calls.length,notAdapter=await invoke(bot,'我的武将 吴 2 文字');assert.equal(calls.length,count);assert.match(notAdapter.text,/用法|参数|不支持/);noCardOrFile(notAdapter);
  const skinText=await invoke(bot,'我的皮肤 2 文字',{imageReply:true});noCardOrFile(skinText);assert.equal(calls.at(-1).kind,'ownedSkins');assert.deepEqual(calls.at(-1).params,{page:2,countryType:0});
});

test('modern malformed responses never fall back to legacy previews or claim a private image',async t=>{
  const bot=workspace(t);seed(bot);
  const malformed=[
    undefined,{},{...fixture('ownedGenerals'),protocol:'app-qr-v1'},
    {...fixture('ownedGenerals'),sourceUrl:'https://evil.invalid/owned'},
    {...fixture('ownedGenerals'),kind:'ownedSkins'},
    {...fixture('ownedGenerals'),data:{generals:[{id:1,name:'合成未拥有武将',isHave:false}],have:1,total:2,searchNum:1}},
    {...fixture('ownedGenerals'),query:{page:2,pageSize:12,countryType:0,skin:false}}
  ];
  for(const result of malformed){
    const calls=[];bot.auth.queryOwn=async(kind,session,params)=>{calls.push({kind,params});assert.equal(kind,'ownedGenerals');return result;};
    const reply=await invoke(bot,'我的武将',{imageReply:true});assert.equal(calls.length,1);assert.deepEqual(calls[0].params,{page:1,countryType:0});
    assert.match(reply.text,/结构|响应|暂未|暂不|未完成/);noCardOrFile(reply);noCredentialReply(reply);
  }
});

test('a requested country cannot be substituted by response metadata or unrelated rows, while a matching second country remains valid',async t=>{
  const bot=workspace(t);seed(bot);
  const unrelatedRows=fixture('ownedGenerals',{countryType:3});
  for(const row of unrelatedRows.data.generals){row.country=1;row.country2=0;}
  for(const result of [fixture('ownedGenerals',{countryType:2}),unrelatedRows]){
    const calls=[];bot.auth.queryOwn=async(kind,session,params)=>{calls.push({kind,params});return result;};
    const reply=await invoke(bot,'我的武将 吴',{imageReply:true});
    assert.deepEqual(calls,[{kind:'ownedGenerals',params:{page:1,countryType:3}}]);
    assert.match(reply.text,/结构|响应|暂未|暂不|未完成/);noCardOrFile(reply);
  }
  const dualCountry=fixture('ownedGenerals',{countryType:3});
  for(const row of dualCountry.data.generals){row.country=1;row.country2=3;}
  bot.auth.queryOwn=async(kind,session,params)=>{assert.equal(kind,'ownedGenerals');assert.deepEqual(params,{page:1,countryType:3});return dualCountry;};
  const accepted=await invoke(bot,'我的吴国武将',{imageReply:true});
  assert.equal(accepted.card.private,true);assert.equal(accepted.card.result.data.countryType,3);assert.equal(accepted.card.result.data.items.length,12);
});

test('modern authorization or source errors preserve current local authorization and cannot query legacy APIs',async t=>{
  const bot=workspace(t);seed(bot);const before=bot.vault.get(OWNER);
  for(const code of ['AUTH_EXPIRED','SOURCE_CHANGED','QUERY_UNSUPPORTED','TIMEOUT']){
    const calls=[];bot.auth.queryOwn=async(kind,session,params)=>{calls.push({kind,params});throw new CommunityAuthError(code,'合成只读接口失败');};
    const reply=await invoke(bot,'我的皮肤 2',{imageReply:true});assert.equal(reply.text,'合成只读接口失败');assert.deepEqual(calls,[{kind:'ownedSkins',params:{page:2,countryType:0}}]);
    noCardOrFile(reply);assert.deepEqual(bot.vault.get(OWNER),before);
  }
});
