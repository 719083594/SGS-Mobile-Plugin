import {createFixedHelpDelivery} from './static-help-reply.mjs';
export function createInstructionReply({root,prefix=()=>'#sgs',sendHelp,loadService=()=>import('../../AI-Plugin/src/rendering/static-help-reply.mjs')}={}){
 if(sendHelp!==undefined&&typeof sendHelp!=='function'||typeof loadService!=='function')throw new TypeError('INVALID_FIXED_INSTRUCTION_OPTIONS');
 let factory,delivery,localDelivery;
 async function sharedDelivery(){
  try{
   if(delivery)return delivery;
   factory??=Promise.resolve().then(loadService);
   const service=await factory;
   if(delivery)return delivery;
   if(typeof service?.createFixedHelpDelivery!=='function')throw new Error('STATIC_HELP_SERVICE_UNAVAILABLE');
   delivery=service.createFixedHelpDelivery({root,defaultPrefix:'#sgs'});
   if(typeof delivery!=='function')throw new Error('STATIC_HELP_SERVICE_UNAVAILABLE');
   return delivery;
  }catch{factory=undefined;delivery=undefined;return null;}
 }
 return async e=>{
  const p=typeof prefix==='function'?prefix():prefix,text=String(e.msg||'').trim();
  if(!text.startsWith(p))return false;
  const command=text.slice(p.length).trim(),topic={'官号登录':'sgs-official-login','华为登录':'sgs-huawei-login','功能':'sgs-features'}[command];
  if(!topic||(command==='官号登录'&&(e.group_id||e.isGroup===true||e.privateChat===false)))return false;
  if(sendHelp)return sendHelp(e,topic,{prefix:p});
  // A partial-send exception propagates; only a no-send false result permits
  // local retry, so successful pages cannot be duplicated by the fallback.
  const shared=await sharedDelivery();
  if(shared&&await shared(e,topic,{prefix:p}))return true;
  localDelivery??=createFixedHelpDelivery({root,defaultPrefix:'#sgs'});
  return localDelivery(e,topic,{prefix:p});
 };
}
