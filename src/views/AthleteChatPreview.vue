<script setup lang="ts">
/** R22B: private Coach–Atleta chat (pilot). The server alone grants access.
 * This screen intentionally keeps the R22A swipe and header navigation intact. */
import {computed,ref,watch,onUnmounted,nextTick} from 'vue'
import {RouterLink,useRoute} from 'vue-router'
import LionIcon from '../components/LionIcon.vue'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {readNavigationSession} from '../integrations/firebase/stagingSession'
import {CHAT_PILOT_ENABLED,chatPilotAllowed,chatContacts,chatList,chatOpen,chatHistory,chatSend,chatMarkRead,signalChatUpdated,
 type ChatContact,type ChatThread,type ChatMessage} from '../features/chat/chatClient'
const route=useRoute()
const coach=computed(()=>route.path==='/coach/messaggi')
const dashboard=computed(()=>{const path=coach.value?'/coach':'/home';return route.query.source==='emulator'?path+'?source=emulator':path})
const enabled=computed(()=>CHAT_PILOT_ENABLED&&chatPilotAllowed.value&&isStagingMode()&&route.query.source!=='emulator')
const uid=ref(''),contacts=ref<ChatContact[]>([]),threads=ref<ChatThread[]>([])
const currentId=ref(''),currentName=ref(''),messages=ref<ChatMessage[]>([]),olderCursor=ref<string|null>(null)
const query=ref(''),draft=ref(''),error=ref(''),busy=ref(false),sending=ref(false),loading=ref(true)
const logEl=ref<HTMLElement|null>(null)
let poll:ReturnType<typeof setInterval>|null=null,alive=true,refreshing=false
function onVisibilityChange(){if(!document.hidden)void refresh()}
let pendingSend:{text:string;key:string}|null=null
const conversation=computed(()=>threads.value.find(t=>t.id===currentId.value))
const filterContacts=computed(()=>contacts.value.filter(c=>c.name.toLocaleLowerCase('it').includes(query.value.trim().toLocaleLowerCase('it'))))
const availableContacts=computed(()=>filterContacts.value.filter(c=>!threads.value.some(t=>t.peerUid===c.uid)).slice(0,50))
const titleFor=(id:string)=>threads.value.find(t=>t.id===id)?.peerName||contacts.value.find(c=>c.threadId===id)?.name||currentName.value||'Conversazione'
function readableError(e:unknown){
 const raw=e instanceof Error?e.message:String(e??'')
 if(/permission-denied/i.test(raw))return 'Non sei autorizzato a leggere o scrivere questa conversazione. Verifica il Coach assegnato.'
 if(/failed-precondition|chat non|not-found/i.test(raw))return 'Chat non disponibile: configurazione pilota o permessi da verificare.'
 if(/resource-exhausted/i.test(raw))return 'Hai inviato troppi messaggi: riprova tra qualche istante.'
 if(/unavailable|network-request-failed/i.test(raw))return 'Connessione non disponibile. Controlla Internet e riprova.'
 return raw.slice(0,220)||'Operazione non riuscita. Riprova.'
}
function time(ms:number){return ms>0?new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):''}
async function scrollLast(){await nextTick();if(logEl.value)logEl.value.scrollTop=logEl.value.scrollHeight}
async function refreshList(){
 if(!uid.value||document.hidden)return
 const result=await chatList(uid.value)
 if(!alive)return
 const oldCount=threads.value.reduce((n,r)=>n+r.unread,0)
 threads.value=result.rows
 if(oldCount!==result.unread)signalChatUpdated()
}
async function refreshHistory(scroll=false){
 if(!uid.value||!currentId.value||document.hidden)return
 const selected=currentId.value
 const result=await chatHistory(uid.value,selected)
 if(!alive||selected!==currentId.value)return
 const oldLast=messages.value.at(-1)?.id
 messages.value=result.rows
 olderCursor.value=result.beforeId
 if(scroll||result.rows.at(-1)?.id!==oldLast)await scrollLast()
 const unread=threads.value.find(t=>t.id===selected)?.unread||0
 const seenAt=result.rows.at(-1)?.createdAt||0
 if(unread>0&&seenAt>0){
  await chatMarkRead(uid.value,selected,seenAt)
  if(!alive)return
  threads.value=threads.value.map(t=>t.id===selected?{...t,unread:0}:t)
  signalChatUpdated()
 }
}
async function refresh(){
 if(!uid.value||busy.value||sending.value||refreshing||document.hidden)return
 refreshing=true
 try{await refreshList();if(currentId.value)await refreshHistory()}catch(e){if(alive)error.value=readableError(e)}finally{refreshing=false}
}
async function selectContact(contact:ChatContact){
 if(!uid.value||busy.value)return
 error.value='';busy.value=true
 try{
  const opened=await chatOpen(uid.value,contact.uid)
  if(!alive)return
  currentId.value=opened.id;currentName.value=opened.peerName;messages.value=[];olderCursor.value=null;pendingSend=null
  await refreshList();await refreshHistory(true)
 }catch(e){if(alive)error.value=readableError(e)}finally{busy.value=false}
}
async function selectThread(thread:ChatThread){
 if(busy.value)return
 error.value='';currentId.value=thread.id;currentName.value=thread.peerName;messages.value=[];olderCursor.value=null;pendingSend=null
 busy.value=true
 try{await refreshHistory(true)}catch(e){if(alive)error.value=readableError(e)}finally{busy.value=false}
}
async function older(){
 if(!olderCursor.value||!uid.value||!currentId.value||busy.value)return
 const cursor=olderCursor.value,id=currentId.value
 busy.value=true;error.value=''
 try{
  const data=await chatHistory(uid.value,id,cursor)
  if(!alive||currentId.value!==id)return
  messages.value=[...data.rows,...messages.value.filter(m=>!data.rows.some(r=>r.id===m.id))]
  olderCursor.value=data.beforeId
 }catch(e){if(alive)error.value=readableError(e)}finally{busy.value=false}
}
async function send(){
 const text=draft.value.trim()
 if(!uid.value||!currentId.value||!text||sending.value||text.length>1200)return
 if(!globalThis.crypto?.randomUUID){error.value='Questo browser non supporta l’invio sicuro dei messaggi.';return}
 sending.value=true;error.value=''
 try{
  if(!pendingSend||pendingSend.text!==text)pendingSend={text,key:crypto.randomUUID()}
  await chatSend(uid.value,currentId.value,pendingSend.key,text)
  if(!alive)return
  pendingSend=null
  if(draft.value.trim()===text)draft.value=''
  await refreshList();await refreshHistory(true);signalChatUpdated()
 }catch(e){if(alive)error.value=readableError(e)}finally{sending.value=false}
}
function onEnter(e:KeyboardEvent){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void send()}}
watch(()=>route.path,()=>{error.value=''})
async function initializeChat(){
 if(!enabled.value||uid.value)return
 loading.value=true
 try{
  const session=await readNavigationSession()
  if(!alive)return
  if((coach.value&&session.role==='atleta')||(!coach.value&&session.role!=='atleta'))throw new Error('Ruolo non autorizzato per questa schermata.')
  uid.value=session.uid
  const [c,t]=await Promise.all([chatContacts(uid.value),chatList(uid.value)])
  if(!alive)return
  contacts.value=c.rows;threads.value=t.rows;loading.value=false
  // A lightweight refresh while the chat is visible; no Firestore Rules changes.
  poll=setInterval(()=>{void refresh()},10000)
  document.addEventListener('visibilitychange',onVisibilityChange)
 }catch(e){if(alive){loading.value=false;error.value=readableError(e)}}
}
watch(enabled,allowed=>{
 if(allowed){void initializeChat()}
 else if(poll){clearInterval(poll);poll=null;document.removeEventListener('visibilitychange',onVisibilityChange)}
},{immediate:true})
onUnmounted(()=>{alive=false;if(poll)clearInterval(poll);document.removeEventListener('visibilitychange',onVisibilityChange)})
</script>

