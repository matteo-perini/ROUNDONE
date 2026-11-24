<script setup lang="ts">
/** E.3: short same-session list hint, fresh authorization on each entry.
 * All private message reads/writes still use the callable backend. */
import {computed,ref,watch,onMounted,onUnmounted,nextTick} from 'vue'
import {RouterLink,useRoute} from 'vue-router'
import LionIcon from '../components/LionIcon.vue'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {readNavigationSession,stagingSession} from '../integrations/firebase/stagingSession'
import {accountKey} from '../features/platform/platformModel'
import {currentVerifiedScope} from '../features/performance/verifiedSessionStreams'
import {beginSessionDataAudit} from '../features/performance/sessionDataAudit'
import {attachChatViewport,chatNearBottom} from '../features/chat/chatViewport'
import {chatListHint} from '../features/chat/chatSessionSnapshot'
import {CHAT_PILOT_ENABLED,chatPilotAllowed,chatContacts,chatList,chatOpen,chatHistory,chatSend,chatMarkRead,signalChatUpdated,
 type ChatContact,type ChatThread,type ChatMessage} from '../features/chat/chatClient'
const route=useRoute()
const coach=ref(route.path==='/coach/messaggi')
const inChatRoute=computed(()=>route.path==='/coach/messaggi'||route.path==='/messaggi')
const dashboard=computed(()=>{const path=coach.value?'/coach':'/home';return route.query.source==='emulator'?path+'?source=emulator':path})
const enabled=computed(()=>CHAT_PILOT_ENABLED&&chatPilotAllowed.value&&isStagingMode()&&route.query.source!=='emulator')
const uid=ref(''),contacts=ref<ChatContact[]>([]),threads=ref<ChatThread[]>([])
const currentId=ref(''),currentName=ref(''),messages=ref<ChatMessage[]>([]),olderCursor=ref<string|null>(null)
const query=ref(''),draft=ref(''),error=ref(''),busy=ref(false),sending=ref(false),loading=ref(true),verified=ref(false),hintVisible=ref(false)
const logEl=ref<HTMLElement|null>(null),pageEl=ref<HTMLElement|null>(null)
let viewport:ReturnType<typeof attachChatViewport>|undefined,logObserver:ResizeObserver|undefined,anchorFrame=0,stickToBottom=true
const mobileChat=()=>typeof window!=='undefined'&&window.innerWidth<(coach.value?901:800)
function onLogScroll(){if(logEl.value)stickToBottom=chatNearBottom(logEl.value)}
function keepBottom(){
 if(!stickToBottom||!logEl.value||!inChatRoute.value||!verified.value)return
 if(anchorFrame)cancelAnimationFrame(anchorFrame)
 const el=logEl.value,id=currentId.value,n=generation
 anchorFrame=requestAnimationFrame(()=>{anchorFrame=0;if(active(n)&&stickToBottom&&currentId.value===id&&logEl.value===el)el.scrollTop=el.scrollHeight})
}
function resetChatLayout(preserve=false){viewport?.deactivate(preserve);if(anchorFrame){cancelAnimationFrame(anchorFrame);anchorFrame=0}}
onMounted(()=>{if(pageEl.value&&typeof window!=='undefined')viewport=attachChatViewport(pageEl.value,{active:()=>enabled.value&&inChatRoute.value,mobile:mobileChat,onLayout:keepBottom})})
watch(logEl,(el)=>{logObserver?.disconnect();logObserver=undefined;stickToBottom=true;if(el&&typeof ResizeObserver!=='undefined'){logObserver=new ResizeObserver(keepBottom);logObserver.observe(el)}},{flush:'post'})
watch([currentId,error],()=>viewport?.schedule(),{flush:'post'})
let poll:ReturnType<typeof setInterval>|null=null,hintTimer:ReturnType<typeof setTimeout>|undefined,alive=true,refreshing=false,generation=0,scopeKey='',lastContacts=0,lastList=0,actionVersion=0
let pendingSend:{threadId:string;text:string;key:string}|null=null
const keyNow=()=>stagingSession.value?currentVerifiedScope(stagingSession.value):''
const active=(n:number)=>alive&&n===generation&&enabled.value&&inChatRoute.value&&!!scopeKey&&keyNow()===scopeKey
const current=(n:number,version:number)=>active(n)&&version===actionVersion
function stopPoll(){if(poll)clearInterval(poll);poll=null;clearTimeout(hintTimer);document.removeEventListener('visibilitychange',onVisibilityChange)}
function clearThread(){stickToBottom=true;currentId.value='';currentName.value='';messages.value=[];olderCursor.value=null;draft.value='';pendingSend=null}
function clearView(){generation++;stopPoll();scopeKey='';uid.value='';contacts.value=[];threads.value=[];clearThread();query.value='';error.value='';busy.value=false;sending.value=false;loading.value=true;verified.value=false;hintVisible.value=false;refreshing=false;lastContacts=0;lastList=0;actionVersion++}
function onVisibilityChange(){if(!document.hidden){if(!verified.value)void initializeChat();else void refresh()}}
const normalizedQuery=computed(()=>query.value.trim().toLocaleLowerCase('it'))
const filterContacts=computed(()=>contacts.value.filter(c=>c.name.toLocaleLowerCase('it').includes(normalizedQuery.value)))
const threadPeers=computed(()=>new Set(threads.value.map(t=>t.peerUid)))
const availableContacts=computed(()=>filterContacts.value.filter(c=>!threadPeers.value.has(c.uid)).slice(0,50))
const filteredThreads=computed(()=>threads.value.filter(t=>t.peerName.toLocaleLowerCase('it').includes(normalizedQuery.value)))
const titleFor=(id:string)=>threads.value.find(t=>t.id===id)?.peerName||contacts.value.find(c=>c.threadId===id)?.name||currentName.value||'Conversazione'
function readableError(e:unknown){
 const raw=e instanceof Error?e.message:String(e??'')
 const code=String((e as {code?:string})?.code||'')+' '+raw
 if(/permission-denied|unauthenticated/i.test(code))return 'Non sei autorizzato a leggere o scrivere questa conversazione. Verifica il Coach assegnato.'
 if(/failed-precondition|chat non|not-found/i.test(code))return 'Chat non disponibile: configurazione o permessi da verificare.'
 if(/resource-exhausted/i.test(code))return 'Hai inviato troppi messaggi: riprova tra qualche istante.'
 if(/unavailable|network-request-failed/i.test(code))return 'Connessione non disponibile. Controlla Internet e riprova.'
 return raw.slice(0,220)||'Operazione non riuscita. Riprova.'
}
function fail(e:unknown,n:number){
 if(!active(n))return
 chatListHint.clear();clearTimeout(hintTimer)
 const code=String((e as {code?:string})?.code||'')+' '+String(e)
 if(!verified.value||/permission-denied|unauthenticated|failed-precondition|not-found/i.test(code)){
  resetChatLayout()
  verified.value=false;hintVisible.value=false;contacts.value=[];threads.value=[];clearThread();stopPoll()
 }
 loading.value=false;error.value=readableError(e)
}
const timeFormat=new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'})
function time(ms:number){return ms>0?timeFormat.format(new Date(ms)):''}
async function scrollLast(n:number,selected:string){await nextTick();if(active(n)&&currentId.value===selected&&logEl.value){stickToBottom=true;logEl.value.scrollTop=logEl.value.scrollHeight}}
function rememberList(){if(verified.value&&scopeKey&&keyNow()===scopeKey)chatListHint.remember(scopeKey,contacts.value,threads.value,Math.min(lastContacts,lastList))}
async function refreshList(n:number,withContacts=false,version=actionVersion){
 if(!current(n,version)||document.hidden)return
 const [result,c]=await Promise.all([chatList(uid.value),withContacts?chatContacts(uid.value):Promise.resolve(null)])
 if(!current(n,version))return
 lastList=Date.now()
 const oldCount=threads.value.reduce((sum,r)=>sum+r.unread,0)
 if(c){contacts.value=c.rows;lastContacts=Date.now()}
 threads.value=result.rows
 if(currentId.value&&!threads.value.some(t=>t.id===currentId.value)&&!contacts.value.some(c=>c.threadId===currentId.value))clearThread()
 rememberList()
 if(oldCount!==result.unread)signalChatUpdated()
}
async function refreshHistory(scroll=false,n=generation,version=actionVersion){
 if(!current(n,version)||!currentId.value||document.hidden)return
 const selected=currentId.value
 const result=await chatHistory(uid.value,selected)
 if(!current(n,version)||selected!==currentId.value)return
 const oldLast=messages.value.at(-1)?.id
 const el=logEl.value,nearBottom=!el||chatNearBottom(el)
 // Keep an older page only when the new server tail overlaps it; do not create invisible gaps.
 const first=result.rows[0]?.id,overlap=first?messages.value.findIndex(m=>m.id===first):-1
 if(overlap>0){messages.value=[...messages.value.slice(0,overlap),...result.rows]}
 else{messages.value=result.rows;olderCursor.value=result.beforeId}
 if(scroll||(nearBottom&&result.rows.at(-1)?.id!==oldLast))await scrollLast(n,selected)
 if(!current(n,version)||selected!==currentId.value||document.hidden)return
 const unread=threads.value.find(t=>t.id===selected)?.unread||0
 const seenAt=result.rows.at(-1)?.createdAt||0
 if(unread>0&&seenAt>0){
  await chatMarkRead(uid.value,selected,seenAt)
  if(!current(n,version)||selected!==currentId.value)return
  threads.value=threads.value.map(t=>t.id===selected?{...t,unread:0}:t);signalChatUpdated()
 }
}
async function refresh(){
 if(!verified.value||!active(generation)||busy.value||sending.value||refreshing||document.hidden)return
 const n=generation,version=actionVersion;refreshing=true
 try{await refreshList(n,Date.now()-lastContacts>=30000,version);if(current(n,version)&&currentId.value)await refreshHistory(false,n,version)}catch(e){if(current(n,version))fail(e,n)}finally{if(active(n))refreshing=false}
}
async function selectContact(contact:ChatContact){
 if(!verified.value||!active(generation)||busy.value||sending.value)return
 actionVersion++;const n=generation;error.value='';busy.value=true
 try{
  const opened=await chatOpen(uid.value,contact.uid)
  if(!active(n))return
  clearThread();currentId.value=opened.id;currentName.value=opened.peerName
  await refreshList(n);await refreshHistory(true,n)
 }catch(e){fail(e,n)}finally{if(active(n))busy.value=false}
}
async function selectThread(thread:ChatThread){
 if(!verified.value||!active(generation)||busy.value||sending.value)return
 actionVersion++;const n=generation;error.value='';clearThread();currentId.value=thread.id;currentName.value=thread.peerName;busy.value=true
 try{await refreshHistory(true,n)}catch(e){fail(e,n)}finally{if(active(n))busy.value=false}
}
async function older(){
 if(!verified.value||!active(generation)||!olderCursor.value||!currentId.value||busy.value||sending.value)return
 actionVersion++;const n=generation,cursor=olderCursor.value,id=currentId.value
 const el=logEl.value,oldHeight=el?.scrollHeight||0,oldTop=el?.scrollTop||0
 stickToBottom=false
 busy.value=true;error.value=''
 try{
  const data=await chatHistory(uid.value,id,cursor)
  if(!active(n)||currentId.value!==id)return
  const seen=new Set(data.rows.map(m=>m.id));messages.value=[...data.rows,...messages.value.filter(m=>!seen.has(m.id))]
  olderCursor.value=data.beforeId
  await nextTick();if(active(n)&&currentId.value===id&&el&&el===logEl.value){el.scrollTop=oldTop+el.scrollHeight-oldHeight;onLogScroll()}
 }catch(e){fail(e,n)}finally{if(active(n))busy.value=false}
}
async function send(){
 const text=draft.value.trim()
 if(!verified.value||!active(generation)||!currentId.value||!text||sending.value||busy.value||text.length>1200)return
 if(!globalThis.crypto?.randomUUID){error.value='Questo browser non supporta l’invio sicuro dei messaggi.';return}
 actionVersion++;const n=generation,selected=currentId.value;sending.value=true;error.value=''
 try{
  if(!pendingSend||pendingSend.text!==text||pendingSend.threadId!==selected)pendingSend={threadId:selected,text,key:crypto.randomUUID()}
  await chatSend(uid.value,selected,pendingSend.key,text)
  if(!active(n)||currentId.value!==selected)return
  pendingSend=null
  if(draft.value.trim()===text)draft.value=''
  await refreshList(n);await refreshHistory(true,n);signalChatUpdated()
 }catch(e){fail(e,n)}finally{if(active(n))sending.value=false}
}
function onEnter(e:KeyboardEvent){if(e.key==='Enter'&&!mobileChat()&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();void send()}}
function backToList(){if(busy.value||sending.value)return;resetChatLayout();actionVersion++;clearThread();error.value=''}
async function initializeChat(){
 if(!enabled.value||!inChatRoute.value||verified.value||busy.value||document.hidden)return
 const n=++generation;scopeKey=keyNow();if(!scopeKey)return
 const audit=beginSessionDataAudit('chat-list')
 loading.value=true;busy.value=true;error.value='';clearTimeout(hintTimer)
 const hint=typeof navigator!=='undefined'&&navigator.onLine===false?null:chatListHint.read(scopeKey)
 if(hint){contacts.value=hint.contacts;threads.value=hint.threads;hintVisible.value=true;loading.value=false;audit('warm-hint')
  hintTimer=setTimeout(()=>{if(active(n)&&!verified.value){contacts.value=[];threads.value=[];hintVisible.value=false;loading.value=true}},Math.max(0,hint.expiresAt-Date.now()))}
 try{
  const session=await readNavigationSession()
  if(!active(n))return
  if((coach.value&&session.role==='atleta')||(!coach.value&&session.role!=='atleta'))throw new Error('Ruolo non autorizzato per questa schermata.')
  uid.value=session.uid
  const [c,t]=await Promise.all([chatContacts(uid.value),chatList(uid.value)])
  if(!active(n))return
  clearTimeout(hintTimer);contacts.value=c.rows;threads.value=t.rows;loading.value=false;hintVisible.value=false;verified.value=true;lastContacts=lastList=Date.now();rememberList();audit('ready')
  if(!poll)poll=setInterval(()=>{void refresh()},10000)
  document.addEventListener('visibilitychange',onVisibilityChange)
 }catch(e){if(active(n))audit('error');fail(e,n)}finally{if(active(n))busy.value=false}
}
function retry(){error.value='';if(verified.value)void refresh();else void initializeChat()}
watch([enabled,()=>accountKey(stagingSession.value),()=>route.path],()=>{
 const previousScope=scopeKey
 // On ordinary navigation, preserve the rendered outgoing page until Vue has
 // finished its leave animation. Invalidate callbacks and stop all polling now.
 // Scope changes and access revocation instead clear sensitive state immediately.
 if(!enabled.value||(previousScope&&previousScope!==keyNow())){
  resetChatLayout();chatListHint.clear();clearView()
  if(!enabled.value||!inChatRoute.value)return
 }
 if(!inChatRoute.value){resetChatLayout(true);generation++;actionVersion++;stopPoll();refreshing=false;return}
 clearView();coach.value=route.path==='/coach/messaggi';viewport?.schedule()
 document.addEventListener('visibilitychange',onVisibilityChange);void initializeChat()
},{immediate:true,flush:'sync'})
onUnmounted(()=>{alive=false;viewport?.dispose();logObserver?.disconnect();if(anchorFrame)cancelAnimationFrame(anchorFrame);clearView()})
</script>

