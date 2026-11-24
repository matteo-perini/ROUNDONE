import type {ChatContact,ChatThread} from './chatClient'
/** A single, bounded, ephemeral list hint. No messages, previews, draft or history.
 * The view must always revalidate via the server, and remove the hint on failure.
 */
export type ChatListHint={contacts:ChatContact[];threads:ChatThread[];expiresAt:number}
export function createChatListHint(ttl=8000,now=Date.now){
 let entry:{key:string;value:ChatListHint}|undefined
 let timer:ReturnType<typeof setTimeout>|undefined
 function clear(){clearTimeout(timer);timer=undefined;entry=undefined}
 function remember(key:string,contacts:ChatContact[],threads:ChatThread[],verifiedAt=now()){
  clear();const expiresAt=Math.min(now(),verifiedAt)+ttl;if(!key||expiresAt<=now())return
  entry={key,value:{contacts:contacts.slice(0,100).map(c=>({uid:c.uid,name:c.name,threadId:c.threadId})),threads:threads.slice(0,100).map(t=>({id:t.id,peerUid:t.peerUid,peerName:t.peerName,updatedAt:t.updatedAt,unread:t.unread,lastText:''})),expiresAt}}
  timer=setTimeout(clear,Math.max(0,expiresAt-now()))
 }
 function read(key:string){
  if(!entry||!key||entry.key!==key||entry.value.expiresAt<=now()){clear();return null}
  return entry.value
 }
 return {clear,remember,read}
}
export const chatListHint=createChatListHint()
