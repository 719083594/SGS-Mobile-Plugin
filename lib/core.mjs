import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ConfigStore} from './config.mjs';import {MobilePublicClient,PublicDataError,normalizeHeroName,formatPublic} from './public.mjs';import {formatLoginStatus,bindIdentity} from './login.mjs';
import {parseCommand,parseWinRateArgs,parseGameplayArgs,parseOwnedCollectionArgs} from './commands.mjs';
import {parseHeroCatalogArgs,parseSkinCatalogArgs} from './catalog-query.mjs';
import {formatCatalog} from './catalog-display.mjs';
import {buildOwnedCollection,formatOwnedCollection} from './owned-collection.mjs';
import {CommunityAuthClient,CommunityAuthError} from './community-auth.mjs';import {SessionVault} from './vault.mjs';
import {formatPersonal} from './format-personal.mjs';
import {projectRecentRecords} from './modern-records.mjs';
import {buildWinRateOverview,buildGeneralWinRate,formatWinRate,WinRateError} from './win-rate.mjs';
const OPTIONAL_STAT_ERRORS=new Set(['TIMEOUT','NETWORK_ERROR','HTTP_ERROR','API_ERROR','SOURCE_CHANGED','RESPONSE_TOO_LARGE']);
const optionalStatError=error=>error instanceof CommunityAuthError&&OPTIONAL_STAT_ERRORS.has(error.code);
const modernUserId=value=>typeof value==='string'&&/^[1-9]\d{0,15}$/u.test(value)&&Number.isSafeInteger(Number(value));
const sameChallenge=(current,expected)=>!!current&&current.protocol===expected.protocol&&current.challengeId===expected.challengeId&&current.createdAt===expected.createdAt&&current.qrPayload===expected.qrPayload;
const authorizationArgument=prefix=>{throw new CommunityAuthError('INVALID_ARGUMENT','授权用法：'+prefix+'登录 / 扫码状态 / 授权状态 / 取消扫码；请使用微信扫描官方二维码，原 APP 扫码入口已移除。');};
async function queryWinRateSources(auth,session,kinds,model=0){
  const settled=await Promise.allSettled(kinds.map(kind=>auth.queryOwn(kind,session,['records','recent','bestGeneral'].includes(kind)?{model,...(kind==='recent'?{page:1}:{})}:{})));
  // A successful endpoint never hides expired authorization, an unlinked role,
  // an unsupported protocol, or an unexpected implementation error elsewhere.
  const fatal=settled.find(row=>row.status==='rejected'&&!optionalStatError(row.reason));
  if(fatal)throw fatal.reason;
  const rejected=settled.filter(row=>row.status==='rejected');
  if(rejected.length===settled.length)throw rejected[0].reason;
  return {values:Object.fromEntries(settled.flatMap((row,index)=>row.status==='fulfilled'?[[kinds[index],row.value]]:[])),partial:rejected.length>0};
}
const SHARED_GAMEPLAY=new Set(['winRate','records','recent','force','abilities','bestGeneral']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeScalar=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/gu,' ').slice(0,180):undefined;
function selectFields(value,keys){return object(value)?Object.fromEntries(keys.flatMap(key=>{const v=safeScalar(value[key]);return v===undefined?[]:[[key,v]];})):{};}
const ABILITY_FIELDS=['one','two','three','four','zhu','zhong','fan','nei','wei','shu','wu','qun','ye','landlord','farmer','cards'];
function abilityTree(value,depth=0){
  if(depth>3)return {};
  if(Array.isArray(value))return value.slice(0,100).map(row=>abilityTree(row,depth+1));
  if(!object(value))return {};
  const out=selectFields(value,['name',...ABILITY_FIELDS]);
  for(const key of ['ri','ii','nw','ddz','riTotal','iiTotal','nwTotal','ddzTotal'])if(object(value[key])||Array.isArray(value[key]))out[key]=abilityTree(value[key],depth+1);
  return out;
}
/** Group commands publish only the invoking account's selected game statistics.
 * Neither raw JSON nor unknown API fields can enter the group text or card. */
