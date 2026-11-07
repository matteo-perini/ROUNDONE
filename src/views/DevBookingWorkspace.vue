<script setup lang="ts">
import BookingServiceMark from '../components/BookingServiceMark.vue'
/** Prenotazioni 2M/L: interfaccia originale nel SOLO Firebase Emulator.
 * Nessuna mutazione senza consenso, nessun documento di produzione.
 */
import { computed,onMounted,onUnmounted,ref,watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDocFromServer, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { readVerifiedDevSession, type VerifiedDevSession } from '../integrations/firebase/devSession'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import { useLabStore } from '../stores/lab'
import {
  BOOKING_GYM, bookingPaths, assertBookingLabUser, cancelReservation,
  createCoachDefault, prepareDaySlots, reserve, saveCoachConfig,
  toCoachConfig,toReservation,toSlot, type LiveCoachConfig,type LiveReservation
} from '../integrations/firestore/bookings'
import {
  candidateSlots, canCancel, countsByDay, filterBookings, mondayOf, romeParts, shiftDate,
  validateConfig, type BookingFilter, type CalendarView, type Service, type Slot, type Range
} from '../features/bookings/bookingPolicy'
const router=useRouter(),lab=useLabStore()
const status=ref<'loading'|'ready'|'error'>('loading'),message=ref('Verifica account fittizio…')
const session=ref<VerifiedDevSession|null>(null)
const configs=ref<LiveCoachConfig[]>([]),slots=ref<Slot[]>([]),allRows=ref<LiveReservation[]>([])
const names=ref<Record<string,string>>({})
const selectedDate=ref(romeParts(Date.now()).date),month=ref(selectedDate.value.slice(0,7))
const service=ref<Service>('fighter'),chosenCoach=ref(''),discipline=ref('MMA'),chosenStart=ref<number|null>(null)
const athleteTab=ref<'prenota'|'mie'>('prenota'),coachTab=ref<'calendario'|'disponibilita'>('calendario')
const coachFilter=ref('all'),serviceFilter=ref<'all'|Service>('all'),history=ref<'next'|'history'|'all'>('next')
const view=ref<CalendarView>('day'),approved=ref(false),busy=ref(false)
const draft=ref<LiveCoachConfig|null>(null),edited=ref(false)
const exceptDate=ref(''),exceptKind=ref<'closed'|'special'>('closed'),exceptFrom=ref('09:00'),exceptTo=ref('13:00')
const holidayFrom=ref(''),holidayTo=ref('')
const snapshots=ref(0)
let alive=true;let stops:Unsubscribe[]=[]
const isCoach=computed(()=>session.value?.role==='titolare'||session.value?.role==='collaboratore')
const myConfig=computed(()=>configs.value.find(c=>c.coachId===session.value?.uid))
const chosenConfig=computed(()=>configs.value.find(c=>c.coachId===chosenCoach.value))
const coachLabel=(uid:string)=>configs.value.find(c=>c.coachId===uid)?.displayName||names.value[uid]||uid.slice(0,9)
const nameLabel=(uid:string)=>names.value[uid]||uid.slice(0,9)
// Colori stabili per i Coach, indipendenti dall'ordine delle prenotazioni.
const coachOrder=computed(()=>configs.value.map(c=>c.coachId).sort((a,b)=>coachLabel(a).localeCompare(coachLabel(b),'it')))
const coachColor=(id:string)=>coachOrder.value.indexOf(id)===0?'coach-blue':coachOrder.value.indexOf(id)===1?'coach-yellow':'coach-other'
const coachIdsOn=(date:string)=>[...new Set(eventsOn(date).map(b=>b.coachId))]

const localStart=(ms:number)=>{const p=romeParts(ms);return `${p.date} · ${p.time}`}
const shownDuration=computed(()=>chosenConfig.value?.durations[service.value]||60)
const candidates=computed(()=>chosenConfig.value?candidateSlots(chosenConfig.value,slots.value,service.value,selectedDate.value,Date.now()):[])
const availableTimes=computed(()=>candidates.value.filter(c=>c.free))
const myRows=computed(()=>allRows.value.filter(b=>b.athleteId===session.value?.uid)
 .sort((a,b)=>b.startMs-a.startMs))
const bookingFilter=computed<BookingFilter>(()=>({date:selectedDate.value,view:view.value,
 coachId:coachFilter.value,service:serviceFilter.value,history:history.value,nowMs:Date.now()}))
const events=computed<LiveReservation[]>(()=>{
 const byId=new Map(allRows.value.map(b=>[b.id,b] as const))
 return filterBookings(allRows.value,bookingFilter.value).map(b=>byId.get(b.id)).filter((b):b is LiveReservation=>!!b)
})
const counts=computed(()=>countsByDay(allRows.value,bookingFilter.value))
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
function moveDate(n:number){
 if(view.value==='month'){
  const d=new Date(month.value+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n)
  chooseDate(d.toISOString().slice(0,10))
 }else chooseDate(shiftDate(selectedDate.value,n*(view.value==='week'?7:1)))
}
const eventsOn=(date:string)=>events.value.filter(b=>romeParts(b.startMs).date===date)
const todayEvents=computed(()=>eventsOn(selectedDate.value))
function canRemove(b:LiveReservation){
 const s=session.value;if(!s)return false
 return canCancel({role:s.role==='atleta'?'athlete':s.role==='titolare'?'owner':'coach',uid:s.uid,gymId:s.gymId},
  b,BOOKING_GYM,configs.value.find(c=>c.coachId===b.coachId)?.cancelHours??12,Date.now())
}
function close(){stops.forEach(stop=>stop());stops=[]}
async function resolveNames(db:ReturnType<typeof getLocalEmulatorClients>['db'],rows:LiveReservation[]){
 if(!isCoach.value)return
 for(const id of [...new Set(rows.map(b=>b.athleteId))]){
  if(!alive||names.value[id])continue
  try{const r=await getDocFromServer(doc(db,'users',id));if(alive&&r.exists()&&r.data().gymId===BOOKING_GYM)
    names.value={...names.value,[id]:String(r.data().name||id)}}catch{ /* Nessuna esposizione di altri profili. */ }
 }
}
onMounted(async()=>{
 try{
  const s=await readVerifiedDevSession();if(!alive)return
  const {db,auth}=getLocalEmulatorClients()
  const profile=await assertBookingLabUser(db,s);if(!alive)return
  session.value=s;names.value={[s.uid]:profile.name}
  if(isCoach.value)draft.value=createCoachDefault(s.uid,profile.name)
  stops.push(onAuthStateChanged(auth,user=>{
   if(!alive)return
   if(!user||user.uid!==s.uid){close();status.value='error';message.value='Sessione Firebase terminata.';void router.replace('/dev/accesso')}
  }))
  stops.push(onSnapshot(collection(db,'gyms',BOOKING_GYM,bookingPaths.config),snap=>{
   if(!alive)return
   configs.value=snap.docs.map(d=>toCoachConfig(d.id,d.data())).filter((c):c is LiveCoachConfig=>!!c)
   if(!chosenCoach.value||!configs.value.some(c=>c.coachId===chosenCoach.value))chosenCoach.value=configs.value.find(c=>c.active)?.coachId||''
   const own=configs.value.find(c=>c.coachId===s.uid)
   if(own&&!edited.value)draft.value=JSON.parse(JSON.stringify(own)) as LiveCoachConfig
   snapshots.value++
  },e=>fail(e)))
  stops.push(onSnapshot(collection(db,'gyms',BOOKING_GYM,bookingPaths.slots),snap=>{
   if(!alive)return
   slots.value=snap.docs.map(d=>toSlot(d.data())).filter((x):x is Slot=>!!x)
   snapshots.value++
  },e=>fail(e)))
  const base=collection(db,'gyms',BOOKING_GYM,bookingPaths.reservations)
  // Gli atleti possono fare query solo sui propri booking: Security Rules non sono filtri.
  const source=s.role==='atleta'?query(base,where('athleteId','==',s.uid)):base
  stops.push(onSnapshot(source,snap=>{
   if(!alive)return
   allRows.value=snap.docs.map(d=>toReservation(d.id,d.data())).filter((b):b is LiveReservation=>!!b)
   snapshots.value++;void resolveNames(db,allRows.value)
  },e=>fail(e)))
  status.value='ready';message.value='Collegato soltanto a Firebase Emulator.'
 }catch(e){fail(e)}
})
function fail(e:unknown){
 if(!alive)return
 status.value='error';message.value=e instanceof Error?e.message:'Errore Firebase Emulator.';close()
}
onUnmounted(()=>{alive=false;close()})
watch([selectedDate,service,chosenCoach],()=>{chosenStart.value=null;approved.value=false})
watch(service,(next)=>{discipline.value=next==='pesi'?'Pesistica':'MMA'})
watch([coachFilter,serviceFilter,history,view],()=>{approved.value=false})
async function runWrite(fn:()=>Promise<void|string>){
 if(!approved.value||busy.value){message.value='Spunta prima la conferma per i dati fittizi.';return}
 busy.value=true
 try{await fn();message.value='Operazione completata su Firebase Emulator.'}
 catch(e){message.value=`Operazione non riuscita: ${e instanceof Error?e.message:String(e)}`}
 finally{busy.value=false;approved.value=false}
}
function mustSession(){if(!session.value||status.value!=='ready')throw new Error('ACCESSO_NON_VERIFICATO');return session.value}
async function makeBooking(){
 const c=chosenConfig.value,ms=chosenStart.value;if(!c||ms===null)return
 if(!availableTimes.value.some(x=>x.startMs===ms))return
 if(!window.confirm('Confermi la prenotazione SOLO nel Firebase Emulator?'))return
 await runWrite(async()=>{
  const {db}=getLocalEmulatorClients()
  await reserve(db,mustSession(),c,service.value,discipline.value,ms)
  athleteTab.value='mie';chosenStart.value=null
 })
}
async function cancelBookingRow(b:LiveReservation){
 if(!canRemove(b))return
 if(!window.confirm('Annullare questa prenotazione fittizia e liberare gli slot?'))return
 await runWrite(async()=>{
  const {db}=getLocalEmulatorClients()
  await cancelReservation(db,mustSession(),b.id)
 })
}
function editConfig(){edited.value=true;approved.value=false}
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
 if(!window.confirm('Preparare SOLO gli slot mancanti dei prossimi 7 giorni nell’emulatore?'))return
 await runWrite(async()=>{
  const {db}=getLocalEmulatorClients(),today=romeParts(Date.now()).date
  let created=0,already=0
  for(let i=1;i<=7;i++){
   const r=await prepareDaySlots(db,s,c,shiftDate(today,i));created+=r.created;already+=r.already
  }
  return `7 giorni: ${created} slot creati, ${already} già presenti.`
 })
}