<template>
 <section class="lf-chat-page" aria-label="Messaggi Coach e Atleta">
  <div class="lf-chat-head">
   <div class="lf-chat-emblem"><LionIcon name="messages" :size="24"/></div>
   <div><p class="lf-chat-kicker">LIONFIT · CONVERSAZIONI PRIVATE</p><h1>Messaggi</h1><p>In contatto con il tuo {{coach?'atleta':'Coach'}}.</p></div>
  </div>
  <div v-if="!enabled" class="lf-chat-placeholder" role="status">
   <LionIcon name="messages" :size="36"/>
   <h2>La Chat è in preparazione</h2>
   <p>La navigazione è pronta. L'invio dei messaggi verrà attivato solo dopo il collaudo del backend e dei permessi Firebase.</p>
   <p>Non vengono inviati né salvati messaggi in questa anteprima.</p>
   <RouterLink :to="dashboard" class="lf-chat-back"><LionIcon name="back" :size="16"/> Torna alla Dashboard</RouterLink>
  </div>
  <div v-else-if="loading" class="lf-chat-placeholder" role="status">Verifica dei permessi e caricamento conversazioni…</div>
  <div v-else class="lf-chat-workspace" :class="{'lf-chat-compact-open':!!currentId}">
   <aside class="lf-chat-sidebar" aria-label="Elenco conversazioni">
    <label class="lf-chat-search-label" for="lf-chat-search">Cerca un contatto</label>
    <input id="lf-chat-search" v-model="query" type="search" maxlength="80" placeholder="Nome del Coach o dell'atleta" autocomplete="off"/>
    <div class="lf-chat-list">
     <p class="lf-chat-group-title">Conversazioni</p>
     <p v-if="!threads.length" class="lf-chat-small">Non hai ancora conversazioni.</p>
     <button v-for="t in threads.filter(x=>x.peerName.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')))" :key="t.id" type="button" class="lf-chat-person" :class="{'is-selected':t.id===currentId}" @click="selectThread(t)">
      <span class="lf-chat-avatar"><LionIcon name="user" :size="19"/></span>
      <span class="lf-chat-person-copy"><strong>{{t.peerName}}</strong><small>{{t.lastText||'Inizia la conversazione'}}</small></span>
      <span v-if="t.unread>0" class="lf-chat-count">{{t.unread>99?'99+':t.unread}}</span>
     </button>
     <p class="lf-chat-group-title">Nuovo messaggio</p>
     <p v-if="!availableContacts.length" class="lf-chat-small">Nessun altro contatto disponibile.</p>
     <button v-for="c in availableContacts" :key="c.uid" class="lf-chat-person" type="button" :disabled="busy" @click="selectContact(c)">
      <span class="lf-chat-avatar"><LionIcon name="user" :size="19"/></span>
      <span class="lf-chat-person-copy"><strong>{{c.name}}</strong><small>Apri conversazione</small></span>
      <LionIcon name="messages" :size="17"/>
     </button>
    </div>
   </aside>
   <div class="lf-chat-main" aria-label="Conversazione privata">
    <template v-if="currentId">
     <button type="button" class="lf-chat-mobile-back" @click="currentId='';pendingSend=null;error=''">← Conversazioni</button>
     <header class="lf-chat-conversation-title"><strong>{{titleFor(currentId)}}</strong><small>Solo i partecipanti autorizzati possono leggere i messaggi</small></header>
     <div ref="logEl" class="lf-chat-messages" role="log" aria-label="Cronologia dei messaggi" aria-live="polite">
      <button v-if="olderCursor" type="button" class="lf-chat-older" :disabled="busy" @click="older">Carica i messaggi precedenti</button>
      <p v-if="!messages.length" class="lf-chat-none">Inizia la conversazione con un messaggio.</p>
      <div v-for="m in messages" :key="m.id" class="lf-chat-bubble-wrap" :class="{'is-me':m.fromUid===uid}">
       <div class="lf-chat-bubble"><p>{{m.text}}</p><time>{{time(m.createdAt)}}</time></div>
      </div>
     </div>
     <form class="lf-chat-composer" @submit.prevent="send">
      <label for="lf-chat-compose" class="lf-chat-sr">Scrivi il tuo messaggio</label>
      <textarea id="lf-chat-compose" v-model="draft" placeholder="Scrivi un messaggio…" rows="2" maxlength="1200" :disabled="busy||sending" @keydown="onEnter"/>
      <button type="submit" :disabled="!draft.trim()||busy||sending" aria-label="Invia messaggio"><LionIcon name="messages" :size="19"/> {{sending?'Invio…':'Invia'}}</button>
     </form>
     <p class="lf-chat-hint">Invio: Invio · Nuova riga: Maiusc + Invio</p>
    </template>
    <div v-else class="lf-chat-no-selection"><LionIcon name="messages" :size="35"/><h2>Le tue conversazioni</h2><p>Scegli un contatto per iniziare o riprendere una chat.</p></div>
   </div>
  </div>
  <p v-if="error" class="lf-chat-error" role="alert">{{error}} <button type="button" @click="error='';void refresh()">Riprova</button></p>
  <p v-if="!coach" class="lf-chat-gesture"><LionIcon name="back" :size="15"/> Dalla chat, scorri a sinistra per tornare alla Dashboard.</p>
 </section>
