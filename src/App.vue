<script setup lang="ts">
import { computed, ref, watch, onUnmounted, defineAsyncComponent } from 'vue'
import {quietLoadingVisible} from './features/motion/quietLoading'
import {onAuthStateChanged} from 'firebase/auth'
import {doc,onSnapshot,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from './integrations/firebase/stagingClient'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useLabStore } from './stores/lab'
import LionIcon from './components/LionIcon.vue'
import QuickProfileSwitch from './components/QuickProfileSwitch.vue'
import {navigationFailure,reloadNavigation} from './features/auth/navigationRecovery'
import {linkedNotice} from './integrations/firebase/linkedProfiles'
// A different tab can change Firebase local persistence. Destroy this UI instead of retaining old account data.
let stopIdentity: (()=>void)|undefined
if(isLiveMode()){try{stopIdentity=onAuthStateChanged(getStagingClients().auth,u=>{const old=stagingSession.value;if(old&&u?.uid!==old.uid){const mount=document.getElementById('app');if(mount)mount.style.display='none';window.location.replace('/')}})}catch{/* auth configuration already handled by router */}}
onUnmounted(()=>stopIdentity?.())
import InboxBell from './components/InboxBell.vue'
import PushWelcome from './components/PushWelcome.vue'
import CheckUploadNotice from './components/CheckUploadNotice.vue'
import {coachInboxEnabled} from './integrations/firebase/coachInbox'
import AthleteBottomNavigation from './components/AthleteBottomNavigation.vue'
import AthleteDesktopSidebar from './components/AthleteDesktopSidebar.vue'
import {isLiveMode,isStagingMode,isLocalProdDev} from './integrations/firebase/stagingConfig'
import {stagingSession,signOutStaging} from './integrations/firebase/stagingSession'
import {connectPushSession,pushNotice} from './integrations/firebase/pushNotifications'
import {demoProfiles} from './features/profile/localProfile'
import {uiText} from './features/i18n/interfaceLanguage'
import {CHAT_PREVIEW_ENABLED} from './features/chat/chatPreview'
import {sectionTransition} from './features/navigation/sectionSwipe'
import {prepareSectionMotion,releaseSectionMotion,prepareSectionLeave,finishSectionLeave,isSectionMoving,rememberSectionLayout} from './features/navigation/continuousMotion'
import {swipeNeighbor,snapBackDuration} from './features/navigation/fluidSwipe'
import {appendSwipeSample,recentSwipeVelocity,releaseSwipeCommit,type SwipeSample} from './features/navigation/nativeSwipe'
import {continuousDragOffset,continuousCommitMotion,createMotionCue,motionOutline,type MotionCue,type MotionSummary} from './features/navigation/universalMotion'
import {vLfSwipeRails} from './features/navigation/swipeRails'
import {reportSwipeTiming} from './features/performance/swipeAudit'
import {resolveSwipeIntent,protectedSwipeSelector,hasNativeHorizontalScroll,insideSystemEdge,suppressSwipeClick,type SwipeIntent} from './features/navigation/swipeIntent'
import {installMotionAudit} from './features/performance/motionAudit'
import {accountKey} from './features/platform/platformModel'
import {chatListHint} from './features/chat/chatSessionSnapshot'
import {CHAT_PILOT_ENABLED,chatUnread,chatPilotStatus,chatPilotAllowed} from './features/chat/chatClient'
// Chunk di avviso STAGING caricato solo in `vite build --mode staging`, mai in LIVE.
const StagingBanner=import.meta.env.MODE==='staging' ? defineAsyncComponent(()=>import('./components/StagingBanner.vue')) : null
const lab=useLabStore();const route=useRoute();const router=useRouter()
// Opt-in diagnostics only in local development. No content or identifiers are recorded.
const stopMotionAudit=installMotionAudit(router)
onUnmounted(stopMotionAudit)
// Match the actual shell breakpoints. Render exactly one inbox at a stable location.
const athleteHeaderMedia=window.matchMedia('(max-width: 799px)')
const coachHeaderMedia=window.matchMedia('(max-width: 900px)')
const athleteHeaderVisible=ref(athleteHeaderMedia.matches),coachHeaderVisible=ref(coachHeaderMedia.matches)
function syncHeaderViewport(){athleteHeaderVisible.value=athleteHeaderMedia.matches;coachHeaderVisible.value=coachHeaderMedia.matches}
athleteHeaderMedia.addEventListener('change',syncHeaderViewport);coachHeaderMedia.addEventListener('change',syncHeaderViewport)
onUnmounted(()=>{athleteHeaderMedia.removeEventListener('change',syncHeaderViewport);coachHeaderMedia.removeEventListener('change',syncHeaderViewport)})
function openPushAgenda(){pushNotice.value=null;void router.push(stagingSession.value?.role==='atleta'?'/prenotazioni':'/coach/prenotazioni')}
function openPushCompetition(eventId:string){pushNotice.value=null;const path=stagingSession.value?.role==='atleta'?'/prenotazioni':'/coach/prenotazioni';if(/^[A-Za-z0-9]{20}$/.test(eventId))void router.push({path,query:{competitionId:eventId}});else openPushAgenda()}
function openPushSupport(){pushNotice.value=null;void router.push(route.path==='/lionfit-control'?'/lionfit-control?open=support&notice='+Date.now():'/impostazioni?inboxSupport=1')}
function openPushNotice(){const n=pushNotice.value;if(n?.open==='support')openPushSupport();else if(n?.open==='competition'&&n.eventId)openPushCompetition(n.eventId);else openPushAgenda()}
watch(()=>stagingSession.value?.uid,uid=>{void connectPushSession(uid||null,openPushAgenda,true,openPushSupport,openPushCompetition).catch(()=>{})},{immediate:true})
const workoutRoute=computed(()=>route.path==='/progressi'||route.path==='/coach/progressi')
// Usa lo stesso gestore di Indietro della WebView, senza importare una seconda volta
// il modulo nativo e senza cambiare l'ordine dei CSS della shell.
function requestBackFromUi(){window.dispatchEvent(new Event('lionfit:ui-back'))}
const currentAvatar=ref('')
const verifiedSettingsRole=ref<null|'coach'|'atleta'>(null)
let roleSettingsRequest=0
watch(()=>[route.path,route.query.source],async()=>{
 const request=++roleSettingsRequest;verifiedSettingsRole.value=null
 if(!(import.meta.env.DEV&&route.path==='/impostazioni'&&route.query.source==='emulator'))return
 try{const {readVerifiedDevSession}=await import('./integrations/firebase/devSession');const verified=await readVerifiedDevSession();
  if(request===roleSettingsRequest)verifiedSettingsRole.value=verified.role==='atleta'?'atleta':'coach'
 }catch{/* Nessuna fiducia nel parametro URL: il router rifiuta accessi non verificati. */}
},{immediate:true})
const athleteSidebarExpanded=ref(true)
try{athleteSidebarExpanded.value=window.localStorage.getItem('lionfit-athlete-sidebar-collapsed')!=='1'}catch{/* browser storage unavailable */}
function toggleAthleteSidebar(){
 athleteSidebarExpanded.value=!athleteSidebarExpanded.value
 try{window.localStorage.setItem('lionfit-athlete-sidebar-collapsed',athleteSidebarExpanded.value?'0':'1')}catch{/* storage optional */}
}
let stopAvatar:Unsubscribe|null=null
watch(()=>stagingSession.value?.uid,(uid)=>{
 stopAvatar?.();stopAvatar=null;currentAvatar.value=''
 if(!uid||!isStagingMode())return
 try{
  const {db}=getStagingClients()
  stopAvatar=onSnapshot(doc(db,'users',uid),snap=>{
   const url=snap.data()?.photoURL||snap.data()?.photoUrl
   currentAvatar.value=typeof url==='string'&&url.length<870000&&(/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(url))?url:''
  },()=>{currentAvatar.value=''})
 }catch{currentAvatar.value=''}
},{immediate:true})
onUnmounted(()=>{stopAvatar?.()})

