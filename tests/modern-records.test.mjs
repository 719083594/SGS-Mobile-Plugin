import test from 'node:test';import assert from 'node:assert/strict';
import {projectRecentRecords} from '../lib/modern-records.mjs';
const envelope=(rows,query={model:0,wireMode:0,page:1,pageSize:10})=>({kind:'recent',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,sourceUrl:'https://api-xh.sanguosha.cn/user/gameRecordList/total',query,data:{list:rows}});
const row=(extra={})=>({result:0,mode:'4',beginTime:1700000000,mvp:1,run:0,myGeneralAvatar:['https://sjpubicres.sanguosha.cn/release/character_heads/synthetic.png'],players:[{isMe:true,general:['合成武将'],nick:'synthetic-private-name'},{isMe:false,general:['other-player-hero'],token:'synthetic-private-token'}],...extra});
test('records keep invoking heroes only, verified outcome codes and official seconds in Shanghai time',()=>{
  const input=envelope([row(),row({result:1}),row({result:99})]),before=structuredClone(input),out=projectRecentRecords(input);
  assert.deepEqual(out.data.map(r=>r.outcomeCode),[0,1,null]);assert.deepEqual(out.data.map(r=>r.result),['胜利','失败','未知']);
  assert.equal(out.data[0].Model,'排位赛');assert.match(out.data[0].begin_time,/2023/);assert.deepEqual(out.data[0].general_names,['合成武将']);assert(out.data[0].mvp);
  assert.doesNotMatch(JSON.stringify(out),/synthetic-private|other-player|"players"|"nick"|token/);assert.deepEqual(input,before);
});
test('crossed page, mode, source, legacy and oversized records fail before projection',()=>{
  const good=envelope([row()]);for(const value of [{...good,protocol:'app-qr-v1'},{...good,sourceUrl:'https://evil.invalid'},{...good,query:{...good.query,page:2}},envelope([row({mode:'3'})],{model:1,wireMode:4,page:1,pageSize:10}),envelope(Array.from({length:101},()=>row()))]){
    const model=value.query?.model??0;assert.throws(()=>projectRecentRecords(value,{model,page:1}),e=>e.code==='SOURCE_CHANGED');
  }
});
test('official size parameter is a request, bounded larger batches remain complete and self-only',()=>{
  const input=envelope(Array.from({length:20},()=>row()));const out=projectRecentRecords(input);
  assert.equal(out.query.pageSize,10);assert.equal(out.data.length,20);assert.match(out.notice,/前10条/);
  assert.doesNotMatch(JSON.stringify(out),/other-player|private-name|private-token|"players"/);
  input.data.list[19].players=null;assert.throws(()=>projectRecentRecords(input),error=>error.code==='SOURCE_CHANGED');
});
test('unknown mode labels are not presented as all modes and remote avatar references are rejected',()=>{
  const out=projectRecentRecords(envelope([row({mode:'99',myGeneralAvatar:['https://evil.invalid/a.png','file:///private','https://sjpubicres.sanguosha.cn/release/character_heads/synthetic.png?token=synthetic']})]));
  assert.equal(out.data[0].Model,'官方未标明模式');assert.deepEqual(out.data[0].general_avatar,[]);
  assert.throws(()=>projectRecentRecords(envelope([row({mode:'wrong'})])),e=>e.code==='SOURCE_CHANGED');
});
