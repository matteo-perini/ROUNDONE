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
import {coachInboxEnabled} from './integrations/firebase/coachInbox'
import AthleteBottomNavigation from './components/AthleteBottomNavigation.vue'
import AthleteDesktopSidebar from './components/AthleteDesktopSidebar.vue'
import {isLiveMode,isStagingMode,isLocalProdDev} from './integrations/firebase/stagingConfig'
import {stagingSession,signOutStaging} from './integrations/firebase/stagingSession'
import {connectPushSession,pushNotice} from './integrations/firebase/pushNotifications'
import {demoProfiles} from './features/profile/localProfile'
import {uiText} from './features/i18n/interfaceLanguage'
// Chunk di avviso STAGING caricato solo in `vite build --mode staging`, mai in LIVE.
const StagingBanner=import.meta.env.MODE==='staging' ? defineAsyncComponent(()=>import('./components/StagingBanner.vue')) : null
const lab=useLabStore();const route=useRoute();const router=useRouter()
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
const coachEmulatorPreview = computed(() => import.meta.env.DEV && (['/coach','/coach/atleti','/coach/archivio','/coach/progressi','/coach/profilo'].includes(route.path) || (route.path === '/impostazioni' && verifiedSettingsRole.value === 'coach')) && route.query.source === 'emulator')
const athleteEmulatorPreview = computed(() => import.meta.env.DEV && (['/home','/piano','/archivio','/progressi','/profilo'].includes(route.path) || (route.path === '/impostazioni' && verifiedSettingsRole.value === 'atleta')) && route.query.source === 'emulator')
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
const coachNav=[{to:'/coach',label:'HOME',desk:'DASHBOARD',icon:'home'},{to:'/coach/atleti',label:'ATLETI',desk:'GESTIONE ATLETI',icon:'users'},{to:'/coach/libreria',label:'ESERCIZI',desk:'LIBRERIA ESERCIZI',icon:'clipboard'},{to:'/coach/archivio',label:'ARCHIVIO',desk:'ARCHIVIO SCHEDE',icon:'book'},{to:'/coach/profilo',label:'PROFILO',desk:'PROFILO & PALESTRA',icon:'settings'}]
type SideNavItem = {to:string;label:string;icon:string;desk?:string}
const sideNav:SideNavItem[]=[coachNav[0],coachNav[1],coachNav[3],coachNav[2],{to:'/coach/prenotazioni',label:'AGENDA',icon:'calendar'},{to:'/coach/cestino',label:'CESTINO',icon:'bin'},{to:'/coach/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/coach/staff',label:'INVITI E TEAM',icon:'users'},coachNav[4]]
const athleteEmulatorNav=[{to:'/home?source=emulator',label:'HOME',icon:'home'},{to:'/piano?source=emulator',label:'PIANO',icon:'calendar'},{to:'/archivio?source=emulator',label:'ARCHIVIO',icon:'archive'},{to:'/progressi?source=emulator',label:'ALLENAMENTI',icon:'progress'},{to:'/prenotazioni?source=emulator',label:'AGENDA',icon:'calendar-plus'},{to:'/profilo?source=emulator',label:'PROFILO',icon:'user'}]
const coachEmulatorNav=[{to:'/coach?source=emulator',label:'HOME',icon:'home'},{to:'/coach/atleti?source=emulator',label:'ATLETI',icon:'users'},{to:'/coach/archivio?source=emulator',label:'ARCHIVIO',icon:'book'},{to:'/coach/prenotazioni?source=emulator',label:'AGENDA',icon:'calendar'},{to:'/coach/progressi?source=emulator',label:'ALLENAMENTI',icon:'progress'},{to:'/coach/profilo?source=emulator',label:'PROFILO',icon:'user'}]
const stagingAthleteNav=[{to:'/home',label:'HOME',icon:'home'},{to:'/piano',label:'PIANO',icon:'calendar'},{to:'/archivio',label:'ARCHIVIO',icon:'archive'},{to:'/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/prenotazioni',label:'AGENDA',icon:'calendar-plus'},{to:'/profilo',label:'PROFILO',icon:'user'}]
const stagingCoachNav=[{to:'/coach',label:'HOME',icon:'home'},{to:'/coach/atleti',label:'ATLETI',icon:'users'},{to:'/coach/archivio',label:'ARCHIVIO',icon:'book'},{to:'/coach/prenotazioni',label:'AGENDA',icon:'calendar'},{to:'/coach/progressi',label:'ALLENAMENTI',icon:'progress'},{to:'/coach/profilo',label:'PROFILO',icon:'user'}]
const mobileNav=computed(()=>isStagingMode()?(shownRole.value==='coach'?stagingCoachNav:stagingAthleteNav):coachDevShell.value?coachEmulatorNav:athleteDevShell.value?athleteEmulatorNav:shownRole.value==='coach'?coachNav:athleteNav)
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
  <template v-else-if="shownRole">
    <AthleteDesktopSidebar v-if="shownRole==='atleta'" :items="mobileNav" :expanded="athleteSidebarExpanded" @toggle="toggleAthleteSidebar" @logout="goOut"/>
    <aside v-if="shownRole==='coach'" class="desktop-sidebar">
      <div class="sidebar-head"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div><strong>LION <em>FIT</em></strong><small>{{uiText("AREA COACH / ADMIN")}}</small></div></div>
      <nav class="sidebar-nav">
        <template v-if="isStagingMode()"><RouterLink v-for="item in sideNav" :key="item.to" :to="item.to" :class="{'staff-nav-item':item.to==='/coach/staff'}"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.desk||item.label)}}</span></RouterLink></template>
        <RouterLink v-if="coachDevShell" to="/coach?source=emulator"><LionIcon name="home" :size="17"/><span>DASHBOARD · FIREBASE</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/atleti?source=emulator"><LionIcon name="users" :size="17"/><span>{{uiText("GESTIONE ATLETI · FIREBASE")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/archivio?source=emulator"><LionIcon name="book" :size="17"/><span>{{uiText("ARCHIVIO COACH · FIREBASE")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/prenotazioni?source=emulator"><LionIcon name="calendar" :size="17"/><span>{{uiText("CALENDARIO APPUNTAMENTI · FIREBASE")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/progressi?source=emulator"><LionIcon name="progress" :size="17"/><span>{{uiText("ALLENAMENTI")}}</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/profilo?source=emulator"><LionIcon name="user" :size="17"/><span>{{uiText("PROFILO · FIREBASE")}}</span></RouterLink>
        <template v-else-if="!isStagingMode()"><RouterLink v-for="item in sideNav" :key="item.to" :to="item.to" :class="{'staff-nav-item':item.to==='/coach/staff'}"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.desk||item.label)}}</span></RouterLink></template>
      </nav>
      <div class="sidebar-foot"><QuickProfileSwitch/><button class="ghost wide" @click="goOut">{{uiText(isStagingMode()?'Esci da Lion Fit':coachEmulatorPreview ? 'Esci dal laboratorio' : 'Esci')}}</button><RouterLink v-if="shownRole==='coach' && !coachDevShell" class="invite-shortcut" to="/coach/staff">{{uiText('INVITI DELLA PALESTRA')}} <strong>{{uiText('Inviti via email →')}}</strong></RouterLink></div>
    </aside>
    <header class="mobile-topbar"><div class="brand"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div><div class="brand-name">LION <span>FIT</span><small v-if="shownRole==='coach'">COACH</small></div><div class="brand-subtitle">{{uiText(shownRole==='coach'?'PANNELLO ADMIN':'AREA ATLETA')}}</div></div></div><div class="top-actions"><QuickProfileSwitch compact/><InboxBell v-if="inboxInHeader&&inboxVisibleOnRoute&&coachInboxEnabled()&&stagingSession" :key="stagingSession.uid+':'+stagingSession.gymId" :session="stagingSession"/><RouterLink v-if="shownRole==='coach'" class="theme-square header-settings-button" :to="athleteDevShell?'/impostazioni?source=emulator':'/impostazioni'" :title="uiText('Apri impostazioni')" :aria-label="uiText('Apri impostazioni')"><LionIcon name="settings" :size="19"/></RouterLink><RouterLink v-if="shownRole==='atleta'" class="theme-square header-settings-button" :to="athleteDevShell?'/impostazioni?source=emulator':'/impostazioni'" :title="uiText('Impostazioni')" :aria-label="uiText('Apri impostazioni')"><LionIcon name="settings" :size="19"/></RouterLink><RouterLink v-if="shownRole==='atleta'" :to="athleteDevShell?'/profilo?source=emulator':'/profilo'" class="header-avatar" :aria-label="uiText('Apri il profilo')"><img v-if="isStagingMode() && currentAvatar" :src="currentAvatar" :alt="uiText('Foto profilo')"/><img v-else-if="!isStagingMode() && !athleteDevShell && demoProfiles.atleta.photo" :src="demoProfiles.atleta.photo" alt="" /><span v-else>🦁</span></RouterLink></div></header>

    <!-- Navigazione Atleta esclusiva: sidebar a sinistra su desktop, dock inferiore su mobile. -->
    <main class="main-layout" :class="[shownRole==='coach'?'coach-container':'athlete-container', {'booking-in-shell':isBooking}]"><button v-if="route.path!=='/home' && route.path!=='/coach' && (shownRole!=='coach' || coachHeaderVisible)" type="button" class="lf-route-back" :class="{'lf-r8-route-back':workoutRoute}" :aria-label="uiText('Torna indietro')" @click="requestBackFromUi"><LionIcon name="back" :size="17"/> </button><template v-if="coachInboxEnabled()&&stagingSession"><InboxBell v-if="!inboxInHeader&&inboxVisibleOnRoute" :key="stagingSession.uid+':'+stagingSession.gymId" :session="stagingSession"/><PushWelcome :key="stagingSession.uid" :uid="stagingSession.uid" :open-agenda="openPushAgenda" :open-support="openPushSupport"/></template><p v-if="linkedNotice" class="notice" role="alert">{{linkedNotice}} <button type="button" class="bare" @click="linkedNotice=''">Chiudi</button></p><RouterView/></main>
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