const platformPage=computed(()=>route.path==='/lionfit-control')
const isBooking=computed(()=>route.path.includes('prenotazioni'))
// Le schermate di laboratorio DEV non devono ereditare la shell demo anche se lab.role rimane valorizzato.
const isDevLab = computed(() => import.meta.env.DEV && route.path.startsWith('/dev/'))
const coachEmulatorPreview = computed(() => import.meta.env.DEV && (['/coach','/coach/messaggi','/coach/atleti','/coach/archivio','/coach/progressi','/coach/profilo'].includes(route.path) || (route.path === '/impostazioni' && verifiedSettingsRole.value === 'coach')) && route.query.source === 'emulator')
const athleteEmulatorPreview = computed(() => import.meta.env.DEV && (['/home','/messaggi','/piano','/archivio','/progressi','/profilo'].includes(route.path) || (route.path === '/impostazioni' && verifiedSettingsRole.value === 'atleta')) && route.query.source === 'emulator')
const bookingEmulatorPreview = computed(() => import.meta.env.DEV && ['/prenotazioni','/coach/prenotazioni'].includes(route.path) && route.query.source === 'emulator')
const bookingIsCoach = computed(()=>bookingEmulatorPreview.value && route.path==='/coach/prenotazioni')
const coachDevShell = computed(()=>coachEmulatorPreview.value || bookingIsCoach.value)
const athleteDevShell = computed(()=>athleteEmulatorPreview.value || (bookingEmulatorPreview.value && !bookingIsCoach.value))
const demoRouteRole=computed(() => import.meta.env.DEV && !isStagingMode() && !isDevLab.value ? (route.path.startsWith('/coach')?'coach' : ['/home','/piano','/archivio','/progressi','/profilo','/prenotazioni'].includes(route.path)?'atleta':null) : null)
// In una build pubblica NON leggere mai il ruolo demo dal browser:
// se LIVE non e' configurato, la UI resta soltanto sulla pagina di accesso bloccata.
const shownRole = computed(() => isStagingMode()
 ? (stagingSession.value?.role==='atleta'?'atleta':stagingSession.value?'coach':null)
 : import.meta.env.DEV
   ? (coachEmulatorPreview.value || bookingIsCoach.value ? 'coach'
     : athleteEmulatorPreview.value || bookingEmulatorPreview.value ? 'atleta'
     : demoRouteRole.value??lab.role)
   : null)
