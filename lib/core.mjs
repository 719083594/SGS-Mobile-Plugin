import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ConfigStore} from './config.mjs';import {MobilePublicClient,PublicDataError,normalizeHeroName,formatPublic} from './public.mjs';import {formatLoginStatus,bindIdentity} from './login.mjs';
import {parseCommand} from './commands.mjs';
import {CommunityAuthClient,CommunityAuthError} from './community-auth.mjs';import {SessionVault} from './vault.mjs';
import {formatPersonal} from './format-personal.mjs';
export const rootDefault=fileURLToPath(new URL('../',import.meta.url));
export class SanguoshaMobile{
  constructor(root=rootDefault,options={}){this.root=root;this.options=options;this.config=new ConfigStore(root);const c=this.config.init();this.public=new MobilePublicClient({fetchImpl:options.fetch,timeoutMs:c.timeoutMs,cacheTtlMs:c.cacheSeconds*1000});this.auth=new CommunityAuthClient({fetchImpl:options.fetch,timeoutMs:c.timeoutMs});this.vault=new SessionVault(root,c.credentialsKey);const oldDir=path.join(root,'data/identities');if(fs.existsSync(oldDir)){this.accountFile('100000001');for(const file of fs.readdirSync(oldDir))if(/^[1-9]\d{4,14}\.json$/.test(file))this.identities(file.slice(0,-5));}}
  help(){const p=this.config.read().prefix;return ['三国杀移动助手 0.1.0 · 三国杀移动版',`${p}资讯 / 活动 / 公告 / 武将 [名称或ID] / 攻略 [关键词] / 模式 [名称]`,`${p}社区 [关键词] / 热榜 [today/week/all/theme]`,`${p}社区授权 / 扫码状态 / 退出授权（私聊，三国咸话APP扫码）`,`${p}个人资料 / 战绩 [模式0-4] / 近期战绩 [模式0-4] [页码] / 将力 / 资产 / 皮肤 / 武将收藏 / 能力 / 擅长武将 / 游戏资料（本人私聊）`,`${p}资产 导出 / 战绩 2 导出 / 近期战绩 0 1 导出（所有本人查询均可追加 导出，获取完整已脱敏JSON）`,`${p}官号登录 / 华为登录 / 绑定 官号或华为 游戏ID [区服] / 账户 / 解绑`,`${p}功能 / 状态`, '来源：三国杀移动版官网与三国咸话。','社区APP扫码及11类本人接口已验证连通性；每个用户仍须自己授权。游戏官号/华为渠道登录仍未证实。“绑定”只保存身份。'].join('\n')}
  accountFile(owner){const id=this.vault.owner(owner);const base=path.resolve(this.root);for(const folder of [base,path.join(base,'data'),path.join(base,'data/identities')])if(fs.existsSync(folder)){const s=fs.lstatSync(folder);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('账户文件路径不合法')}return path.join(base,'data/identities',id+'.json')}
  identities(owner){const value=this.vault.get(owner);const file=this.accountFile(owner);if(!fs.existsSync(file))return value?.identities||[];const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1048576)throw new Error('账户文件不合法');const raw=fs.readFileSync(file,'utf8');const rows=JSON.parse(raw);if(!Array.isArray(rows))throw new Error('账户文件损坏');if(value?.identities&&JSON.stringify(value.identities)!==JSON.stringify(rows))throw new Error('旧身份与加密身份不一致，请保留文件核对');this.saveIdentities(owner,rows);if(JSON.stringify(this.vault.get(owner).identities)!==JSON.stringify(rows))throw new Error('账户加密迁移未验证');const after=fs.lstatSync(file);if(this.accountFile(owner)!==file||after.isSymbolicLink()||!after.isFile()||after.dev!==stat.dev||after.size!==stat.size||after.ino!==stat.ino||fs.readFileSync(file,'utf8')!==raw)throw new Error('旧账户文件已变化，保留原文件');fs.unlinkSync(file);return rows}
  saveIdentities(owner,rows){this.vault.update(owner,value=>({...value,identities:rows}))}
  saveAuth(owner,auth){this.vault.update(owner,value=>({...value,...auth}))}
  clearAuth(owner){this.vault.update(owner,current=>{const value={...current};delete value.session;delete value.challenge;return Object.keys(value).length?value:null})}
  async handle(event){
    const c=this.config.read(),text=String(event.text??event.msg??'').trim();
    if(!c.enabled||!text.startsWith(c.prefix))return {handled:false};
    let body=text.slice(c.prefix.length).trim();
    const textOnly=event.imageReply===true&&/\s+文字$/.test(body);
    if(textOnly)body=body.replace(/\s+文字$/,'').trim();
    const {cmd,arg,heroShorthand=false}=parseCommand(body);
    const ctx={owner:String(event.owner||event.user_id||''),privateChat:!event.group_id&&event.privateChat!==false,imageReply:event.imageReply===true&&!textOnly,heroShorthand};
    try{
      const r=await this.command(cmd,arg,ctx);
      return typeof r==='object'?{handled:true,...r}:{handled:true,text:String(r).slice(0,c.maxReplyChars)};
    }catch(error){
      const publicArgumentError=error instanceof PublicDataError&&['NOT_FOUND','AMBIGUOUS_HERO','INVALID_ARGUMENT'].includes(error.code);
      return {handled:true,text:error instanceof CommunityAuthError||publicArgumentError?error.message:'查询未完成：参数不合法或官方接口暂不可用。请稍后再试。'};
    }
  }
  async command(cmd,arg,ctx){const limit=this.config.read().maxItems;
    const publicReply=result=>ctx.imageReply?{text:formatPublic(result,{maxItems:limit,maxLength:this.config.read().maxReplyChars}),card:{type:'public',private:false,result,params:{command:cmd}}}:formatPublic(result,{maxItems:limit,maxLength:this.config.read().maxReplyChars});
    if(cmd==='帮助')return ctx.imageReply?{text:this.help(),card:{type:'help',private:false}}:this.help();if(['资讯','公告','活动'].includes(cmd))return publicReply(await this.public.news({category:cmd==='活动'?'活动公告':cmd==='资讯'?'资讯':'最新',limit}));
    if(['社区授权','扫码状态','个人资料','战绩','近期战绩','将力','资产','皮肤','武将收藏','能力','擅长武将','游戏资料'].includes(cmd)&&!this.config.read().personalDataEnabled)return '管理员已关闭社区授权和个人数据查询；仍可退出已有授权。';
    if(cmd==='武将'){
      let r;
      if(/^\d+$/.test(arg))r=await this.public.hero(Number(arg));
      else{
        r=await this.public.heroes(arg,{limit:arg?1000:50});
        const exact=arg?r.items.filter(x=>normalizeHeroName(x.name||x.title)===normalizeHeroName(arg)):[];
        if(exact.length>1)throw new PublicDataError('AMBIGUOUS_HERO','官网中有多个同名武将，请使用武将目录中的 ID 查询。');
        if(exact.length===1)r=await this.public.hero(Number(exact[0].id));
        else if(ctx.heroShorthand)return '未找到该名称的移动版武将；可发送 '+this.config.read().prefix+'武将 '+arg+' 搜索，或 '+this.config.read().prefix+'帮助 查看用法。';
        else if(arg&&!r.items.length)return '官网中没有找到此移动版武将，请检查名称。';
        else r={...r,items:r.items.slice(0,50)};
      }
      return publicReply(r);
    }
    if(cmd==='详情')return publicReply(await this.public.article(Number(arg)));if(cmd==='攻略')return publicReply(arg?await this.public.topics({keyword:arg,categoryId:6,limit}):await this.public.guides({}));if(cmd==='模式')return publicReply(await this.public.mode(arg));if(cmd==='社区')return publicReply(await this.public.topics({keyword:arg,limit}));if(cmd==='热榜')return publicReply(await this.public.hot({kind:arg||'today',limit}));
    if(cmd==='华为登录')return formatLoginStatus('huawei')+'\n已有三国咸话关联角色时，可 #sgs社区授权，再查询本人资料；这一步不宣称华为游戏登录。';
    if(cmd==='官号登录'){if(!ctx.privateChat)return '官号游戏登录状态请在私聊查看。';return formatLoginStatus('official')+'\n当前未接通官号游戏授权协议。已有三国咸话关联角色时，请发送 '+this.config.read().prefix+'社区授权，取得社区本人资料授权；这一步不是官号游戏登录。'}
    if(cmd==='社区授权'){if(!ctx.privateChat)return '社区扫码授权只能在私聊开始。';const challenge=await this.auth.start({protocol:arg==='微信'?'pc-scan-v7':'app-qr-v1'});this.saveAuth(ctx.owner,{challenge,session:null});let image;if(this.options.qr)image=await this.options.qr(challenge.qrPayload);else{const QR=(await import('qrcode')).default;image=await QR.toBuffer(challenge.qrPayload,{width:360,margin:3,errorCorrectionLevel:'M'})}return {image,text:'请用'+challenge.scanner+'扫描二维码，在官方页面确认登录三国咸话。\n扫码后发送 #sgs扫码状态。仅授权社区，游戏角色和官号/华为渠道尚需实际查询确认；请勿转发二维码。'}}
    if(cmd==='扫码状态'){if(!ctx.privateChat)return '扫码状态只能在私聊查询。';const value=this.vault.get(ctx.owner);if(!value?.challenge)return '没有待确认扫码；请 #sgs社区授权。';const r=await this.auth.poll(value.challenge);if(r.status==='authorized'){this.saveAuth(ctx.owner,{session:r.session,challenge:null});return '已验证三国咸话本人授权并加密保存。可私聊 #sgs个人资料 / 战绩 / 将力 / 资产 / 皮肤 / 武将收藏；是否有游戏角色由官方接口返回，当前未证明游戏渠道登录。'}if(r.status==='expired'){this.clearAuth(ctx.owner);return '二维码已过期，请重新 #sgs社区授权。'}return '尚未完成官方扫码确认。'}
    if(cmd==='退出授权'){if(!ctx.privateChat)return '退出授权请私聊。';const value=this.vault.get(ctx.owner);let remotely=false,failed=false;try{if(value?.session){const r=await this.auth.logout(value.session);remotely=r.revokedRemotely===true}}catch{failed=true}finally{this.clearAuth(ctx.owner)}return '已删除本bot保存的社区会话。'+(remotely?'官方会话已注销。':failed?'官方远程注销未成功，请在官方APP管理剩余会话。':'此协议尚无已核实的远程撤销接口；如需撤销所有会话，请在官方APP管理。')}
    if(cmd==='绑定'){if(!ctx.privateChat)return '游戏身份绑定请使用私聊。';const [label,gameId,server='']=arg.split(/\s+/);const channel=label==='官号'?'official':label==='华为'?'huawei':label;if(!this.config.read().channels[channel])return '该渠道未启用。';const r=bindIdentity({channel,gameId,server});const rows=this.identities(ctx.owner);const next=rows.filter(x=>x.identityKey!==r.identityKey);next.push(r);this.saveIdentities(ctx.owner,next);return '已加密保存'+(channel==='official'?'官号':'华为')+'游戏身份 '+gameId+'。这一步尚未登录，也没有取得个人战绩授权。'}
    if(cmd==='账户'){if(!ctx.privateChat)return '账户列表请在私聊查询。';return this.identities(ctx.owner).map(r=>`${r.channel} · ${r.gameId} · ${r.server||'未选区服'} · 未认证`).join('\n')||'尚未绑定游戏身份。'}
    if(cmd==='解绑'){if(!ctx.privateChat)return '解绑请使用私聊。';const rows=this.identities(ctx.owner);if(arg){const channel=arg==='官号'?'official':arg==='华为'?'huawei':arg;this.saveIdentities(ctx.owner,rows.filter(r=>r.channel!==channel))}else this.saveIdentities(ctx.owner,[]);return '已删除本bot保存的游戏身份。'}
    if(['个人资料','战绩','近期战绩','将力','资产','皮肤','武将收藏','能力','擅长武将','游戏资料'].includes(cmd)){if(!ctx.privateChat)return '个人游戏信息仅在私聊查询。';const value=this.vault.get(ctx.owner);if(!value?.session)return '请先 #sgs社区授权 并扫码确认；官号/华为游戏登录尚未验证，公开信息不能代替本人资料。';const kind={'个人资料':'summary','战绩':'records','近期战绩':'recent','将力':'force','资产':'assets','皮肤':'skins','武将收藏':'favorites','能力':'abilities','擅长武将':'bestGeneral','游戏资料':'gameInfo'}[cmd];const exportJson=/(?:^|\s)导出$/.test(arg);const queryArg=exportJson?arg.replace(/(?:^|\s)导出$/,'').trim():arg;const params=cmd==='近期战绩'?{model:Number(queryArg.split(/\s+/)[0]||0),page:Number(queryArg.split(/\s+/)[1]||1)}:cmd==='战绩'?{model:Number(queryArg||0)}:{};const r=await this.auth.queryOwn(kind,value.session,params);const output=formatPersonal(r,{command:cmd,prefix:this.config.read().prefix,maxLength:this.config.read().maxReplyChars,maxItems:limit,exportJson,dataAlreadyRedacted:true,...params});return ctx.imageReply&&!exportJson?{...output,card:{type:'personal',private:true,result:r,params:{command:cmd,...params}}}:output};
    if(cmd==='状态')return '三国杀移动版 · 官方公开数据核心运行\n当前QQ社区会话：'+(this.vault.get(ctx.owner)?.session?'已授权并加密保存':'尚未授权')+'\n三国咸话APP扫码及11类本人接口：已验证连通性；字段解读以官方返回为准\n游戏官号登录：未验证\n华为游戏登录：未接通\n公开资讯/武将/攻略/社区/热榜：可查询';
    if(cmd==='功能')return '已实现：移动版资讯、活动、公告、武将资料、模式介绍、官方攻略、社区搜索、社区热榜、渠道分离身份绑定、加密社区扫码授权及本人数据查询协议。\n已用本人APP授权验证11类接口连通性；当前返回官方数据，字段与APP逐项对照仍待完成。\n尚未完成：官号游戏登录、华为渠道登录、完整游戏排行榜。详见 docs/FEATURES.md。';
    return '未识别命令；发送 '+this.config.read().prefix+'帮助 查看用法。'
  }
}
