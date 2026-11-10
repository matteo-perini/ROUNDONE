<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import BookingServiceMark from '../components/BookingServiceMark.vue'
/** Prenotazioni LIVE: le scritture richiedono un clic esplicito, un account verificato
 * e Rules Firebase; cancellazioni e sincronizzazioni massive chiedono conferma. */
import { computed,onMounted,onUnmounted,ref,watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, documentId, getDocFromServer, onSnapshot, query, where, Timestamp, type Unsubscribe }  from 'firebase/firestore'
import { readStagingSession, type StagingSession } from '../integrations/firebase/stagingSession'
import { getStagingClients } from '../integrations/firebase/stagingClient'
import { useLabStore } from '../stores/lab'
import {
  bookingPaths, assertBookingLiveUser, cancelReservation,
  createCoachDefault, prepareDaySlots, synchronizeCoachAvailability, reserve,
  toCoachConfig,toReservation,toSlot, type LiveCoachConfig,type LiveReservation
} from '../integrations/firestore/liveBookings'
import {
  candidateSlots, canCancel, countsByDay, coachColorIndex, bookingDisplayStatus, disciplineAllowed, SERVICE_DISCIPLINES, addCalendarMonth, filterBookings, mondayOf, romeParts, shiftDate,
  validateConfig, type BookingFilter, type CalendarView, type Service, type Slot, type Range
} from '../features/bookings/bookingPolicy'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {reservationQueryPredicates,canListPrivateCoachProfiles} from '../features/security/phase1QueryScope'
import {athleteSlotMonthWindow} from '../features/bookings/monthQueryWindow'
const router=useRouter(),lab=useLabStore()
const status=ref<'loading'|'ready'|'error'>('loading'),message=ref('Verifica account reale…')
const session=ref<StagingSession|null>(null)
const configs=ref<LiveCoachConfig[]>([]),slots=ref<Slot[]>([]),allRows=ref<LiveReservation[]>([])
const names=ref<Record<string,string>>({})
const coachRoster=ref<{id:string;name:string}[]>([])
const availabilityProgress=ref(''),availabilityFeedback=ref('')
const calendarWarning=ref(''),availabilityWarning=ref(''),nowMs=ref(Date.now())
let clockTimer:ReturnType<typeof setInterval>|null=null
const namesPending=new Set<string>()
const selectedDate=ref(romeParts(Date.now()).date),month=ref(selectedDate.value.slice(0,7))
const service=ref<Service>('fighter'),chosenCoach=ref(''),discipline=ref('MMA'),chosenStart=ref<number|null>(null)
const athleteTab=ref<'prenota'|'mie'>('prenota'),coachTab=ref<'calendario'|'disponibilita'>('calendario')
const coachFilter=ref('all'),serviceFilter=ref<'all'|Service>('all'),history=ref<'next'|'history'|'all'>('next')
const view=ref<CalendarView>('day'),busy=ref(false)
const draft=ref<LiveCoachConfig|null>(null),edited=ref(false)
const exceptDate=ref(''),exceptKind=ref<'closed'|'special'>('closed'),exceptFrom=ref('09:00'),exceptTo=ref('13:00')
const holidayFrom=ref(''),holidayTo=ref('')
const snapshots=ref(0)
let alive=true;let stops:Unsubscribe[]= [];let reservationStop:Unsubscribe|null=null,slotStop:Unsubscribe|null=null;let bookingGym='' 
const isCoach=computed(()=>session.value?.role==='titolare'||session.value?.role==='collaboratore')
const myConfig=computed(()=>configs.value.find(c=>c.coachId===session.value?.uid))
const chosenConfig=computed(()=>configs.value.find(c=>c.coachId===chosenCoach.value))
const coachLabel=(uid:string)=>coachRoster.value.find(c=>c.id===uid)?.name||configs.value.find(c=>c.coachId===uid)?.displayName||names.value[uid]||uid.slice(0,9)
const coachChips=computed(()=>{
 const ids=new Set([...coachRoster.value.map(c=>c.id),...configs.value.map(c=>c.coachId),...allRows.value.map(b=>b.coachId)])
 return [...ids].map(id=>({id,name:coachLabel(id)})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
})
const serviceReasons=computed(()=>SERVICE_DISCIPLINES[service.value])
const nameLabel=(uid:string)=>names.value[uid]||uid.slice(0,9)
// Colori stabili per i Coach, indipendenti dall'ordine delle prenotazioni.
// Prima coppia coach sempre blu/giallo nella legenda, nei filtri e nel mese.
// Stesso ordine (per nome, poi UID) in tutte le viste. Altri coach mantengono una tinta identificativa.
const coachColor=(id:string)=>{
 const index=coachChips.value.findIndex(c=>c.id===id)
 return index===0?'coach-blue':index===1?'coach-yellow':'coach-hash-'+coachColorIndex(id,6)
}
const coachIdsOn=(date:string)=>[...new Set(eventsOn(date).map(b=>b.coachId))]

const localStart=(ms:number)=>{const p=romeParts(ms);return `${p.date} · ${p.time}`}
const shownDuration=computed(()=>chosenConfig.value?.durations[service.value]||60)
const candidates=computed(()=>chosenConfig.value?candidateSlots(chosenConfig.value,slots.value,service.value,selectedDate.value,nowMs.value):[])
const availableTimes=computed(()=>candidates.value.filter(c=>c.free))
const myRows=computed(()=>allRows.value.filter(b=>b.athleteId===session.value?.uid))
const myHistory=ref<'next'|'history'>('next')
const visibleMyRows=computed(()=>myRows.value.filter(b=>myHistory.value==='next'?b.status==='confirmed'&&b.startMs+b.durationMinutes*60_000>nowMs.value:b.status==='cancelled'||b.startMs+b.durationMinutes*60_000<=nowMs.value)
 .sort((a,b)=>myHistory.value==='next'?a.startMs-b.startMs:b.startMs-a.startMs))
const bookingFilter=computed<BookingFilter>(()=>({date:selectedDate.value,view:view.value,
 coachId:coachFilter.value,service:serviceFilter.value,history:history.value,nowMs:nowMs.value}))
const events=computed<LiveReservation[]>(()=>{
 const byId=new Map(allRows.value.map(b=>[b.id,b] as const))
 return filterBookings(allRows.value,bookingFilter.value).map(b=>byId.get(b.id)).filter((b):b is LiveReservation=>!!b)
})
// Ogni data viene indicizzata una volta per aggiornamento dei filtri/snapshot.
// I riquadri del calendario non devono filtrare di nuovo tutte le prenotazioni.
const eventsByDate=computed(()=>{
 const result=new Map<string,LiveReservation[]>()
 for(const b of events.value){
  const day=romeParts(b.startMs).date
  const group=result.get(day)||[];group.push(b);result.set(day,group)
 }
 return result
})
const coachCountsByDate=computed(()=>{
 const result=new Map<string,Record<string,number>>()
 for(const [date,rows] of eventsByDate.value){
  const counts:Record<string,number>={}
  for(const b of rows)counts[b.coachId]=(counts[b.coachId]||0)+1
  result.set(date,counts)
 }
 return result
})
const counts=computed(()=>countsByDay(allRows.value,bookingFilter.value))
const coachCountsOn=(date:string)=>coachCountsByDate.value.get(date)||{}
const formatTime=(ms:number)=>romeParts(ms).time
const showStatus=(b:LiveReservation)=>bookingDisplayStatus(b,nowMs.value)
const endTime=(b:LiveReservation)=>formatTime(b.startMs+b.durationMinutes*60_000)
const weekDates=computed(()=>Array.from({length:7},(_,i)=>shiftDate(mondayOf(selectedDate.value),i)))
const monthYear=computed(()=>{const [y,m]=month.value.split('-').map(Number);return {y,m}})
const monthDays=computed(()=>{
 const {y,m}=monthYear.value;const first=new Date(Date.UTC(y,m-1,1));const shift=(first.getUTCDay()+6)%7
 const count=new Date(Date.UTC(y,m,0)).getUTCDate()
 return [...Array.from({length:shift},()=>''),...Array.from({length:count},(_,i)=>String(i+1).padStart(2,'0'))]
})
const monthLabel=computed(()=>new Date(`${month.value}-01T12:00:00Z`).toLocaleDateString('it-IT',{month:'long',year:'numeric',timeZone:'Europe/Rome'}))
function dateInMonth(dd:string){return `${month.value}-${dd}`}
function chooseDate(date:string){if(!date)return;selectedDate.value=date;month.value=date.slice(0,7);chosenStart.value=null}
function chooseMonthDay(date:string){chooseDate(date);view.value='day'}
function moveAthleteMonth(n:number){chooseDate(addCalendarMonth(month.value+'-01',n))}
function today(){chooseDate(romeParts(nowMs.value).date)}
// Memoizzazione per mese e Coach: impedisce doppio calcolo per il pulsante
// e il suo tooltip, e non ricalcola tutti i giorni a ogni render Vue.
const monthAvailability=computed(()=>{
 const available=new Set<string>()
 const coach=chosenConfig.value
 if(!coach||!coach.services[service.value])return available
 const [year,mon]=month.value.split('-').map(Number)
 const totalDays=new Date(Date.UTC(year,mon,0)).getUTCDate()
 for(let day=1;day<=totalDays;day++){
  const date=`${month.value}-${String(day).padStart(2,'0')}`
  if(candidateSlots(coach,slots.value,service.value,date,nowMs.value).some(s=>s.free))available.add(date)
 }
 return available
})
function monthDayAvailable(date:string):boolean{return monthAvailability.value.has(date)} 
function moveDate(n:number){
 if(view.value==='month'){
  const d=new Date(month.value+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n)
  chooseDate(d.toISOString().slice(0,10))
 }else chooseDate(shiftDate(selectedDate.value,n*(view.value==='week'?7:1)))
}
const eventsOn=(date:string)=>eventsByDate.value.get(date)||[]
const todayEvents=computed(()=>eventsOn(selectedDate.value))
function canRemove(b:LiveReservation){
 const s=session.value;if(!s)return false
 return canCancel({role:s.role==='atleta'?'athlete':s.role==='titolare'?'owner':'coach',uid:s.uid,gymId:s.gymId},
  b,bookingGym,configs.value.find(c=>c.coachId===b.coachId)?.cancelHours??12,nowMs.value)
}
function close(){stops.forEach(stop=>stop());stops=[];reservationStop?.();reservationStop=null;slotStop?.();slotStop=null}
function localMonthWindow():{from:number;to:number}{
 // Mese visibile con margine 8 giorni per settimane al confine e ora legale.
 const first=Date.parse(month.value+'-01T00:00:00Z')
 const d=new Date(first),next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)
 return {from:first-8*86_400_000,to:next+8*86_400_000}
}
function listenReservations(){
 const s=session.value;if(!s||!alive)return
 // L'Atleta mantiene un solo listener filtrato UID anche passando fra mesi.
 if(s.role==='atleta'&&reservationStop)return
 reservationStop?.();reservationStop=null
 const {db}=getStagingClients(),base=collection(db,'gyms',bookingGym,bookingPaths.reservations)
 const bounds=localMonthWindow()
 // Il collaboratore legge soltanto le prenotazioni del proprio UID: le Rules
 // non filtrano automaticamente le query e rifiutano una query troppo ampia.
 const predicates=reservationQueryPredicates(s.role,s.uid,bounds.from,bounds.to)
 const source=query(base,...predicates.map(p=>where(p.field,p.operator,
  p.field==='startAt'?Timestamp.fromMillis(p.value as number):p.value)))
 reservationStop=onSnapshot(source,snap=>{
  if(!alive)return
  calendarWarning.value=''
  allRows.value=snap.docs.map(d=>toReservation(d.id,d.data())).filter((b):b is LiveReservation=>!!b)
  snapshots.value++;void resolveNames(db,allRows.value)
 },e=>{if(alive)calendarWarning.value='Prenotazioni non aggiornate: '+e.message})
}
function listenSlots(){
 slotStop?.();slotStop=null;slots.value=[]
 const s=session.value,c=chosenCoach.value
 if(!alive||!s||s.role!=='atleta'||athleteTab.value!=='prenota'||!c)return
 // Gli slot servono al calendario mensile dell'Atleta, non alla finestra
 // Coach (mese + 8 giorni). Riduce la lettura iniziale senza perdere i giorni
 // locali ai confini del mese e senza cambiare i controlli di prenotazione.
 const {db}=getStagingClients(),bounds=athleteSlotMonthWindow(month.value),base=collection(db,'gyms',bookingGym,bookingPaths.slots)
 const from=c+'_'+String(bounds.from).padStart(13,'0'),to=c+'_'+String(bounds.to).padStart(13,'0')
 slotStop=onSnapshot(query(base,where(documentId(),'>=',from),where(documentId(),'<',to)),snap=>{
  if(!alive)return
  availabilityWarning.value=''
  slots.value=snap.docs.map(d=>toSlot(d.data())).filter((x):x is Slot=>!!x&&x.coachId===c)
  snapshots.value++
 },e=>{if(alive)availabilityWarning.value='Slot non aggiornati: '+e.message})
}
async function resolveNames(db:ReturnType<typeof getStagingClients>['db'],rows:LiveReservation[]){
 if(!isCoach.value)return
 for(const id of [...new Set(rows.map(b=>b.athleteId))]){
  if(!alive||names.value[id]||namesPending.has(id))continue
  namesPending.add(id)
  try{const r=await getDocFromServer(doc(db,'users',id));if(alive&&r.exists()&&r.data().gymId===bookingGym)
    names.value={...names.value,[id]:String(r.data().name||id)}}catch{ /* Nessuna esposizione di altri profili. */ }
  finally{namesPending.delete(id)}
 }
}
onMounted(async()=>{
 clockTimer=setInterval(()=>{nowMs.value=Date.now()},60_000)
 try{
  const s=await readStagingSession();if(!alive)return
  bookingGym=s.gymId
  const {db,auth}=getStagingClients()
  const profile=await assertBookingLiveUser(db,s);if(!alive)return
  session.value=s;names.value={[s.uid]:profile.name}
  if(isCoach.value)draft.value=createCoachDefault(s.uid,profile.name)
  stops.push(onAuthStateChanged(auth,user=>{
   if(!alive)return
   if(!user||user.uid!==s.uid){close();status.value='error';message.value='Sessione Firebase terminata.';void router.replace('/accesso')}
  }))
  // L'elenco Coach deriva da users/admin della palestra, NON soltanto da config.
  if(canListPrivateCoachProfiles(s.role))stops.push(onSnapshot(query(collection(db,'users'),where('gymId','==',bookingGym),where('role','==','admin')),snap=>{
   if(!alive)return
   coachRoster.value=snap.docs.map(d=>({id:d.id,name:String(d.data().name||d.id)}))
  },e=>{if(alive)calendarWarning.value='Elenco Coach non aggiornato: '+e.message}))
  stops.push(onSnapshot(collection(db,'gyms',bookingGym,bookingPaths.config),snap=>{
   if(!alive)return
   configs.value=snap.docs.map(d=>toCoachConfig(d.id,d.data())).filter((c):c is LiveCoachConfig=>!!c)
   if(chosenCoach.value&&!configs.value.some(c=>c.coachId===chosenCoach.value&&c.active&&c.services[service.value]))chosenCoach.value='' 
   const own=configs.value.find(c=>c.coachId===s.uid)
   if(own&&!edited.value)draft.value=JSON.parse(JSON.stringify(own)) as LiveCoachConfig
   snapshots.value++
  },e=>fail(e)))
  status.value='ready';message.value='Calendario sincronizzato.'
 }catch(e){fail(e)}
})
function fail(e:unknown){
 if(!alive)return
 status.value='error';message.value=e instanceof Error?e.message:'Errore Firebase Lion Fit.';close()
}
watch([session,month],()=>{if(session.value&&alive)listenReservations()})
watch([session,month,chosenCoach,athleteTab],()=>{if(session.value&&alive)listenSlots()})
onUnmounted(()=>{alive=false;close();if(clockTimer)clearInterval(clockTimer)})
watch([selectedDate,service,chosenCoach],()=>{chosenStart.value=null})
watch(service,(next)=>{
 discipline.value=SERVICE_DISCIPLINES[next][0]
 if(chosenCoach.value&&!configs.value.some(c=>c.coachId===chosenCoach.value&&c.active&&c.services[next]))chosenCoach.value=''
})
async function runWrite(fn:()=>Promise<void|string>){
 if(!mayWriteLive()){message.value='Scritture Firebase non abilitate per questa build.';return}
 if(busy.value)return
 busy.value=true
 try{const result=await fn();message.value=typeof result==='string'?result:'Operazione completata su Firebase Lion Fit.'}
 catch(e){message.value=`Operazione non riuscita: ${e instanceof Error?e.message:String(e)}`}
 finally{busy.value=false}
}
function mustSession(){if(!session.value||status.value!=='ready')throw new Error('ACCESSO_NON_VERIFICATO');return session.value}
async function makeBooking(){
 const c=chosenConfig.value,ms=chosenStart.value;if(!c||ms===null)return
 if(!availableTimes.value.some(x=>x.startMs===ms)||!disciplineAllowed(service.value,discipline.value))return
 await runWrite(async()=>{
  const {db}=getStagingClients()
  await reserve(db,mustSession(),c,service.value,discipline.value,ms)
  athleteTab.value='mie';chosenStart.value=null
 })
}
async function cancelBookingRow(b:LiveReservation){
 if(!canRemove(b))return
 if(!window.confirm('Annullare questa prenotazione e liberare gli slot?'))return
 await runWrite(async()=>{
  const {db}=getStagingClients()
  await cancelReservation(db,mustSession(),b.id)
  // UI ottimistica SOLO dopo commit: non riattiva slot nel client, il listener li aggiorna.
  allRows.value=allRows.value.map(row=>row.id===b.id?{...row,status:'cancelled'}:row)
 })
}
function editConfig(){edited.value=true;availabilityFeedback.value=''}
function setWeeklyDay(day:string,field:'enabled'|'from'|'to',value:boolean|string){
 const d=draft.value;if(!d)return
 const info=d.weekly[day as keyof typeof d.weekly]||{enabled:false,ranges:[{from:'09:00',to:'13:00'}]}
 const first=info.ranges[0] as {from:string;to:string}|undefined
 if(field==='enabled')info.enabled=Boolean(value)
 else info.ranges[0]={from:field==='from'?String(value):first?.from||'09:00',to:field==='to'?String(value):first?.to||'13:00'}
 d.weekly[day as keyof typeof d.weekly]=info;editConfig()
}
function addBand(day:string){const d=draft.value;if(!d)return
 const info=d.weekly[day as keyof typeof d.weekly];if(!info||info.ranges.length>=4)return
 const last=info.ranges[info.ranges.length-1] as {from:string;to:string}
 info.ranges.push({from:last?.to||'14:00',to:'19:00'});editConfig()
}
function removeBand(day:string,index:number){const info=draft.value?.weekly[day as keyof LiveCoachConfig['weekly']];
 if(!info||info.ranges.length<=1)return;info.ranges.splice(index,1);editConfig()
}
function addException(){
 if(!draft.value||!exceptDate.value)return
 draft.value.exceptions ||= {}
 draft.value.exceptions[exceptDate.value]= exceptKind.value==='closed'?{enabled:false,ranges:[]}
  :{enabled:true,ranges:[{from:exceptFrom.value,to:exceptTo.value}]}
 editConfig()
}
function addHoliday(){if(!draft.value||!holidayFrom.value||!holidayTo.value||holidayFrom.value>holidayTo.value)return
 draft.value.holidays ||= [];draft.value.holidays.push({from:holidayFrom.value,to:holidayTo.value});editConfig()
}
function removeException(date:string){if(!draft.value?.exceptions)return;delete draft.value.exceptions[date];editConfig()}
function removeHoliday(index:number){if(!draft.value?.holidays)return;draft.value.holidays.splice(index,1);editConfig()}
function fillDefaultWeek(){if(!draft.value)return
 const defaults=createCoachDefault(draft.value.coachId,draft.value.displayName)
 draft.value.weekly=defaults.weekly;editConfig()
}
async function prepareNextWeek(){const s=mustSession(),c=myConfig.value;if(!c)return
 if(!window.confirm('Preparare solo gli slot mancanti dei prossimi 7 giorni su Firebase?'))return
 await runWrite(async()=>{
  const {db}=getStagingClients(),today=romeParts(Date.now()).date
  let created=0,already=0
  for(let i=1;i<=7;i++){
   const r=await prepareDaySlots(db,s,c,shiftDate(today,i));created+=r.created;already+=r.already
  }
  return `7 giorni: ${created} slot creati, ${already} già presenti.`
 })
}