// Keep the Coach inbox in Dashboard only. Athlete notifications retain their original access points.
const inboxVisibleOnRoute=computed(()=>shownRole.value!=='coach'||route.path==='/coach')
const inboxInHeader=computed(()=>shownRole.value==='atleta'?athleteHeaderVisible.value:coachHeaderVisible.value)
const athleteNav=[{to:'/home',label:'HOME',icon:'home'},{to:'/piano',label:'PIANO',icon:'calendar'},{to:'/archivio',label:'ARCHIVIO',icon:'archive'},{to:'/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/prenotazioni',label:'AGENDA',icon:'calendar-plus'},{to:'/profilo',label:'PROFILO',icon:'user'}]
const coachNav=[{to:'/coach',label:'HOME',desk:'DASHBOARD',icon:'home'},{to:'/coach/atleti',label:'ATLETI',desk:'GESTIONE ATLETI',icon:'users'},{to:'/coach/libreria',label:'ESERCIZI',desk:'LIBRERIA ESERCIZI',icon:'clipboard'},{to:'/coach/archivio',label:'ARCHIVIO',desk:'ARCHIVIO SCHEDE',icon:'book'},{to:'/coach/profilo',label:'PROFILO',desk:'PROFILO & PALESTRA',icon:'user'}]
type SideNavItem = {to:string;label:string;icon:string;desk?:string}
const sideNav:SideNavItem[]=[coachNav[0],coachNav[1],coachNav[3],coachNav[2],{to:'/coach/prenotazioni',label:'AGENDA',icon:'calendar'},{to:'/coach/cestino',label:'CESTINO',icon:'bin'},{to:'/coach/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/coach/staff',label:'INVITI E TEAM',icon:'users'},coachNav[4]]
const athleteEmulatorNav=[{to:'/home?source=emulator',label:'HOME',icon:'home'},{to:'/piano?source=emulator',label:'PIANO',icon:'calendar'},{to:'/archivio?source=emulator',label:'ARCHIVIO',icon:'archive'},{to:'/progressi?source=emulator',label:'ALLENAMENTI',icon:'progress'},{to:'/prenotazioni?source=emulator',label:'AGENDA',icon:'calendar-plus'},{to:'/profilo?source=emulator',label:'PROFILO',icon:'user'}]
const coachEmulatorNav=[{to:'/coach?source=emulator',label:'HOME',icon:'home'},{to:'/coach/atleti?source=emulator',label:'ATLETI',icon:'users'},{to:'/coach/archivio?source=emulator',label:'ARCHIVIO',icon:'book'},{to:'/coach/prenotazioni?source=emulator',label:'AGENDA',icon:'calendar'},{to:'/coach/progressi?source=emulator',label:'ALLENAMENTI',icon:'progress'},{to:'/coach/profilo?source=emulator',label:'PROFILO',icon:'user'}]
const stagingAthleteNav=[{to:'/home',label:'HOME',icon:'home'},{to:'/piano',label:'PIANO',icon:'calendar'},{to:'/archivio',label:'ARCHIVIO',icon:'archive'},{to:'/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/prenotazioni',label:'AGENDA',icon:'calendar-plus'},{to:'/profilo',label:'PROFILO',icon:'user'}]
const stagingCoachNav=[{to:'/coach',label:'HOME',icon:'home'},{to:'/coach/atleti',label:'ATLETI',icon:'users'},{to:'/coach/archivio',label:'ARCHIVIO',icon:'book'},{to:'/coach/prenotazioni',label:'AGENDA',icon:'calendar'},{to:'/coach/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/coach/profilo',label:'PROFILO',icon:'user'}]
const mobileNav=computed(()=>isStagingMode()?(shownRole.value==='coach'?stagingCoachNav:stagingAthleteNav):coachDevShell.value?coachEmulatorNav:athleteDevShell.value?athleteEmulatorNav:shownRole.value==='coach'?coachNav:athleteNav)
// R22A: an opt-in navigation preview; does not read/write chat data.
// The LIVE pilot icon is visible only after backend authorization of the chosen pair.
const chatPreviewEnabled=computed(()=>CHAT_PREVIEW_ENABLED&&(!CHAT_PILOT_ENABLED||chatPilotAllowed.value))
// Same left-to-right order as the visible mobile dock; Chat is a page to the LEFT of Home.
const swipePages=computed(()=>[...(chatPreviewEnabled.value?[shownRole.value==='coach'?'/coach/messaggi':'/messaggi']:[]),...mobileNav.value.map(item=>item.to.split('?')[0])])
function swipeViewport(){return window.innerWidth<(shownRole.value==='coach'?901:800)}
const swipeSurfaceEnabled=computed(()=>!!shownRole.value&&swipePages.value.includes(route.path))
let chatPilotVisibilityRequest=0
watch(()=>accountKey(stagingSession.value),async key=>{
 const uid=stagingSession.value?.uid,request=++chatPilotVisibilityRequest
 chatListHint.clear();chatPilotAllowed.value=false
 if(!CHAT_PILOT_ENABLED||!uid||!isStagingMode())return
 try{
  const allowed=await chatPilotStatus(uid)
  if(request===chatPilotVisibilityRequest&&accountKey(stagingSession.value)===key)chatPilotAllowed.value=allowed
 }catch{if(request===chatPilotVisibilityRequest)chatPilotAllowed.value=false}
},{immediate:true,flush:'sync'})
const chatRoute=computed(()=>{const target=shownRole.value==='coach'?'/coach/messaggi':'/messaggi';return route.query.source==='emulator'?target+'?source=emulator':target})
const chatMotion=ref('')
const swipeStage=ref<HTMLElement|null>(null)
const enteringPaths=new WeakMap<Element,string>()
function beforeChatEnter(el:Element){enteringPaths.set(el,route.path);if(chatMotion.value&&swipeViewport())prepareSectionMotion(el,swipeStage.value)}
function finishChatMotion(el:Element){releaseSectionMotion(el);if(enteringPaths.get(el)===route.path&&el===swipeRouteRoot)chatMotion.value='';enteringPaths.delete(el)}
function cancelChatEnter(el:Element){releaseSectionMotion(el);enteringPaths.delete(el)}
function beforeChatLeave(el:Element){prepareSectionLeave(el,chatMotion.value,swipeViewport())}
// R22B will populate this from authorized unread metadata; 0 means no invented notifications.
const chatUnreadCount=ref(0)
let chatUnreadTimer:ReturnType<typeof setInterval>|null=null,chatRequest=0
async function refreshChatUnread(){
 const uid=stagingSession.value?.uid,request=++chatRequest,key=accountKey(stagingSession.value)
 if(!CHAT_PILOT_ENABLED||!chatPilotAllowed.value||!isStagingMode()||!uid){chatUnreadCount.value=0;return}
 if(document.hidden)return
 try{
  const result=await chatUnread(uid)
  if(request===chatRequest&&accountKey(stagingSession.value)===key)chatUnreadCount.value=Math.max(0,Math.min(999,result.unread))
 }catch(e){if(request===chatRequest){chatUnreadCount.value=0;if(/permission-denied|unauthenticated|failed-precondition/i.test(String((e as {code?:string})?.code||''))){chatListHint.clear();chatPilotAllowed.value=false}}}
}
watch([()=>accountKey(stagingSession.value),chatPilotAllowed],()=>{chatUnreadCount.value=0;void refreshChatUnread()},{immediate:true,flush:'sync'})
function chatVisibility(){if(!document.hidden)void refreshChatUnread()}
function chatEvent(){void refreshChatUnread()}
document.addEventListener('visibilitychange',chatVisibility)
window.addEventListener('lionfit:chat-updated',chatEvent)
if(CHAT_PILOT_ENABLED)chatUnreadTimer=setInterval(()=>{void refreshChatUnread()},30000)
onUnmounted(()=>{++chatRequest;if(chatUnreadTimer)clearInterval(chatUnreadTimer);document.removeEventListener('visibilitychange',chatVisibility);window.removeEventListener('lionfit:chat-updated',chatEvent)})
watch(()=>route.path,(now,before)=>{
 touchStart=null;const retainCue=!!motionCue&&pendingSwipe?.from===before&&pendingSwipe?.to===now;transferSwipeMotion(before,now);if(swipeViewport())rememberSectionLayout(swipeRouteRoot);restoreDrag(false,retainCue)
 // Preserve the R22A premium Chat gesture on athlete Home; extend the same direction logic
 // to the other top-level sections, including taps on the existing navbar.
 if (chatPreviewEnabled.value && before==='/home' && now==='/messaggi') chatMotion.value='lf-chat-open'
 else if (chatPreviewEnabled.value && before==='/messaggi' && now==='/home') chatMotion.value='lf-chat-close'
 // Home/Piano/Archivio share AthleteLiveWorkspace. Vue Router reuses that instance,
 // so RouterView cannot animate these two transitions. Their content is animated
 // internally without tearing down the existing live Firestore subscriptions.
 else if (shownRole.value==='atleta' && isStagingMode() &&
  ['/home','/piano','/archivio'].includes(before) && ['/home','/piano','/archivio'].includes(now)) chatMotion.value=''
 else chatMotion.value=shownRole.value && swipeViewport() ? sectionTransition(before,now,swipePages.value) : ''
})
// E.5 — native touch feedback with real-page navigation. This never replaces Vue Router.
// The native section transitions still own the final page switch.
type GestureStart={x:number;y:number;at:number;path:string;root:HTMLElement|null;intent:SwipeIntent;target:Element|null;identifier:number;samples:SwipeSample[];lockedAt:number;paintReported:boolean;width:number;reducedMotion:boolean}
let touchStart:GestureStart|null=null
let consumedContact:GestureStart|null=null
// Pointer Events deliver continuous coordinates without the legacy TouchEvent
// slop on modern engines. Use exactly one input path, never both.
const pointerSwipeEnabled=typeof window.PointerEvent==='function'&&typeof CSS!=='undefined'&&CSS.supports('touch-action','pan-y pinch-zoom')
let swipeClickGuard:{at:number;target:Element;path:string}|null=null
let swipeRouteRoot:HTMLElement|null=null
let swipeRouteInstance:{motionSummary?:(path:string,scope:string)=>MotionSummary|null}|null=null
let motionCue:MotionCue|null=null,snapCue:MotionCue|null=null
let handoffCue:MotionCue|null=null,handoffFrame=0
function clearHandoffCue(){if(handoffFrame){cancelAnimationFrame(handoffFrame);handoffFrame=0}handoffCue?.dispose();handoffCue=null}
let cueTarget:string|null=null,cueDirection=0,cueLabel="",cueSummary:MotionSummary|null=null
let dragFrame=0,swipeWaitFrame=0,externalTapUntil=0,dragOffset=0,dragPaintedOffset=0,dragRoot:HTMLElement|null=null
let snapAnimation:Animation|null=null,snapStage:HTMLElement|null=null
let dragStage:HTMLElement|null=null
let pendingSwipe:{from:string;to:string;direction:number;velocity:number;at:number;issued:boolean}|null=null
let motionStage:HTMLElement|null=null,motionTimer:ReturnType<typeof setTimeout>|null=null
let dragOriginal:{transform:string;transition:string;willChange:string}|null=null
function setSwipeRouteRoot(instance:unknown){
 const element=(instance as {$el?:unknown}|null)?.$el
 swipeRouteRoot=element instanceof HTMLElement?element:null
 swipeRouteInstance=swipeRouteRoot?instance as typeof swipeRouteInstance:null
}
function clearSwipeMotion(){
 if(motionTimer!==null){clearTimeout(motionTimer);motionTimer=null}
 motionStage?.style.removeProperty('--lf-swipe-commit-offset')
 motionStage?.style.removeProperty('--lf-swipe-commit-duration')
 motionStage?.style.removeProperty('--lf-motion-span')
 if(motionStage)delete motionStage.dataset.lfMotionPaired
 motionStage=null
}
function transferSwipeMotion(from:string,to:string){
 clearSwipeMotion()
 const pending=pendingSwipe;pendingSwipe=null
 if(!swipeViewport()||!sectionTransition(from,to,swipePages.value)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
 const stage=swipeStage.value||(dragRoot||swipeRouteRoot)?.closest<HTMLElement>('.main-layout')
 if(!stage)return
 motionStage=stage
 stage.dataset.lfMotionPaired='true'
 stage.style.setProperty('--lf-motion-span',`${stage.clientWidth}px`)
 motionTimer=setTimeout(clearSwipeMotion,1200)
 if(!pending||pending.from!==from||pending.to!==to)return
 reportSwipeTiming('route',pending.at)
 const motion=continuousCommitMotion(dragRoot?.isConnected?dragPaintedOffset:0,stage.clientWidth,pending.direction,pending.velocity)
 if(!motion)return
 // Both the outer RouterView and the reused athlete workspace inherit these
 // variables. Vue's leave-from starts at the last visible drag offset.
 stage.style.setProperty('--lf-swipe-commit-offset',`${motion.offset}px`)
 stage.style.setProperty('--lf-swipe-commit-duration',`${motion.duration}ms`)
}
function restoreDrag(animateBack:boolean,retainCue=false){
 clearHandoffCue()
 if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0}
 if(swipeWaitFrame){cancelAnimationFrame(swipeWaitFrame);swipeWaitFrame=0}
 externalTapUntil=0
 snapAnimation?.cancel();snapAnimation=null
 snapCue?.dispose();snapCue=null
 const cue=motionCue;motionCue=null;cueTarget=null;cueDirection=0;cueLabel="";cueSummary=null
 if(snapStage)delete snapStage.dataset.lfMotionDragging;snapStage=null
 const el=dragRoot,original=dragOriginal,offset=dragPaintedOffset,stage=dragStage
 dragRoot=null;dragOriginal=null;dragStage=null;dragOffset=0;dragPaintedOffset=0
 if(stage)delete stage.dataset.lfMotionDragging
 if(!el||!original){cue?.dispose();return}
 el.style.transform=original.transform
 el.style.transition=original.transition
 el.style.willChange=original.willChange
 if(animateBack&&Math.abs(offset)>3&&el.isConnected&&typeof el.animate==='function'&&!isSectionMoving(el)){
  const duration=snapBackDuration(offset,stage?.clientWidth||window.innerWidth)
  if(stage)stage.dataset.lfMotionDragging='true'
  const animation=el.animate([{transform:`translate3d(${offset}px,0,0)`},{transform:original.transform||'translate3d(0,0,0)'}],
   {duration,easing:'cubic-bezier(.18,1,.35,1)'})
  snapAnimation=animation;snapStage=stage
  snapCue=cue;cue?.returnToEdge(duration)
  const clean=()=>{if(snapAnimation===animation){snapAnimation=null;snapStage=null;snapCue?.dispose();snapCue=null;if(stage)delete stage.dataset.lfMotionDragging}}
  animation.onfinish=clean;animation.oncancel=clean
 }else if(retainCue&&cue&&stage&&stage.dataset.lfMotionPaired==='true'){
  // Route watcher runs before the destination DOM patch. Keep the cue through
  // that patch, remove before the next paint (the real enter shares its offset).
  handoffCue=cue;handoffFrame=requestAnimationFrame(()=>{handoffFrame=0;clearHandoffCue()})
 }else cue?.dispose()
}
function paintNativeDrag(start:GestureStart){
 if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0}
 if(!dragRoot?.isConnected)return
 if(cueDirection&&dragStage&&!motionCue)motionCue=createMotionCue(dragStage,dragRoot,dragPaintedOffset)
 motionCue?.paint(dragOffset,cueDirection,cueLabel,cueSummary)
 dragRoot.style.transition='none'
 dragRoot.style.willChange='transform'
 dragRoot.style.transform=`translate3d(${dragOffset}px,0,0)`
 dragPaintedOffset=dragOffset
 if(!start.paintReported){start.paintReported=true;reportSwipeTiming('paint',start.lockedAt||start.at)}
}
function skipSectionSwipe(target:EventTarget|null,root:EventTarget|null):boolean {
 let node=target instanceof Element?target:null
 while(node && node!==root){
  if(node.matches(protectedSwipeSelector))return true
  if(node instanceof HTMLElement){
   if(node.isContentEditable)return true
   if(node.scrollWidth>node.clientWidth+2&&hasNativeHorizontalScroll(node.scrollWidth,node.clientWidth,window.getComputedStyle(node).overflowX))return true
  }
  node=node.parentElement
 }
 return false
}
function selectedTouchTarget(target:EventTarget|null):boolean{
 const selection=window.getSelection()
 if(!selection||selection.isCollapsed||!selection.rangeCount||!(target instanceof Node))return false
 try{return selection.getRangeAt(0).intersectsNode(target)}catch{return false}
}
function visibleSwipeModal(stage:HTMLElement|null):boolean{
 if(!stage)return false
 return Array.from(stage.querySelectorAll<HTMLElement>('[aria-modal="true"],dialog[open],.modal-overlay,.lf15-video-backdrop')).some(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden="true"]'))
}
function armSwipeClickGuard(start:GestureStart){
 if(start.target)swipeClickGuard={at:Date.now(),target:start.target,path:start.path}
}
function chatClickCapture(event:MouseEvent){
 const guard=swipeClickGuard
 if(!guard)return
 const target=event.target instanceof Element?event.target:null
 const related=!!target&&(guard.target===target||guard.target.contains(target)||target.contains(guard.target))
 const source=(event as MouseEvent & {sourceCapabilities?:{firesTouchEvents?:boolean}}).sourceCapabilities
 if(suppressSwipeClick(Date.now()-guard.at,event.detail,related||(guard.path!==route.path&&source?.firesTouchEvents!==false),source?.firesTouchEvents)){
  swipeClickGuard=null
  event.preventDefault();event.stopImmediatePropagation()
 }else if(Date.now()-guard.at>450)swipeClickGuard=null
}
type SwipePoint={clientX:number;clientY:number;identifier:number}
function beginGesture(event:Event,point:SwipePoint){
 if(pendingSwipe)return // only one navigation for a committed gesture
 touchStart=null;consumedContact=null;swipeClickGuard=null;restoreDrag(false)
 if(!swipeSurfaceEnabled.value||!swipeViewport())return
 const stage=swipeStage.value
 if(insideSystemEdge(point.clientX,window.innerWidth)||skipSectionSwipe(event.target,event.currentTarget))return
 if(selectedTouchTarget(event.target)||visibleSwipeModal(stage))return
 const at=performance.now(),el=swipeRouteRoot
 touchStart={x:point.clientX,y:point.clientY,at,path:route.path,root:el,intent:'pending',target:event.target instanceof Element?event.target:null,identifier:point.identifier,samples:[{x:point.clientX,at}],lockedAt:0,paintReported:false,width:stage?.clientWidth||window.innerWidth,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches}
}
function lockGesture(start:GestureStart,dx:number,dy:number){
 start.intent=resolveSwipeIntent(start.intent,dx,dy)
 if(start.intent==='horizontal'&&!start.lockedAt){start.lockedAt=performance.now();reportSwipeTiming('lock',start.at)}
}
function commitSwipe(start:GestureStart,destination:string,dx:number,velocity:number,held:boolean){
 if(pendingSwipe||start.path!==route.path||!swipePages.value.includes(destination))return
 // Retain the exact painted position until router guards resolve. Do not
 // force an unpainted drag frame immediately before route transfer.
 if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0}
 armSwipeClickGuard(start);touchStart=null
 if(held)consumedContact=start
 if(destination==='/messaggi'||route.path==='/messaggi')chatHintClose()
 const commit={from:route.path,to:destination,direction:dx,velocity,at:performance.now(),issued:false}
 pendingSwipe=commit
 const settle=()=>{if(pendingSwipe===commit){pendingSwipe=null;restoreDrag(route.path!==commit.to);if(route.path!==commit.to)reportSwipeTiming('cancel',commit.at,'navigation-failed')}}
 const push=()=>{
  swipeWaitFrame=0
  if(pendingSwipe!==commit||route.path!==commit.from)return
  // A second deliberate swipe can be accepted while the preceding page is
  // moving. Queue one destination until that transition rests, rather than
  // restarting an already-moving page from transform:0. Navbar taps remain
  // independent and a route change invalidates this pending intent.
  const now=performance.now()
  if(now<externalTapUntil||(swipeRouteRoot?.isConnected&&isSectionMoving(swipeRouteRoot))){
   if(now-commit.at<500){swipeWaitFrame=requestAnimationFrame(push);return}
   settle();return // never force a new animation over a still-moving page
  }
  commit.issued=true
  void router.push(route.query.source==='emulator'?{path:destination,query:{source:'emulator'}}:destination).then(settle,settle)
 }
 push()
}
function moveGesture(event:Event,point:SwipePoint){
 const start=touchStart
 if(!start)return
 if(start.path!==route.path||!swipeViewport()||point.identifier!==start.identifier){cancelGesture();return}
 const dx=point.clientX-start.x,dy=point.clientY-start.y,now=performance.now()
 if(selectedTouchTarget(start.target)){cancelGesture();return}
 appendSwipeSample(start.samples,point.clientX,now)
 lockGesture(start,dx,dy)
 if(start.intent!=='horizontal')return // native taps and vertical scroll remain native
 if(!pointerSwipeEnabled){if(!event.cancelable){cancelGesture();return}event.preventDefault()}
 const next=swipeNeighbor(start.path,dx,swipePages.value)
 const stage=swipeStage.value,el=start.root,width=start.width
 const moving=!dragRoot&&!!el&&isSectionMoving(el)
 // If a prior real transition is still active, accept a new gesture without
 // overwriting its transform. Once stable, the drag can attach normally.
 if(el?.isConnected&&!moving&&!start.reducedMotion){
  const offset=continuousDragOffset(dx,width,!!next)
  if(offset||dragRoot){
   if(!dragRoot){dragRoot=el;dragStage=stage;dragOriginal={transform:el.style.transform,transition:el.style.transition,willChange:el.style.willChange};if(stage)stage.dataset.lfMotionDragging='true'}
   dragOffset=offset
   cueDirection=next?Math.sign(dx):0
   if(cueTarget!==next){cueTarget=next;cueLabel=next?uiText(next===chatRoute.value.split('?')[0]?'Messaggi':mobileNav.value.find(item=>item.to.split('?')[0]===next)?.label||''):''
    const scope=accountKey(stagingSession.value);cueSummary=next?((scope?swipeRouteInstance?.motionSummary?.(next,scope):null)||motionOutline(next)):null
   }
   if(!dragFrame)dragFrame=requestAnimationFrame(()=>paintNativeDrag(start))
  }
 }
 // E.5.1: retain reversibility throughout the drag; commit on release only.
}
function finishConsumedContact(identifier:number){
 if(consumedContact?.identifier!==identifier)return false
 armSwipeClickGuard(consumedContact);consumedContact=null;return true
}
function endGesture(event:Event,point:SwipePoint){
 if(finishConsumedContact(point.identifier)){if(!pointerSwipeEnabled&&event.cancelable)event.preventDefault();return}
 if(pendingSwipe)return
 const start=touchStart;touchStart=null
 if(!start)return
 if(start.path!==route.path||!swipeViewport()||point.identifier!==start.identifier){restoreDrag(true);return}
 const dx=point.clientX-start.x,dy=point.clientY-start.y,now=performance.now()
 appendSwipeSample(start.samples,point.clientX,now)
 lockGesture(start,dx,dy)
 if(start.intent!=='horizontal'){restoreDrag(true);return}
 if(!pointerSwipeEnabled&&event.cancelable)event.preventDefault()
 armSwipeClickGuard(start)
 const candidate=swipeNeighbor(start.path,dx,swipePages.value),velocity=recentSwipeVelocity(start.samples)
 const shouldMove=releaseSwipeCommit({dx,dy,elapsed:now-start.at,width:start.width,velocity,hasNeighbor:!!candidate})
 const destination=shouldMove?candidate:null
 if(!destination){reportSwipeTiming('cancel',start.at,'release');restoreDrag(true);return}
 // A final pointer sample may arrive between two animation frames. Keep the
 // last painted position rather than jumping forward on release.
 commitSwipe(start,destination,dx,velocity,false)
}
function cancelGesture(){
 if(pendingSwipe)return
 if(touchStart?.intent==='horizontal'){armSwipeClickGuard(touchStart);reportSwipeTiming('cancel',touchStart.at,'input-cancel')}
 touchStart=null;restoreDrag(true)
}
function pointerPoint(event:PointerEvent):SwipePoint{return {clientX:event.clientX,clientY:event.clientY,identifier:event.pointerId}}
function chatPointerDown(event:PointerEvent){
 if(event.pointerType!=='touch')return
 if(!event.isPrimary){cancelGesture();return} // second finger belongs to pinch zoom
 beginGesture(event,pointerPoint(event))
}
function chatPointerMove(event:PointerEvent){if(event.pointerType==='touch'&&event.isPrimary)moveGesture(event,pointerPoint(event))}
function chatPointerUp(event:PointerEvent){if(event.pointerType==='touch'&&event.isPrimary)endGesture(event,pointerPoint(event))}
function chatPointerCancel(event:PointerEvent){if(event.pointerType==='touch'&&(event.pointerId===touchStart?.identifier||event.pointerId===consumedContact?.identifier)){finishConsumedContact(event.pointerId);cancelGesture()}}
function chatPointerLostCapture(event:PointerEvent){if(event.pointerType==='touch'&&event.pointerId===touchStart?.identifier)cancelGesture()}
// Compatibility path for browsers without Pointer Events / touch-action support.
function chatTouchStart(event:TouchEvent){if(event.touches.length!==1){cancelGesture();return}beginGesture(event,event.touches[0])}
function chatTouchMove(event:TouchEvent){if(event.touches.length!==1){cancelGesture();return}moveGesture(event,event.touches[0])}
function chatTouchEnd(event:TouchEvent){if(event.changedTouches.length!==1||event.touches.length>0){cancelGesture();return}endGesture(event,event.changedTouches[0])}
function chatTouchCancel(){cancelGesture()}
// v-on object keeps the inactive input path unregistered, including its
// non-passive touchmove. Pointer input uses implicit touch capture only.
const swipeInputEvents=pointerSwipeEnabled?{
 pointerdownCapture:chatPointerDown,pointermoveCapture:chatPointerMove,pointerupCapture:chatPointerUp,pointercancelCapture:chatPointerCancel,lostpointercaptureCapture:chatPointerLostCapture
}:{touchstartCapturePassive:chatTouchStart,touchmoveCapture:chatTouchMove,touchendCapture:chatTouchEnd,touchcancelCapturePassive:chatTouchCancel}
// An early commit may detach the original target before release. Refresh the
// short click guard at release even if the event no longer reaches the shell.
function committedPointerRelease(event:PointerEvent){if(event.pointerType==='touch')finishConsumedContact(event.pointerId)}
function committedTouchRelease(event:TouchEvent){for(const point of Array.from(event.changedTouches))finishConsumedContact(point.identifier)}
function resetSwipeSession(){touchStart=null;consumedContact=null;pendingSwipe=null;swipeClickGuard=null;restoreDrag(false);clearSwipeMotion()}
// Changing identity or hiding the app must not leave a drag or scheduled frame.
watch([()=>stagingSession.value?.uid,()=>stagingSession.value?.gymId,()=>stagingSession.value?.role],resetSwipeSession,{flush:'sync'})
watch(chatPreviewEnabled,()=>{if(touchStart||pendingSwipe&&!pendingSwipe.issued)resetSwipeSession()},{flush:'sync'})
function swipeVisibility(){if(document.hidden)resetSwipeSession()}
let lastSwipeWidth=window.innerWidth
function swipeResize(){if(lastSwipeWidth!==window.innerWidth){lastSwipeWidth=window.innerWidth;resetSwipeSession()}}
function outsideSwipeStage(event:Event){return event.target instanceof Node&&!swipeStage.value?.contains(event.target)}
function pauseQueuedSwipeForExternalTouch(event:Event){
 // Pointerdown alone is not a click. Some browsers suppress compatibility
 // clicks immediately after a drag. Do not lose the already accepted swipe.
 if(pendingSwipe&&!pendingSwipe.issued&&outsideSwipeStage(event))externalTapUntil=performance.now()+180
}
function cancelQueuedSwipeForExternalClick(event:Event){if(pendingSwipe&&!pendingSwipe.issued&&outsideSwipeStage(event))resetSwipeSession()}