<template>
 <section ref="pageEl" class="lf-chat-page" :class="{'lf-chat-native-active':enabled,'lf-chat-native-thread':!!currentId,'lf-chat-native-coach':coach}" aria-label="Messaggi Coach e Atleta">
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
  <div v-else class="lf-chat-workspace" :class="{'lf-chat-compact-open':!!currentId}">
   <aside class="lf-chat-sidebar" aria-label="Elenco conversazioni">
    <label class="lf-chat-search-label" for="lf-chat-search">Cerca un contatto</label>
    <div class="lf-chat-search-field"><LionIcon name="search" :size="18"/><input id="lf-chat-search" v-model="query" type="search" maxlength="80" :placeholder="coach?'Cerca atleta':'Cerca Coach'" autocomplete="off" :disabled="loading||(!verified&&!hintVisible)"/></div>
    <div v-if="loading" class="lf-chat-initial" role="status">
     <p class="lf-chat-small">Verifica dei permessi e caricamento conversazioni…</p>
     <div v-for="i in 3" :key="i" class="lf-chat-skeleton-row" aria-hidden="true"><span/><div><i/><i/></div></div>
    </div>
    <div v-else-if="!verified&&!hintVisible" class="lf-chat-list-state"> <LionIcon name="info" :size="25"/><p>Conversazioni non disponibili.</p><small>Verifica la connessione o riprova.</small></div>
    <div v-else class="lf-chat-list" :aria-busy="!verified">
     <p v-if="hintVisible" class="lf-chat-small" role="status">Aggiornamento conversazioni…</p>
     <p class="lf-chat-group-title">Conversazioni</p>
     <p v-if="verified&&!threads.length" class="lf-chat-small">Non hai ancora conversazioni.</p>
     <button v-for="t in filteredThreads" :key="t.id" type="button" class="lf-chat-person" :class="{'is-selected':t.id===currentId}" :disabled="!verified||busy||sending" @click="selectThread(t)">
      <span class="lf-chat-avatar"><LionIcon name="user" :size="19"/></span>
      <span class="lf-chat-person-copy"><strong>{{t.peerName}}</strong><small>{{hintVisible?'Conversazione':(t.lastText||'Inizia la conversazione')}}</small></span>
      <span v-if="t.unread>0" class="lf-chat-count">{{t.unread>99?'99+':t.unread}}</span>
     </button>
     <p class="lf-chat-group-title">Nuovo messaggio</p>
     <p v-if="verified&&!availableContacts.length" class="lf-chat-small">Nessun altro contatto disponibile.</p>
     <button v-for="c in availableContacts" :key="c.uid" class="lf-chat-person" type="button" :disabled="!verified||busy||sending" @click="selectContact(c)">
      <span class="lf-chat-avatar"><LionIcon name="user" :size="19"/></span>
      <span class="lf-chat-person-copy"><strong>{{c.name}}</strong><small>Apri conversazione</small></span>
      <LionIcon name="messages" :size="17"/>
     </button>
    </div>
   </aside>
   <div class="lf-chat-main" aria-label="Conversazione privata">
    <template v-if="currentId">
     <header class="lf-chat-conversation-title"><button type="button" class="lf-chat-mobile-back" :disabled="busy||sending" @click="backToList" aria-label="Torna alle conversazioni"><LionIcon name="back" :size="20"/></button><span class="lf-chat-avatar" aria-hidden="true"><LionIcon name="user" :size="20"/></span><div><strong>{{titleFor(currentId)}}</strong><small>Conversazione privata</small></div></header>
     <div ref="logEl" class="lf-chat-messages" role="log" aria-label="Cronologia dei messaggi" aria-live="polite" @scroll.passive="onLogScroll">
      <button v-if="olderCursor" type="button" class="lf-chat-older" :disabled="busy||sending" @click="older">Carica i messaggi precedenti</button>
      <div v-if="!messages.length&&busy" class="lf-chat-history-loading" role="status"><p>Caricamento messaggi…</p><span aria-hidden="true"/><span aria-hidden="true"/></div>
      <p v-else-if="!messages.length&&!error" class="lf-chat-none">Inizia la conversazione con un messaggio.</p>
      <div v-for="m in messages" :key="m.id" class="lf-chat-bubble-wrap" :class="{'is-me':m.fromUid===uid}">
       <div class="lf-chat-bubble"><p>{{m.text}}</p><time>{{time(m.createdAt)}}</time></div>
      </div>
     </div>
     <form class="lf-chat-composer" @submit.prevent="send">
      <label for="lf-chat-compose" class="lf-chat-sr">Scrivi il tuo messaggio</label>
      <textarea id="lf-chat-compose" v-model="draft" placeholder="Scrivi un messaggio…" rows="2" maxlength="1200" enterkeyhint="enter" :disabled="!verified" @keydown="onEnter"/>
      <button type="submit" @mousedown.prevent :disabled="!verified||!draft.trim()||busy||sending"  :aria-label="sending?'Invio in corso':'Invia messaggio'"><LionIcon name="send" :size="21"/> <span>{{sending?'Invio…':'Invia'}}</span></button>
     </form>
     <p class="lf-chat-hint">Invio: Invio · Nuova riga: Maiusc + Invio</p>
    </template>
    <div v-else class="lf-chat-no-selection"><LionIcon name="messages" :size="35"/><h2>Le tue conversazioni</h2><p>{{loading||hintVisible?'Le conversazioni saranno disponibili dopo la verifica.':verified?'Scegli un contatto per iniziare o riprendere una chat.':'Riprova per visualizzare le conversazioni.'}}</p></div>
   </div>
  </div>
  <p v-if="error" class="lf-chat-error" role="alert">{{error}} <button type="button" @click="retry">Riprova</button></p>
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
@media(max-width:799px){.lf-chat-workspace,.lf-chat-sidebar,.lf-chat-messages{touch-action:pan-y pinch-zoom}}
@media(max-width:650px){.lf-chat-page{padding-left:7px;padding-right:7px}.lf-chat-workspace{grid-template-columns:minmax(0,1fr);min-height:55dvh;max-height:calc(100dvh - 220px)}.lf-chat-sidebar{padding:10px;border-right:0}.lf-chat-main{display:none}.lf-chat-workspace.lf-chat-compact-open .lf-chat-sidebar{display:none}.lf-chat-workspace.lf-chat-compact-open .lf-chat-main{display:flex}.lf-chat-mobile-back{display:block}.lf-chat-person{padding:7px 3px}.lf-chat-avatar{width:29px;height:29px}.lf-chat-person-copy strong{font-size:12px}.lf-chat-person-copy small{font-size:10px}.lf-chat-conversation-title{padding:10px}.lf-chat-messages{padding:10px}.lf-chat-composer{padding:7px}.lf-chat-composer button{font-size:0;gap:0;min-width:41px;justify-content:center}.lf-chat-hint{display:none}}
@media(min-width:800px){.lf-chat-page{padding-bottom:25px}.lf-chat-gesture{display:none}}
@media(prefers-reduced-motion:reduce){.lf-chat-workspace,.lf-chat-person{scroll-behavior:auto;transition:none}}
/* E.4: stable first-load/list geometry, accessible controls, no animation on loading placeholders. */
.lf-chat-workspace{height:clamp(400px,65dvh,680px);min-height:0;max-height:none;grid-template-rows:minmax(0,1fr);border-color:var(--border);background:var(--card2)}
.lf-chat-sidebar{min-height:0;border-color:var(--border);overscroll-behavior-y:contain}
.lf-chat-main{min-height:0;overflow:hidden}
.lf-chat-search-field{position:relative;display:flex;align-items:center;min-width:0}
.lf-chat-search-field>svg{position:absolute;left:12px;color:var(--muted);pointer-events:none}
.lf-chat-sidebar .lf-chat-search-field input{box-sizing:border-box;padding-left:38px;background:var(--field);border-color:var(--border);font-size:16px;min-height:46px}
.lf-chat-group-title{margin:17px 5px 7px;color:var(--muted);font-size:11px}
.lf-chat-small{opacity:1;color:var(--muted);font-size:12px;line-height:1.5}
.lf-chat-person{min-height:64px;padding:9px 7px;gap:10px;border:1px solid transparent}
.lf-chat-person.is-selected{background:var(--green-bg);border-color:var(--border)}
.lf-chat-person-copy strong{font-size:14px;line-height:1.35}.lf-chat-person-copy small{font-size:12px;line-height:1.35}
.lf-chat-avatar{width:40px;height:40px;background:var(--green-bg);color:var(--mint)}
.lf-chat-count{background:#126b45;color:#fff;flex:none}
.lf-chat-person:disabled{cursor:default;opacity:.74}
.lf-chat-initial{padding:12px 4px}.lf-chat-skeleton-row{display:flex;align-items:center;gap:12px;min-height:64px;padding:8px 3px}
.lf-chat-skeleton-row>span{width:40px;height:40px;border-radius:50%;background:var(--border);opacity:.65;flex:none}
.lf-chat-skeleton-row>div{display:grid;gap:8px;flex:1}.lf-chat-skeleton-row i,.lf-chat-history-loading>span{display:block;background:var(--border);opacity:.65;border-radius:6px;height:10px;width:75%}.lf-chat-skeleton-row i:last-child{width:48%}
.lf-chat-list-state{display:grid;justify-items:center;text-align:center;gap:8px;color:var(--muted);padding:30px 10px}.lf-chat-list-state p{margin:0;font-weight:700;color:var(--text)}
.lf-chat-conversation-title{display:flex;flex-direction:row;align-items:center;gap:10px;border-color:var(--border);flex:none;min-width:0}.lf-chat-conversation-title>div{display:grid;gap:3px;min-width:0}.lf-chat-conversation-title strong{overflow-wrap:anywhere;line-height:1.35}.lf-chat-conversation-title small{font-size:12px}
.lf-chat-messages{min-height:0;gap:12px;padding:14px;overscroll-behavior-y:contain}
.lf-chat-bubble{background:var(--card);border:1px solid var(--border)}.is-me .lf-chat-bubble{background:var(--green-bg);border-color:var(--border)}
.lf-chat-bubble p{font-size:14px;line-height:1.5;color:var(--text)}.lf-chat-bubble time{font-size:11px;color:var(--muted)}
.lf-chat-history-loading{display:grid;gap:12px;color:var(--muted);font-size:12px;padding:10px 0}.lf-chat-history-loading p{margin:0;text-align:center}.lf-chat-history-loading>span{height:38px;width:65%;border-radius:12px}.lf-chat-history-loading>span:last-child{justify-self:end;width:52%}
.lf-chat-composer{flex:none;border-color:var(--border);background:var(--card2);align-items:flex-end}.lf-chat-composer textarea{background:var(--field);border-color:var(--border);font-size:16px;line-height:1.4;min-height:46px;max-height:100px;resize:none}
.lf-chat-composer button{background:#126b45;color:#fff;min-height:46px;min-width:46px;flex:none;justify-content:center}.lf-chat-composer button:disabled{opacity:.6}
.lf-chat-hint{flex:none;font-size:11px}.lf-chat-gesture{font-size:12px;line-height:1.45}.lf-chat-error button,.lf-chat-older{min-height:44px}.lf-chat-mobile-back:focus-visible,.lf-chat-composer textarea:focus-visible,.lf-chat-older:focus-visible,.lf-chat-error button:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
@media(max-width:799px){
 .lf-chat-page{padding:12px 4px calc(78px + env(safe-area-inset-bottom,0px))}
 .lf-chat-head{gap:10px;margin-bottom:12px}.lf-chat-emblem{width:44px;height:44px;border-radius:13px}.lf-chat-head h1{font-size:25px}
 .lf-chat-workspace{grid-template-columns:minmax(0,1fr);height:clamp(245px,calc(100dvh - 245px),650px);min-height:0;max-height:none}
 .lf-chat-sidebar{padding:10px;border-right:0}.lf-chat-main{display:none}.lf-chat-workspace.lf-chat-compact-open .lf-chat-sidebar{display:none}.lf-chat-workspace.lf-chat-compact-open .lf-chat-main{display:flex}
 .lf-chat-mobile-back{display:flex;align-items:center;gap:5px;min-height:44px;flex:none;padding:8px 10px}
 .lf-chat-person{padding:8px 5px}.lf-chat-conversation-title{padding:8px 10px}.lf-chat-conversation-title .lf-chat-avatar{width:34px;height:34px}.lf-chat-messages{padding:10px}
 .lf-chat-composer{padding:8px}.lf-chat-composer button{min-width:46px;padding:10px;gap:0}.lf-chat-composer button span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.lf-chat-hint{display:none}
}
@media(prefers-reduced-motion:reduce){.lf-chat-page *{scroll-behavior:auto!important}}
/* E.6: one viewport-sized mobile workspace; only messages/list scroll. */
@media(max-width:799px){
 .lf-chat-page.lf-chat-native-active{height:var(--lf-chat-visible-height,max(220px,calc(100dvh - 180px)));min-height:112px;max-height:none;display:flex;flex-direction:column;gap:8px;padding:4px 3px 0;overflow:hidden}
 .lf-chat-native-active .lf-chat-head{flex:none;margin:0;gap:9px}
 .lf-chat-native-thread .lf-chat-head,.lf-chat-keyboard-open .lf-chat-head{display:none}
 .lf-chat-native-active .lf-chat-workspace{flex:1 1 0;height:auto;min-height:0;max-height:none;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
 .lf-chat-native-active .lf-chat-sidebar{display:flex;flex-direction:column;overflow:auto;min-height:0}
 .lf-chat-native-active .lf-chat-list>*{flex-shrink:0}
 .lf-chat-native-active .lf-chat-search-field{flex:none;position:sticky;top:0;z-index:1;background:var(--card2);padding-bottom:4px}
 .lf-chat-native-active .lf-chat-main{min-height:0;overflow:hidden}
 .lf-chat-native-active .lf-chat-conversation-title{flex:none;padding:5px 8px;min-height:52px;gap:8px}
 .lf-chat-native-active .lf-chat-mobile-back{min-width:44px;width:44px;padding:8px;justify-content:center}
 .lf-chat-native-active .lf-chat-conversation-title strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .lf-chat-native-active .lf-chat-conversation-title>div{flex:1}
 .lf-chat-native-active .lf-chat-messages{flex:1 1 0;min-height:0;overflow-y:auto;overflow-anchor:none}
 .lf-chat-native-active .lf-chat-messages>*{flex-shrink:0}
 .lf-chat-native-active .lf-chat-composer{flex:none;padding:7px;gap:6px}
 .lf-chat-native-active .lf-chat-composer textarea{box-sizing:border-box;min-height:46px;max-height:80px;padding:10px;field-sizing:content}
 .lf-chat-native-active .lf-chat-gesture{display:none}
 .lf-chat-native-active .lf-chat-error{flex:none;max-height:80px;overflow:auto;margin:0;padding:6px;font-size:12px}
}
/* Coach dock remains mobile up to 900px (athlete up to 799px). */
@media(min-width:800px) and (max-width:900px){
 .lf-chat-page.lf-chat-native-coach.lf-chat-native-active{height:var(--lf-chat-visible-height,max(220px,calc(100dvh - 180px)));min-height:112px;max-height:none;display:flex;flex-direction:column;gap:8px;padding:4px 3px 0;overflow:hidden}
 .lf-chat-native-coach .lf-chat-head{flex:none;margin:0}
 .lf-chat-native-coach.lf-chat-keyboard-open .lf-chat-head{display:none}
 .lf-chat-native-coach .lf-chat-workspace{flex:1 1 0;height:auto;min-height:0;max-height:none}
 .lf-chat-native-coach .lf-chat-messages{min-height:0;overflow-anchor:none}
 .lf-chat-native-coach .lf-chat-messages>*{flex-shrink:0}
 .lf-chat-native-coach .lf-chat-hint{display:none}
 .lf-chat-native-coach .lf-chat-error{flex:none;max-height:80px;overflow:auto;margin:0}
}
</style>
<style>
/* The shell already reserves the dock; the chat calculates this space itself.
   Never change the padding of a different active route during the leave animation. */
@media(max-width:799px){.app.as-athlete>main.main-layout:has(>.lf-chat-native-active:not(.lf-motion-leaving)){padding-bottom:0!important;min-height:0!important}}
@media(max-width:900px){.app.as-coach>main.main-layout:has(>.lf-chat-native-active:not(.lf-motion-leaving)){padding-bottom:0!important;min-height:0!important}.app.as-coach:has(>main>.lf-chat-native-active:not(.lf-motion-leaving)){padding-bottom:0!important}}
/* The athlete navigation is teleported. Hide only with confirmed keyboard shrink. */
@media(max-width:799px){body[data-lf-chat-keyboard] [data-lionfit-dock="athlete"]{display:none!important}}
@media(max-width:900px){body[data-lf-chat-keyboard] .app.as-coach .coach-bottom{display:none!important}}
</style>
