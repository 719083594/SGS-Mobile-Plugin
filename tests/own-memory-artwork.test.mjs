import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePortraitResolver} from '../lib/memory-portraits.mjs';
const url='https://sjpubicres.sanguosha.cn/release/character_skins/skins/synthetic.jpg';

test('stopped legacy owned artwork never downloads or enters current RAM resolver',async()=>{
  const result={kind:'ownedSkins',coverage:'official-own-response',protocol:'app-qr-v1',data:{items:[{url,isHave:true}]}};
  const resolver=await preparePortraitResolver(result,null,{fetchImpl:()=>assert.fail('Legacy skin must not download')});
  assert.equal(resolver.imageForOfficialStatic(url),null);
});
test('stopped legacy or unknown recent artwork never downloads',async()=>{
  for(const protocol of ['app-qr-v1','unknown',undefined]){
    const result={kind:'recent',protocol,data:[{general_avatar:['https://sjpubicres.sanguosha.cn/release/character_heads/synthetic.png']}]};
    const resolver=await preparePortraitResolver(result,null,{fetchImpl:()=>assert.fail('Unsupported recent must not download')});
    assert.equal(resolver.imageForGeneral(result.data[0].general_avatar[0]),null);
  }
});
