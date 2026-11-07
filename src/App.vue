<script setup lang="ts">
import { computed, ref, watch, onUnmounted, defineAsyncComponent } from 'vue'
import {doc,onSnapshot,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from './integrations/firebase/stagingClient'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useLabStore } from './stores/lab'
import LionIcon from './components/LionIcon.vue'
import AthleteBottomNavigation from './components/AthleteBottomNavigation.vue'
import {isStagingMode} from './integrations/firebase/stagingConfig'
import {stagingSession,signOutStaging} from './integrations/firebase/stagingSession'
import {demoProfiles} from './features/profile/localProfile'
import {uiText} from './features/i18n/interfaceLanguage'
// Chunk di avviso STAGING caricato solo in `vite build --mode staging`, mai in LIVE.
const StagingBanner=import.meta.env.MODE==='staging' ? defineAsyncComponent(()=>import('./components/StagingBanner.vue')) : null
const lab=useLabStore();const route=useRoute();const router=useRouter()
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
const coachMenuOpen=ref(false)
// Menu Coach soltanto: la navigazione Atleta usa una barra unica per dispositivo.
watch(()=>route.fullPath,()=>{coachMenuOpen.value=false})
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

const isBooking=computed(()=>route.path.includes('prenotazioni'))
// Le schermate di laboratorio DEV non devono ereditare la shell demo anche se lab.role rimane valorizzato.
const isDevLab = computed(() => import.meta.env.DEV && route.path.startsWith('/dev/'))
const coachEmulatorPreview = computed(() => import.meta.env.DEV && (['/coach','/coach/atleti','/coach/archivio','/coach/profilo'].includes(route.path) || (route.path === '/impostazioni' && verifiedSettingsRole.value === 'coach')) && route.query.source === 'emulator')
const athleteEmulatorPreview = computed(() => import.meta.env.DEV && (['/home','/piano','/archivio','/team','/profilo'].includes(route.path) || (route.path === '/impostazioni' && verifiedSettingsRole.value === 'atleta')) && route.query.source === 'emulator')
const bookingEmulatorPreview = computed(() => import.meta.env.DEV && ['/prenotazioni','/coach/prenotazioni'].includes(route.path) && route.query.source === 'emulator')
const bookingIsCoach = computed(()=>bookingEmulatorPreview.value && route.path==='/coach/prenotazioni')
const coachDevShell = computed(()=>coachEmulatorPreview.value || bookingIsCoach.value)
const athleteDevShell = computed(()=>athleteEmulatorPreview.value || (bookingEmulatorPreview.value && !bookingIsCoach.value))
const demoRouteRole=computed(() => import.meta.env.DEV && !isStagingMode() && !isDevLab.value ? (route.path.startsWith('/coach')?'coach' : ['/home','/piano','/archivio','/team','/profilo','/prenotazioni'].includes(route.path)?'atleta':null) : null)
// In una build pubblica NON leggere mai il ruolo demo dal browser:
// se LIVE non e' configurato, la UI resta soltanto sulla pagina di accesso bloccata.
const shownRole = computed(() => isStagingMode()
 ? (stagingSession.value?.role==='atleta'?'atleta':stagingSession.value?'coach':null)
 : import.meta.env.DEV
   ? (coachEmulatorPreview.value || bookingIsCoach.value ? 'coach'
     : athleteEmulatorPreview.value || bookingEmulatorPreview.value ? 'atleta'
     : demoRouteRole.value??lab.role)
   : null)
