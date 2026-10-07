import test from 'node:test';import assert from 'node:assert/strict';
import {createInstructionReply} from '../lib/fixed-instructions.mjs';
test('固定说明不拦截动态扫码/账户，官号私聊检查及文字版仍有效',async()=>{
 const topics=[],send=createInstructionReply({sendHelp:async(e,topic)=>{topics.push(topic);return true;}});
 assert.equal(await send({msg:'#sgs官号登录',group_id:'synthetic'}),false);
 assert.equal(await send({msg:'#sgs社区授权'}),false);
 assert.equal(await send({msg:'#sgs账户'}),false);
 assert.equal(await send({msg:'#sgs功能 文字'}),false);
 assert.deepEqual(topics,[]);
 assert.equal(await send({msg:'#sgs官号登录'}),true);assert.equal(await send({msg:'#sgs华为登录'}),true);
 assert.equal(await send({msg:'#sgs功能',group_id:'synthetic'}),true);
 assert.deepEqual(topics,['sgs-official-login','sgs-huawei-login','sgs-features']);
});