if(pointerSwipeEnabled){
 document.addEventListener('pointerdown',pauseQueuedSwipeForExternalTouch,{capture:true,passive:true})
 document.addEventListener('pointerup',committedPointerRelease,true)
 document.addEventListener('pointercancel',committedPointerRelease,true)
}else{
 document.addEventListener('touchstart',pauseQueuedSwipeForExternalTouch,{capture:true,passive:true})
 document.addEventListener('touchend',committedTouchRelease,{capture:true,passive:true})
 document.addEventListener('touchcancel',committedTouchRelease,{capture:true,passive:true})
}
document.addEventListener('click',cancelQueuedSwipeForExternalClick,true)
document.addEventListener('visibilitychange',swipeVisibility)
window.addEventListener('lionfit:motion-scope-invalidated',resetSwipeSession)
window.addEventListener('resize',swipeResize,{passive:true})
onUnmounted(()=>{resetSwipeSession();document.removeEventListener('pointerdown',pauseQueuedSwipeForExternalTouch,true);document.removeEventListener('pointerup',committedPointerRelease,true);document.removeEventListener('pointercancel',committedPointerRelease,true);document.removeEventListener('touchstart',pauseQueuedSwipeForExternalTouch,true);document.removeEventListener('touchend',committedTouchRelease,true);document.removeEventListener('touchcancel',committedTouchRelease,true);document.removeEventListener('click',cancelQueuedSwipeForExternalClick,true);document.removeEventListener('visibilitychange',swipeVisibility);window.removeEventListener('lionfit:motion-scope-invalidated',resetSwipeSession);window.removeEventListener('resize',swipeResize)})