const athleteNav=[{to:'/home',label:'HOME',icon:'home'},{to:'/piano',label:'PIANO',icon:'calendar'},{to:'/archivio',label:'ARCHIVIO',icon:'archive'},{to:'/team',label:'TEAM',icon:'team'},{to:'/prenotazioni',label:'PRENOTA',icon:'calendar-plus'},{to:'/profilo',label:'PROFILO',icon:'user'}]
const coachNav=[{to:'/coach',label:'HOME',desk:'DASHBOARD',icon:'home'},{to:'/coach/atleti',label:'ATLETI',desk:'GESTIONE ATLETI',icon:'users'},{to:'/coach/libreria',label:'ESERCIZI',desk:'LIBRERIA ESERCIZI',icon:'clipboard'},{to:'/coach/archivio',label:'ARCHIVIO',desk:'ARCHIVIO SCHEDE',icon:'book'},{to:'/coach/profilo',label:'PROFILO',desk:'PROFILO & PALESTRA',icon:'settings'}]
type SideNavItem = {to:string;label:string;icon:string;desk?:string}
const sideNav:SideNavItem[]=[coachNav[0],coachNav[1],coachNav[3],coachNav[2],{to:'/coach/prenotazioni',label:'CALENDARIO APPUNTAMENTI',icon:'calendar'},{to:'/coach/cestino',label:'CESTINO',icon:'bin'},{to:'/coach/staff',label:'COACH DELLA PALESTRA',icon:'users'},coachNav[4]]
const athleteEmulatorNav=[{to:'/home?source=emulator',label:'HOME',icon:'home'},{to:'/piano?source=emulator',label:'PIANO',icon:'calendar'},{to:'/archivio?source=emulator',label:'ARCHIVIO',icon:'archive'},{to:'/team?source=emulator',label:'TEAM',icon:'team'},{to:'/prenotazioni?source=emulator',label:'PRENOTA',icon:'calendar-plus'},{to:'/profilo?source=emulator',label:'PROFILO',icon:'user'}]
const coachEmulatorNav=[{to:'/coach?source=emulator',label:'HOME',icon:'home'},{to:'/coach/atleti?source=emulator',label:'ATLETI',icon:'users'},{to:'/coach/archivio?source=emulator',label:'ARCHIVIO',icon:'book'},{to:'/coach/prenotazioni?source=emulator',label:'PRENOTAZIONI',icon:'calendar'},{to:'/coach/profilo?source=emulator',label:'PROFILO',icon:'user'}]
const stagingAthleteNav=[{to:'/home',label:'HOME',icon:'home'},{to:'/piano',label:'PIANO',icon:'calendar'},{to:'/archivio',label:'ARCHIVIO',icon:'archive'},{to:'/team',label:'TEAM',icon:'team'},{to:'/prenotazioni',label:'PRENOTA',icon:'calendar-plus'},{to:'/profilo',label:'PROFILO',icon:'user'}]
const stagingCoachNav=[{to:'/coach',label:'HOME',icon:'home'},{to:'/coach/atleti',label:'ATLETI',icon:'users'},{to:'/coach/archivio',label:'ARCHIVIO',icon:'book'},{to:'/coach/prenotazioni',label:'CALENDARIO',icon:'calendar'},{to:'/coach/profilo',label:'PROFILO',icon:'user'}]
const mobileNav=computed(()=>isStagingMode()?(shownRole.value==='coach'?stagingCoachNav:stagingAthleteNav):coachDevShell.value?coachEmulatorNav:athleteDevShell.value?athleteEmulatorNav:shownRole.value==='coach'?coachNav:athleteNav)
async function goOut(){
 if(isStagingMode()){await signOutStaging();await router.replace('/accesso');return}
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
 <div class="app" :class="['theme-'+lab.theme,shownRole==='coach'?'as-coach':'as-athlete',{'bookings-mode':isBooking}]">
  <component v-if="StagingBanner" :is="StagingBanner"/>
  <div v-else-if="coachEmulatorPreview || athleteEmulatorPreview || bookingEmulatorPreview" class="lab-banner">FIREBASE EMULATOR · DATI FITTIZI · SCRITTURE SOLO CON CONFERMA · NON È L'APP PUBBLICATA</div>
  <template v-if="isDevLab">
    <header class="login-header"><img src="/v1-preview/LOGO-APP.png" alt=""/><span>LION <b>FIT</b></span></header>
    <main class="login-main"><RouterView/></main>
  </template>
  <template v-else-if="shownRole">
    <div v-if="shownRole==='coach' && coachMenuOpen" class="coach-mobile-shade" @click="coachMenuOpen=false" aria-hidden="true"></div>
    <aside v-if="shownRole==='coach'" class="desktop-sidebar" :class="{'mobile-sidebar-open':coachMenuOpen}">
      <div class="sidebar-head"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div><strong>LION <em>FIT</em></strong><small>AREA COACH / ADMIN</small></div></div>
      <nav class="sidebar-nav" @click="coachMenuOpen=false">
        <template v-if="isStagingMode()"><RouterLink v-for="item in sideNav" :key="item.to" :to="item.to" :class="{'staff-nav-item':item.to==='/coach/staff'}"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.desk||item.label)}}</span></RouterLink></template>
        <RouterLink v-if="coachDevShell" to="/coach?source=emulator"><LionIcon name="home" :size="17"/><span>DASHBOARD · FIREBASE</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/atleti?source=emulator"><LionIcon name="users" :size="17"/><span>GESTIONE ATLETI · FIREBASE</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/archivio?source=emulator"><LionIcon name="book" :size="17"/><span>ARCHIVIO COACH · FIREBASE</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/prenotazioni?source=emulator"><LionIcon name="calendar" :size="17"/><span>CALENDARIO APPUNTAMENTI · FIREBASE</span></RouterLink><RouterLink v-if="coachDevShell" to="/coach/profilo?source=emulator"><LionIcon name="user" :size="17"/><span>PROFILO · FIREBASE</span></RouterLink>
        <template v-else-if="!isStagingMode()"><RouterLink v-for="item in sideNav" :key="item.to" :to="item.to" :class="{'staff-nav-item':item.to==='/coach/staff'}"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.desk||item.label)}}</span></RouterLink></template>
      </nav>
      <div class="sidebar-foot"><button class="ghost wide" @click="goOut">{{isStagingMode()?'Esci da Lion Fit':coachEmulatorPreview ? 'Esci dal laboratorio' : 'Esci'}}</button><RouterLink v-if="shownRole==='coach' && !coachDevShell" class="invite-shortcut" to="/coach/staff">INVITI DELLA PALESTRA <strong>Inviti via email →</strong></RouterLink><small>{{isStagingMode()?'LION FIT · V1 MODERN':'LION FIT · AMBIENTE DI SVILUPPO'}}</small></div>
    </aside>
    <header class="mobile-topbar"><div class="brand"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div><div class="brand-name">LION <span>FIT</span><small v-if="shownRole==='coach'">COACH</small></div><div class="brand-subtitle">{{shownRole==='coach'?'PANNELLO ADMIN':'AREA ATLETA'}}</div></div></div><div class="top-actions"><button v-if="shownRole==='coach'" type="button" class="mobile-coach-menu-btn" :aria-expanded="coachMenuOpen" aria-label="Apri il menu completo Coach" @click="coachMenuOpen=!coachMenuOpen">☰</button><RouterLink v-if="shownRole==='coach'" class="theme-square header-settings-button" :to="athleteDevShell?'/impostazioni?source=emulator':'/impostazioni'" title="Apri impostazioni" aria-label="Apri impostazioni"><LionIcon name="settings" :size="19"/></RouterLink><RouterLink v-if="shownRole==='atleta'" class="theme-square header-settings-button" :to="athleteDevShell?'/impostazioni?source=emulator':'/impostazioni'" title="Impostazioni" aria-label="Apri impostazioni"><LionIcon name="settings" :size="19"/></RouterLink><RouterLink v-if="shownRole==='atleta'" :to="athleteDevShell?'/profilo?source=emulator':'/profilo'" class="header-avatar" aria-label="Apri il profilo"><img v-if="isStagingMode() && currentAvatar" :src="currentAvatar" alt="Foto profilo"/><img v-else-if="!isStagingMode() && !athleteDevShell && demoProfiles.atleta.photo" :src="demoProfiles.atleta.photo" alt="" /><span v-else>🦁</span></RouterLink></div></header>
    <nav v-if="shownRole==='atleta'" id="athlete-top-menu" class="athlete-top-nav lf-top-menu-75 lf-top-menu-76" aria-label="Menu principale Atleta"><RouterLink v-for="item in mobileNav" :key="item.to" :to="item.to"><LionIcon :name="item.icon" :size="17"/><span>{{uiText(item.label)}}</span></RouterLink></nav>
    <main class="main-layout" :class="[shownRole==='coach'?'coach-container':'athlete-container', {'booking-in-shell':isBooking}]"><div class="version">{{isStagingMode()?'LION FIT · V1 MODERN':athleteDevShell?'LION FIT · ATLETA EMULATORE':shownRole==='coach'?'RIFINITURE 7.6 · COACH':'RIFINITURE 7.6 · ATLETA'}}</div><RouterView/></main>
    <!-- La navbar Atleta vive fuori dal contenitore .app: nessun CSS / overflow legacy può coprirla. -->
    <AthleteBottomNavigation v-if="shownRole==='atleta'" :items="mobileNav" :theme="lab.theme"/>
    <nav v-if="shownRole==='coach'" class="bottom-nav coach-bottom" aria-label="Navigazione Coach"><RouterLink v-for="item in mobileNav" :key="item.to" :to="item.to"><LionIcon :name="item.icon" :size="24"/><span>{{uiText(item.label)}}</span></RouterLink></nav>
  </template>

  <template v-else><header class="login-header login-modern-header"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><div class="login-brand-title"><strong>LION <b>FIT</b></strong><small>AREA ACCESSO</small></div></header><main class="login-main"><RouterView/></main></template>
 </div>
</template>