async function persistAvailability(){const d=draft.value;if(!d)return
 const reason=validateConfig(d);if(reason){message.value=`Controlla disponibilità: ${reason}`;return}
 if(!window.confirm('Salvare la disponibilità SOLO nell’emulatore?'))return
 await runWrite(async()=>{
  const {db}=getLocalEmulatorClients();await saveCoachConfig(db,mustSession(),d);edited.value=false
 })
}
async function prepareDay(){const s=mustSession(),c=myConfig.value;if(!c)return
 if(!window.confirm(`Preparare gli slot aperti del ${selectedDate.value} SOLO nell’emulatore?`))return
 await runWrite(async()=>{
  const {db}=getLocalEmulatorClients();const result=await prepareDaySlots(db,s,c,selectedDate.value)
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
 <div class="stack" style="gap:18px" aria-label="Prenotazioni Firebase Emulator">
  <div class="booking-intro"><span class="eyebrow">LION FIT · FIREBASE EMULATOR · SOLO TEST</span>
   <h1 style="margin:4px 0">Prenotazioni</h1>
   <p class="muted">Area {{isCoach?'Coach / Admin':'Atleta'}} · {{session?.label||'account fittizio'}}</p>
   <div class="row booking-top-controls">
    
    <RouterLink class="ghost booking-return booking-control" :to="isCoach?'/coach/atleti?source=emulator':'/home?source=emulator'">← Torna all'app</RouterLink>
    <span class="pill">● Solo emulatore</span>
   </div>
  </div>
  <div v-if="status==='loading'" class="panel" role="status">Connessione al Firebase Emulator…</div>
  <div v-else-if="status==='error'" class="panel" role="alert">{{message}} <RouterLink to="/dev/accesso">Torna all'accesso</RouterLink></div>
  <template v-else>
   <div class="notice">{{message}} · {{snapshots}} aggiornamenti ricevuti · Solo dati fittizi. Nessuna operazione sulla produzione.</div>
   <template v-if="!isCoach">
    <div class="booking-tabs booking-main-tabs"><button :class="{selected:athleteTab==='prenota'}" @click="athleteTab='prenota'">Prenota</button><button :class="{selected:athleteTab==='mie'}" @click="athleteTab='mie'">Le mie prenotazioni</button></div>
    <template v-if="athleteTab==='prenota'">
     <h2 class="booking-section-title">1. Scegli il tuo percorso</h2>
     <div class="booking-choices booking-v1-services">
      <button class="booking-choice booking-service-card" :class="{selected:service==='fighter'}" @click="service='fighter'"><BookingServiceMark kind="fighter"/><strong>FIGHTER</strong><small>MMA, Boxe, K-1 e discipline da combattimento</small></button>
      <button class="booking-choice booking-service-card" :class="{selected:service==='pesi'}" @click="service='pesi'"><BookingServiceMark kind="pesi"/><strong>PESI</strong><small>Preparazione atletica e allenamento pesi</small></button>
     </div>
     <h2 class="booking-section-title">2. Seleziona il Coach</h2>
     <div v-if="!configs.length" class="notice">Nessun Coach configurato nell'emulatore. Accedi come Coach e prepara la disponibilità.</div>
     <div class="grid2"><button v-for="c in configs.filter(x=>x.active&&x.services[service])" :key="c.coachId" class="action-card" :class="{active:chosenCoach===c.coachId}" @click="chosenCoach=c.coachId">
      <span class="action-icon">🦁</span><div><strong>{{c.displayName}}</strong><small>{{displayService(service)}} · {{c.durations[service]}} minuti</small></div></button></div>
     <h2 class="booking-section-title">3. Tipo di incontro</h2>
     <section class="panel"><label>Disciplina / motivo</label><select v-model="discipline"><option>MMA</option><option>Boxe</option><option>K-1</option><option>Grappling</option><option>Pesistica</option><option>Preparazione atletica</option></select></section>
     <h2 class="booking-section-title">4. Scegli giorno e orario</h2>
     <section class="panel"><div class="row between"><button class="secondary" @click="moveDate(-1)">‹</button><strong>{{monthLabel}}</strong><button class="secondary" @click="moveDate(1)">›</button></div>
      <div class="booking-calendar" style="margin-top:20px"><div v-for="(n,i) in ['L','M','M','G','V','S','D']" :key="i" class="muted">{{n}}</div>
       <template v-for="(d,i) in monthDays" :key="i"><div v-if="!d"/><button v-else class="booking-day" :class="{selected:selectedDate===dateInMonth(d)}" @click="chooseDate(dateInMonth(d))">{{Number(d)}}</button></template></div></section>
     <section class="panel"><h2>{{selectedDate}} · {{shownDuration}} minuti</h2>
      <p v-if="!availableTimes.length" class="muted">Nessuno slot libero e prenotabile per questa data. Il Coach deve preparare orari validi nell'emulatore.</p>
      <div v-else class="times"><button v-for="slot in availableTimes" :key="slot.startMs" :class="{selected:chosenStart===slot.startMs}" @click="chosenStart=slot.startMs">{{slot.time}}</button></div>
      <p class="small muted">Sono ammessi solo slot consecutivi da 30 minuti, senza sovrapposizioni. L'orario è Europe/Rome.</p>
     </section>
     <section class="panel"><span class="eyebrow">RIEPILOGO</span><h2>{{displayService(service)}} · {{chosenConfig?.displayName||'Seleziona Coach'}}</h2>
      <p class="muted">{{selectedDate}} · {{chosenStart!==null?romeParts(chosenStart).time:'Nessun orario selezionato'}} · {{shownDuration}} min · {{discipline}}</p>
      <label class="checkline"><input v-model="approved" type="checkbox"/> Confermo di prenotare SOLO con dati fittizi del Firebase Emulator</label>
      <button class="primary wide" :disabled="busy||!approved||chosenStart===null" @click="makeBooking">Conferma prenotazione fittizia</button>
     </section>
    </template>
    <template v-else><section class="panel"><h2>Le mie prenotazioni</h2><p v-if="!myRows.length" class="muted">Nessuna prenotazione.</p>
      <article v-for="b in myRows" :key="b.id" class="event-item" style="display:block;margin:9px 0"><strong>{{localStart(b.startMs)}} · {{displayService(b.service)}} · {{b.durationMinutes}} min</strong>
       <p class="small muted">{{coachLabel(b.coachId)}} · {{b.discipline}} · {{b.status==='confirmed'?'Confermata':'Annullata'}}</p>
       <button v-if="canRemove(b)" class="danger" :disabled="busy||!approved" @click="cancelBookingRow(b)">Annulla e libera slot</button></article>
      <label class="checkline"><input v-model="approved" type="checkbox"/> Autorizzo l'eventuale annullamento SOLO nell'emulatore</label>
     </section></template>
   </template>
   <template v-else>
    <div class="booking-tabs booking-main-tabs"><button :class="{selected:coachTab==='calendario'}" @click="coachTab='calendario'">Calendario appuntamenti</button><button :class="{selected:coachTab==='disponibilita'}" @click="coachTab='disponibilita'">Gestione disponibilità</button></div>
    <template v-if="coachTab==='calendario'">
     <section class="panel"><div class="row between"><h2>Calendario condiviso</h2><div class="booking-tabs"><button v-for="v in (['day','week','month'] as const)" :key="v" :class="{selected:view===v}" @click="view=v">{{v==='day'?'Giorno':v==='week'?'Settimana':'Mese'}}</button></div></div>
      <div class="row booking-date-controls"><button class="secondary" @click="moveDate(-1)">‹</button><input type="date" :value="selectedDate" @change="chooseDate(($event.target as HTMLInputElement).value)"/><button class="secondary" @click="moveDate(1)">›</button>
       <div class="booking-tabs booking-coach-chips"><button :class="{selected:coachFilter==='all'}" @click="coachFilter='all'">Tutti</button><button v-for="c in configs" :key="c.coachId" :class="{selected:coachFilter===c.coachId}" @click="coachFilter=c.coachId"><i class="coach-dot" :class="coachColor(c.coachId)"/> {{c.displayName}}</button></div>
       <select v-model="coachFilter"><option value="all">Tutti i Coach</option><option v-for="c in configs" :key="c.coachId" :value="c.coachId">{{c.displayName}}</option></select>
       <select v-model="serviceFilter"><option value="all">Fighter e Pesi</option><option value="fighter">Fighter</option><option value="pesi">Pesi</option></select>
       <select v-model="history"><option value="next">Prossimi</option><option value="history">Storico / annullati</option><option value="all">Tutti</option></select>
      </div>
     </section>
     <section v-if="view==='day'" class="panel booking-period"><h3>{{selectedDate}} · {{todayEvents.length}} appuntamenti</h3>
      <p v-if="!todayEvents.length" class="muted">Nessun appuntamento.</p><article v-for="b in todayEvents" :key="b.id" class="event-item"><i class="coach-dot" :class="coachColor(b.coachId)"/><strong>{{localStart(b.startMs)}} · {{nameLabel(b.athleteId)}}</strong><span>{{displayService(b.service)}} · {{coachLabel(b.coachId)}} · {{b.status}}</span>
       <button v-if="canRemove(b)" class="danger" :disabled="busy||!approved" @click="cancelBookingRow(b)">Annulla</button></article>
     </section>
     <section v-else-if="view==='week'" class="panel booking-period"><h3>Settimana del {{weekDates[0]}} · {{events.length}} appuntamenti</h3>
      <div v-for="day in weekDates" :key="day" class="week-event-day"><strong>{{day}}</strong><span class="event-count">{{eventsOn(day).length}}</span><article v-for="b in eventsOn(day)" :key="b.id" class="event-item"><i class="coach-dot" :class="coachColor(b.coachId)"/> {{romeParts(b.startMs).time}} · {{nameLabel(b.athleteId)}} · {{coachLabel(b.coachId)}} · {{displayService(b.service)}} <button v-if="canRemove(b)" class="danger" :disabled="busy||!approved" @click="cancelBookingRow(b)">Annulla</button></article></div>
     </section>
     <section v-else class="panel booking-period"><h3>{{monthLabel}} · {{events.length}} appuntamenti</h3>
      <div class="coach-month-grid"><span v-for="(n,i) in ['L','M','M','G','V','S','D']" :key="i" class="coach-month-weekday">{{n}}</span>
       <template v-for="(d,i) in monthDays" :key="i"><span v-if="!d" class="month-empty"/><button v-else class="coach-month-day" :class="{selected:selectedDate===dateInMonth(d)}" @click="chooseDate(dateInMonth(d))"><b>{{Number(d)}}</b><small>{{counts[dateInMonth(d)]||0}} appuntamenti</small><span class="coach-month-dots" :aria-label="coachIdsOn(dateInMonth(d)).map(coachLabel).join(', ')"><i v-for="uid in coachIdsOn(dateInMonth(d))" :key="uid" class="coach-dot" :class="coachColor(uid)"/></span></button></template>
      </div><p class="small muted">Clicca sul giorno per selezionarlo, poi passa a Giorno per i dettagli.</p>
     </section>
     <section class="panel"><label class="checkline"><input v-model="approved" type="checkbox"/> Autorizzo la cancellazione di prenotazioni fittizie del solo Firebase Emulator</label></section>
    </template>
    <template v-else><section class="panel"><h2>Disponibilità del Coach autenticato</h2><p class="muted">Solo il Coach proprietario può salvare la propria configurazione. Il titolare può preparare slot degli altri Coach solo con funzioni amministrative dedicate, qui disabilitate.</p>
      <template v-if="draft">
       <label>Nome pubblico del Coach<input :value="draft.displayName" maxlength="100" @input="draft.displayName=($event.target as HTMLInputElement).value;editConfig()"/></label>
       <label class="checkline"><input :checked="draft.active" type="checkbox" @change="draft.active=($event.target as HTMLInputElement).checked;editConfig()"/> Disponibilità attiva</label>
       <div class="grid2"><label class="checkline"><input :checked="draft.services.fighter" type="checkbox" @change="draft.services.fighter=($event.target as HTMLInputElement).checked;editConfig()"/> FIGHTER abilitato</label>
        <label class="checkline"><input :checked="draft.services.pesi" type="checkbox" @change="draft.services.pesi=($event.target as HTMLInputElement).checked;editConfig()"/> PESI abilitato</label>
        <label>Durata Fighter<select :value="draft.durations.fighter" @change="draft.durations.fighter=Number(($event.target as HTMLSelectElement).value) as 60|120;editConfig()"><option :value="60">60 minuti</option><option :value="120">120 minuti</option></select></label>
        <label>Durata Pesi<select :value="draft.durations.pesi" @change="draft.durations.pesi=Number(($event.target as HTMLSelectElement).value) as 60|120;editConfig()"><option :value="60">60 minuti</option><option :value="120">120 minuti</option></select></label>
        <label>Preavviso (ore)<input type="number" min="0" max="168" :value="draft.noticeHours" @input="draft.noticeHours=Number(($event.target as HTMLInputElement).value);editConfig()"/></label>
        <label>Disdetta (ore)<input type="number" min="0" max="168" :value="draft.cancelHours" @input="draft.cancelHours=Number(($event.target as HTMLInputElement).value);editConfig()"/></label>
        <label>Prenotabile entro (giorni)<input type="number" min="1" max="30" :value="draft.maxDays" @input="draft.maxDays=Number(($event.target as HTMLInputElement).value);editConfig()"/></label>
       </div><div class="grid2" style="margin-top:16px"><label>Validità disponibilità<select :value="draft.mode||'always'" @change="draft.mode=($event.target as HTMLSelectElement).value as 'always'|'period';editConfig()"><option value="always">Sempre</option><option value="period">Solo per un periodo</option></select></label></div>
       <div v-if="draft.mode==='period'" class="grid2"><label>Dal<input type="date" :value="draft.from" @change="draft.from=($event.target as HTMLInputElement).value;editConfig()"/></label><label>Al<input type="date" :value="draft.to" @change="draft.to=($event.target as HTMLInputElement).value;editConfig()"/></label></div>
       <h3 style="margin-top:22px">Settimana tipo · massimo 4 fasce per giorno</h3>
       <button class="secondary" type="button" @click="fillDefaultWeek">Precompila Lun–Sab 09:00–13:00 (solo modulo)</button>
       <div class="availability-grid"><div v-for="day in weekdays" :key="day.id" class="line-card"><div class="row between"><strong>{{day.label}}</strong><input type="checkbox" :checked="draft.weekly[day.id as keyof typeof draft.weekly]?.enabled??false" @change="setWeeklyDay(day.id,'enabled',($event.target as HTMLInputElement).checked)"/></div>
        <div v-for="(band,i) in (draft.weekly[day.id as keyof typeof draft.weekly]?.ranges||[])" :key="i" class="row"><input type="time" step="1800" style="max-width:125px" :value="bandFrom(band)" @change="draft!.weekly[day.id as keyof typeof draft.weekly]!.ranges[i]={from:($event.target as HTMLInputElement).value,to:bandTo(band)};editConfig()"/>
         <input type="time" step="1800" style="max-width:125px" :value="bandTo(band)" @change="draft!.weekly[day.id as keyof typeof draft.weekly]!.ranges[i]={from:bandFrom(band),to:($event.target as HTMLInputElement).value};editConfig()"/>
         <button type="button" class="bare" :disabled="(draft.weekly[day.id as keyof typeof draft.weekly]?.ranges.length||0)<=1" @click="removeBand(day.id,i)">×</button></div>
        <button class="ghost" :disabled="(draft.weekly[day.id as keyof typeof draft.weekly]?.ranges.length||0)>=4" @click="addBand(day.id)">+ Fascia</button></div></div>
       <h3>Eccezioni e ferie</h3><div class="grid2"><label>Giorno<input v-model="exceptDate" type="date"/></label><label>Tipo<select v-model="exceptKind"><option value="closed">Chiudi questo giorno</option><option value="special">Orario speciale</option></select></label>
        <label v-if="exceptKind==='special'">Dalle<input v-model="exceptFrom" type="time" step="1800"/></label><label v-if="exceptKind==='special'">Alle<input v-model="exceptTo" type="time" step="1800"/></label></div>
       <button class="secondary" @click="addException">+ Aggiungi eccezione</button>
       <div v-for="(val,date) in draft.exceptions||{}" :key="date" class="row"><small>{{date}} · {{val.enabled?'Orario speciale':'Chiuso'}}</small><button class="bare" @click="removeException(String(date))">Rimuovi</button></div>
       <div class="grid2"><label>Ferie dal<input v-model="holidayFrom" type="date"/></label><label>Ferie al<input v-model="holidayTo" type="date"/></label></div><button class="secondary" @click="addHoliday">+ Aggiungi ferie</button>
       <div v-for="(holiday,i) in draft.holidays||[]" :key="i" class="row"><small>Ferie {{holiday.from}} — {{holiday.to}}</small><button class="bare" @click="removeHoliday(i)">Rimuovi</button></div>
       <p class="small muted">Le variazioni agli orari non eliminano prenotazioni già confermate.</p>
       <label class="checkline"><input v-model="approved" type="checkbox"/> Autorizzo questa scrittura SOLO nel Firebase Emulator</label>
       <button class="primary wide" :disabled="busy||!approved" @click="persistAvailability">Salva disponibilità</button>
       <hr/><h3>Prepara slot del giorno selezionato</h3><p class="muted small">Crea soltanto slot mancanti e futuri da 30 minuti; non sovrascrive mai quelli esistenti o prenotati.</p>
       <input v-model="selectedDate" type="date"/><label class="checkline"><input v-model="approved" type="checkbox"/> Confermo la preparazione sul solo emulatore</label>
       <button class="primary wide" :disabled="busy||!approved||!myConfig||edited" @click="prepareDay">Prepara slot del {{selectedDate}}</button>
       <button class="secondary wide" :disabled="busy||!approved||!myConfig||edited" @click="prepareNextWeek">Prepara i prossimi 7 giorni · solo emulatore</button>
       <p v-if="edited" class="small muted">Salva prima la configurazione per preparare nuovi slot.</p>
      </template>
     </section></template>
   </template>
  </template>
 </div>
</template>
