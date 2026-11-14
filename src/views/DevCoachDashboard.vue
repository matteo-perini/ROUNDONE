<script setup lang="ts">
/** Dashboard Coach: all values are read-only, scoped to a server-verified gym.
 * Historical sections are best-effort and explicitly remain unavailable on read errors.
 */
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {useRouter} from 'vue-router'
import {collection,doc,getDocFromServer,getDocs,limit,onSnapshot,query,Timestamp,where,type Unsubscribe} from 'firebase/firestore'
import {onAuthStateChanged} from 'firebase/auth'
import {readVerifiedDevSession} from '../integrations/firebase/devSession'
import {isStagingMode,isLiveMode} from '../integrations/firebase/stagingConfig'
import {readStagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {getLocalEmulatorClients} from '../integrations/firebase/emulatorClient'
import {toReservation,bookingPaths} from '../integrations/firestore/liveBookings'
import {reservationQueryPredicates} from '../features/security/phase1QueryScope'
import {buildDashboardActivity,summarizeAthletePrograms,upcomingDashboardBookings,DASHBOARD_DAY_MS,
 type DashboardTemplate,type DashboardBooking,type DashboardWeek,type DashboardAthleteWeeks} from '../features/coach/dashboardLiveModel'
import type {SearchItem} from '../features/platform/platformModel'
import {romeDay} from '../features/coach/dashboardLiveModel'
import CoachDashboardRedesign from '../components/CoachDashboardRedesign.vue'

const router=useRouter()
const coachName=ref('Coach'),coachUid=ref(''),athletes=ref<number|null>(null),templates=ref<number|null>(null)
const athletesById=ref<Record<string,string>>({}),templateRows=ref<DashboardTemplate[]>([]),bookingRows=ref<DashboardBooking[]>([])
const bookingReady=ref(false),templateReady=ref(false),programReady=ref(false),readingPrograms=ref(false)
const programRows=ref<DashboardAthleteWeeks[]>([])
const status=ref<'loading'|'ready'|'error'>('loading'),message=ref('Caricamento dati della palestra…')
const warnings=ref<Record<string,string>>({})
let alive=true,programEpoch=0,lastRosterKeys:string|null=null
const unsub:Unsubscribe[]=[]
let gymId=''
const {db,auth}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
const toMs=(value:unknown):number|undefined=>{
 if(typeof value==='object'&&value!==null&&'toMillis' in value&&typeof value.toMillis==='function'){
  const n=value.toMillis();return Number.isSafeInteger(n)?n:undefined
 }
 return undefined
}
const bookingCount=computed(()=>bookingReady.value?upcoming.value.length:null)
const upcoming=computed(()=>upcomingDashboardBookings(bookingRows.value,Date.now(),athletesById.value,coachUid.value))
const programTotals=computed(()=>programReady.value?summarizeAthletePrograms(programRows.value):null)
const activity=computed(()=>{
 if(!templateReady.value&&!bookingReady.value&&!programReady.value)return {days:[],recent:[]}
 return buildDashboardActivity(bookingRows.value,templateRows.value,programTotals.value?.weeksForActivity||[],Date.now())
})
const dataWarnings=computed(()=>Object.values(warnings.value).filter(Boolean))
const pathFor=(path:string)=>isStagingMode()?path:`${path}?source=emulator`

const searchRows=computed<SearchItem[]>(()=>[...Object.entries(athletesById.value).map(([id,title]):SearchItem=>({id,kind:'Atleta',title,to:pathFor('/coach/atleti')+(isStagingMode()?'?':'&')+'athleteId='+encodeURIComponent(id)})),...templateRows.value.filter(t=>!t.deletedAt).map((t):SearchItem=>({id:t.id,kind:'Scheda',title:t.title,to:pathFor('/coach/archivio')+(isStagingMode()?'?':'&')+'sheetId='+encodeURIComponent(t.id)})),...programRows.value.flatMap(r=>r.personal.filter(t=>!t.deletedAt&&t.title).map((t):SearchItem=>({id:r.athleteId+':'+t.id,kind:'Scheda',title:t.title||'Scheda',detail:'Personale · '+(athletesById.value[r.athleteId]||'Atleta'),to:pathFor('/coach/atleti')+(isStagingMode()?'?':'&')+'athleteId='+encodeURIComponent(r.athleteId)+'&personalSheetId='+encodeURIComponent(t.id)}))),...bookingRows.value.map((b):SearchItem=>({id:b.id,kind:'Appuntamento',title:athletesById.value[b.athleteId]||b.discipline,detail:b.discipline+' · '+romeDay(b.startMs),to:pathFor('/coach/prenotazioni')+(isStagingMode()?'?':'&')+'date='+romeDay(b.startMs)+'&bookingId='+encodeURIComponent(b.id)}))])
async function refreshPrograms(){
 if(!gymId||!alive||athletes.value===null)return
 const epoch=++programEpoch
 readingPrograms.value=true;programReady.value=false;programRows.value=[]
 warnings.value={...warnings.value,programs:''}
 const athleteIds=Object.keys(athletesById.value)
 // Avoid an unbounded fan-out on the dashboard. A bigger gym can use a dedicated aggregate later.
 if(athleteIds.length>200){
  readingPrograms.value=false
  warnings.value={...warnings.value,programs:'Riepilogo programmi non disponibile per oltre 200 Atleti. Nessun valore approssimato.'}
  return
 }
 const result:DashboardAthleteWeeks[]=[];let index=0;let failed=false
 async function worker(){
  while(alive&&epoch===programEpoch&&index<athleteIds.length){
   const athleteId=athleteIds[index++]
   try{
    const parent=['gyms',gymId,'athlete_programs',athleteId] as const
    const [weeksSnap,personalSnap]=await Promise.all([
     getDocs(query(collection(db,...parent,'weeks'),limit(501))),
     getDocs(query(collection(db,...parent,'personal_templates'),limit(501)))
    ])
    if(weeksSnap.size>=501||personalSnap.size>=501)throw new Error('Troppe schede o settimane per un singolo Atleta.')
    const weeks:DashboardWeek[]=weeksSnap.docs.map(d=>{
     const w=d.data();return {id:d.id,name:String(w.name||''),programTitle:typeof w.programTitle==='string'?w.programTitle:undefined,programId:typeof w.programId==='string'?w.programId:undefined,
      deletedAt:w.deletedAt,createdMs:toMs(w.createdAt),days:w.days&&typeof w.days==='object'&&!Array.isArray(w.days)?w.days:{}}
    })
    result.push({athleteId,weeks,personal:personalSnap.docs.map(d=>({id:d.id,title:String(d.data().title||''),deletedAt:d.data().deletedAt}))})
   }catch{failed=true}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,athleteIds.length)},()=>worker()))
 if(!alive||epoch!==programEpoch)return
 readingPrograms.value=false
 if(failed){warnings.value={...warnings.value,programs:'Alcune schede o settimane non sono leggibili: riepilogo non disponibile.'};return}
 programRows.value=result;programReady.value=true
}

