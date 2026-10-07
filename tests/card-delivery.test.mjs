import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SanguoshaMobile} from '../api.mjs';
import {sendCardReply,CardReplyError} from '../lib/card-reply.mjs';

async function workspace(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sg-card-flow-'));try{await fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}}

test('图片帮助仅适配器启用，文字回退不请求网络',()=>workspace(async root=>{
 const bot=new SanguoshaMobile(root,{fetch:async()=>{throw new Error('unexpected')}});
 const e={owner:'100000001',privateChat:true};
 assert.equal((await bot.handle({...e,text:'#sgs帮助'})).card,undefined);
 assert.deepEqual((await bot.handle({...e,text:'#sgs帮助',imageReply:true})).card,{type:'help',private:false});
 assert.equal((await bot.handle({...e,text:'#sgs帮助 文字',imageReply:true})).card,undefined);
}));

test('个人图片不绕过授权和群限制，显式文字与导出保持原协议且每次只查一次',()=>workspace(async root=>{
 const bot=new SanguoshaMobile(root);const e={owner:'100000001',privateChat:true,imageReply:true};let calls=0;
 bot.auth.queryOwn=async(kind,session,params)=>{calls++;return {kind,protocol:'app-qr-v1',data:{yb:1234},sourceUrl:'https://hi-gateway.sanguosha.cn/api/game/v2/general/property'}};
 assert.equal((await bot.handle({...e,text:'#sgs资产'})).card,undefined);assert.equal(calls,0);
 bot.vault.set(e.owner,{session:{token:'synthetic',protocol:'app-qr-v1'}});
 assert.equal((await bot.handle({...e,group_id:'200000001',text:'#sgs资产'})).card,undefined);assert.equal(calls,0);
 const card=await bot.handle({...e,text:'#sgs资产'});assert.equal(card.card.private,true);assert.equal(card.card.type,'personal');assert.equal(calls,1);
 const plain=await bot.handle({...e,text:'#sgs资产 文字'});assert.equal(plain.card,undefined);assert.match(plain.text,/元宝/);assert.equal(calls,2);
 const full=await bot.handle({...e,text:'#sgs资产 导出'});assert.equal(full.card,undefined);assert(full.file);assert.equal(JSON.parse(full.file.data).data.yb,1234);assert.equal(calls,3);
}));

test('群聊公开帮助仍可发送，私密卡片在生成前拒绝混合群上下文',async()=>{
 let built=false;
 await assert.rejects(sendCardReply({card:{private:true}},{event:{group_id:'200000001',privateChat:true},buildCards:()=>{built=true}}),/PRIVATE_CARD_ONLY/);
 assert.equal(built,false);
 const output=[];
 assert.equal(await sendCardReply({card:{private:false}},{event:{group_id:'200000001',reply:async item=>output.push(item)},buildCards:async()=>[{html:'public'}],render:async()=>Buffer.from('synthetic-image'),image:bytes=>bytes}),true);
 assert.equal(output.length,1);assert(Buffer.isBuffer(output[0]));
});


test('后页失败明确保留已发送页数，第一页失败则保留原错误',async()=>{
 const failure=new Error('synthetic-render-error'),output=[];
 const options={event:{reply:async item=>output.push(item)},buildCards:()=>[{html:'one'},{html:'two'}],render:async card=>{if(card.html==='two')throw failure;return Buffer.from('synthetic-image')},image:bytes=>bytes};
 await assert.rejects(sendCardReply({card:{private:true}},options),error=>error instanceof CardReplyError&&error.sent===1&&error.total===2&&error.cause===failure&&!error.message.includes('synthetic'));
 assert.equal(output.length,1);
 await assert.rejects(sendCardReply({card:{private:true}},{...options,render:async()=>{throw failure}}),error=>error===failure);
 assert.equal(output.length,1);
});
