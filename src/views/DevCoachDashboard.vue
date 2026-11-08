<script setup lang="ts">
/** Dashboard della shell originale, dati live SOLO Firebase Emulator. */
import { onMounted,onUnmounted,ref } from 'vue'
import { RouterLink,useRouter } from 'vue-router'
import { collection,doc,getDocFromServer,onSnapshot,query,where,type Unsubscribe } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { readVerifiedDevSession } from '../integrations/firebase/devSession'
import {isStagingMode,isOperationalMode,isLiveMode} from '../integrations/firebase/stagingConfig'
import {readStagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import LionIcon from '../components/LionIcon.vue'
import CoachDashboardRedesign from '../components/CoachDashboardRedesign.vue'
const router=useRouter()
const coachName=ref('Coach'),athletes=ref<number|null>(null),templates=ref<number|null>(null)
const status=ref<'loading'|'ready'|'error'>('loading'),message=ref('Caricamento dati della palestra…')
let active=true;const unsub:Unsubscribe[]=[]
const links=[
 {label:'Gestione atleti',sub:'Programmi e schede dell’atleta',to:isOperationalMode()?'/coach/atleti':isStagingMode()?'/staging':'/coach/atleti?source=emulator',icon:'users'},
 {label:'Archivio schede',sub:'Modelli e superset',to:isOperationalMode()?'/coach/archivio':isStagingMode()?'/staging':'/coach/archivio?source=emulator',icon:'book'},
 {label:'Calendario e prenotazioni',sub:'Calendario condiviso Firebase',to:isOperationalMode()?'/coach/prenotazioni':isStagingMode()?'/staging':'/coach/prenotazioni?source=emulator',icon:'calendar'},
 {label:'Il mio profilo',sub:'Dati del Coach',to:isStagingMode()?'/coach/profilo':'/coach/profilo?source=emulator',icon:'settings'},
]

onMounted(async()=>{
 try{
  const s=isStagingMode()?await readStagingSession():await readVerifiedDevSession()
  if(!active)return
  if(!['titolare','collaboratore'].includes(s.role)||(!isStagingMode()&&!/^gym_lab2c_[ab]$/.test(s.gymId)))throw new Error('Accesso Coach non autorizzato.')
  const {db,auth}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
  const profile=await getDocFromServer(doc(db,'users',s.uid))
  if(!active)return
  if(!profile.exists()||profile.data().gymId!==s.gymId||profile.data().role!=='admin' || !['owner','collaborator','undefined'].includes(String(profile.data().coachRole)))
   throw new Error('Il profilo Coach non corrisponde alla sessione verificata.')
  coachName.value=String(profile.data().name||s.label||'Coach').trim().slice(0,80)
  unsub.push(onAuthStateChanged(auth,u=>{if(active&&u?.uid!==s.uid){void router.replace(isStagingMode()?'/accesso':'/dev/accesso')}}))
  unsub.push(onSnapshot(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','athlete')),snap=>{
   if(!active)return;athletes.value=snap.docs.length;status.value='ready'
  },e=>{status.value='error';message.value=`Atleti non leggibili: ${e.message}`}))
  unsub.push(onSnapshot(collection(db,'gyms',s.gymId,'templates'),snap=>{
   if(!active)return;templates.value=snap.docs.filter(d=>!d.data().deletedAt).length;status.value='ready'
  },e=>{status.value='error';message.value=`Modelli non leggibili: ${e.message}`}))
 }catch(e){status.value='error';message.value=e instanceof Error?e.message:String(e)}
})
onUnmounted(()=>{active=false;unsub.forEach(fn=>fn())})
</script>
<template>
 <CoachDashboardRedesign :name="coachName" :athletes="athletes" :templates="templates" :bookings="null" :programs="null" :assigned="null" :unassigned="null" :loading="status==='loading'" :error="status==='error'?message:undefined" :source="isLiveMode()?'Firebase Lion Fit':isStagingMode()?'Firebase STAGING':'Firebase Emulator'" :athletes-url="isStagingMode()?'/coach/atleti':'/coach/atleti?source=emulator'" :create-url="isStagingMode()?'/coach/archivio':'/coach/archivio?source=emulator'" :calendar-url="isStagingMode()?'/coach/prenotazioni':'/coach/prenotazioni?source=emulator'" :invite-url="isStagingMode()?'/coach/staff':'/coach/staff?source=emulator'" :library-url="isStagingMode()?'/coach/libreria':'/coach/libreria?source=emulator'" :profile-url="isStagingMode()?'/coach/profilo':'/coach/profilo?source=emulator'"/>
</template>