const showChatHint=ref(false)
const chatHintKey='lionfit-r22a-chat-hint-seen'
function chatHintClose(){
 showChatHint.value=false
 try{localStorage.setItem(chatHintKey,'1')}catch{/* ephemeral browsers */}
}
if(chatPreviewEnabled.value){
 try{showChatHint.value=localStorage.getItem(chatHintKey)!=='1'}catch{showChatHint.value=true}
}
watch(()=>route.path,path=>{if(chatPreviewEnabled.value&&path==='/messaggi')chatHintClose()})
async function goOut(){
 if(isStagingMode()){if(await signOutStaging())await router.replace('/accesso');return}
 if(coachEmulatorPreview.value || athleteEmulatorPreview.value || bookingEmulatorPreview.value){
  const { leaveDevSession } = await import('./integrations/firebase/devSession')
  await leaveDevSession()
  await router.push('/dev/accesso')
  return
 }
 lab.logout()
 await router.push('/accesso')
}
</script>
<template>
  <Teleport to="body"><div v-if="quietLoadingVisible" class="lf-quiet-indicator" role="status"><span class="lf-quiet-status">{{uiText("Caricamento in corso…")}}</span><span class="lf-quiet-track" aria-hidden="true"></span></div></Teleport>
  <Teleport to="body"><aside v-if="navigationFailure" class="lf21-nav-recovery" role="alert"><strong>{{navigationFailure.kind==='assets'?'Pagina non caricata':'Navigazione non riuscita'}}</strong><p>{{navigationFailure.kind==='assets'?'Potrebbe essere disponibile una nuova versione. Ricarica per riprovare.':'Riprova a cambiare pagina o ricarica LionFit.'}}</p><button type="button" @click="reloadNavigation">Ricarica</button><button type="button" @click="navigationFailure=null">Chiudi</button></aside></Teleport>
  <Teleport to="body"><aside v-if="pushNotice" role="status" style="position:fixed;inset:auto 12px max(85px,env(safe-area-inset-bottom)) 12px;z-index:9999;max-width:440px;margin:auto;padding:14px;border-radius:12px;background:#162720;color:#fff;box-shadow:0 6px 24px #0008"><strong>{{pushNotice.title}}</strong><p>{{pushNotice.body}}</p><button type="button" class="secondary" @click="openPushNotice">{{pushNotice.open==='support'?'Apri assistenza':pushNotice.open==='competition'?'Apri gara':'Apri Agenda'}}</button> <button type="button" class="bare" style="color:#fff" @click="pushNotice=null">Chiudi</button></aside></Teleport>
 <div class="app" :class="['theme-'+lab.theme,shownRole==='coach'?'as-coach':'as-athlete',{'bookings-mode':isBooking,'lf-support-shell':route.path==='/assistenza'&&!!shownRole&&isStagingMode(),'athlete-sidebar-collapsed':!athleteSidebarExpanded}]">
  <div v-if="isLocalProdDev()" class="lab-banner" role="status">⚠ SVILUPPO LOCALE · FIREBASE PRODUZIONE · LE SCRITTURE POSSONO CAMBIARE DATI REALI</div>
  <component v-if="StagingBanner" :is="StagingBanner"/>
  <div v-else-if="coachEmulatorPreview || athleteEmulatorPreview || bookingEmulatorPreview" class="lab-banner">{{uiText("FIREBASE EMULATOR · DATI FITTIZI · SCRITTURE SOLO CON CONFERMA · NON È L'APP PUBBLICATA")}}</div>
  <template v-if="isDevLab">
    <header class="login-header"><img src="/v1-preview/LOGO-APP.png" alt=""/><span>LION <b>FIT</b></span></header>
    <main class="login-main"><RouterView/></main>
  </template>
  <template v-else-if="platformPage"><header class="login-header"><img src="/v1-preview/LOGO-APP.png" alt="LionFit"/><span>LION <b>FIT</b> · Control Center</span></header><main class="lf14-platform-shell"><RouterView/></main></template>
  <template v-else-if="route.path==='/assistenza' && shownRole && isStagingMode()"><RouterView/></template>
  <template v-else-if="shownRole && route.path!=='/accesso'">
    <AthleteDesktopSidebar v-if="shownRole==='atleta'" :items="mobileNav" :expanded="athleteSidebarExpanded" @toggle="toggleAthleteSidebar" @logout="goOut"/>
    <RouterLink v-if="chatPreviewEnabled && shownRole==='atleta' && !athleteHeaderVisible" :to="chatRoute" class="lf-chat-desktop-shortcut" aria-label="Apri Messaggi" title="Apri Messaggi"><LionIcon name="messages" :size="24"/><span>Messaggi</span><span v-if="chatUnreadCount>0" class="lf-chat-unread">{{chatUnreadCount>99?'99+':chatUnreadCount}}</span></RouterLink>
    <aside v-if="shownRole==='coach'" class="desktop-sidebar">
      <div class="sidebar-head"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div><strong>LION <em>FIT</em></strong><small>{{uiText("AREA COACH / ADMIN")}}</small></div></div>
      <nav class="sidebar-nav">
        <template v-if="isStagingMode()"><RouterLink v-for="item in sideNav" :key="item.to" :to="item.to" :class="{'staff-nav-item':item.to==='/coach/staff'}"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.desk||item.label)}}</span></RouterLink></template>
        <RouterLink v-if="coachDevShell" to="/coach?source=emulator"><LionIcon name="home" :size="17"/><span>DASHBOARD · FIREBASE</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/atleti?source=emulator"><LionIcon name="users" :size="17"/><span>{{uiText("GESTIONE ATLETI · FIREBASE")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/archivio?source=emulator"><LionIcon name="book" :size="17"/><span>{{uiText("ARCHIVIO COACH · FIREBASE")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/prenotazioni?source=emulator"><LionIcon name="calendar" :size="17"/><span>{{uiText("CALENDARIO APPUNTAMENTI · FIREBASE")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/progressi?source=emulator"><LionIcon name="progress" :size="17"/><span>{{uiText("ALLENAMENTI")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/profilo?source=emulator"><LionIcon name="user" :size="17"/><span>{{uiText("PROFILO · FIREBASE")}}</span></RouterLink>
        <template v-else-if="!isStagingMode()"><RouterLink v-for="item in sideNav" :key="item.to" :to="item.to" :class="{'staff-nav-item':item.to==='/coach/staff'}"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.desk||item.label)}}</span></RouterLink></template>
      </nav>
      <div class="sidebar-foot"><QuickProfileSwitch/><button class="ghost wide" @click="goOut">{{uiText(isStagingMode()?'Esci da Lion Fit':coachEmulatorPreview ? 'Esci dal laboratorio' : 'Esci')}}</button><RouterLink v-if="shownRole==='coach' && !coachDevShell" class="invite-shortcut" to="/coach/staff">{{uiText('INVITI DELLA PALESTRA')}} <strong>{{uiText('Inviti via email →')}}</strong></RouterLink></div>
    </aside>
    <header class="mobile-topbar"><div class="brand"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div><div class="brand-name">LION <span>FIT</span><small v-if="shownRole==='coach'">COACH</small></div><div class="brand-subtitle">{{uiText(shownRole==='coach'?'PANNELLO ADMIN':'AREA ATLETA')}}</div></div></div><div class="top-actions"><QuickProfileSwitch compact/><RouterLink v-if="chatPreviewEnabled && shownRole" :to="chatRoute" class="lf-chat-header-link" :aria-label="uiText('Apri messaggi Coach-Atleta')" title="Messaggi"><LionIcon name="messages" :size="24"/><span v-if="chatUnreadCount>0" class="lf-chat-unread">{{chatUnreadCount>99?'99+':chatUnreadCount}}</span></RouterLink><InboxBell v-if="inboxInHeader&&inboxVisibleOnRoute&&coachInboxEnabled()&&stagingSession" :key="stagingSession.uid+':'+stagingSession.gymId" :session="stagingSession"/><RouterLink v-if="shownRole==='atleta'" :to="athleteDevShell?'/profilo?source=emulator':'/profilo'" class="header-avatar" :aria-label="uiText('Apri il profilo')"><img v-if="isStagingMode() && currentAvatar" :src="currentAvatar" :alt="uiText('Foto profilo')"/><img v-else-if="!isStagingMode() && !athleteDevShell && demoProfiles.atleta.photo" :src="demoProfiles.atleta.photo" alt="" /><span v-else>🦁</span></RouterLink></div></header>

    <!-- Navigazione Atleta esclusiva: sidebar a sinistra su desktop, dock inferiore su mobile. -->
    <main ref="swipeStage" v-lf-swipe-rails class="main-layout" :class="[shownRole==='coach'?'coach-container':'athlete-container', {'booking-in-shell':isBooking,'lf-chat-stage':!!chatMotion,'lf-swipe-surface':swipeSurfaceEnabled}]" v-on="swipeInputEvents" @click.capture="chatClickCapture" @contextmenu.capture="chatTouchCancel"><RouterLink v-if="chatPreviewEnabled && shownRole==='coach' && !coachHeaderVisible" :to="chatRoute" class="lf-chat-coach-top" :class="{'lf-chat-coach-with-bell':route.path==='/coach'&&coachInboxEnabled()}" aria-label="Apri Messaggi Coach–Atleta" title="Apri Messaggi"><LionIcon name="messages" :size="23"/><span>Messaggi</span><span v-if="chatUnreadCount>0" class="lf-chat-unread">{{chatUnreadCount>99?'99+':chatUnreadCount}}</span></RouterLink><button v-if="route.path!=='/home' && route.path!=='/coach' && (shownRole!=='coach' || coachHeaderVisible)" type="button" class="lf-route-back" :class="{'lf-r8-route-back':workoutRoute}" :aria-label="uiText('Torna indietro')" @click="requestBackFromUi"><LionIcon name="back" :size="17"/> </button><template v-if="coachInboxEnabled()&&stagingSession"><InboxBell v-if="!inboxInHeader&&inboxVisibleOnRoute" :key="stagingSession.uid+':'+stagingSession.gymId" :session="stagingSession"/><PushWelcome :key="stagingSession.uid" :uid="stagingSession.uid" :open-agenda="openPushAgenda" :open-support="openPushSupport"/></template><p v-if="linkedNotice" class="notice" role="alert">{{linkedNotice}} <button type="button" class="bare" @click="linkedNotice=''">Chiudi</button></p><aside v-if="chatPreviewEnabled && shownRole==='atleta' && route.path==='/home' && showChatHint" class="lf-chat-discovery" role="status"><LionIcon name="messages" :size="19"/><span>I messaggi sono a sinistra: scorri verso destra oppure tocca l'icona.</span><button type="button" aria-label="Chiudi suggerimento messaggi" @click="chatHintClose">×</button></aside><RouterView v-slot="{ Component }"><Transition :name="chatMotion" @before-enter="beforeChatEnter" @after-enter="finishChatMotion" @enter-cancelled="cancelChatEnter" @before-leave="beforeChatLeave" @after-leave="finishSectionLeave" @leave-cancelled="finishSectionLeave"><component :is="Component" :ref="setSwipeRouteRoot"/></Transition></RouterView><CheckUploadNotice v-if="shownRole==='atleta'&&stagingSession?.role==='atleta'" :session="stagingSession"/></main>
    <!-- La navbar Atleta vive fuori dal contenitore .app: nessun CSS / overflow legacy può coprirla. -->
    <AthleteBottomNavigation v-if="shownRole==='atleta'" :items="mobileNav" :theme="lab.theme"/>
    <nav v-if="shownRole==='coach'" class="bottom-nav coach-bottom" :aria-label="uiText('Navigazione Coach')"><RouterLink v-for="item in mobileNav" :key="item.to" :to="item.to"><LionIcon :name="item.icon" :size="24"/><span>{{uiText(item.label)}}</span></RouterLink></nav>
  </template>

  <template v-else><header class="login-header login-modern-header"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div class="login-brand-title"><strong>LION <b>FIT</b></strong><small>{{uiText("AREA ACCESSO")}}</small></div></header><main class="login-main"><RouterView/></main></template>
 </div>
</template>

<style scoped>
.lf21-nav-recovery{position:fixed;inset:auto 12px max(82px,calc(76px + env(safe-area-inset-bottom,0px))) 12px;z-index:11000;max-width:460px;margin:auto;padding:14px;background:#17212e;color:#f2f6fb;border:1px solid #587067;border-radius:13px;box-shadow:0 8px 30px #0006}.lf21-nav-recovery p{margin:6px 0 10px;color:#c4d2dc;font-size:14px}.lf21-nav-recovery button{min-height:42px;border:1px solid #587067;border-radius:9px;color:#fff;background:#16854f;padding:8px 14px;margin-right:6px}.lf21-nav-recovery button+button{background:#263641}
</style>

<style>
.app.lf-support-shell{display:flex!important;flex-direction:column;width:100%;height:100vh;height:100dvh;min-height:0!important;padding:0!important;margin:0!important;overflow:hidden}
/* R8: a single back control in normal flow when the technical version label is absent. */
.app .main-layout > .lf-route-back{position:static!important;display:inline-flex!important;align-self:flex-start;justify-content:center;min-width:44px;min-height:44px;margin:0 0 6px;padding:6px;border-radius:10px;box-shadow:none!important}
/* PATCH 30 R2.3: the Coach inbox lives only in Dashboard; the header does
   not reserve a separate row. Athletes and Coach mobile keep their original shell. */
@media (min-width:901px) {
 .app.as-coach .main-layout.booking-in-shell{position:relative;width:calc(100% - 256px);margin-left:256px;max-width:none;padding-top:16px!important}
 .app.as-coach .main-layout.coach-container{position:relative}
 .app.as-coach .main-layout.coach-container > .lf17-bell-wrap{
  position:absolute;top:15px;right:clamp(12px,1.65vw,27px);z-index:6;
  width:44px;height:44px;margin:0;
 }
 .app.as-coach .main-layout.coach-container > .lf17-bell-wrap .lf17-bell{width:44px;height:44px}
 .app.as-coach .lf-coach-dashboard .lf-coach-greeting{padding-right:54px;min-height:44px}
}
/* Single archive heading: title, counts, and primary action share one panel. */
.app.as-coach .lf30-archive-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.app.as-coach .lf30-archive-title{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.app.as-coach .lf30-archive-title .card-heading{margin:0}
.app.as-coach .lf30-archive-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.app.as-coach .lf30-archive-actions .primary{max-width:100%;white-space:normal;text-align:center}
.app.as-coach .lf30-archive-context{display:inline-block;margin-top:8px;font-size:12px}
@media(max-width:650px){.app.as-coach .lf30-archive-head{align-items:stretch}.app.as-coach .lf30-archive-actions{width:100%}.app.as-coach .lf30-archive-actions .primary{flex:1 1 190px}}
/* PATCH 21 R3: four action buttons must remain one row, including the unread badge. */
@media(max-width:799px){
 .app.as-athlete > .mobile-topbar{padding-inline:clamp(8px,2.5vw,16px)!important;gap:6px;overflow:visible}
 .app.as-athlete > .mobile-topbar .brand{flex:1 1 auto;min-width:0;gap:6px}
 .app.as-athlete > .mobile-topbar .brand img{width:32px;height:32px;flex:none}
 .app.as-athlete > .mobile-topbar .brand>div{min-width:0}
 .app.as-athlete > .mobile-topbar .brand-name{font-size:clamp(14px,4vw,21px);white-space:nowrap}
 .app.as-athlete > .mobile-topbar .brand-subtitle{font-size:clamp(8px,2.2vw,11px);white-space:nowrap;letter-spacing:.03em}
 .app.as-athlete > .mobile-topbar .top-actions{display:flex;flex:0 0 auto;flex-wrap:nowrap;align-items:center;gap:5px;overflow:visible}
 .app.as-athlete > .mobile-topbar .top-actions :is(.theme-square,.header-avatar){width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px;padding:0;box-sizing:border-box}
 .app.as-athlete > .mobile-topbar .top-actions .lf17-bell-wrap{flex:0 0 auto;position:relative;overflow:visible}
 .app.as-athlete > .mobile-topbar .top-actions .lf17-bell{pointer-events:auto;touch-action:manipulation}
 .app.as-athlete > .mobile-topbar .top-actions .lf17-badge{pointer-events:none}
}
@media(max-width:359px){
 .app.as-athlete > .mobile-topbar .top-actions{gap:4px}
 .app.as-athlete > .mobile-topbar .top-actions :is(.theme-square,.header-avatar){width:40px;height:40px;min-width:40px;min-height:40px;flex-basis:40px}
 .app.as-athlete > .mobile-topbar .brand img{width:28px;height:28px}
}
</style>

<style scoped>
/* R22B.4: premium Chat icon + swipe motion; athlete/coach docks remain unchanged. */
.lf-chat-header-link{position:relative;display:inline-grid;place-items:center;width:43px;height:43px;flex:none;border-radius:14px;border:1px solid rgba(88,238,155,.44);background:linear-gradient(145deg,#1d7050 0%,#113c30 55%,#132b2d 100%);color:#b7ffdc;text-decoration:none;box-shadow:inset 0 1px rgba(255,255,255,.15),0 4px 14px rgba(0,0,0,.22)}
.lf-chat-header-link svg{filter:drop-shadow(0 1px 3px rgba(74,234,138,.25))}
.lf-chat-header-link:hover{border-color:#91ffc1;background:linear-gradient(145deg,#23865d,#144435);transform:translateY(-1px)}
.lf-chat-header-link:focus-visible,.lf-chat-desktop-shortcut:focus-visible,.lf-chat-coach-top:focus-visible{outline:2px solid var(--mint,#3bcb83);outline-offset:2px}
.lf-chat-unread{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:999px;background:#c53546;color:#fff;font-size:10px;font-weight:900;display:grid;place-items:center;box-shadow:0 0 0 2px var(--nav,#101820)}
.lf-chat-header-link.router-link-active{background:linear-gradient(145deg,#248559,#124a39);border-color:#8cf8b6}
.lf-chat-discovery{display:flex;align-items:center;gap:9px;max-width:880px;margin:0 auto 12px;padding:10px 12px;border:1px solid rgba(51,170,100,.27);border-radius:12px;background:var(--card2,rgba(22,60,41,.9));color:var(--text,#e3f5e9);font-size:12px;line-height:1.4}
.lf-chat-discovery svg{flex:none;color:var(--mint,#42cb80)}
.lf-chat-discovery span{flex:1}
.lf-chat-discovery button{border:0;background:transparent;color:inherit;font-size:22px;min-width:32px;min-height:32px;line-height:1;cursor:pointer}
.lf-chat-desktop-shortcut{position:fixed;top:18px;right:18px;display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(88,238,155,.43);border-radius:14px;padding:10px 15px;background:linear-gradient(145deg,#1b6149,#112e2b);color:#e4ffef;text-decoration:none;font-size:13px;font-weight:800;z-index:10;box-shadow:0 6px 18px #0004}
.lf-chat-desktop-shortcut svg{color:#b7ffdc}
/* Desktop Coach: no Messages link in sidebar footer. One floating top-right action. */
.lf-chat-coach-top{position:absolute;top:16px;right:24px;z-index:8;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:8px 15px;border:1px solid rgba(87,234,149,.46);border-radius:14px;background:linear-gradient(145deg,#1c7251,#113d34 65%,#132d30);color:#e8fff1;text-decoration:none;font-size:13px;font-weight:850;letter-spacing:.01em;box-shadow:inset 0 1px #ffffff1d,0 7px 20px #0004}
.lf-chat-coach-top svg{color:#baffd8}
.lf-chat-coach-top:hover{transform:translateY(-1px);border-color:#a3ffd0;box-shadow:0 9px 22px #0005}
.lf-chat-coach-top.router-link-active{border-color:#a3ffd0;background:linear-gradient(145deg,#24875b,#11503c)}
.lf-chat-coach-top.lf-chat-coach-with-bell{right:86px}
.lf-chat-coach-top .lf-chat-unread,.lf-chat-desktop-shortcut .lf-chat-unread{top:-6px;right:-7px}
/* Chat lies to the LEFT of Home: opening moves the Home right; returning reverses. */
.main-layout.lf-chat-stage{position:relative;overflow-x:clip}
@media(prefers-reduced-motion:no-preference){
 .lf-chat-open-enter-active,.lf-chat-open-leave-active,.lf-chat-close-enter-active,.lf-chat-close-leave-active{transition:transform 340ms cubic-bezier(.22,1,.36,1);will-change:transform;transition-duration:var(--lf-swipe-commit-duration,340ms)}
 .lf-chat-open-leave-from,.lf-chat-close-leave-from{transform:translate3d(var(--lf-swipe-commit-offset,0px),0,0)}
 .lf-chat-open-enter-from,.lf-chat-close-leave-to{transform:translate3d(calc(-1 * var(--lf-motion-span,100%)),0,0)}
 .lf-chat-open-leave-to,.lf-chat-close-enter-from{transform:translate3d(var(--lf-motion-span,100%),0,0)}
 .lf-chat-open-enter-from{transform:translate3d(calc(-1 * var(--lf-motion-span,100%) + var(--lf-swipe-commit-offset,0px)),0,0)}
 .lf-chat-close-enter-from{transform:translate3d(calc(var(--lf-motion-span,100%) + var(--lf-swipe-commit-offset,0px)),0,0)}
 .lf-chat-open-leave-active,.lf-chat-close-leave-active{position:absolute;top:var(--lf-leave-top,0px);left:var(--lf-leave-left,0px);width:var(--lf-leave-width,100%);pointer-events:none}
}
/* R22B.6E.1 — declare native vertical scroll and pinch before touchstart.
   Native horizontal scrollports stop touch-action ancestor intersection at their
   own scroll container; skipSectionSwipe keeps their gestures out of routing. */
@media(max-width:799px){
 .main-layout.athlete-container.lf-swipe-surface{touch-action:pan-y pinch-zoom}
}
@media(max-width:900px){
 .main-layout.coach-container.lf-swipe-surface{touch-action:pan-y pinch-zoom}
}
/* Navigate horizontally between existing mobile section tabs (no extra navbar items). */
@media(max-width:900px) and (prefers-reduced-motion:no-preference){
 .lf-section-next-enter-active,.lf-section-next-leave-active,.lf-section-prev-enter-active,.lf-section-prev-leave-active{transition:transform 340ms cubic-bezier(.22,1,.36,1);will-change:transform;transition-duration:var(--lf-swipe-commit-duration,340ms)}
 .lf-section-next-enter-from,.lf-section-prev-leave-to{transform:translate3d(var(--lf-motion-span,100%),0,0)}
 .lf-section-next-leave-to,.lf-section-prev-enter-from{transform:translate3d(calc(-1 * var(--lf-motion-span,100%)),0,0)}
 .lf-section-next-leave-from,.lf-section-prev-leave-from{transform:translate3d(var(--lf-swipe-commit-offset,0px),0,0)}
 .lf-section-next-enter-from{transform:translate3d(calc(var(--lf-motion-span,100%) + var(--lf-swipe-commit-offset,0px)),0,0)}
 .lf-section-prev-enter-from{transform:translate3d(calc(-1 * var(--lf-motion-span,100%) + var(--lf-swipe-commit-offset,0px)),0,0)}
 .lf-section-next-leave-active,.lf-section-prev-leave-active{position:absolute;top:var(--lf-leave-top,0px);left:var(--lf-leave-left,0px);width:var(--lf-leave-width,100%);pointer-events:none}
}
@media(prefers-reduced-motion:reduce){
 .lf-chat-open-enter-active,.lf-chat-open-leave-active,.lf-chat-close-enter-active,.lf-chat-close-leave-active,.lf-section-next-enter-active,.lf-section-next-leave-active,.lf-section-prev-enter-active,.lf-section-prev-leave-active{transition:none!important;animation:none!important}
}
@media(min-width:800px){.lf-chat-discovery{display:none}}
@media(max-width:799px){.lf-chat-desktop-shortcut{display:none}}
@media(max-width:380px){.app .top-actions .lf-chat-header-link{width:36px;height:36px;min-width:36px;border-radius:12px}.app .top-actions{gap:4px}}
@media(max-width:900px){.lf-chat-coach-top{display:none!important}}
</style>
