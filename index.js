import {privateFileUpload} from './lib/private-file.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {SanguoshaMobile} from './api.mjs';
import {createCardRenderer,CardRenderError} from './lib/card-renderer.mjs';
import {resolveHostPuppeteer} from './lib/host-bridge.mjs';
import {buildHelpCard,buildPersonalCards,buildPublicCards} from './lib/card-views.mjs';
import {createAssetResolver} from './lib/ui-assets.mjs';
import {preparePortraitResolver} from './lib/memory-portraits.mjs';
import {sendCardReply} from './lib/card-reply.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));let apps={};let enabled=false;try{enabled=JSON.parse(fs.readFileSync(path.join(root,'config/local.json'),'utf8')).adapter==='yunzai'}catch{}
if(enabled){
  const Base=globalThis.plugin||(await import('../../lib/plugins/plugin.js')).default;const engine=new SanguoshaMobile(root);
  const hostRenderer=resolveHostPuppeteer((await import('../../lib/renderer/loader.js')).default);
  const renderCard=createCardRenderer({botRoot:path.resolve(root,'../..'),getBrowser:()=>hostRenderer.browser,ensureBrowser:()=>hostRenderer.browserInit(),assetRoots:[path.join(root,'resources/ui')],bootstrapFile:path.join(root,'resources/ui/shell.html')});
  const assetResolver=createAssetResolver(root);
  async function buildReplyCards(card){
    const options={prefix:engine.config.read().prefix,assetResolver,dataAlreadyRedacted:true,...card.params};
    if(card.type==='help')return [buildHelpCard(options)];
    if(card.type==='personal'){
      if(card.result?.kind==='recent')options.assetResolver=await preparePortraitResolver(card.result,assetResolver);
      return buildPersonalCards(card.result,options);
    }
    return buildPublicCards(card.result,options);
  }
  class SanguoshaCommands extends Base{
    constructor(){const p=engine.config.read().prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');super({name:'三国移动助手',dsc:'三国杀移动版',event:'message',priority:-8000,rule:[{reg:new RegExp('^'+p),fnc:'run',title:'三国杀移动版助手',description:'#三国帮助：公开资料、社区扫码、本人数据；游戏渠道状态见帮助'}]})}
    async run(e){const r=await engine.handle({...e,owner:String(e.user_id),text:e.msg,privateChat:!e.group_id,imageReply:true});if(!r.handled)return false;if(r.card){try{await sendCardReply(r,{event:e,render:renderCard,image:bytes=>globalThis.segment.image(bytes),buildCards:buildReplyCards});return true}catch(error){globalThis.logger?.warn?.('[Sanguosha] 图片处理失败：'+(error instanceof CardRenderError?error.code:'SEND_OR_VIEW_FAILED'));await e.reply('图片暂未生成，先显示文字；命令末尾加「文字」可查看文字版。')}}if(r.image)await e.reply([r.text,globalThis.segment?.image?segment.image(r.image):r.image]);else if(r.file){if(!e.friend?.sendFile)await e.reply('协议端不支持文件发送；请用独立API读取本人数据。');else {const upload=privateFileUpload(r.file.data,r.file.name);await e.friend.sendFile(upload.buffer,upload.name)}}else await e.reply(r.text);return true}
  }
  apps={SanguoshaCommands};
}
export {apps};
