/** Current official records projected to the invoking player's display fields.
 * Other players, account identifiers and unknown fields never leave this boundary. */
import {CommunityAuthError} from './community-auth.mjs';
export const MODERN_RECORDS_SOURCE='https://api-xh.sanguosha.cn/user/gameRecordList/total';
const WIRES=[0,4,1,2,3],MODES=['全部模式','排位赛','身份场','国战','斗地主'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const changed=()=>{throw new CommunityAuthError('SOURCE_CHANGED','官方近期战绩结构发生变化，暂未生成记录。');};
const label=value=>typeof value==='string'&&value.trim()&&Array.from(value).length<=100&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value)?value.trim():null;
function avatar(value){
  if(typeof value!=='string'||value.length>256)return null;
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='sjpubicres.sanguosha.cn'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.href===value&&/^\/release\/character_heads\/[A-Za-z0-9_-]{1,100}\.(?:png|jpe?g)$/u.test(u.pathname)?value:null;}catch{return null;}
}
export function projectRecentRecords(result,{model=0,page=1}={}){
  const query=result?.query;
  if(result?.kind!=='recent'||result.protocol!=='pc-scan-v7'||result.scope!=='sanguosha-community'||result.gameVersion!=='sanguosha-mobile'||result.communityAuthenticated!==true||
    result.sourceUrl!==MODERN_RECORDS_SOURCE||!object(query)||query.model!==model||query.wireMode!==WIRES[model]||query.page!==page||query.pageSize!==10||
    !Number.isInteger(model)||model<0||model>4||!Number.isInteger(page)||page<1||page>1000||!object(result.data)||!Array.isArray(result.data.list)||result.data.list.length>100)return changed();
  const rows=result.data.list.map(row=>{
    if(!object(row)||!Array.isArray(row.players)||row.players.length>20||!Array.isArray(row.myGeneralAvatar)||row.myGeneralAvatar.length>4)return changed();
    const mode=typeof row.mode==='string'&&/^\d{1,2}$/u.test(row.mode)?Number(row.mode):null;
    if(mode===null||model!==0&&mode!==WIRES[model])return changed();
    const names=row.players.filter(player=>object(player)&&player.isMe===true).flatMap(player=>Array.isArray(player.general)?player.general.slice(0,4).map(label).filter(Boolean):[]);
    const seconds=Number.isSafeInteger(row.beginTime)&&row.beginTime>0&&row.beginTime<=100000000000?row.beginTime:null;
    const date=seconds===null?null:new Date(seconds*1000);
    const time=date&&!Number.isNaN(date.valueOf())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'时间未返回';
    const outcomeCode=row.result===0?0:row.result===1?1:null;
    return {Model:label(row.modeName)??({1:'身份场',2:'国战',3:'斗地主',4:'排位赛'}[mode]??'官方未标明模式'),begin_time:time,result:outcomeCode===0?'胜利':outcomeCode===1?'失败':'未知',outcomeCode,
      general_avatar:row.myGeneralAvatar.map(avatar).filter(Boolean),general_names:[...new Set(names)].slice(0,4),mvp:row.mvp===1,run:row.run===1};
  });
  return {kind:'recent',protocol:'pc-scan-v7',scope:'sanguosha-community',gameVersion:'sanguosha-mobile',communityAuthenticated:true,
    gameAuthenticated:false,channelVerified:false,sourceUrl:MODERN_RECORDS_SOURCE,source:MODERN_RECORDS_SOURCE,
    query:{model,wireMode:WIRES[model],page,pageSize:10},data:rows,
    notice:'页码和size=10按官方APP参数请求；官方可能返回更多记录。图片和近期样本仅取本批前10条，私聊导出保留本批全部安全投影；不代表全部历史对局。'};
}
