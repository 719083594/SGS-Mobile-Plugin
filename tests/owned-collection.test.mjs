import test from 'node:test';import assert from 'node:assert/strict';
import {buildOwnedCollection,formatOwnedCollection} from '../lib/owned-collection.mjs';
test('removed partial-preview sources cannot become a current owned list',()=>{
 for(const protocol of ['app-qr-v1',undefined,'pc-scan-v7'])assert.throws(()=>buildOwnedCollection({kind:'ownedGenerals',collectionResult:{kind:'skins',protocol,sourceUrl:'https://hi-gateway.sanguosha.cn/api/game/v2/general/generalSkins',data:{generalList:[{id:1,name:'合成'}]}}}),e=>e.code==='SOURCE_CHANGED');
 assert.throws(()=>formatOwnedCollection({kind:'ownedGenerals',protocol:'app-qr-v1',coverage:'official-own-response',data:{items:[]}}),e=>e.code==='SOURCE_CHANGED');
});
