import {privateFileBuffer} from './lib/private-file.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {SanguoshaMobile} from './api.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));let apps={};let enabled=false;try{enabled=JSON.parse(fs.readFileSync(path.join(root,'config/local.json'),'utf8')).adapter==='yunzai'}catch{}
if(enabled){
  const Base=globalThis.plugin||(await import('../../lib/plugins/plugin.js')).default;const engine=new SanguoshaMobile(root);
  class SanguoshaCommands extends Base{
    constructor(){const p=engine.config.read().prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');super({name:'三国移动助手',dsc:'三国杀移动版',event:'message',priority:-8000,rule:[{reg:new RegExp('^'+p),fnc:'run',title:'三国杀移动版助手',description:'#三国帮助：公开资料、社区扫码、本人数据；游戏渠道状态见帮助'}]})}
    async run(e){const r=await engine.handle({...e,owner:String(e.user_id),text:e.msg,privateChat:!e.group_id});if(!r.handled)return false;if(r.image)await e.reply([r.text,globalThis.segment?.image?segment.image(r.image):r.image]);else if(r.file){if(!e.friend?.sendFile)await e.reply('协议端不支持文件发送；请用独立API读取本人数据。');else await e.friend.sendFile(privateFileBuffer(r.file.data),r.file.name)}else await e.reply(r.text);return true}
  }
  apps={SanguoshaCommands};
}
export {apps};