onMounted(async()=>{
 try{
  const s=isStagingMode()?await readStagingSession():await readVerifiedDevSession()
  if(!alive)return
  if(!['titolare','collaboratore'].includes(s.role)||(!isStagingMode()&&!/^gym_lab2c_[ab]$/.test(s.gymId)))throw new Error('Accesso Coach non autorizzato.')
  const profile=await getDocFromServer(doc(db,'users',s.uid))
  if(!alive)return
  if(!profile.exists()||profile.data().gymId!==s.gymId||profile.data().role!=='admin' || !['owner','collaborator','undefined'].includes(String(profile.data().coachRole)))
   throw new Error('Il profilo Coach non corrisponde alla sessione verificata.')
  coachName.value=String(profile.data().name||s.label||'Coach').trim().slice(0,80)
  coachUid.value=s.uid;gymId=s.gymId
  unsub.push(onAuthStateChanged(auth,u=>{if(alive&&u?.uid!==s.uid){void router.replace(isStagingMode()?'/accesso':'/dev/accesso')}}))
  unsub.push(onSnapshot(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','athlete')),snap=>{
   if(!alive)return
   const activeUsers=snap.docs.filter(d=>d.data().membershipStatus!=='revoked')
   athletes.value=activeUsers.length
   athletesById.value=Object.fromEntries(activeUsers.map(d=>[d.id,[d.data().name,d.data().surname].filter(x=>typeof x==='string'&&x.trim()).join(' ').trim()||'Atleta']))
   status.value='ready';warnings.value={...warnings.value,athletes:''}
   const keys=activeUsers.map(d=>d.id).sort().join('|')
   if(lastRosterKeys!==keys){lastRosterKeys=keys;void refreshPrograms()}
  },e=>{if(!alive)return;athletes.value=null;status.value='ready';warnings.value={...warnings.value,athletes:'Atleti non leggibili: '+e.message}}))
  unsub.push(onSnapshot(collection(db,'gyms',s.gymId,'templates'),snap=>{
   if(!alive)return
   templateRows.value=snap.docs.map(d=>({id:d.id,title:String(d.data().title||'Scheda'),deletedAt:d.data().deletedAt,createdMs:toMs(d.data().createdAt)}))
   templates.value=templateRows.value.filter(t=>!t.deletedAt).length
   templateReady.value=true;status.value='ready';warnings.value={...warnings.value,templates:''}
  },e=>{if(!alive)return;templates.value=null;templateReady.value=false;status.value='ready';warnings.value={...warnings.value,templates:'Archivio Coach non leggibile: '+e.message}}))
  const from=Date.now()-30*DASHBOARD_DAY_MS,to=Date.now()+60*DASHBOARD_DAY_MS
  const predicates=reservationQueryPredicates(s.role,s.uid,from,to)
  const reservationQuery=query(collection(db,'gyms',s.gymId,bookingPaths.reservations),
   ...predicates.map(p=>where(p.field,p.operator,p.field==='startAt'?Timestamp.fromMillis(p.value as number):p.value)))
  unsub.push(onSnapshot(reservationQuery,snap=>{
   if(!alive)return
   bookingRows.value=snap.docs.flatMap(d=>{
    const b=toReservation(d.id,d.data());return b?[{...b,createdMs:toMs(d.data().createdAt)}]:[]
   })
   bookingReady.value=true;warnings.value={...warnings.value,bookings:''}
  },e=>{if(!alive)return;bookingReady.value=false;bookingRows.value=[];status.value='ready';warnings.value={...warnings.value,bookings:'Prenotazioni non leggibili: '+e.message}}))
 }catch(e){status.value='error';message.value=e instanceof Error?e.message:String(e)}
})
onUnmounted(()=>{alive=false;programEpoch++;unsub.forEach(stop=>stop())})
</script>
<template>
 <CoachDashboardRedesign :name="coachName" :athletes="athletes" :templates="templates" :bookings="bookingCount"
  :programs="programTotals?.programs??null" :assigned="programTotals?.assigned??null" :unassigned="programTotals?.unassigned??null"
  :search-items="searchRows" :search-partial="!templateReady||!bookingReady||!programReady||athletes===null" :appointments="bookingReady?upcoming:[]" :activity-days="activity.days" :recent-events="activity.recent"
  :history-complete="templateReady&&bookingReady&&programReady" :data-warnings="dataWarnings"
  :loading="status==='loading'" :program-loading="readingPrograms" :error="status==='error'?message:undefined"
  :source="isLiveMode()?'Firebase Lion Fit':isStagingMode()?'Firebase STAGING':'Firebase Emulator'"
  :athletes-url="pathFor('/coach/atleti')" :create-url="pathFor('/coach/archivio')"
  :calendar-url="pathFor('/coach/prenotazioni')" :invite-url="pathFor('/coach/staff')"
  :library-url="pathFor('/coach/libreria')" :profile-url="pathFor('/coach/profilo')"
  :trash-url="pathFor('/coach/cestino')" :staff-url="pathFor('/coach/staff')"
  @refresh-programs="refreshPrograms"/>
</template>
