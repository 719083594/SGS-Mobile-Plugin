import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SanguoshaMobile} from '../api.mjs';
test('old credentials cannot query a preview or fallback after upgrade',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgs-retired-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let calls=0;
 const bot=new SanguoshaMobile(root,{fetch:async()=>{calls++;assert.fail('retired credentials may not reach network');}});bot.vault.get=()=>({session:{protocol:'app-qr-v1',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',token:'synthetic-retired-token'}});
 for(const command of ['我的武将','我的皮肤','我的吴国武将']){const r=await bot.handle({text:'#sgs'+command,user_id:'100000001',privateChat:true,imageReply:true});assert.equal(r.card,undefined);assert.match(r.text,/协议|重新|微信|#sgs登录/);}
 assert.equal(calls,0);
});
