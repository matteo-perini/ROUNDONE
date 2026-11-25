import { createRouter, createWebHistory } from 'vue-router'
import {adjacentRouteLoader,canWarmRoute,type RouteLoader,type WarmupConnection} from '../features/performance/routeWarmup'
import {installNavigationTiming} from '../features/motion/navigationTiming'
import {isStagingMode,isOperationalMode} from '../integrations/firebase/stagingConfig'
import {readNavigationSession,stagingSession} from '../integrations/firebase/stagingSession'
import { useLabStore } from '../stores/lab'
import Access from '../views/Access.vue'
import {CHAT_PREVIEW_ENABLED} from '../features/chat/chatPreview'
const PlatformAdmin=()=>import('../views/PlatformAdmin.vue')
const ChatPreview=()=>import('../views/AthleteChatPreview.vue')
const LiveAthlete = () => import('../views/AthleteLiveWorkspace.vue')
const Home = () => import('../views/Home.vue')
const Program = () => import('../views/Program.vue')
const Archive = () => import('../views/Archive.vue')
const Coach = () => import('../views/Coach.vue')
const LiveCoach = () => import('../views/DevCoachDashboard.vue')
const LiveRoster = () => import('../views/LiveCoachAthletes.vue')
const LiveCoachArchive = () => import('../views/LiveCoachTemplates.vue')
const CoachAthletes = () => import('../views/CoachAthletes.vue')
const CoachProgram = () => import('../views/CoachProgram.vue')
const CoachSheets = () => import('../views/CoachSheets.vue')
// Resolve the actual authorized operational root before committing the route.
const Bookings = isOperationalMode() ? () => import('../views/LiveBookingWorkspace.vue') : () => import('../views/Bookings.vue')
const Library = () => import('../views/Library.vue')
const AthleteProgress = () => import('../views/AthleteProgress.vue')
const Profile = isOperationalMode() ? () => import('../views/DevProfileWorkspace.vue') : () => import('../views/Profile.vue')
const WelcomeInstall = () => import('../views/WelcomeInstall.vue')
const Settings = () => import('../views/Settings.vue')
const CoachTrash = () => import('../views/CoachTrash.vue')
const CoachProgress = () => import('../views/CoachProgress.vue')
const CoachStaff = () => import('../views/CoachStaff.vue')
const router=createRouter({history:createWebHistory(),routes:[
 {path:'/',redirect:'/accesso'},{path:'/accesso',component:Access,meta:{title:'Accesso'}},
 {path:'/home',component:isStagingMode()?LiveAthlete:Home,props:isStagingMode()?{screen:'home'}:false,meta:{title:'Home Atleta'}},
 {path:'/messaggi',component:ChatPreview,meta:{title:'Messaggi Atleta'}},
 {path:'/piano',component:isStagingMode()?LiveAthlete:Program,props:isStagingMode()?{screen:'plan'}:false,meta:{title:'Piano Atleta'}},
 {path:'/schede',redirect:'/piano'},
 {path:'/archivio',component:isStagingMode()?LiveAthlete:Archive,props:isStagingMode()?{screen:'archive'}:false,meta:{title:'Archivio Atleta'}},
 {path:'/staging',redirect:'/accesso'},
 {path:'/team',redirect:to=>({path:'/progressi',query:to.query})},
 {path:'/progressi',component:AthleteProgress,meta:{title:'Allenamenti Atleta'}},
 {path:'/profilo',component:Profile,meta:{title:'Profilo'}},
 {path:'/impostazioni',component:Settings,meta:{title:'Impostazioni'}},
 {path:'/installazione',component:WelcomeInstall,meta:{title:'Benvenuto e installazione'}},
 {path:'/assistenza',component:()=>import('../views/Support.vue'),meta:{title:'Assistenza'}},
 {path:'/lionfit-control',component:PlatformAdmin,meta:{title:'LionFit Control Center'}},
 {path:'/prenotazioni',component:Bookings,meta:{title:'Prenotazioni'}},
 {path:'/coach',component:isOperationalMode()?LiveCoach:Coach,meta:{title:'Dashboard Coach',coachOnly:true}},
 {path:'/coach/messaggi',component:ChatPreview,meta:{title:'Messaggi Coach',coachOnly:true}},
 {path:'/coach/atleti',component:isOperationalMode()?LiveRoster:CoachAthletes,meta:{title:'Gestione Atleti',coachOnly:true}},
 {path:'/coach/programmi',component:CoachProgram,meta:{title:'Programmazione',coachOnly:true}},
 {path:'/coach/archivio',component:isOperationalMode()?LiveCoachArchive:CoachSheets,meta:{title:'Archivio Coach',coachOnly:true}},
 {path:'/coach/schede',redirect:'/coach/archivio'},
 {path:'/coach/libreria',component:Library,meta:{title:'Libreria Esercizi',coachOnly:true}},
 {path:'/coach/cestino',component:CoachTrash,meta:{title:'Cestino',coachOnly:true}},
 {path:'/coach/progressi',component:CoachProgress,meta:{title:'Allenamenti Coach',coachOnly:true}},
 {path:'/coach/work',component:()=>import('../views/WorkReport.vue'),meta:{title:'Report lavorativi',coachOnly:true}},
 {path:'/coach/staff',component:CoachStaff,meta:{title:'Inviti e Team',coachOnly:true}},
 {path:'/coach/profilo',component:Profile,meta:{title:'Profilo Coach',coachOnly:true}},
 {path:'/coach/prenotazioni',component:Bookings,meta:{title:'Calendario Appuntamenti',coachOnly:true}},
 ...(import.meta.env.DEV ? [{path:'/classica',component:()=>import('../views/Classic.vue'),meta:{title:'Sorgente Originale'}}] : []),
 ...(import.meta.env.DEV ? [{path:'/dev/emulatore',component:()=>import('../views/DevFirebase.vue'),meta:{title:'Diagnostica Emulatore'}}] : []),
 ...(import.meta.env.DEV ? [{path:'/dev/test-schede-identiche',component:()=>import('../views/DevSemanticDedup.vue'),meta:{title:'Test schede identiche'}}] : []),
 ...(import.meta.env.DEV ? [{path:'/dev/ruoli',component:()=>import('../views/DevFirebaseRoles.vue'),meta:{title:'Test ruoli Emulator'}}] : []),
 ...(import.meta.env.DEV ? [
  {path:'/dev/accesso',component:()=>import('../views/DevRoleAccess.vue'),meta:{title:'Accesso test Emulator'}},
  {path:'/dev/pannello/coach',component:()=>import('../views/DevRolePanel.vue'),meta:{title:'Pannello Coach Emulator',devScreen:'coach'}},
  {path:'/dev/pannello/atleta',component:()=>import('../views/DevRolePanel.vue'),meta:{title:'Pannello Atleta Emulator',devScreen:'atleta'}},
  {path:'/dev/schede-live',component:()=>import('../views/DevLiveSheets.vue'),meta:{title:'Schede live Emulator',devScreen:'schede'}},
  {path:'/dev/atleti-live',component:()=>import('../views/DevCoachAthletes.vue'),meta:{title:'Gestione atleti Coach Emulator',devScreen:'coachAthletes'}},
  {path:'/dev/schede-scritture',component:()=>import('../views/DevWriteSheets.vue'),meta:{title:'Collega e scollega Emulator',devScreen:'schedeWrite'}},
 ] : []),
 {path:'/:pathMatch(.*)*',redirect:'/accesso'}
]})
installNavigationTiming(router)
router.beforeEach(async to=>{
 // R22A: no public chat entry until messaging and restrictive rules are deployed.
 if(!CHAT_PREVIEW_ENABLED && ['/messaggi','/coach/messaggi'].includes(to.path)) return '/accesso'
 // La build Android normale non deve mai usare lo store fittizio.
 if(import.meta.env.PROD || isStagingMode()){
  if(!isStagingMode())return to.path==='/accesso'?true:'/accesso'
  const {isCurrentControlAccount,verifyPlatformAccess}=await import('../integrations/firebase/platformAccess')
  if(await isCurrentControlAccount()){
   stagingSession.value=null
   const allowed=await verifyPlatformAccess()
   if(allowed)return to.path==='/lionfit-control'?true:to.query.open==='support'?'/lionfit-control?open=support':'/lionfit-control'
   return to.path==='/accesso'?true:'/accesso'
  }
  if(to.path==='/accesso'){
   try{
    const s=await readNavigationSession()
    if(to.query.open==='support' && isOperationalMode())return '/impostazioni?inboxSupport=1'
    if(to.query.open==='competition'&&isOperationalMode()&&typeof to.query.eventId==='string'&&/^[A-Za-z0-9]{20}$/.test(to.query.eventId))return (s.role==='atleta'?'/prenotazioni':'/coach/prenotazioni')+'?competitionId='+encodeURIComponent(to.query.eventId)
    if(to.query.open==='bookings' && isOperationalMode())return s.role==='atleta'?'/prenotazioni':'/coach/prenotazioni'
    return s.role==='atleta'?'/home':'/coach'
   }catch{stagingSession.value=null;return true}
  }
  let s
  try{s=await readNavigationSession()}
  catch{stagingSession.value=null;return '/accesso'}
  if(to.path==='/lionfit-control'){return await verifyPlatformAccess()?true:'/impostazioni'}
  const athletes=['/home',...(CHAT_PREVIEW_ENABLED?['/messaggi']:[]),'/piano','/archivio','/progressi','/profilo']
  const coaches=['/coach',...(CHAT_PREVIEW_ENABLED?['/coach/messaggi']:[]),'/coach/profilo']
  if(isOperationalMode()) {
   if(to.path==='/impostazioni'&&to.query.inboxSupport==='1')return {path:'/assistenza',replace:true}
   const liveAthletes=[...athletes,'/prenotazioni','/impostazioni','/installazione','/assistenza']
   const liveCoaches=[...coaches,'/impostazioni','/installazione','/assistenza','/coach/atleti','/coach/programmi','/coach/archivio','/coach/libreria','/coach/cestino','/coach/progressi','/coach/staff','/coach/prenotazioni','/coach/work']
   return (s.role==='atleta'?liveAthletes:liveCoaches).includes(to.path)?true:(s.role==='atleta'?'/home':'/coach')
  }
  if(s.role==='atleta')return (to.path==='/installazione'||athletes.includes(to.path))?true:'/home'
  return (to.path==='/installazione'||coaches.includes(to.path))?true:'/coach'
 }

 if(to.path==='/lionfit-control'||to.path==='/assistenza')return '/accesso'
 // Il diagnostico DEV non richiede il login demo. Non e' mai registrato in build produzione.
 if (import.meta.env.DEV && to.path === '/dev/emulatore') return true
 if (import.meta.env.DEV && to.path === '/dev/ruoli') return true
 if (import.meta.env.DEV && to.path === '/dev/test-schede-identiche') return true
 if (import.meta.env.DEV && to.path === '/dev/accesso') return true
 // 2M/L: Prenotazioni nella shell originale, dati fittizi e autentica identita' Firebase.
 if (import.meta.env.DEV && ['/prenotazioni','/coach/prenotazioni'].includes(to.path) && to.query.source === 'emulator') {
  try {
   const {readVerifiedDevSession}=await import('../integrations/firebase/devSession')
   const verified=await readVerifiedDevSession()
   if(verified.gymId!=='gym_lab2c_a'||!verified.uid)return '/dev/accesso'
   const expected=to.path==='/coach/prenotazioni' ? verified.role!=='atleta' : verified.role==='atleta'
   return expected?true:'/dev/accesso'
  }catch{return '/dev/accesso'}
 }
 // Le impostazioni possono essere aperte anche dal Coach emulator autenticato.
 if(import.meta.env.DEV && to.path === '/impostazioni' && to.query.source === 'emulator'){
  try{const {readVerifiedDevSession}=await import('../integrations/firebase/devSession');const s=await readVerifiedDevSession();
   return /^gym_lab2c_[ab]$/.test(s.gymId) && !!s.uid ? true : '/dev/accesso'
  }catch{return '/dev/accesso'}
 }
 // 2M/K: Home/Piano/Archivio Atleta nella shell originale, esclusivamente emulator.
 // Il parametro non autorizza nessuna lettura; la pagina verifica anche users/{uid}.
 if (import.meta.env.DEV && (['/home','/messaggi','/piano','/archivio'].includes(to.path) || ['/progressi','/profilo','/impostazioni'].includes(to.path)) && to.query.source === 'emulator') {
  try {
   const {readVerifiedDevSession}=await import('../integrations/firebase/devSession')
   const verified=await readVerifiedDevSession()
   return (verified.role==='atleta' && verified.gymId==='gym_lab2c_a' && !!verified.uid)
    ? true : '/dev/accesso'
  }catch{return '/dev/accesso'}
 }
 // 2M/C: la UI Coach originale puo' mostrare le fixture dell'emulatore in DEV.
 // Nessun parametro URL concede autorizzazioni: serve la sessione Firebase verificata.
 if (import.meta.env.DEV && ((to.path === '/coach/atleti' && to.query.source === 'emulator') || (to.path === '/coach/archivio' && to.query.source === 'emulator') || (to.path === '/coach/progressi' && to.query.source === 'emulator') || (['/coach','/coach/messaggi','/coach/profilo'].includes(to.path) && to.query.source === 'emulator'))) {
  try {
   const { readVerifiedDevSession } = await import('../integrations/firebase/devSession')
   const verified = await readVerifiedDevSession()
   return (/^gym_lab2c_[ab]$/.test(verified.gymId) &&
     (verified.role === 'titolare' || verified.role === 'collaboratore'))
       ? true : '/dev/accesso'
  } catch { return '/dev/accesso' }
 }
 const devScreen=to.meta.devScreen
 if (import.meta.env.DEV && (devScreen === 'coach' || devScreen === 'atleta' || devScreen === 'schede' || devScreen === 'schedeWrite' || devScreen === 'coachAthletes')) {
  try {
   const [{readVerifiedDevSession},{mayOpenDevScreen}] = await Promise.all([import('../integrations/firebase/devSession'),import('../integrations/firebase/devRoutePolicy')])
   const user = await readVerifiedDevSession()
   return devScreen === 'schedeWrite' ? ((user.gymId === 'gym_lab2c_a' && (user.role === 'titolare' || user.role === 'collaboratore')) ? true : '/dev/accesso') : devScreen === 'coachAthletes' ? ((/^gym_lab2c_[ab]$/.test(user.gymId) && mayOpenDevScreen(user.role, 'coach')) ? true : '/dev/accesso') : (devScreen === 'schede' || mayOpenDevScreen(user.role,devScreen)) ? true : '/dev/accesso'
  } catch { return '/dev/accesso' }
 }
 const store=useLabStore();if(to.path!=='/accesso'&&!store.role)return '/accesso';if(to.meta.coachOnly&&store.role!=='coach')return '/home';if(to.path==='/accesso'&&store.role)return store.role==='coach'?'/coach':'/home';return true})
