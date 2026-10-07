let factory;
export function createInstructionReply({root,prefix=()=>'#sgs',sendHelp}={}){
 let delivery;
 return async e=>{
  const p=typeof prefix==='function'?prefix():prefix,text=String(e.msg||'').trim();
  if(!text.startsWith(p))return false;
  const command=text.slice(p.length).trim(),topic={'官号登录':'sgs-official-login','华为登录':'sgs-huawei-login','功能':'sgs-features'}[command];
  if(!topic||(command==='官号登录'&&(e.group_id||e.isGroup===true||e.privateChat===false)))return false;
  if(!sendHelp){try{factory??=import('../../AI-Plugin/src/rendering/static-help-reply.mjs');delivery??=(await factory).createFixedHelpDelivery({root,defaultPrefix:'#sgs'});}catch{factory=undefined;return false;}}
  return (sendHelp||delivery)(e,topic,{prefix:p});
 };
}
