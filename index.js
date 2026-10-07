import {privateFileUpload} from './lib/private-file.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {SanguoshaMobile} from './api.mjs';
import {createCardRenderer,CardRenderError} from './lib/card-renderer.mjs';
import {createQueuedCardRenderer,CardRenderQueueError} from './lib/card-render-queue.mjs';
import {createPublicHelpCache} from './lib/public-help-cache.mjs';
import {resolveHostPuppeteer} from './lib/host-bridge.mjs';
import {sendCardReply,CardReplyError} from './lib/card-reply.mjs';
import {createBundledHelpReader} from './lib/bundled-help.mjs';
import {NativeCardRenderError} from './lib/native-card-renderer.mjs';
import {createSharedNativeCardRenderer} from './lib/shared-renderer.mjs';
import {createReplyCardBuilder} from './lib/reply-cards.mjs';
import {createInstructionReply} from './lib/fixed-instructions.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));let apps={};let enabled=false;try{enabled=JSON.parse(fs.readFileSync(path.join(root,'config/local.json'),'utf8')).adapter==='yunzai'}catch{}
if(enabled){
  const Base=globalThis.plugin||(await import('../../lib/plugins/plugin.js')).default;const engine=new SanguoshaMobile(root);
  const replyInstructions=createInstructionReply({root,prefix:()=>engine.config.read().prefix});
  const hostRenderer=resolveHostPuppeteer((await import('../../lib/renderer/loader.js')).default);
  const renderCard=createQueuedCardRenderer(createCardRenderer({botRoot:path.resolve(root,'../..'),getBrowser:()=>hostRenderer.browser,ensureBrowser:()=>hostRenderer.browserInit(),assetRoots:[path.join(root,'resources/ui')],bootstrapFile:path.join(root,'resources/ui/shell.html'),deliverBeforeCleanup:true,onMetrics:metrics=>globalThis.logger?.info?.('[Sanguosha] 图片耗时：'+JSON.stringify(metrics))}),{botRoot:path.resolve(root,'../..')});
  // All standard dynamic cards use AI-Plugin's process-wide native queue.
  // A rendering error never starts Chromium as a hidden retry.
  const renderDynamic=createSharedNativeCardRenderer({onMetrics:metrics=>globalThis.logger?.info?.('[Sanguosha] 共享原生图片耗时：'+JSON.stringify(metrics))});
  const readHelp=createBundledHelpReader({root,defaultPrefix:'#sgs'});
  const renderCachedHelp=createPublicHelpCache(renderCard);
  const renderHelp=card=>{const prefix=engine.config.read().prefix;if(prefix==='#sgs'){const bytes=readHelp({prefix,private:card.private});if(!bytes)throw new CardRenderError('HELP_IMAGE_UNAVAILABLE');return bytes}return renderCachedHelp(card)};
  const buildReplyCards=createReplyCardBuilder({root,prefix:()=>engine.config.read().prefix});
  class SanguoshaCommands extends Base{
    constructor(){const p=engine.config.read().prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');super({name:'三国杀移动助手',dsc:'三国杀移动版',event:'message',priority:-8000,rule:[{reg:new RegExp('^'+p),fnc:'run',title:'三国杀移动助手',description:'#sgs帮助：公开资料、社区扫码、本人数据；游戏渠道状态见帮助'}]})}
    async run(e){const r=await engine.handle({...e,owner:String(e.user_id),text:e.msg,privateChat:!e.group_id,imageReply:true});if(!r.handled)return false;if(await replyInstructions(e))return true;if(r.card){try{await sendCardReply(r,{event:e,render:r.card.type==='help'?renderHelp:renderDynamic,image:bytes=>globalThis.segment.image(bytes),buildCards:buildReplyCards});return true}catch(error){const failure=error instanceof CardReplyError?error.cause:error;globalThis.logger?.warn?.('[Sanguosha] 图片处理失败：'+(failure instanceof CardRenderError||failure instanceof CardRenderQueueError||failure instanceof NativeCardRenderError?failure.code:'SEND_OR_VIEW_FAILED'));if(error instanceof CardReplyError){await e.reply('已发送 '+error.sent+'/'+error.total+' 页，其余图片未能生成；原命令末尾加「文字」可查看全文。');return true}await e.reply('图片暂未生成，先显示文字；命令末尾加「文字」可查看文字版。')}}if(r.image)await e.reply([r.text,globalThis.segment?.image?segment.image(r.image):r.image]);else if(r.file){if(!e.friend?.sendFile)await e.reply('协议端不支持文件发送；请用独立API读取本人数据。');else {const upload=privateFileUpload(r.file.data,r.file.name);await e.friend.sendFile(upload.buffer,upload.name)}}else await e.reply(r.text);return true}
  }
  apps={SanguoshaCommands};
}
export {apps};