async function persistAvailability(){
 const d=draft.value;if(!d||busy.value)return
 availabilityFeedback.value=''
 const reason=validateConfig(d)
 if(reason){availabilityFeedback.value=`Controlla disponibilità: ${reason}`;message.value=availabilityFeedback.value;return}
 if(!window.confirm('Salvare la disponibilità e sincronizzare gli slot dei prossimi 30 giorni? Le prenotazioni confermate saranno conservate.'))return
 await confirmAvailabilitySave()
}
async function confirmAvailabilitySave(){
 if(busy.value)return
 const d=draft.value;if(!d)return
 availabilityProgress.value='Verifica e sincronizzazione della disponibilità in corso…'
 let successMessage=''
 await runWrite(async()=>{
  const {db}=getStagingClients()
  const result=await synchronizeCoachAvailability(db,mustSession(),d,30,(finished,total)=>{
   availabilityProgress.value=total?`Sincronizzazione slot: ${finished} di ${total} controllati…`:'Configurazione salvata. Verifica degli slot…'
  })
  edited.value=false
  successMessage=`Disponibilità salvata e sincronizzata: ${result.created} slot nuovi, ${result.retired} aperti obsoleti rimossi, ${result.keptBooked} occupati conservati.`
  return successMessage
 })
 availabilityProgress.value=''
 if(successMessage){
  availabilityFeedback.value=successMessage
  coachTab.value='calendario'
 }else{
  const error=message.value||'Impossibile salvare la disponibilità.'
  availabilityFeedback.value=/permission|permess|autorizza|insufficient/i.test(error)
   ?'Salvataggio non riuscito: permessi Firebase insufficienti. Verifica ruolo collaboratore, palestra di appartenenza e Rules pubblicate.'
   :error
 }
}
async function prepareDay(){const s=mustSession(),c=myConfig.value;if(!c)return
 if(!window.confirm(`Preparare gli slot aperti del ${selectedDate.value} su Firebase?`))return
 await runWrite(async()=>{
  const {db}=getStagingClients();const result=await prepareDaySlots(db,s,c,selectedDate.value)
  return `Slot preparati: ${result.created} nuovi, ${result.already} già presenti.`
 })
}
const weekdays=[{id:'lun',label:'Lunedì'},{id:'mar',label:'Martedì'},{id:'mer',label:'Mercoledì'},
{id:'gio',label:'Giovedì'},{id:'ven',label:'Venerdì'},{id:'sab',label:'Sabato'},{id:'dom',label:'Domenica'}]
const bandFrom=(r:Range)=>Array.isArray(r)?r[0]:(r as {from:string;to:string}).from
const bandTo=(r:Range)=>Array.isArray(r)?r[1]:(r as {from:string;to:string}).to
const displayService=(s:Service)=>s==='fighter'?'FIGHTER':'PESI'
</script>
<template>
 <div class="stack" style="gap:18px" aria-label="Prenotazioni Lion Fit">
  <div class="booking-intro"><span class="eyebrow">{{uiText("LION FIT · PRENOTAZIONI")}}</span>
   <h1 style="margin:4px 0">{{uiText("Prenotazioni")}}</h1>
   <p class="muted">Area {{isCoach?'Coach / Admin':'Atleta'}} · {{session?.label||'account reale'}}</p>
   <div class="row booking-top-controls">
    
    <RouterLink class="ghost booking-return booking-control" :to="isCoach?'/coach/atleti':'/home'">{{uiText("← Torna all'app")}}</RouterLink>
    <span v-if="status==='ready'" class="pill booking-live-pill">● Online</span>
   </div>
  </div>
  <div v-if="status==='loading'" class="panel" role="status">{{uiText("Connessione al Firebase Lion Fit…")}}</div>
  <div v-else-if="status==='error'" class="panel" role="alert">{{message}} <RouterLink to="/accesso">{{uiText("Torna all'accesso")}}</RouterLink></div>
  <template v-else>
   <p v-if="calendarWarning" class="notice" role="alert">{{calendarWarning}}</p><p v-if="availabilityWarning&&!isCoach" class="notice" role="alert">{{availabilityWarning}}</p>
   <p v-if="availabilityFeedback" class="notice" role="status" aria-live="polite">{{availabilityFeedback}}</p>
   <p v-if="message&&message!=='Calendario sincronizzato.'" class="small muted" role="status">{{message}}</p>
   <template v-if="!isCoach">
    <div class="booking-tabs booking-main-tabs"><button :class="{selected:athleteTab==='prenota'}" @click="athleteTab='prenota'">{{uiText("Prenota")}}</button><button :class="{selected:athleteTab==='mie'}" @click="athleteTab='mie'">{{uiText("Le mie prenotazioni")}}</button></div>
    <template v-if="athleteTab==='prenota'"><div class="lf-booking-v4-flow">
     <h2 class="booking-section-title">{{uiText("1. Scegli il tuo percorso")}}</h2>
     <div class="booking-choices booking-v1-services">
      <button class="booking-choice booking-service-card" :class="{selected:service==='fighter'}" @click="service='fighter'"><BookingServiceMark kind="fighter"/><strong>FIGHTER</strong><small>{{uiText("MMA, Boxe, K-1 e discipline da combattimento")}}</small></button>
      <button class="booking-choice booking-service-card" :class="{selected:service==='pesi'}" @click="service='pesi'"><BookingServiceMark kind="pesi"/><strong>PESI</strong><small>{{uiText("Preparazione atletica e allenamento pesi")}}</small></button>
     </div>
     <h2 class="booking-section-title">{{uiText("2. Seleziona il Coach")}}</h2>
     <div v-if="!configs.length" class="notice">{{uiText("Nessun Coach configurato per le prenotazioni. Accedi come Coach e prepara la disponibilità.")}}</div>
     <div class="grid2 lf-booking-v4-coaches"><button v-for="c in configs.filter(x=>x.active&&x.services[service])" :key="c.coachId" class="action-card lf-booking-coach-choice" :class="{'lf-booking-coach-selected':chosenCoach===c.coachId}" :aria-pressed="chosenCoach===c.coachId" @click="chosenCoach=c.coachId">
      <span class="action-icon">🦁</span><div><strong>{{c.displayName}}</strong><small>{{displayService(service)}} · {{c.durations[service]}} {{uiText("minuti")}}</small></div><span class="lf-booking-coach-check" aria-hidden="true">{{chosenCoach===c.coachId?'✓':'○'}}</span></button></div>
     <h2 class="booking-section-title">{{uiText("3. Tipo di incontro")}}</h2>
     <section class="panel"><h3 class="booking-reasons-title">{{service==='fighter'?'Disciplina Fighter':'Motivo della prenotazione Pesi'}}</h3><label class="lf-booking-v4-select-label"><select v-model="discipline" class="lf-booking-v4-select" aria-label="Seleziona disciplina o motivo"><option v-for="reason in serviceReasons" :key="reason" :value="reason">{{reason}}</option></select></label></section>
     <h2 class="booking-section-title">{{uiText("4. Scegli giorno e orario")}}</h2>
     <section class="panel lf-booking-v4-calendar"><div class="row between"><button class="secondary" @click="moveAthleteMonth(-1)">‹</button><strong>{{monthLabel}}</strong><button class="secondary" @click="moveAthleteMonth(1)">›</button></div>
      <div class="booking-calendar" style="margin-top:20px"><div v-for="(n,i) in ['L','M','M','G','V','S','D']" :key="i" class="muted">{{n}}</div>
       <template v-for="(d,i) in monthDays" :key="i"><div v-if="!d"/><button v-else class="booking-day" :class="{selected:selectedDate===dateInMonth(d)}" :disabled="!monthDayAvailable(dateInMonth(d))" :title="monthDayAvailable(dateInMonth(d))?'Disponibile':'Nessun orario disponibile'" @click="chooseDate(dateInMonth(d))">{{Number(d)}}</button></template></div></section>
     <section class="panel lf-booking-v4-times"><h2>{{selectedDate}} · {{shownDuration}} {{uiText("minuti")}}</h2>
      <p v-if="!candidates.length" class="muted">{{uiText("Nessun orario preparato per questo giorno. Seleziona un altro giorno o Coach.")}}</p>
      <div v-else class="times"><button v-for="slot in candidates" :key="slot.startMs" :disabled="!slot.free" :class="{selected:chosenStart===slot.startMs,unavailable:!slot.free}" :title="slot.busy?'Occupato':slot.late?'Preavviso minimo':'Disponibile'" @click="chosenStart=slot.startMs">{{slot.time}} <small v-if="!slot.free">{{slot.busy?'Occupato':'Preavviso'}}</small></button></div>
      <p class="small muted">{{uiText("Sono ammessi solo slot consecutivi da 30 minuti, senza sovrapposizioni. L'orario è Europe/Rome.")}}</p>
     </section>
     <section class="panel lf-booking-v4-review"><span class="eyebrow">{{uiText("RIEPILOGO")}}</span><h2>{{displayService(service)}} · {{chosenConfig?.displayName||'Seleziona Coach'}}</h2>
      <p class="muted">{{selectedDate}} · {{chosenStart!==null?romeParts(chosenStart).time:'Nessun orario selezionato'}} · {{shownDuration}} min · {{discipline}}</p>
      
      <button class="primary wide" :disabled="busy||chosenStart===null" @click="makeBooking">{{uiText("Conferma prenotazione")}}</button>
     </section>
    </div></template>
    <template v-else><section class="panel"><h2>{{uiText("Le mie prenotazioni")}}</h2><div class="booking-tabs"><button :class="{selected:myHistory==='next'}" @click="myHistory='next'">{{uiText("Prossime")}}</button><button :class="{selected:myHistory==='history'}" @click="myHistory='history'">{{uiText("Storico")}}</button></div><p v-if="!visibleMyRows.length" class="muted">{{uiText("Nessuna prenotazione in questa sezione.")}}</p>
      <article v-for="b in visibleMyRows" :key="b.id" class="event-item" style="display:block;margin:9px 0"><strong>{{localStart(b.startMs)}} · {{displayService(b.service)}} · {{b.durationMinutes}} min</strong>
       <p class="small muted">{{coachLabel(b.coachId)}} · {{b.discipline}} · {{showStatus(b)}}</p>
       <button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">{{uiText("Annulla e libera slot")}}</button></article>
      
     </section></template>
   </template>
   <template v-else>
    <div class="booking-tabs booking-main-tabs"><button :class="{selected:coachTab==='calendario'}" @click="coachTab='calendario'">{{uiText("Calendario appuntamenti")}}</button><button :class="{selected:coachTab==='disponibilita'}" @click="coachTab='disponibilita'">{{uiText("Gestione disponibilità")}}</button></div>
    <template v-if="coachTab==='calendario'">
     <section class="panel booking-compact-toolbar"><div class="row between booking-toolbar-heading"><h2>{{uiText("Calendario condiviso")}}</h2><span class="pill">{{events.length}} {{uiText("appuntamenti")}}</span></div>
      <p class="small muted">{{uiText("Un calendario, filtri per Coach; prenotazioni aggiornate senza ricaricare la pagina.")}}</p>
      <div class="booking-coach-chips booking-tabs" aria-label="Filtra per Coach">
       <button :class="{selected:coachFilter==='all'}" @click="coachFilter='all'">{{uiText("Tutti")}}</button>
       <button v-for="c in coachChips" :key="c.id" :class="{selected:coachFilter===c.id}" @click="coachFilter=c.id"><i class="coach-dot" :class="coachColor(c.id)"/> {{c.name}}</button>
      </div>
      <div class="booking-toolbar-line"><div class="booking-tabs booking-view-tabs"><span class="muted small">{{uiText("Vista")}}</span><button v-for="v in (['day','week','month'] as const)" :key="v" :class="{selected:view===v}" @click="view=v">{{v==='day'?'Giorno':v==='week'?'Settimana':'Mese'}}</button></div>
      <div class="booking-tabs booking-history-tabs"><span class="muted small">{{uiText("Mostra")}}</span><button :class="{selected:history==='next'}" @click="history='next'">{{uiText("Prossimi")}}</button><button :class="{selected:history==='history'}" @click="history='history'">{{uiText("Storico")}}</button><button :class="{selected:history==='all'}" @click="history='all'">{{uiText("Tutti")}}</button></div></div>
      <div class="booking-toolbar-line booking-date-line"><div class="booking-date-controls"><button class="secondary" @click="moveDate(-1)" aria-label="Periodo precedente">‹</button><input type="date" :value="selectedDate" aria-label="Data calendario" @change="chooseDate(($event.target as HTMLInputElement).value)"/><button class="secondary" @click="moveDate(1)" aria-label="Periodo successivo">›</button><button class="ghost" @click="today">{{uiText("Oggi")}}</button></div>
       <select v-model="serviceFilter" aria-label="Filtra servizio"><option value="all">{{uiText("Fighter e Pesi")}}</option><option value="fighter">Fighter</option><option value="pesi">{{uiText("Pesi")}}</option></select>
      </div>
     </section>
     <section v-if="view==='day'" class="panel booking-period"><h3>{{selectedDate}} · {{todayEvents.length}} {{uiText("appuntamenti")}}</h3>
      <p v-if="!todayEvents.length" class="muted">{{uiText("Nessun appuntamento.")}}</p><article v-for="b in todayEvents" :key="b.id" class="event-item"><i class="coach-dot" :class="coachColor(b.coachId)"/><strong>{{formatTime(b.startMs)}}–{{endTime(b)}} · {{nameLabel(b.athleteId)}}</strong><span><b class="booking-service-badge" :class="b.service">{{displayService(b.service)}}</b> · {{coachLabel(b.coachId)}} · {{b.discipline}} · {{showStatus(b)}}</span>
       <button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">{{uiText("Annulla")}}</button></article>
     </section>
     <section v-else-if="view==='week'" class="panel booking-period"><h3>{{uiText("Settimana del")}} {{weekDates[0]}} · {{events.length}} {{uiText("appuntamenti")}}</h3>
      <div v-for="day in weekDates" :key="day" class="week-event-day"><strong>{{day}}</strong><span class="event-count">{{eventsOn(day).length}}</span><article v-for="b in eventsOn(day)" :key="b.id" class="event-item"><i class="coach-dot" :class="coachColor(b.coachId)"/> {{formatTime(b.startMs)}}–{{endTime(b)}} · <strong>{{nameLabel(b.athleteId)}}</strong> · {{coachLabel(b.coachId)}} · <b class="booking-service-badge" :class="b.service">{{displayService(b.service)}}</b> · {{b.discipline}} · {{showStatus(b)}} <button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">{{uiText("Annulla")}}</button></article></div>
     </section>
     <section v-else class="panel booking-period"><h3>{{monthLabel}} · {{events.length}} {{uiText("appuntamenti")}}</h3>
      <div class="coach-month-grid"><span v-for="(n,i) in ['L','M','M','G','V','S','D']" :key="i" class="coach-month-weekday">{{n}}</span>
       <template v-for="(d,i) in monthDays" :key="i"><span v-if="!d" class="month-empty"/><button v-else class="coach-month-day" :class="{selected:selectedDate===dateInMonth(d)}" @click="chooseMonthDay(dateInMonth(d))"><b>{{Number(d)}}</b><small>{{counts[dateInMonth(d)]||0}} {{uiText("appuntamenti")}}</small><span class="coach-month-dots" :aria-label="coachIdsOn(dateInMonth(d)).map(coachLabel).join(', ')"><span v-for="uid in coachIdsOn(dateInMonth(d))" :key="uid" class="booking-coach-mini"><i class="coach-dot" :class="coachColor(uid)"/>{{coachCountsOn(dateInMonth(d))[uid]||0}}</span></span></button></template>
      </div><p class="small muted">{{uiText("Tocca un giorno per aprire direttamente gli appuntamenti di quel giorno.")}}</p>
     </section>
     
    </template>
    <template v-else><section class="panel coach-availability-compact"><h2>{{uiText("Disponibilità del Coach autenticato")}}</h2><p class="muted coach-availability-intro">{{uiText("Solo il Coach proprietario può salvare la propria configurazione. Il titolare può preparare slot degli altri Coach solo con funzioni amministrative dedicate, qui disabilitate.")}}</p>
      <template v-if="draft">
       <label>{{uiText("Nome pubblico del Coach")}}<input :value="draft.displayName" maxlength="100" @input="draft.displayName=($event.target as HTMLInputElement).value;editConfig()"/></label>
       <label class="checkline"><input :checked="draft.active" type="checkbox" @change="draft.active=($event.target as HTMLInputElement).checked;editConfig()"/> {{uiText("Disponibilità attiva")}}</label>
       <div class="grid2 coach-availability-fields"><label class="checkline"><input :checked="draft.services.fighter" type="checkbox" @change="draft.services.fighter=($event.target as HTMLInputElement).checked;editConfig()"/> {{uiText("FIGHTER abilitato")}}</label>
        <label class="checkline"><input :checked="draft.services.pesi" type="checkbox" @change="draft.services.pesi=($event.target as HTMLInputElement).checked;editConfig()"/> {{uiText("PESI abilitato")}}</label>
        <label>{{uiText("Durata Fighter")}}<select :value="draft.durations.fighter" @change="draft.durations.fighter=Number(($event.target as HTMLSelectElement).value) as 60|120;editConfig()"><option :value="60">{{uiText("60 minuti")}}</option><option :value="120">{{uiText("120 minuti")}}</option></select></label>
        <label>{{uiText("Durata Pesi")}}<select :value="draft.durations.pesi" @change="draft.durations.pesi=Number(($event.target as HTMLSelectElement).value) as 60|120;editConfig()"><option :value="60">{{uiText("60 minuti")}}</option><option :value="120">{{uiText("120 minuti")}}</option></select></label>
        <label>{{uiText("Preavviso (ore)")}}<input type="number" min="0" max="168" :value="draft.noticeHours" @input="draft.noticeHours=Number(($event.target as HTMLInputElement).value);editConfig()"/></label>
        <label>{{uiText("Disdetta (ore)")}}<input type="number" min="0" max="168" :value="draft.cancelHours" @input="draft.cancelHours=Number(($event.target as HTMLInputElement).value);editConfig()"/></label>
        <label>{{uiText("Prenotabile entro (giorni)")}}<input type="number" min="1" max="30" :value="draft.maxDays" @input="draft.maxDays=Number(($event.target as HTMLInputElement).value);editConfig()"/></label>
       </div><div class="grid2 coach-availability-period"><label>{{uiText("Validità disponibilità")}}<select :value="draft.mode||'always'" @change="draft.mode=($event.target as HTMLSelectElement).value as 'always'|'period';editConfig()"><option value="always">{{uiText("Sempre")}}</option><option value="period">{{uiText("Solo per un periodo")}}</option></select></label></div>
       <div v-if="draft.mode==='period'" class="grid2"><label>{{uiText("Dal")}}<input type="date" :value="draft.from" @change="draft.from=($event.target as HTMLInputElement).value;editConfig()"/></label><label>Al<input type="date" :value="draft.to" @change="draft.to=($event.target as HTMLInputElement).value;editConfig()"/></label></div>
       <h3 class="coach-availability-heading">{{uiText("Settimana tipo · massimo 4 fasce per giorno")}}</h3>
       <button class="secondary" type="button" @click="fillDefaultWeek">{{uiText("Precompila Lun–Sab 09:00–13:00 (solo modulo)")}}</button>
       <div class="availability-grid coach-availability-week"><div v-for="day in weekdays" :key="day.id" class="line-card"><div class="row between"><strong>{{day.label}}</strong><input type="checkbox" :checked="draft.weekly[day.id as keyof typeof draft.weekly]?.enabled??false" @change="setWeeklyDay(day.id,'enabled',($event.target as HTMLInputElement).checked)"/></div>
        <div v-for="(band,i) in (draft.weekly[day.id as keyof typeof draft.weekly]?.ranges||[])" :key="i" class="row"><input class="coach-time-input" type="time" step="1800" :value="bandFrom(band)" @change="draft!.weekly[day.id as keyof typeof draft.weekly]!.ranges[i]={from:($event.target as HTMLInputElement).value,to:bandTo(band)};editConfig()"/>
         <input class="coach-time-input" type="time" step="1800" :value="bandTo(band)" @change="draft!.weekly[day.id as keyof typeof draft.weekly]!.ranges[i]={from:bandFrom(band),to:($event.target as HTMLInputElement).value};editConfig()"/>
         <button type="button" class="bare" :disabled="(draft.weekly[day.id as keyof typeof draft.weekly]?.ranges.length||0)<=1" @click="removeBand(day.id,i)">×</button></div>
        <button class="ghost" :disabled="(draft.weekly[day.id as keyof typeof draft.weekly]?.ranges.length||0)>=4" @click="addBand(day.id)">{{uiText("+ Fascia")}}</button></div></div>
       <h3>{{uiText("Eccezioni e ferie")}}</h3><div class="grid2"><label>{{uiText("Giorno")}}<input v-model="exceptDate" type="date"/></label><label>{{uiText("Tipo")}}<select v-model="exceptKind"><option value="closed">{{uiText("Chiudi questo giorno")}}</option><option value="special">{{uiText("Orario speciale")}}</option></select></label>
        <label v-if="exceptKind==='special'">{{uiText("Dalle")}}<input v-model="exceptFrom" type="time" step="1800"/></label><label v-if="exceptKind==='special'">{{uiText("Alle")}}<input v-model="exceptTo" type="time" step="1800"/></label></div>
       <button class="secondary" @click="addException">{{uiText("+ Aggiungi eccezione")}}</button>
       <div v-for="(val,date) in draft.exceptions||{}" :key="date" class="row"><small>{{date}} · {{val.enabled?'Orario speciale':'Chiuso'}}</small><button class="bare" @click="removeException(String(date))">{{uiText("Rimuovi")}}</button></div>
       <div class="grid2"><label>{{uiText("Ferie dal")}}<input v-model="holidayFrom" type="date"/></label><label>{{uiText("Ferie al")}}<input v-model="holidayTo" type="date"/></label></div><button class="secondary" @click="addHoliday">{{uiText("+ Aggiungi ferie")}}</button>
       <div v-for="(holiday,i) in draft.holidays||[]" :key="i" class="row"><small>{{uiText("Ferie")}} {{holiday.from}} — {{holiday.to}}</small><button class="bare" @click="removeHoliday(i)">{{uiText("Rimuovi")}}</button></div>
       <p class="muted small">{{uiText("Salvare sincronizza fino a 30 giorni di slot. Quelli aperti non più validi vengono ritirati; le prenotazioni confermate non vengono cancellate. In caso di errore la disponibilità resta inattiva finché non ripeti il salvataggio.")}}</p>
       
       <button class="primary wide" :disabled="busy||status!=='ready'" @click="persistAvailability">{{busy?'Sincronizzazione in corso…':uiText("Salva e sincronizza disponibilità (30 giorni)")}}</button><p v-if="availabilityProgress" class="small green lf-availability-progress" role="status" aria-live="polite">{{availabilityProgress}}</p>
       <hr/><h3>{{uiText("Prepara slot del giorno selezionato")}}</h3><p class="muted small">{{uiText("Crea soltanto slot mancanti e futuri da 30 minuti; non sovrascrive mai quelli esistenti o prenotati.")}}</p>
       <input v-model="selectedDate" type="date"/>
       <button class="primary wide" :disabled="busy||!myConfig||edited" @click="prepareDay">{{uiText("Prepara slot del")}} {{selectedDate}}</button>
       <button class="secondary wide" :disabled="busy||!myConfig||edited" @click="prepareNextWeek">{{uiText("Prepara i prossimi 7 giorni · Firebase")}}</button>
       <p v-if="edited" class="small muted">{{uiText("Salva prima la configurazione per preparare nuovi slot.")}}</p>
      </template>
     </section></template>
   </template>
  </template>
 </div>
