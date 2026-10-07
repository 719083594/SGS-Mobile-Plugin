import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativePersonalCards} from '../lib/native-views.mjs';
import {createReplyCardBuilder} from '../lib/reply-cards.mjs';
import {fileURLToPath} from 'node:url';

// Legacy shape is a synthetic rejection fixture, never a supported account.
const legacy=kind=>({kind,protocol:'app-qr-v1',coverage:'official-own-response',data:{items:[{id:1,name:'合成旧条目'}],page:1,pageSize:24,pages:1,returnedCount:1,total:1}});
test('legacy owned views are rejected before any private artwork is resolved',()=>{
  const assetResolver={imageForGeneral:()=>assert.fail('Legacy artwork must not resolve'),imageForOfficialStatic:()=>assert.fail('Legacy artwork must not resolve')};
  for(const kind of ['ownedGenerals','ownedSkins'])assert.equal(buildNativePersonalCards(legacy(kind),{assetResolver}),null);
});
test('production reply builder rejects stopped legacy owned projections',async()=>{
  const build=createReplyCardBuilder({root:fileURLToPath(new URL('../',import.meta.url))});
  for(const kind of ['ownedGenerals','ownedSkins'])await assert.rejects(build({type:'personal',private:true,result:legacy(kind)}),{code:'INVALID_NATIVE_CARD'});
});