router.afterEach(to=>{document.title=`Lion Fit · ${String(to.meta.title??'V1')}`})
// R22B.6C.2: opportunistic, one code chunk at a time, only after a successful
// operational navigation. Never prefetch Firestore data or bypass route guards.
const warmAthleteOrder=['/home','/piano','/archivio','/progressi','/prenotazioni','/profilo']
const warmCoachOrder=['/coach','/coach/atleti','/coach/archivio','/coach/prenotazioni','/coach/progressi','/coach/profilo']
const warmLoaders:Record<string,RouteLoader>={
 '/home':LiveAthlete,'/piano':LiveAthlete,'/archivio':LiveAthlete,
 '/progressi':AthleteProgress,'/prenotazioni':Bookings,'/profilo':Profile,
 '/coach':LiveCoach,'/coach/atleti':LiveRoster,'/coach/archivio':LiveCoachArchive,
 '/coach/prenotazioni':Bookings,'/coach/progressi':CoachProgress,'/coach/profilo':Profile
}
const warmLoaded=new Set<RouteLoader>()
let warmTimer:ReturnType<typeof setTimeout>|null=null,warmIdle:number|null=null,warmBusy=false
function cancelRouteWarmup(){
 if(warmTimer!==null){clearTimeout(warmTimer);warmTimer=null}
 if(warmIdle!==null){window.cancelIdleCallback?.(warmIdle);warmIdle=null}
}
router.beforeEach(()=>{cancelRouteWarmup()})
router.afterEach((to,_from,failure)=>{
 if(failure||!isOperationalMode()||!stagingSession.value||typeof window==='undefined')return
 const session=stagingSession.value
 const order=session.role==='atleta'?warmAthleteOrder:warmCoachOrder
 if(!order.includes(to.path))return
 const current=warmLoaders[to.path];if(current)warmLoaded.add(current)
 const permitted=()=>router.currentRoute.value.path===to.path&&stagingSession.value?.uid===session.uid&&stagingSession.value?.gymId===session.gymId&&stagingSession.value?.role===session.role&&canWarmRoute(!document.hidden,navigator.onLine,(navigator as Navigator&{connection?:WarmupConnection}).connection)
 if(!permitted()||warmBusy)return
 const run=()=>{
  warmIdle=null
  if(!permitted()||warmBusy)return
  const loader=adjacentRouteLoader(to.path,order,warmLoaders,warmLoaded)
  if(!loader)return
  warmBusy=true
  void loader().then(()=>warmLoaded.add(loader)).catch(()=>{/* Normal navigation can retry. */}).finally(()=>{warmBusy=false})
 }
 warmTimer=setTimeout(()=>{
  warmTimer=null
  if(!permitted()||warmBusy)return
  if(typeof window.requestIdleCallback==='function')warmIdle=window.requestIdleCallback(run)
  else run() // delayed fallback for WebViews without idle callbacks
 },1500)
})
export default router