</template>

<style scoped>
/* STEP 3N — intervento UI isolato: la logica Firebase e le fasce restano identiche. */
.coach-availability-compact { padding: 14px 16px; min-width: 0; }
.coach-availability-compact h2 { font-size: clamp(16px, 1.6vw, 19px); margin: 0 0 6px; line-height: 1.2; }
.coach-availability-intro { font-size: 11px; line-height: 1.4; margin: 0 0 8px; }
.coach-availability-compact label { font-size: 11px; line-height: 1.25; margin: 7px 0 4px; min-width: 0; }
.coach-availability-compact .checkline { display: flex; align-items: center; gap: 7px; margin: 6px 0; min-width: 0; }
.coach-availability-compact .checkline input[type="checkbox"] { flex: none; width: 16px; height: 16px; }
.coach-availability-compact input:not([type="checkbox"]),
.coach-availability-compact select { min-width: 0; width: 100%; min-height: 36px; padding: 7px 9px; font-size: 12px; border-radius: 8px; }
.coach-availability-fields { gap: 7px 10px; align-items: end; }
.coach-availability-period { gap: 7px 10px; margin-top: 8px; }
.coach-availability-heading { font-size: 14px; margin: 14px 0 7px; }
.coach-availability-compact h3 { font-size: 14px; margin-bottom: 7px; }
.coach-availability-compact .coach-availability-week { gap: 8px; }
.coach-availability-week .line-card { padding: 9px 10px; min-width: 0; border-radius: 10px; }
.coach-availability-week .line-card > .row:first-child { gap: 8px; margin-bottom: 5px; }
.coach-availability-week .line-card > .row:not(:first-child) { display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; margin-bottom: 5px; min-width: 0; }
.coach-availability-week .coach-time-input { min-width: 0; flex: 1 1 0; width: 0; min-height: 35px; padding: 6px 5px; font-size: 12px; }
.coach-availability-week .line-card .bare { flex: 0 0 27px; min-width: 27px; min-height: 35px; padding: 0 5px; }
.coach-availability-week .line-card .ghost { min-height: 32px; padding: 6px 10px; font-size: 11px; }
.coach-availability-compact > button.secondary { min-height: 34px; padding: 7px 10px; font-size: 11px; }
.coach-availability-compact > .grid2 { margin-bottom: 7px; }
.coach-availability-compact > .row { gap: 6px; }
@media (min-width: 1050px) {
  .coach-availability-fields { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .coach-availability-week { grid-template-columns: repeat(3,minmax(0,1fr)); }
}
@media (max-width: 680px) {
  .coach-availability-compact { padding: 12px; }
  .coach-availability-fields { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .coach-availability-week { grid-template-columns: minmax(0,1fr); }
  .coach-availability-compact input:not([type="checkbox"]),
  .coach-availability-compact select { min-height: 40px; }
  .coach-availability-week .coach-time-input { min-height: 40px; }
  .coach-availability-week .line-card .bare { min-height: 40px; }
}
</style>

<style scoped>
.booking-reasons-title{margin:0 0 10px;font-size:15px}
.booking-reasons-list{display:grid;grid-template-columns:1fr;gap:7px;max-width:560px}
.booking-reason{display:flex;align-items:center;gap:11px;margin:0;padding:11px 12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;min-height:43px;font-weight:750;font-size:13px;cursor:pointer}
.booking-reason input{width:18px;min-width:18px;height:18px;margin:0;accent-color:var(--mint)}
.booking-reason-active{border-color:var(--mint);background:var(--green-bg);color:var(--mint)}
@media(max-width:480px){.booking-reason{font-size:12px;padding:9px 11px}}
</style>