function sharedGameplay(result){
  if(!SHARED_GAMEPLAY.has(result?.kind)||result.protocol!=='pc-scan-v7')throw new CommunityAuthError('QUERY_UNSUPPORTED','此协议暂不支持在群内展示本人游戏统计，请使用当前微信扫码授权。');
  const data=result.data;let selected;
  if(result.kind==='force')selected={...selectFields(data,['game_total','game_win','win_rate','general_count','skin_count','general_power','mvp']),...(object(data?.game_force)?{game_force:selectFields(data.game_force,['totalForce','doudizhuForce','paiweiForce','guozhanForce','shenfenForce'])}:{})};
  if(result.kind==='recent')selected=(Array.isArray(data)?data:[]).slice(0,10).map(row=>({...selectFields(row,['Model','begin_time','result','outcomeCode']),mvp:row?.mvp===true,run:row?.run===true,...(Array.isArray(row?.general_names)?{general_names:row.general_names.slice(0,4).map(safeScalar).filter(value=>value!==undefined)}:{}),...(Array.isArray(row?.general_avatar)?{general_avatar:row.general_avatar.slice(0,4).map(safeScalar).filter(value=>value!==undefined)}:{})}));
  if(result.kind==='abilities'||result.kind==='bestGeneral')selected=abilityTree(data);
  if(result.kind==='records'){
    selected=selectFields(data,['winGames','totalGames','mvp','rate','nowRank','maxRank','kingNum','maxScore','cWin','beans','force','goldenTicket']);
    if(Array.isArray(data?.rates))selected.rates=data.rates.slice(0,12).map(row=>selectFields(row,['name','rate']));
    if(Array.isArray(data?.rankList))selected.rankList=data.rankList.slice(0,12).map(row=>selectFields(row,['name','num']));
  }
  if(result.kind==='bestGeneral'){selected={list:(Array.isArray(data?.list)?data.list:[]).slice(0,100).map(row=>({...selectFields(row,['total','win']),info:selectFields(row?.info,['name','id','country','country2','url','star','maxStar','grade'])}))};}
  if(result.kind==='winRate')selected=JSON.parse(formatWinRate(result,{exportJson:true}).file.data).data;
  return {kind:result.kind,protocol:result.protocol,scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,gameAuthenticated:false,channelVerified:false,data:selected,...(result.query?{query:{...result.query}}:{}),...(result.sourceUrl?{sourceUrl:result.sourceUrl}:{}),...(result.recentRecords?{recentRecords:sharedGameplay(result.recentRecords)}:{}),...(result.winRateSummary?{winRateSummary:sharedGameplay(result.winRateSummary)}:{})};
}
function groupStatText(result,options={}){
  if(result.kind==='winRate')return {text:formatWinRate(result,options).text.split('\n').filter(line=>!line.startsWith('统计导出：')&&!line.startsWith('来源：')).join('\n')+'\n发送者本人游戏统计'};
  const formatted=formatPersonal(result,{...options,maxLength:8000,maxItems:Math.min(options.maxItems??8,8),dataAlreadyRedacted:true}),lines=[];
  if(['records','recent','force'].includes(result.kind)){
    if(formatted.file||/暂无已核实的中文字段映射/u.test(formatted.text))lines.push('本人游戏统计','官方本次未返回可公开展示的中文统计。');
    else lines.push(...formatted.text.split('\n').filter(line=>!/^未映射字段：|^完整已脱敏 JSON：|^导出已脱敏 JSON：|^来源：/u.test(line)));
    if(result.kind==='records'&&result.winRateSummary)lines.push(groupStatText(result.winRateSummary,options).text);
  }else{
    lines.push(result.kind==='abilities'?'本人能力统计':'本人擅长武将');
    const visit=(value,label='',depth=0)=>{
      if(depth>4||lines.length>100)return;
      if(Array.isArray(value)){for(const row of value.slice(0,20))visit(row,label,depth+1);return;}
      if(!object(value))return;
      const fields=Object.entries(value).filter(([,v])=>!object(v)&&!Array.isArray(v)).map(([key,v])=>key+'：'+v);
      if(fields.length)lines.push((label?label+' · ':'')+fields.join(' · '));
      for(const [key,v] of Object.entries(value))if(object(v)||Array.isArray(v))visit(v,label?label+'/'+key:key,depth+1);
    };visit(result.data);
    if(lines.length===1)lines.push('官方本次未返回可公开展示的统计。');
  }
  if(!lines.some(line=>line==='发送者本人游戏统计'))lines.push('发送者本人游戏统计');
  return {text:lines.join('\n').slice(0,Math.max(500,Math.min(8000,options.maxLength??3500)))};
}
export const rootDefault=fileURLToPath(new URL('../',import.meta.url));
export class SanguoshaMobile{
  #authorizationStarts=new Map();
  constructor(root=rootDefault,options={}){this.root=root;this.options=options;this.config=new ConfigStore(root);const c=this.config.init();this.public=new MobilePublicClient({fetchImpl:options.fetch,timeoutMs:c.timeoutMs,cacheTtlMs:c.cacheSeconds*1000});this.auth=new CommunityAuthClient({fetchImpl:options.fetch,timeoutMs:c.timeoutMs});this.vault=new SessionVault(root,c.credentialsKey);const oldDir=path.join(root,'data/identities');if(fs.existsSync(oldDir)){this.accountFile('100000001');for(const file of fs.readdirSync(oldDir))if(/^[1-9]\d{4,14}\.json$/.test(file))this.identities(file.slice(0,-5));}}
  help(){const p=this.config.read().prefix;return [
    '三国杀移动助手 0.1.0 · 三国杀移动版',
    `${p}资讯 / 活动 / 公告 / 武将 [名称或ID] / 攻略 [关键词] / 模式 [名称]`,
    `${p}全部武将 [页] / 吴国武将 [页] / 武将列表 [全部/魏/蜀/吴/群/神] [页]（官网图鉴）`,
    `${p}皮肤图鉴 [武将] [至尊/传说/原画] [页] / 关羽皮肤 [页]（官方公开图鉴）`,
    `${p}我的武将 [魏/蜀/吴/群/神] [页] / 我的吴国武将 [页] / 我的皮肤 [页]（本人私聊；新版官方完整目录分页，每页12项）`,
    `${p}社区 [关键词] / 热榜 [today/week/all/theme]`,
    `${p}登录 / 扫码状态 / 授权状态 / 取消扫码 / 退出授权（私聊，微信扫码；本人身份验证成功才替换并删除旧授权）`,
    `${p}战绩 [模式] / 近期战绩 [模式] [页码] / 将力 / 能力 / 擅长武将（群内可展示发送者本人统计）`,
    `${p}胜率 [模式] / 势周瑜胜率 [模式] / 胜率 势周瑜 [模式]（如 ${p}势周瑜胜率排位）`,
    '胜率/战绩模式：全部/0、排位/1、身份/2、国战/3、斗地主/4；未返回不表示0胜率。',
    `${p}个人资料 / 资产 / 游戏资料 / 我的武将 / 我的皮肤（仅本人私聊）`,
    `${p}资产 导出 / 战绩 2 导出 / 近期战绩 0 1 导出（所有导出均仅本人私聊）`,
    `${p}官号登录 / 华为登录 / 绑定 官号或华为 游戏ID [区服] / 账户 / 解绑`,
    `${p}功能 / 状态`, '来源：三国杀移动版官网与三国咸话。',
    '当前统一新版微信授权；本人战绩、胜率、将力、能力、资产、拥有武将/皮肤均使用新版官方接口。旧授权与旧查询协议已移除。游戏官号/华为渠道登录仍未证实。“绑定”只保存身份。'
  ].join('\n')}
  accountFile(owner){const id=this.vault.owner(owner);const base=path.resolve(this.root);for(const folder of [base,path.join(base,'data'),path.join(base,'data/identities')])if(fs.existsSync(folder)){const s=fs.lstatSync(folder);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('账户文件路径不合法')}return path.join(base,'data/identities',id+'.json')}
  identities(owner){const value=this.vault.get(owner);const file=this.accountFile(owner);if(!fs.existsSync(file))return value?.identities||[];const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1048576)throw new Error('账户文件不合法');const raw=fs.readFileSync(file,'utf8');const rows=JSON.parse(raw);if(!Array.isArray(rows))throw new Error('账户文件损坏');if(value?.identities&&JSON.stringify(value.identities)!==JSON.stringify(rows))throw new Error('旧身份与加密身份不一致，请保留文件核对');this.saveIdentities(owner,rows);if(JSON.stringify(this.vault.get(owner).identities)!==JSON.stringify(rows))throw new Error('账户加密迁移未验证');const after=fs.lstatSync(file);if(this.accountFile(owner)!==file||after.isSymbolicLink()||!after.isFile()||after.dev!==stat.dev||after.size!==stat.size||after.ino!==stat.ino||fs.readFileSync(file,'utf8')!==raw)throw new Error('旧账户文件已变化，保留原文件');fs.unlinkSync(file);return rows}
  saveIdentities(owner,rows){this.vault.update(owner,value=>({...value,identities:rows}))}
  saveAuth(owner,auth){this.vault.update(owner,value=>({...value,...auth}))}
  invalidateAuthorizationStarts(owner){this.#authorizationStarts.delete(owner);}
  clearAuth(owner){this.invalidateAuthorizationStarts(owner);this.vault.update(owner,current=>{const value={...current};delete value.session;delete value.challenge;delete value.modernChallenge;return Object.keys(value).length?value:null})}
  async startAuthorization(owner){
    const key=owner,generation=Symbol('authorization-start');
    this.#authorizationStarts.set(key,generation);
    try{
      const challenge=await this.auth.start({protocol:'pc-scan-v7'});
      let image;
      if(this.options.qr)image=await this.options.qr(challenge.qrPayload);
      else{const QR=(await import('qrcode')).default;image=await QR.toBuffer(challenge.qrPayload,{width:360,margin:3,errorCorrectionLevel:'M'});}
      // A canceled/older asynchronous start must never resurrect a pending QR.
      if(this.#authorizationStarts.get(key)!==generation)throw new CommunityAuthError('CHALLENGE_CHANGED','扫码请求已变更或已取消；本次二维码未保存。');
      this.saveAuth(owner,{modernChallenge:challenge});
      return {image,text:'请用'+challenge.scanner+'扫描二维码，在官方页面确认登录三国咸话。\n扫码后发送 '+this.config.read().prefix+'扫码状态。\n本人身份验证成功后会加密保存新授权，并删除本bot的旧授权；未完成、失败、过期或取消均保留原授权。新版支持本人资料、战绩、胜率、将力、能力、资产和分页拥有武将/皮肤。请勿转发二维码。'};
    }finally{if(this.#authorizationStarts.get(key)===generation)this.#authorizationStarts.delete(key);}
  }
  async pollAuthorization(owner){
    const key='modernChallenge',challenge=this.vault.get(owner)?.[key];
    if(!challenge)return '没有待确认扫码；请 '+this.config.read().prefix+'登录。';
    if(challenge.protocol!=='pc-scan-v7')throw new CommunityAuthError('AUTH_VALIDATION_FAILED','待扫码请求不是当前授权协议，请重新获取二维码；原有授权保留。');
    const result=await this.auth.poll(challenge);
    if(result.status==='pending')return '尚未完成官方扫码确认；原有授权保留。';
    if(result.status==='authorized'){
      const session=result.session;
      if(!session||session.protocol!==challenge.protocol||session.scope!=='sanguosha-community'||session.gameVersion!=='sanguosha-mobile'||typeof session.token!=='string'||!session.token||!modernUserId(session.communityUserId))throw new CommunityAuthError('AUTH_VALIDATION_FAILED','官方未返回可验证的本人授权，原有授权保留。');
      this.vault.update(owner,current=>{
        if(!sameChallenge(current?.[key],challenge))throw new CommunityAuthError('CHALLENGE_CHANGED','扫码请求已变更或已取消；本次结果未保存，请重新查询当前扫码状态。');
        const next={...current,session};
        delete next[key];
        // Successful modern authorization is the one atomic cutover point.
        // Remove the old credential and any old pending QR; never retain a fallback.
        delete next.challenge;delete next.modernChallenge;
        return next;
      });
      this.invalidateAuthorizationStarts(owner);
      return '新版三国咸话本人授权已验证并加密保存，旧授权已从本bot删除。可发送 '+this.config.read().prefix+'我的武将 / 我的吴国武将 / 我的皮肤 查看官方分页拥有列表；战绩、胜率、资产等均已使用新版官方接口，旧查询协议已移除。';
    }
    if(result.status==='expired'||result.status==='failed'){
      this.vault.update(owner,current=>{
        if(!sameChallenge(current?.[key],challenge))return current;
        const next={...current};delete next[key];return Object.keys(next).length?next:null;
      });
      return '二维码已'+(result.status==='expired'?'过期':'失效')+'，原有授权保留；请重新 '+this.config.read().prefix+'登录。';
    }
    throw new CommunityAuthError('SOURCE_CHANGED','官方扫码状态暂无法确认，原有授权保留。');
  }
  async handle(event){
    const c=this.config.read(),text=String(event.text??event.msg??'').trim();
    if(!c.enabled||!text.startsWith(c.prefix))return {handled:false};
    let body=text.slice(c.prefix.length).trim();
    const textOnly=event.imageReply===true&&/\s+文字$/.test(body);
    if(textOnly)body=body.replace(/\s+文字$/,'').trim();
    const {cmd,arg,heroShorthand=false}=parseCommand(body);
    const privateChat=!event.group_id&&event.isGroup!==true&&event.privateChat!==false;
    const ctx={owner:String(privateChat?event.owner||event.user_id||'':event.user_id||event.owner||''),privateChat,imageReply:event.imageReply===true&&!textOnly,heroShorthand};
    try{
      const r=await this.command(cmd,arg,ctx);
      return typeof r==='object'?{handled:true,...r}:{handled:true,text:String(r).slice(0,c.maxReplyChars)};
    }catch(error){
      const publicArgumentError=error instanceof PublicDataError&&['NOT_FOUND','AMBIGUOUS_HERO','INVALID_ARGUMENT'].includes(error.code);
      return {handled:true,text:error instanceof CommunityAuthError||error instanceof WinRateError||publicArgumentError?error.message:'查询未完成：参数不合法或官方接口暂不可用。请稍后再试。'};
    }
  }
  async command(cmd,arg,ctx){const limit=this.config.read().maxItems;
    const publicReply=result=>{const text=['heroCatalog','skinCatalog'].includes(result?.kind)?formatCatalog(result,{prefix:this.config.read().prefix}):formatPublic(result,{maxItems:limit,maxLength:this.config.read().maxReplyChars});return ctx.imageReply?{text,card:{type:'public',private:false,result,params:{command:cmd}}}:text;};
    if(cmd==='帮助')return ctx.imageReply?{text:this.help(),card:{type:'help',private:false}}:this.help();if(['资讯','公告','活动'].includes(cmd))return publicReply(await this.public.news({category:cmd==='活动'?'活动公告':cmd==='资讯'?'资讯':'最新',limit}));
    if(cmd==='武将列表'){
      let args;try{args=parseHeroCatalogArgs(arg);}catch{return '用法：'+this.config.read().prefix+'全部武将 [页] / 吴国武将 [页] / 武将列表 [魏/蜀/吴/群/神] [页]。';}
      return publicReply(await this.public.heroCatalog(args));
    }
    if(cmd==='皮肤图鉴'){
      let args;try{args=parseSkinCatalogArgs(arg);}catch{return '用法：'+this.config.read().prefix+'皮肤图鉴 [武将] [至尊/传说/原画] [页] / 关羽皮肤 [页]。';}
      return publicReply(await this.public.skinCatalog(args));
    }
    if(['登录','社区授权','扫码状态','授权状态','个人资料','战绩','近期战绩','将力','资产','皮肤','武将收藏','能力','擅长武将','游戏资料','胜率','我的武将','我的皮肤'].includes(cmd)&&!this.config.read().personalDataEnabled)return '管理员已关闭社区授权和个人数据查询；仍可取消扫码或退出已有授权。';
    if(cmd==='我的武将'||cmd==='我的皮肤'){
      if(!ctx.privateChat)return '本人收藏请在私聊查询；发送 '+this.config.read().prefix+cmd+'。';
      let args;try{args=parseOwnedCollectionArgs(arg,{skins:cmd==='我的皮肤'});}catch{return '用法：'+this.config.read().prefix+(cmd==='我的皮肤'?'我的皮肤 [页]':'我的武将 [全部/魏/蜀/吴/群/神] [页] / 我的吴国武将 [页]')+'；页码1～1000，不支持指定其他账号或导出。';}
      const {page,countryType}=args,value=this.vault.get(ctx.owner),kind=cmd==='我的武将'?'ownedGenerals':'ownedSkins';
      if(!value?.session)return '请先 '+this.config.read().prefix+'登录 并扫码确认；每个用户使用自己的加密授权。';
      const collectionResult=await this.auth.queryOwn(kind,value.session,{page,countryType});
      const result=buildOwnedCollection({collectionResult,kind,page,countryType});
      const output={text:formatOwnedCollection(result,{prefix:this.config.read().prefix})};
      return ctx.imageReply?{...output,card:{type:'personal',private:true,result,params:{command:cmd,page,countryType}}}:output;
    }
    if(cmd==='胜率'){
      let args;try{args=parseWinRateArgs(arg);}catch{return '用法：'+this.config.read().prefix+'胜率 [武将完整名称] [排位/身份/国战/斗地主/全部]；例如 '+this.config.read().prefix+'势周瑜胜率排位。';}
      const {name,model,gameMode,exportJson}=args;
      if(!ctx.privateChat&&exportJson)return '完整统计导出请在本人私聊使用；群内仅展示发送者自己的游戏统计。';
      const value=this.vault.get(ctx.owner);if(!value?.session)return '请先 '+this.config.read().prefix+'登录 并扫码确认；只查询本人已授权的官方统计。';
      const {values,partial}=await queryWinRateSources(this.auth,value.session,name?['bestGeneral']:['gameInfo','records','recent'],model);
      if(values.recent)values.recent=projectRecentRecords(values.recent,{model,page:1});
      let result;
      try{result=name?buildGeneralWinRate(name,values,{model}):buildWinRateOverview(values,{model})}catch(error){
        if(partial&&error instanceof WinRateError&&error.code==='GENERAL_STATS_NOT_RETURNED')throw new WinRateError('GENERAL_STATS_NOT_RETURNED','本次成功返回的数据未含该武将'+(model?'的'+gameMode:'')+'统计，另一统计接口暂不可用；不代表胜率为 0，请稍后重试。');
        throw error;
      }
      if(partial)result.data.notice+=' 部分官方统计接口暂不可用，仅显示本次成功返回的数据。';
      if(!ctx.privateChat)result=sharedGameplay(result);
      const output=ctx.privateChat?formatWinRate(result,{prefix:this.config.read().prefix,exportJson}):groupStatText(result,{prefix:this.config.read().prefix});
      return ctx.imageReply&&!exportJson?{...output,card:{type:'personal',private:true,result,params:{command:'胜率',general:name,name,model,gameMode},...(!ctx.privateChat?{share:{scope:'own-gameplay',owner:ctx.owner}}:{})}}:output;
    }
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
    if(cmd==='华为登录')return formatLoginStatus('huawei')+'\n已有三国咸话关联角色时，可 #sgs登录，再查询本人资料；这一步不宣称华为游戏登录。';
    if(cmd==='官号登录'){if(!ctx.privateChat)return '官号游戏登录状态请在私聊查看。';return formatLoginStatus('official')+'\n当前未接通官号游戏授权协议。已有三国咸话关联角色时，请发送 '+this.config.read().prefix+'登录，取得社区本人资料授权；这一步不是官号游戏登录。'}
    if(cmd==='登录'||cmd==='社区授权'){
      if(!ctx.privateChat)return '社区扫码授权只能在私聊开始。';
      if(cmd!=='社区授权'&&arg||cmd==='社区授权'&&!['','微信'].includes(arg))return authorizationArgument(this.config.read().prefix);
      return this.startAuthorization(ctx.owner);
    }
    if(cmd==='扫码状态'){
      if(!ctx.privateChat)return '扫码状态只能在私聊查询。';
      if(!['','微信'].includes(arg))return authorizationArgument(this.config.read().prefix);
      return this.pollAuthorization(ctx.owner);
    }
    if(cmd==='授权状态'){
      if(!ctx.privateChat)return '授权状态只能在本人私聊查询。';if(arg)return authorizationArgument(this.config.read().prefix);
      const value=this.vault.get(ctx.owner),session=value?.session;
      const label=session?.protocol==='pc-scan-v7'&&modernUserId(session.communityUserId)?'新版三国咸话本人授权':session?'授权协议已停用，请重新登录':'尚未授权';
      return '当前：'+label+'。\n扫码：'+(value?.modernChallenge?'等待确认':'无待确认请求')+'。\n本人身份验证成功才替换并删除旧授权；本人查询统一新版官方接口；拥有武将/皮肤支持分页，旧协议已移除。';
    }
    if(cmd==='取消授权'){
      if(!ctx.privateChat)return '取消扫码请在本人私聊操作。';if(arg)return authorizationArgument(this.config.read().prefix);
      this.invalidateAuthorizationStarts(ctx.owner);
      this.vault.update(ctx.owner,current=>{if(!current)return null;const next={...current};delete next.modernChallenge;return Object.keys(next).length?next:null;});
      return '已取消待确认扫码，当前有效授权保留。';
    }
    if(cmd==='退出授权'){if(!ctx.privateChat)return '退出授权请私聊。';if(arg)return authorizationArgument(this.config.read().prefix);const value=this.vault.get(ctx.owner);let remotely=false,failed=false;try{if(value?.session){const r=await this.auth.logout(value.session);remotely=r.revokedRemotely===true}}catch{failed=true}finally{this.clearAuth(ctx.owner)}return '已删除本bot保存的社区会话和所有待确认扫码。'+(remotely?'官方会话已注销。':failed?'官方远程注销未成功，请在官方APP管理剩余会话。':'此协议尚无已核实的远程撤销接口；如需撤销所有会话，请在官方APP管理。')}
    if(cmd==='绑定'){if(!ctx.privateChat)return '游戏身份绑定请使用私聊。';const [label,gameId,server='']=arg.split(/\s+/);const channel=label==='官号'?'official':label==='华为'?'huawei':label;if(!this.config.read().channels[channel])return '该渠道未启用。';const r=bindIdentity({channel,gameId,server});const rows=this.identities(ctx.owner);const next=rows.filter(x=>x.identityKey!==r.identityKey);next.push(r);this.saveIdentities(ctx.owner,next);return '已加密保存'+(channel==='official'?'官号':'华为')+'游戏身份 '+gameId+'。这一步尚未登录，也没有取得个人战绩授权。'}
    if(cmd==='账户'){if(!ctx.privateChat)return '账户列表请在私聊查询。';return this.identities(ctx.owner).map(r=>`${r.channel} · ${r.gameId} · ${r.server||'未选区服'} · 未认证`).join('\n')||'尚未绑定游戏身份。'}
    if(cmd==='解绑'){if(!ctx.privateChat)return '解绑请使用私聊。';const rows=this.identities(ctx.owner);if(arg){const channel=arg==='官号'?'official':arg==='华为'?'huawei':arg;this.saveIdentities(ctx.owner,rows.filter(r=>r.channel!==channel))}else this.saveIdentities(ctx.owner,[]);return '已删除本bot保存的游戏身份。'}
    if(['个人资料','战绩','近期战绩','将力','资产','能力','擅长武将','游戏资料'].includes(cmd)){
      const kind={'个人资料':'summary','战绩':'records','近期战绩':'recent','将力':'force','资产':'assets','能力':'abilities','擅长武将':'bestGeneral','游戏资料':'gameInfo'}[cmd];
      if(!ctx.privateChat&&!SHARED_GAMEPLAY.has(kind))return '该个人资料仅在私聊查询本人信息；群内可查询本人的胜率、战绩、将力、能力或擅长武将。';
      let parsed;try{parsed=parseGameplayArgs(arg,{recent:kind==='recent',modeAllowed:['records','recent','force','bestGeneral'].includes(kind)});}catch{return kind==='records'||kind==='recent'?'战绩模式为 0全部、1排位、2身份、3国战、4斗地主，也可填写模式名称；近期战绩页码为 1 至 1000。':'该查询不接受账号或其他参数；导出请在本人私聊使用。';}
      const {exportJson,gameMode,...params}=parsed;
      if(!ctx.privateChat&&exportJson)return '完整资料导出请在本人私聊使用；群内仅展示发送者自己的游戏统计。';
      const value=this.vault.get(ctx.owner);if(!value?.session)return '请先 '+this.config.read().prefix+'登录 并扫码确认；官号/华为游戏登录尚未验证，公开信息不能代替本人资料。';
      let r=await this.auth.queryOwn(kind,value.session,params);
      if(kind==='recent')r=projectRecentRecords(r,{model:params.model,page:params.page});
      if(kind==='records'){
        let recent,partial=false;
        try{recent=projectRecentRecords(await this.auth.queryOwn('recent',value.session,{model:params.model,page:1}),{model:params.model,page:1})}catch(error){if(!optionalStatError(error))throw error;partial=true;}
        const winRateSummary=buildWinRateOverview({records:r,recent},{model:params.model});
        if(partial)winRateSummary.data.notice+=' 官方近期记录暂不可用，仍展示当前模式正式统计。';
        r={...r,winRateSummary,...(recent?{recentRecords:recent}:{})};
      }
      if(!ctx.privateChat)r=sharedGameplay(r);
      const options={command:cmd,prefix:this.config.read().prefix,maxLength:this.config.read().maxReplyChars,maxItems:limit,exportJson,dataAlreadyRedacted:true,...params};
      const output=ctx.privateChat?formatPersonal(r,options):groupStatText(r,options);
      return ctx.imageReply&&!exportJson?{...output,card:{type:'personal',private:true,result:r,params:{command:cmd,...params,...(gameMode?{gameMode}:{})},...(!ctx.privateChat?{share:{scope:'own-gameplay',owner:ctx.owner}}:{})}}:output};
    if(cmd==='状态')return '三国杀移动版 · 官方公开数据核心运行\n当前QQ社区会话：'+(this.vault.get(ctx.owner)?.session?'已授权并加密保存':'尚未授权')+'\n新版微信扫码：本人资料、战绩、胜率、将力、能力、资产与拥有目录分页已接通\n旧授权入口与旧查询协议：已移除\n游戏官号登录：未验证\n华为游戏登录：未接通\n公开资讯/武将/攻略/社区/热榜：可查询';
    if(cmd==='功能')return '已实现：移动版资讯、活动、公告、武将资料、武将与势力分页图鉴、官方皮肤绘影堂图鉴、模式介绍、官方攻略、社区搜索、社区热榜、渠道分离身份绑定、加密社区扫码授权及本人数据查询协议。\n图鉴范围以官网公开收录为准，不代表客户端全集或本人拥有。\n新版官方本人拥有目录已完成逐页验证，支持我的武将、我的吴国武将等势力筛选和我的皮肤；每页12项，不一次加载全部图片。\n本人战绩、胜率、将力、能力、资产和游戏资料已统一新版官方接口；旧协议已移除。\n尚未完成：官号游戏登录、华为渠道登录、完整游戏排行榜。详见 docs/FEATURES.md。';
    return '未识别命令；发送 '+this.config.read().prefix+'帮助 查看用法。'
  }
}