</template>
<style scoped>
.lf-chat-page{width:100%;max-width:1110px;margin:0 auto;padding:clamp(14px,3vw,30px) 12px calc(95px + env(safe-area-inset-bottom,0px));box-sizing:border-box;color:var(--text,#f0f7f2)}
.lf-chat-head{display:flex;gap:13px;align-items:center;margin-bottom:17px}.lf-chat-head h1{font-size:clamp(23px,4vw,31px);margin:1px 0}.lf-chat-head p{font-size:13px;margin:0;color:var(--muted,#a8bbb1)}
.lf-chat-head .lf-chat-kicker{font-size:10px;letter-spacing:.12em;font-weight:850;color:var(--mint,#44d18c)}
.lf-chat-emblem{width:48px;height:48px;border:1px solid rgba(72,208,126,.3);border-radius:16px;background:rgba(38,151,92,.15);display:grid;place-items:center;color:var(--mint,#40cf86);flex:none}
.lf-chat-placeholder{min-height:330px;background:var(--card2,#1a2922);border:1px solid #78998530;border-radius:17px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;text-align:center;color:var(--muted,#b3c4b8)}
.lf-chat-placeholder h2{color:var(--text,#e9f3ed);margin:0}.lf-chat-placeholder p{margin:0;max-width:410px;line-height:1.55;font-size:13px}
.lf-chat-back{display:inline-flex;align-items:center;gap:7px;background:#227449;color:#fff;padding:11px 16px;border-radius:12px;text-decoration:none;margin-top:8px}
.lf-chat-workspace{display:grid;grid-template-columns:minmax(205px,34%) minmax(0,1fr);min-height:490px;max-height:72dvh;background:var(--card2,#18251f);border:1px solid rgba(113,170,133,.24);border-radius:17px;overflow:hidden}
.lf-chat-sidebar{padding:12px;border-right:1px solid rgba(113,170,133,.23);overflow:auto;min-width:0}.lf-chat-search-label,.lf-chat-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.lf-chat-sidebar input{width:100%;background:rgba(7,22,15,.52);border:1px solid rgba(121,167,136,.3);color:inherit;border-radius:11px;padding:11px;font-size:13px;min-height:44px}
.lf-chat-group-title{font-size:11px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#a7bbaa);margin:20px 5px 8px}.lf-chat-small{font-size:12px;opacity:.75;margin:9px 5px}
.lf-chat-person{width:100%;min-height:59px;border:0;border-radius:12px;background:transparent;color:inherit;display:flex;align-items:center;gap:8px;text-align:left;padding:8px;cursor:pointer}
.lf-chat-person:hover,.lf-chat-person.is-selected{background:rgba(53,157,91,.18)}.lf-chat-person:focus-visible,.lf-chat-composer button:focus-visible,.lf-chat-sidebar input:focus-visible{outline:2px solid var(--mint,#48d28a);outline-offset:2px}
.lf-chat-avatar{width:35px;height:35px;flex:none;border-radius:50%;display:grid;place-items:center;background:rgba(71,161,100,.2)}.lf-chat-person-copy{display:flex;flex-direction:column;min-width:0;flex:1;gap:4px}.lf-chat-person-copy strong,.lf-chat-person-copy small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.lf-chat-person-copy strong{font-size:13px}.lf-chat-person-copy small{font-size:11px;color:var(--muted,#aabfb0)}.lf-chat-count{font-size:11px;font-weight:800;color:white;background:#228e52;min-width:22px;height:22px;display:grid;place-items:center;border-radius:99px;padding:0 5px}
.lf-chat-mobile-back{display:none;border:0;background:transparent;color:var(--mint,#54db93);text-align:left;font-size:13px;font-weight:750;padding:11px;cursor:pointer}.lf-chat-main{min-width:0;display:flex;flex-direction:column;min-height:390px}.lf-chat-conversation-title{padding:13px 15px;display:flex;flex-direction:column;gap:4px;border-bottom:1px solid rgba(113,170,133,.2)}.lf-chat-conversation-title strong{font-size:15px}.lf-chat-conversation-title small{font-size:11px;color:var(--muted,#9fb3a3)}
.lf-chat-messages{flex:1;overflow:auto;min-height:160px;padding:17px 13px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}.lf-chat-older{border:1px solid #557d63;background:transparent;color:inherit;padding:9px;border-radius:10px;margin:0 auto;cursor:pointer;font-size:12px}.lf-chat-none{text-align:center;color:var(--muted,#aabdb0);font-size:13px;margin:auto}
.lf-chat-bubble-wrap{display:flex;justify-content:flex-start}.lf-chat-bubble-wrap.is-me{justify-content:flex-end}.lf-chat-bubble{max-width:min(90%,460px);border-radius:16px 16px 16px 4px;background:rgba(99,143,116,.24);padding:10px 12px;overflow-wrap:anywhere}.is-me .lf-chat-bubble{background:rgba(40,143,82,.37);border-radius:16px 16px 4px 16px}.lf-chat-bubble p{white-space:pre-wrap;font-size:13px;line-height:1.55;margin:0}.lf-chat-bubble time{display:block;color:var(--muted,#c6d2c7);font-size:10px;text-align:right;margin-top:4px}
.lf-chat-composer{display:flex;gap:8px;align-items:end;padding:11px;border-top:1px solid rgba(113,170,133,.2)}.lf-chat-composer textarea{min-width:0;flex:1;background:rgba(4,21,13,.45);border:1px solid rgba(121,167,136,.32);color:inherit;border-radius:11px;padding:11px;font-family:inherit;font-size:14px;resize:vertical;max-height:120px}.lf-chat-composer button{border:0;background:#257b4c;color:white;border-radius:10px;padding:12px;display:flex;align-items:center;gap:6px;min-height:43px;cursor:pointer}.lf-chat-composer button:disabled{opacity:.5;cursor:not-allowed}.lf-chat-hint{font-size:10px;color:var(--muted,#aabdb0);padding:0 12px 9px;margin:0}
.lf-chat-no-selection{margin:auto;display:flex;flex-direction:column;align-items:center;text-align:center;gap:9px;color:var(--muted,#bacbbd);padding:20px}.lf-chat-no-selection h2{margin:0;color:var(--text,#fff)}.lf-chat-no-selection p{margin:0;font-size:13px}.lf-chat-error{font-size:13px;margin-top:12px;border:1px solid #b84b52;background:rgba(161,42,61,.12);border-radius:11px;padding:12px}.lf-chat-error button{border:0;background:transparent;text-decoration:underline;color:inherit;font-weight:750;cursor:pointer}.lf-chat-gesture{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;color:var(--muted,#9aafa0);margin-top:12px}
@media(max-width:650px){.lf-chat-page{padding-left:7px;padding-right:7px}.lf-chat-workspace{grid-template-columns:minmax(0,1fr);min-height:55dvh;max-height:calc(100dvh - 220px)}.lf-chat-sidebar{padding:10px;border-right:0}.lf-chat-main{display:none}.lf-chat-workspace.lf-chat-compact-open .lf-chat-sidebar{display:none}.lf-chat-workspace.lf-chat-compact-open .lf-chat-main{display:flex}.lf-chat-mobile-back{display:block}.lf-chat-person{padding:7px 3px}.lf-chat-avatar{width:29px;height:29px}.lf-chat-person-copy strong{font-size:12px}.lf-chat-person-copy small{font-size:10px}.lf-chat-conversation-title{padding:10px}.lf-chat-messages{padding:10px}.lf-chat-composer{padding:7px}.lf-chat-composer button{font-size:0;gap:0;min-width:41px;justify-content:center}.lf-chat-hint{display:none}}
@media(min-width:800px){.lf-chat-page{padding-bottom:25px}.lf-chat-gesture{display:none}}
@media(prefers-reduced-motion:reduce){.lf-chat-workspace,.lf-chat-person{scroll-behavior:auto;transition:none}}
</style>
