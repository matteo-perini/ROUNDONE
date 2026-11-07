import { createRouter, createWebHistory } from 'vue-router'
import {isStagingMode,isOperationalMode} from '../integrations/firebase/stagingConfig'
import {readStagingSession,stagingSession} from '../integrations/firebase/stagingSession'
import { useLabStore } from '../stores/lab'
import Access from '../views/Access.vue'
const Home = () => import('../views/Home.vue')
const Program = () => import('../views/Program.vue')
const Archive = () => import('../views/Archive.vue')
const Coach = () => import('../views/Coach.vue')
const CoachAthletes = () => import('../views/CoachAthletes.vue')
const CoachProgram = () => import('../views/CoachProgram.vue')
const CoachSheets = () => import('../views/CoachSheets.vue')
const Bookings = () => import('../views/Bookings.vue')
const Library = () => import('../views/Library.vue')
const Team = () => import('../views/Team.vue')
const Profile = () => import('../views/Profile.vue')
const Settings = () => import('../views/Settings.vue')
const CoachTrash = () => import('../views/CoachTrash.vue')
const CoachStaff = () => import('../views/CoachStaff.vue')
const router=createRouter({history:createWebHistory(),routes:[
 {path:'/',redirect:'/accesso'},{path:'/accesso',component:Access,meta:{title:'Accesso'}},
 {path:'/home',component:Home,meta:{title:'Home Atleta'}},
 {path:'/piano',component:Program,meta:{title:'Piano Atleta'}},
 {path:'/schede',redirect:'/piano'},
 {path:'/archivio',component:Archive,meta:{title:'Archivio Atleta'}},
 {path:'/staging',redirect:'/accesso'},
 {path:'/team',component:Team,meta:{title:'Team'}},
 {path:'/profilo',component:Profile,meta:{title:'Profilo'}},
 {path:'/impostazioni',component:Settings,meta:{title:'Impostazioni'}},
 {path:'/prenotazioni',component:Bookings,meta:{title:'Prenotazioni'}},
 {path:'/coach',component:Coach,meta:{title:'Dashboard Coach',coachOnly:true}},
 {path:'/coach/atleti',component:CoachAthletes,meta:{title:'Gestione Atleti',coachOnly:true}},
 {path:'/coach/programmi',component:CoachProgram,meta:{title:'Programmazione',coachOnly:true}},
 {path:'/coach/archivio',component:CoachSheets,meta:{title:'Archivio Coach',coachOnly:true}},
 {path:'/coach/schede',redirect:'/coach/archivio'},
 {path:'/coach/libreria',component:Library,meta:{title:'Libreria Esercizi',coachOnly:true}},
 {path:'/coach/cestino',component:CoachTrash,meta:{title:'Cestino',coachOnly:true}},
 {path:'/coach/staff',component:CoachStaff,meta:{title:'Coach e Inviti',coachOnly:true}},
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
router.beforeEach(async to=>{
 // La build Android normale non deve mai usare lo store fittizio.
 if(import.meta.env.PROD){
  if(!isStagingMode())return to.path==='/accesso'?true:'/accesso'
  if(to.path==='/accesso'){
   try{
    const s=await readStagingSession()
    if(to.query.open==='bookings' && isOperationalMode())return s.role==='atleta'?'/prenotazioni':'/coach/prenotazioni'
    return s.role==='atleta'?'/home':'/coach'
   }catch{stagingSession.value=null;return true}
  }
  let s
  try{s=await readStagingSession()}
  catch{stagingSession.value=null;return '/accesso'}
  const athletes=['/home','/piano','/archivio','/team','/profilo']
  const coaches=['/coach','/coach/profilo']
  if(isOperationalMode()) {
   const liveAthletes=[...athletes,'/prenotazioni','/impostazioni']
   const liveCoaches=[...coaches,'/impostazioni','/coach/atleti','/coach/programmi','/coach/archivio','/coach/libreria','/coach/cestino','/coach/staff','/coach/prenotazioni']
   return (s.role==='atleta'?liveAthletes:liveCoaches).includes(to.path)?true:(s.role==='atleta'?'/home':'/coach')
  }
  if(s.role==='atleta')return athletes.includes(to.path)?true:'/home'
  return coaches.includes(to.path)?true:'/coach'
 }

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
 if (import.meta.env.DEV && (['/home','/piano','/archivio'].includes(to.path) || ['/team','/profilo','/impostazioni'].includes(to.path)) && to.query.source === 'emulator') {
  try {
   const {readVerifiedDevSession}=await import('../integrations/firebase/devSession')
   const verified=await readVerifiedDevSession()
   return (verified.role==='atleta' && verified.gymId==='gym_lab2c_a' && !!verified.uid)
    ? true : '/dev/accesso'
  }catch{return '/dev/accesso'}
 }
 // 2M/C: la UI Coach originale puo' mostrare le fixture dell'emulatore in DEV.
 // Nessun parametro URL concede autorizzazioni: serve la sessione Firebase verificata.
 if (import.meta.env.DEV && ((to.path === '/coach/atleti' && to.query.source === 'emulator') || (to.path === '/coach/archivio' && to.query.source === 'emulator') || (['/coach','/coach/profilo'].includes(to.path) && to.query.source === 'emulator'))) {
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
export default router
