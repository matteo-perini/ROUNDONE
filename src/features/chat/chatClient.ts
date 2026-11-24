/** R22B: callable gateway. No Firestore client read/write permissions for chats.
 * Explicit flag + backend pilot configuration required; normal LIVE remains OFF.
 */
import {getFunctions,httpsCallable} from 'firebase/functions'
import {ref} from 'vue'
import {getStagingClients} from '../../integrations/firebase/stagingClient'
import {isStagingMode} from '../../integrations/firebase/stagingConfig'
export const CHAT_PILOT_ENABLED=(import.meta.env.MODE==='staging'&&import.meta.env.VITE_LIONFIT_CHAT_BETA==='STAGING_REVIEWED') ||
 (import.meta.env.MODE==='production'&&import.meta.env.VITE_LIONFIT_CHAT_BETA==='LIVE_PILOT_REVIEWED')
// Client visibility is not an authorization boundary; the server rechecks access.
export const chatPilotAllowed=ref(false)
export type ChatContact={uid:string;name:string;threadId:string}
export type ChatThread={id:string;peerUid:string;peerName:string;updatedAt:number;lastText:string;unread:number}
export type ChatMessage={id:string;fromUid:string;text:string;createdAt:number}
type ChatActions={
 lfChatPilotStatus:{input:Record<string,never>;output:{enabled:boolean}}
 lfChatContacts:{input:Record<string,never>;output:{rows:ChatContact[]}}
 lfChatList:{input:Record<string,never>;output:{rows:ChatThread[];unread:number}}
 lfChatUnread:{input:Record<string,never>;output:{unread:number}}
 lfChatOpen:{input:{peerUid:string};output:{id:string;peerUid:string;peerName:string}}
 lfChatHistory:{input:{threadId:string;beforeId?:string};output:{rows:ChatMessage[];beforeId:string|null}}
 lfChatSend:{input:{threadId:string;requestId:string;text:string};output:{id:string;duplicate:boolean;createdAt:number}}
 lfChatMarkRead:{input:{threadId:string;seenAt:number};output:{ok:boolean}}
}
async function invoke<K extends keyof ChatActions>(name:K,data:ChatActions[K]['input'],uid:string):Promise<ChatActions[K]['output']>{
 if(!CHAT_PILOT_ENABLED||!isStagingMode())throw new Error('La chat privata non è ancora attivata per questo ambiente.')
 const {auth}=getStagingClients()
 await auth.authStateReady()
 if(!uid||auth.currentUser?.uid!==uid)throw new Error('Sessione cambiata: effettua nuovamente l’accesso.')
 const call=httpsCallable<ChatActions[K]['input'],ChatActions[K]['output']>(getFunctions(auth.app,'europe-west1'),name)
 const result=await call(data)
 if(auth.currentUser?.uid!==uid)throw new Error('Sessione cambiata: aggiorna la pagina.')
 return result.data
}
const empty={} as Record<string,never>
export const chatPilotStatus=async (uid:string):Promise<boolean>=>{
 const result=await invoke('lfChatPilotStatus',empty,uid)
 return result.enabled===true
}
export const chatContacts=(uid:string)=>invoke('lfChatContacts',empty,uid)
export const chatList=(uid:string)=>invoke('lfChatList',empty,uid)
export const chatUnread=(uid:string)=>invoke('lfChatUnread',empty,uid)
export const chatOpen=(uid:string,peerUid:string)=>invoke('lfChatOpen',{peerUid},uid)
export const chatHistory=(uid:string,threadId:string,beforeId?:string)=>invoke('lfChatHistory',{threadId,...(beforeId?{beforeId}:{})},uid)
export const chatSend=(uid:string,threadId:string,requestId:string,text:string)=>invoke('lfChatSend',{threadId,requestId,text},uid)
export const chatMarkRead=(uid:string,threadId:string,seenAt:number)=>invoke('lfChatMarkRead',{threadId,seenAt},uid)
export const signalChatUpdated=()=>window.dispatchEvent(new Event('lionfit:chat-updated'))
