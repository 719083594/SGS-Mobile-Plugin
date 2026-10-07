/** Adapter-only image delivery. A view never replaces authentication checks. */
export class CardReplyError extends Error{
 constructor(sent,total,cause){super('CARD_REPLY_INCOMPLETE',{cause});this.name='CardReplyError';this.sent=sent;this.total=total;}
}
const SHAREABLE_GAMEPLAY=new Set(['winRate','records','recent','force','abilities','bestGeneral']);
export function canShareOwnGameplay(result,event){
 const card=result?.card,owner=String(event?.user_id??'');
 return Boolean((event?.group_id||event?.isGroup===true)&&owner&&card?.type==='personal'&&card.private===true&&SHAREABLE_GAMEPLAY.has(card.result?.kind)&&card.share?.scope==='own-gameplay'&&card.share.owner===owner);
}
export async function sendCardReply(result,{event,buildCards,render,image}={}){
 if(!result?.card)return false;
 if(result.card.type==='personal'&&result.card.private!==true)throw new Error('INVALID_PERSONAL_CARD');
 if(result.card.private===true&&(event?.group_id||event?.isGroup===true||event?.privateChat===false)&&!canShareOwnGameplay(result,event))throw new Error('PRIVATE_CARD_ONLY');
 const cards=await buildCards(result.card);
 if(!Array.isArray(cards)||!cards.length||cards.length>8)throw new Error('INVALID_CARD_COUNT');
 let sent=0;
 try{for(const card of cards){
   const bytes=await render({...card,private:result.card.private===true});
   if(!Buffer.isBuffer(bytes))throw new Error('INVALID_CARD_IMAGE');
   const receipt=await event.reply(image(bytes));
   if(receipt===false||receipt?.error||receipt?.retcode>0||receipt?.discarded||receipt?.status==='failed')throw new Error('CARD_IMAGE_SEND_FAILED');
   sent++;
 }}catch(error){if(sent)throw new CardReplyError(sent,cards.length,error);throw error;}
 return true;
}
