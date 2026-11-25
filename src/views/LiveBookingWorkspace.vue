<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import CompetitionCover from '../components/CompetitionCover.vue'
import AgendaCompetitions from '../components/AgendaCompetitions.vue'
import {watchCompetitionEnabled,watchCompetitionEvents,watchCompetitionEntries} from '../integrations/firestore/competitions'
import {nextCompetition,confirmedCompetitions,type CompetitionEvent,type CompetitionEntry} from '../features/bookings/competitionModel'
import {groupBookingEnabled,groupLabel,MAX_PRIVATE_PARTICIPANTS} from '../features/bookings/groupBooking'
import LionIcon from '../components/LionIcon.vue'
import CoachAppointment from '../components/CoachAppointment.vue'
import {coachInboxEnabled} from '../integrations/firebase/coachInbox'
import {upcomingRows,groupAgendaRows,upcomingQueryWindow,disjointMove} from '../features/bookings/agendaOverview'
import {AgendaBackTrail,type AthleteAgendaScreen,type AgendaPosition} from '../features/bookings/agendaBackTrail'
/** Prenotazioni LIVE: le scritture richiedono un clic esplicito, un account verificato
 * e Rules Firebase; cancellazioni e sincronizzazioni massive chiedono conferma. */
import { computed,onMounted,onUnmounted,ref,watch,nextTick } from 'vue'
import { RouterLink, useRouter,useRoute } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, documentId, getDocFromServer, onSnapshot, query, where, Timestamp, type Unsubscribe }  from 'firebase/firestore'
import { readStagingSession, type StagingSession } from '../integrations/firebase/stagingSession'
import { getStagingClients } from '../integrations/firebase/stagingClient'
import { useLabStore } from '../stores/lab'
import {
  bookingPaths, assertBookingLiveUser, cancelReservation,
  createCoachDefault, prepareDaySlots, synchronizeCoachAvailability, reserve, rescheduleReservation,
  toCoachConfig,toReservation,toSlot, type LiveCoachConfig,type LiveReservation
} from '../integrations/firestore/liveBookings'
import {
  candidateSlots, canCancel, countsByDay, coachColorIndex, bookingDisplayStatus, disciplineAllowed, SERVICE_DISCIPLINES, addCalendarMonth, filterBookings, mondayOf, romeParts, shiftDate,
  validateConfig, type BookingFilter, type CalendarView, type Service, type Slot, type Range
} from '../features/bookings/bookingPolicy'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {reservationQueryPredicates,canListPrivateCoachProfiles} from '../features/security/phase1QueryScope'
import {athleteSlotMonthWindow} from '../features/bookings/monthQueryWindow'
import {createBoundedLookup} from '../features/bookings/boundedLookup'
const router=useRouter(),route=useRoute(),lab=useLabStore()
const status=ref<'loading'|'ready'|'error'>('loading'),message=ref('Verifica account reale…')
const session=ref<StagingSession|null>(null)
const configs=ref<LiveCoachConfig[]>([]),slots=ref<Slot[]>([]),allRows=ref<LiveReservation[]>([])
const names=ref<Record<string,string>>({})
const coachRoster=ref<{id:string;name:string}[]>([])
const availabilityProgress=ref(''),availabilityFeedback=ref('')
const calendarWarning=ref(''),availabilityWarning=ref(''),nowMs=ref(Date.now())
let clockTimer:ReturnType<typeof setInterval>|null=null
let lookupClosed=false
const nameLookup=createBoundedLookup<string>(4,async id=>{
 const s=session.value;if(!alive||lookupClosed||!s||s.role==='atleta'||names.value[id])return
 const {db,auth}=getStagingClients(),gid=s.gymId
 if(auth.currentUser?.uid!==s.uid)return
 const r=await getDocFromServer(doc(db,'users',id))
 if(alive&&!lookupClosed&&session.value?.uid===s.uid&&session.value?.gymId===gid&&auth.currentUser?.uid===s.uid&&r.exists()&&r.data().gymId===gid)
  names.value={...names.value,[id]:[r.data().name,r.data().surname].filter(Boolean).join(' ')||'Atleta'}
})
const selectedDate=ref(romeParts(Date.now()).date),month=ref(selectedDate.value.slice(0,7))
const service=ref<Service>('fighter'),chosenCoach=ref(''),discipline=ref('MMA'),chosenStart=ref<number|null>(null),privateParticipants=ref(1)
const athleteTab=ref<AthleteAgendaScreen>('agenda'),coachTab=ref<'calendario'|'disponibilita'|'competizioni'>('calendario')
const coachFilter=ref('all'),serviceFilter=ref<'all'|Service>('all'),history=ref<'next'|'history'|'all'>('all')
const view=ref<CalendarView>('day'),busy=ref(false)
const upcomingMode=ref(true),filtersOpen=ref(false),rowsLoading=ref(true),expandedBooking=ref('')
const moving=ref<LiveReservation|null>(null)
const coachAppointmentOpen=ref(false)
const athleteTrail=new AgendaBackTrail()
let restoringAthleteTab=false
function agendaPosition():AgendaPosition{return {windowTop:window.scrollY,mainTop:document.querySelector<HTMLElement>('.main-layout')?.scrollTop||0}}
function restoreAgendaPosition(position:AgendaPosition){void nextTick(()=>{if(route.path!=='/prenotazioni')return;window.scrollTo({top:position.windowTop,behavior:'instant'});const main=document.querySelector<HTMLElement>('.main-layout');if(main)main.scrollTop=position.mainTop})}
watch(athleteTab,(next)=>{if(!restoringAthleteTab)athleteTrail.visit(next,agendaPosition())},{flush:'sync'})
function replaceAthleteTab(next:AthleteAgendaScreen){athleteTrail.replace(next);restoringAthleteTab=true;try{athleteTab.value=next}finally{restoringAthleteTab=false}}
function backWithinAthleteAgenda():boolean{
 if(route.path!=='/prenotazioni'||isCoach.value||athleteTab.value==='agenda')return false
 if(busy.value)return true // Do not leave a booking transaction in flight.
 const previous=athleteTrail.back()
 if(!previous)return false
 if(moving.value){moving.value=null;chosenStart.value=null;privateParticipants.value=1}
 restoringAthleteTab=true
 try{athleteTab.value=previous.screen}finally{restoringAthleteTab=false}
 restoreAgendaPosition(previous.position)
 return true
}
function handleLocalAgendaBack(event:Event){if(backWithinAthleteAgenda())event.preventDefault()}
onMounted(()=>window.addEventListener('lionfit:local-back',handleLocalAgendaBack))
onUnmounted(()=>window.removeEventListener('lionfit:local-back',handleLocalAgendaBack))

function coachAppointmentCreated(id:string,date:string){coachAppointmentOpen.value=false;coachFilter.value='all';serviceFilter.value='all';history.value='all';chooseDate(date);openUpcoming();expandedBooking.value=id;message.value='Appuntamento confermato.'}
watch(()=>route.query.inbox,v=>{if(typeof v==='string'&&v&&route.path==='/prenotazioni')athleteTab.value='mie'},{immediate:true})

const competitionEnabled=ref(false),competitionLoading=ref(false),competitionEvents=ref<CompetitionEvent[]>([]),competitionEntries=ref<CompetitionEntry[]>([]),competitionWarning=ref('')
let competitionStops:Unsubscribe[]=[]
const heroEvent=computed(()=>nextCompetition(competitionEvents.value,nowMs.value))
const myEventDates=computed(()=>confirmedCompetitions(competitionEvents.value,competitionEntries.value))
const myCalendarRows=computed(()=>[...myRows.value.filter(b=>b.status==='confirmed').map(b=>({id:'b_'+b.id,startMs:b.startMs,title:b.discipline,description:coachLabel(b.coachId)+' · Lezione privata · '+groupLabel(b.participantCount),kind:'booking'})),...myEventDates.value.map(e=>({id:'e_'+e.id,startMs:e.startMs,title:e.title,description:e.location+' · Competizione',kind:'competition'}))].sort((a,b)=>a.startMs-b.startMs))
const calendarPersonalPeriod=ref<'next'|'past'>('next'),selectedCompetitionId=ref('')
function openCompetition(id=''){selectedCompetitionId.value=id;if(isCoach.value)coachTab.value='competizioni';else athleteTab.value='competizioni'}
function showAthleteCompetitionMode(mode:'events'|'results'){selectedCompetitionId.value='';athleteTab.value=mode==='results'?'risultati':'competizioni'}
watch([()=>route.query.competitionId,competitionEnabled],([id,enabled])=>{
 if(!enabled||typeof id!=='string'||!/^[A-Za-z0-9]{20}$/.test(id))return
 if(route.path==='/prenotazioni'||route.path==='/coach/prenotazioni')openCompetition(id)
},{immediate:true})
const calendarPersonalRows=computed(()=>myCalendarRows.value.filter(r=>calendarPersonalPeriod.value==='next'?r.startMs>=nowMs.value:r.startMs<nowMs.value))
function clearCompetitionData(){competitionStops.forEach(stop=>stop());competitionStops=[];competitionEnabled.value=false;competitionLoading.value=false;competitionEvents.value=[];competitionEntries.value=[];if(athleteTab.value==='competizioni'||athleteTab.value==='risultati')athleteTab.value='agenda';if(coachTab.value==='competizioni')coachTab.value='calendario'}
function subscribeCompetitionModule(db:ReturnType<typeof getStagingClients>['db'],s:StagingSession){
 stops.push(watchCompetitionEnabled(db,s.gymId,enabled=>{
  if(!alive||enabled===competitionEnabled.value)return;clearCompetitionData();competitionWarning.value='';competitionEnabled.value=enabled;if(!enabled)return
  let eventsReady=false,entriesReady=s.role!=='atleta';competitionLoading.value=true
  const settled=()=>{competitionLoading.value=!(eventsReady&&entriesReady)}
  const onError=(e:Error)=>{if(!alive)return;clearCompetitionData();competitionWarning.value='Competizioni non aggiornate: '+e.message}
  competitionStops.push(watchCompetitionEvents(db,s.gymId,rows=>{if(!alive||!competitionEnabled.value)return;competitionEvents.value=rows;eventsReady=true;settled()},onError))
  if(s.role==='atleta')competitionStops.push(watchCompetitionEntries(db,s.gymId,{athlete:s.uid},rows=>{if(alive&&competitionEnabled.value){competitionEntries.value=rows;entriesReady=true;settled()}},onError))
 },()=>{if(alive){clearCompetitionData()}}))
}

const upcoming=computed(()=>upcomingRows(allRows.value,nowMs.value,coachFilter.value,serviceFilter.value))
const agendaGroups=computed(()=>groupAgendaRows(upcoming.value))
const myUpcoming=computed(()=>upcomingRows(myRows.value,nowMs.value))
const dateTitle=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'long',timeZone:'Europe/Rome'})
function calendarView(next:CalendarView){view.value=next;upcomingMode.value=false;expandedBooking.value=''}
function openUpcoming(){upcomingMode.value=true;expandedBooking.value=''}
function toggleDetails(id:string){expandedBooking.value=expandedBooking.value===id?'':id}
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
const nameLabel=(uid:string)=>names.value[uid]||'Atleta'
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
const availableTimes=computed(()=>candidates.value.filter(c=>c.free&&(!moving.value||disjointMove(moving.value,c.startMs))))
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
watch(()=>[route.query.date,route.query.bookingId],()=>{const date=route.query.date,id=route.query.bookingId;if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&typeof id==='string'&&route.path==='/coach/prenotazioni'){chooseDate(date);upcomingMode.value=false;view.value='day';coachTab.value='calendario';expandedBooking.value=id}},{immediate:true})
function chooseDate(date:string){if(!date)return;selectedDate.value=date;month.value=date.slice(0,7);chosenStart.value=null}
function chooseMonthDay(date:string){chooseDate(date);calendarView('day')}
function moveAthleteMonth(n:number){chooseDate(addCalendarMonth(month.value+'-01',n))}
function today(){chooseDate(romeParts(nowMs.value).date);calendarView('day')}
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
  if(candidateSlots(coach,slots.value,service.value,date,nowMs.value).some(s=>s.free&&(!moving.value||disjointMove(moving.value,s.startMs))))available.add(date)
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
function close(){lookupClosed=true;nameLookup.close();clearCompetitionData();stops.forEach(stop=>stop());stops=[];reservationStop?.();reservationStop=null;slotStop?.();slotStop=null}
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
 rowsLoading.value=true;calendarWarning.value='';allRows.value=[]
 const {db}=getStagingClients(),base=collection(db,'gyms',bookingGym,bookingPaths.reservations)
 const bounds=upcomingMode.value?upcomingQueryWindow(nowMs.value):localMonthWindow()
 // Coach attivi: calendario condiviso della palestra, con intervallo temporale limitato.
 // Atleta: solo prenotazioni con il proprio UID.
 const predicates=reservationQueryPredicates(s.role,s.uid,bounds.from,bounds.to)
 const source=query(base,...predicates.map(p=>where(p.field,p.operator,
  p.field==='startAt'?Timestamp.fromMillis(p.value as number):p.value)))
 reservationStop=onSnapshot(source,snap=>{
  if(!alive)return
  calendarWarning.value='';rowsLoading.value=false
  allRows.value=snap.docs.map(d=>toReservation(d.id,d.data())).filter((b):b is LiveReservation=>!!b)
  snapshots.value++;resolveNames(allRows.value)
 },e=>{if(alive){rowsLoading.value=false;allRows.value=[];calendarWarning.value='Prenotazioni non aggiornate: '+e.message}})
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
function resolveNames(rows:LiveReservation[]){
 if(!isCoach.value||lookupClosed)return
 nameLookup.add(rows.map(b=>b.athleteId).filter(id=>!names.value[id]))
}
onMounted(async()=>{
 clockTimer=setInterval(()=>{nowMs.value=Date.now()},60_000)
 try{
  const s=await readStagingSession();if(!alive)return
  bookingGym=s.gymId
  const {db,auth}=getStagingClients()
  const profile=await assertBookingLiveUser(db,s);if(!alive)return
  session.value=s;names.value={[s.uid]:profile.name};subscribeCompetitionModule(db,s)
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
watch([session,()=>upcomingMode.value?'upcoming:'+romeParts(nowMs.value).date:month.value],()=>{if(session.value&&alive)listenReservations()})
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
 const old=moving.value
 if(old&&!window.confirm('Confermi lo spostamento? Il vecchio appuntamento verrà liberato soltanto se il nuovo orario è confermato.'))return
 await runWrite(async()=>{
  const {db}=getStagingClients()
  if(old){await rescheduleReservation(db,mustSession(),old.id,ms);moving.value=null}else await reserve(db,mustSession(),c,service.value,discipline.value,ms,privateParticipants.value)
  privateParticipants.value=1
  replaceAthleteTab('mie');chosenStart.value=null
  return old?'Appuntamento spostato. Il nuovo orario è confermato.':'Prenotazione confermata.'
 })
}
function canMove(b:LiveReservation){const c=configs.value.find(c=>c.coachId===b.coachId);return !b.createdByCoach&&!isCoach.value&&canRemove(b)&&!!c&&c.active&&c.services[b.service]&&c.durations[b.service]===b.durationMinutes&&disciplineAllowed(b.service,b.discipline)}
async function beginMove(b:LiveReservation){if(!canMove(b)||busy.value)return;moving.value=b;privateParticipants.value=b.participantCount;service.value=b.service;chosenCoach.value=b.coachId;chooseDate(romeParts(b.startMs).date);athleteTab.value='prenota';await nextTick();discipline.value=b.discipline;chosenStart.value=null}
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
 <div v-lf-entrance="{id:'agenda-heading',premiumOnly:true,rows:[{match:'.booking-intro'}]}" class="stack lf-agenda13" :class="{'lf-agenda-coach':isCoach}" :data-r9-athlete="!isCoach" aria-label="Agenda Lion Fit">
  <div v-if="isCoach||athleteTab==='agenda'" class="booking-intro">
   <h1 style="margin:4px 0">{{uiText("Agenda")}}</h1>
   <p v-if="isCoach" class="lf-agenda-subtitle">Prenotazioni, disponibilità e appuntamenti della tua palestra.</p>
   <p v-else class="lf-r9-home-intro">Lezioni private, appuntamenti e competizioni</p>
  </div>
  <div v-lf-quiet-loading v-if="status==='loading'" class="panel lf-quiet-status" role="status">{{uiText("Caricamento agenda…")}}</div>
  <div v-else-if="status==='error'" class="panel" role="alert">{{message}} <RouterLink to="/accesso">{{uiText("Torna all'accesso")}}</RouterLink></div>
  <template v-else>
   <p v-if="calendarWarning" class="notice" role="alert">{{calendarWarning}}</p><p v-if="competitionWarning" class="notice" role="alert">{{competitionWarning}}</p><p v-if="availabilityWarning&&!isCoach" class="notice" role="alert">{{availabilityWarning}}</p>
   <p v-if="availabilityFeedback" class="notice" role="status" aria-live="polite">{{availabilityFeedback}}</p>
   <p v-if="message&&message!=='Calendario sincronizzato.'" class="small muted" role="status">{{message}}</p>
   <template v-if="!isCoach">
    <div v-if="athleteTab==='agenda'" v-lf-entrance="{id:'agenda-athlete-home',premiumOnly:true,rows:[{match:'.lf-agenda-hero,.lf-agenda-tiles,.lf-r9-upcoming'}]}" class="lf-agenda-athlete-home">
      <div class="lf-agenda-hero lf-r9-hero">
       <div class="lf-agenda-hero-cover"><CompetitionCover :gym="session?.gymId||''" :event-id="heroEvent?.id" :cover-id="heroEvent?.coverId"/></div>
       <span class="eyebrow">{{heroEvent?'PROSSIMO EVENTO':'LA TUA AGENDA'}}</span>
       <h2>{{heroEvent?.title||'Organizza il tuo allenamento'}}</h2>
       <p v-if="heroEvent">{{dateTitle(romeParts(heroEvent.startMs).date)+' · '+formatTime(heroEvent.startMs)+' · '+heroEvent.location}}</p>
       <p v-else>Lezioni, appuntamenti e gare in un unico posto.</p>
       <button v-if="heroEvent" class="secondary lf-r9-hero-cta" type="button" @click="openCompetition(heroEvent.id)">Scopri l’evento <LionIcon name="chevron" :size="17"/></button>
       <button v-else class="secondary lf-r9-hero-cta" type="button" @click="athleteTab='prenota'">Prenota una lezione <LionIcon name="chevron" :size="17"/></button>
      </div>
      <div class="lf-agenda-tiles lf-r9-agenda-tiles" aria-label="Azioni agenda">
       <button class="action-card lf-r9-tile" type="button" @click="athleteTab='prenota'"><LionIcon name="calendar-plus" :size="26"/><strong>Prenota lezione</strong><small>Singola o di gruppo</small></button>
       <button class="action-card lf-r9-tile" type="button" @click="athleteTab='calendario'"><LionIcon name="calendar" :size="26"/><strong>Calendario</strong><small>I tuoi appuntamenti</small></button>
       <button v-if="competitionEnabled" class="action-card lf-r9-tile lf-r9-tile-full" type="button" @click="openCompetition()"><LionIcon name="trophy" :size="27"/><span><strong>Gare e risultati</strong><small>Competizioni, partecipazioni e risultati</small></span><LionIcon name="chevron" :size="20"/></button>
      </div>
      <section class="panel lf-agenda-list lf-r9-upcoming">
       <div class="lf-r9-section-heading"><h2>Le mie prossime lezioni</h2><button type="button" class="lf-r9-inline-link" @click="athleteTab='mie';myHistory='next'">Vedi tutte <LionIcon name="chevron" :size="15"/></button></div>
       <p v-lf-quiet-loading v-if="rowsLoading" role="status" class="muted lf-quiet-status">Caricamento appuntamenti…</p>
       <div v-else-if="!calendarWarning&&!myUpcoming.length" class="lf-r9-empty"><LionIcon name="calendar" :size="24"/><div><strong>Nessuna lezione prenotata</strong><small>Puoi prenotare una lezione quando preferisci.</small></div></div>
       <button v-for="b in myUpcoming" :key="b.id" type="button" class="lf-agenda-row" @click="athleteTab='mie';myHistory='next'"><div class="lf-agenda-time"><b>{{formatTime(b.startMs)}}</b><small>{{dateTitle(romeParts(b.startMs).date)}}</small></div><div class="lf-agenda-person"><strong>{{b.discipline}}</strong><small>{{coachLabel(b.coachId)}} · {{b.durationMinutes}} min · {{groupLabel(b.participantCount)}}</small></div><LionIcon name="chevron" :size="18"/></button>
      </section>
    </div>
    <AgendaCompetitions v-else-if="(athleteTab==='competizioni'||athleteTab==='risultati')&&competitionEnabled&&session" :session="session" :events="competitionEvents" :entries="competitionEntries" :mode="athleteTab==='risultati'?'results':'events'" :initial-event-id="athleteTab==='competizioni'?selectedCompetitionId:''" :now="nowMs" :loading="competitionLoading" @back="backWithinAthleteAgenda()" @mode-change="showAthleteCompetitionMode"/>
     <section v-else-if="athleteTab==='calendario'" class="panel lf-agenda-list lf-r9-calendar">
      <div class="lf-r9-section-heading"><div><h2>Il mio calendario</h2><p class="muted small">Le tue lezioni e le gare confermate</p></div><select v-model="calendarPersonalPeriod" aria-label="Periodo"><option value="next">Prossimi</option><option value="past">Passati</option></select></div>
      <p v-lf-quiet-loading v-if="rowsLoading||competitionLoading" class="muted lf-quiet-status">Caricamento…</p>
      <div v-else-if="!calendarPersonalRows.length&&!calendarWarning&&!competitionWarning" class="lf-r9-empty"><LionIcon name="calendar" :size="23"/><div><strong>Nessun impegno in questo periodo</strong><small>Le lezioni prenotate e le gare confermate appariranno qui.</small></div></div>
      <button v-for="r in calendarPersonalRows" :key="r.id" type="button" class="lf-agenda-row lf-r9-calendar-row" @click="r.kind==='booking'?(athleteTab='mie',myHistory=calendarPersonalPeriod==='next'?'next':'history'):openCompetition(r.id.slice(2))"><div class="lf-agenda-time"><b>{{formatTime(r.startMs)}}</b><small>{{dateTitle(romeParts(r.startMs).date)}}</small></div><div class="lf-agenda-person"><strong><LionIcon :name="r.kind==='competition'?'trophy':'calendar'" :size="16"/> {{r.title}}</strong><small>{{r.description}}</small></div><LionIcon name="chevron" :size="17"/></button>
     </section>
    <div v-else v-lf-motion-tabs class="booking-tabs booking-main-tabs lf-agenda-main"><button :class="{selected:athleteTab==='prenota'}" @click="athleteTab='prenota'">Prenota</button><button :class="{selected:athleteTab==='mie'}" @click="athleteTab='mie';moving=null">Le mie prenotazioni</button></div>
    <template v-if="athleteTab==='prenota'"><div class="lf-booking-v4-flow"><section v-if="moving" class="panel"><h2>Sposta appuntamento</h2><p class="small">Originale: {{localStart(moving.startMs)}} · {{coachLabel(moving.coachId)}} · {{groupLabel(moving.participantCount)}}. Scegli un orario libero non sovrapposto. La prenotazione originale resta valida fino al buon esito.</p><button class="secondary" @click="backWithinAthleteAgenda()">Annulla spostamento</button></section><template v-if="!moving">
     <h2 class="booking-section-title">{{uiText("1. Scegli il tuo percorso")}}</h2>
     <div class="booking-choices booking-v1-services">
      <button class="booking-choice booking-service-card" :class="{selected:service==='fighter'}" :aria-pressed="service==='fighter'" @click="service='fighter'"><img class="lf17b-category-photo lf17b-category-fighter" src="/lionfit-redesign/agenda-fighter.webp" width="1000" height="333" decoding="async" alt=""/><strong>FIGHTER</strong><small>{{uiText("MMA, Boxe, K-1 e discipline da combattimento")}}</small></button>
      <button class="booking-choice booking-service-card" :class="{selected:service==='pesi'}" :aria-pressed="service==='pesi'" @click="service='pesi'"><img class="lf17b-category-photo lf17b-category-pesi" src="/lionfit-redesign/agenda-pesi.webp" width="1000" height="333" decoding="async" alt=""/><strong>PESI</strong><small>{{uiText("Preparazione atletica e allenamento pesi")}}</small></button>
     </div>
     <h2 class="booking-section-title">{{uiText("2. Seleziona il Coach")}}</h2>
     <div v-if="!configs.length" class="notice">{{uiText("Nessun coach disponibile per le prenotazioni.")}}</div>
     <div class="grid2 lf-booking-v4-coaches"><button v-for="c in configs.filter(x=>x.active&&x.services[service])" :key="c.coachId" class="action-card lf-booking-coach-choice" :class="{'lf-booking-coach-selected':chosenCoach===c.coachId}" :aria-pressed="chosenCoach===c.coachId" @click="chosenCoach=c.coachId">
      <span class="action-icon">🦁</span><div><strong>{{c.displayName}}</strong><small>{{displayService(service)}} · {{c.durations[service]}} {{uiText("minuti")}}</small></div><span class="lf-booking-coach-check" aria-hidden="true">{{chosenCoach===c.coachId?'✓':'○'}}</span></button></div>
     <h2 class="booking-section-title">{{uiText("3. Tipo di incontro")}}</h2>
     <section class="panel"><h3 class="booking-reasons-title">{{service==='fighter'?'Disciplina Fighter':'Motivo della prenotazione Pesi'}}</h3><label class="lf-booking-v4-select-label"><select v-model="discipline" class="lf-booking-v4-select" aria-label="Seleziona disciplina o motivo"><option v-for="reason in serviceReasons" :key="reason" :value="reason">{{reason}}</option></select></label></section>
     <section class="panel lf-r8b-group-booking" aria-label="Numero partecipanti lezione privata"><h3>Per quante persone prenoti?</h3><p class="muted small">Sei tu il referente: le altre persone non devono avere un account LionFit.</p><div class="lf-r8b-people-choices" role="group" aria-label="Numero totale persone"><button v-for="n in MAX_PRIVATE_PARTICIPANTS" :key="n" type="button" :class="{'is-chosen':privateParticipants===n}" :aria-pressed="privateParticipants===n" @click="privateParticipants=n">{{n}} <small>{{n===1?'persona':'persone'}}</small></button></div><p v-if="privateParticipants>1&&!groupBookingEnabled()" class="muted small" role="status">L'opzione gruppo richiede l'attivazione delle regole Firebase R8B prima di confermare.</p></section>
     </template><h2 class="booking-section-title">{{moving?'Scegli un nuovo giorno e orario':uiText("4. Scegli giorno e orario")}}</h2>
     <section class="panel lf-booking-v4-calendar"><div class="row between"><button class="secondary" @click="moveAthleteMonth(-1)">‹</button><strong>{{monthLabel}}</strong><button class="secondary" @click="moveAthleteMonth(1)">›</button></div>
      <div class="booking-calendar" style="margin-top:20px"><div v-for="(n,i) in ['L','M','M','G','V','S','D']" :key="i" class="muted">{{n}}</div>
       <template v-for="(d,i) in monthDays" :key="i"><div v-if="!d"/><button v-else class="booking-day" :class="{selected:selectedDate===dateInMonth(d)}" :disabled="!monthDayAvailable(dateInMonth(d))" :title="monthDayAvailable(dateInMonth(d))?'Disponibile':'Nessun orario disponibile'" @click="chooseDate(dateInMonth(d))">{{Number(d)}}</button></template></div></section>
     <section class="panel lf-booking-v4-times"><h2>{{selectedDate}} · {{shownDuration}} {{uiText("minuti")}}</h2>
      <p v-if="!candidates.length" class="muted">{{uiText("Nessun orario disponibile.")}}</p>
      <div v-else class="times"><button v-for="slot in candidates" :key="slot.startMs" :disabled="!slot.free||(!!moving&&!disjointMove(moving,slot.startMs))" :class="{selected:chosenStart===slot.startMs,unavailable:!slot.free||(!!moving&&!disjointMove(moving,slot.startMs))}" :title="slot.busy?'Occupato':slot.late?'Preavviso minimo':'Disponibile'" @click="chosenStart=slot.startMs">{{slot.time}} <small v-if="!slot.free">{{slot.busy?'Occupato':'Preavviso'}}</small></button></div>
      <p class="small muted">{{uiText("Orari in fuso italiano.")}}</p>
     </section>
     <section class="panel lf-booking-v4-review"><span class="eyebrow">{{uiText("RIEPILOGO")}}</span><h2>{{displayService(service)}} · {{chosenConfig?.displayName||'Seleziona Coach'}}</h2>
      <p class="muted">{{selectedDate}} · {{chosenStart!==null?romeParts(chosenStart).time:'Nessun orario selezionato'}} · {{shownDuration}} min · {{discipline}}</p><p class="lf-r8b-people-recap">{{groupLabel(moving?moving.participantCount:privateParticipants)}} · un solo atleta collegato · un solo appuntamento</p>
      
      <button class="primary wide" :disabled="busy||chosenStart===null||!availableTimes.some(t=>t.startMs===chosenStart)||(!moving&&privateParticipants>1&&!groupBookingEnabled())" @click="makeBooking">{{moving?'Conferma spostamento':uiText("Conferma prenotazione")}}</button>
     </section>
    </div></template>
    <template v-else-if="athleteTab==='mie'"><section class="panel"><h2>{{uiText("Le mie prenotazioni")}}</h2><div v-lf-motion-tabs class="booking-tabs"><button :class="{selected:myHistory==='next'}" @click="myHistory='next'">{{uiText("Prossime")}}</button><button :class="{selected:myHistory==='history'}" @click="myHistory='history'">{{uiText("Storico")}}</button></div><p v-if="!visibleMyRows.length" class="muted">{{uiText("Nessuna prenotazione in questa sezione.")}}</p>
      <article v-for="b in visibleMyRows" :key="b.id" class="event-item" style="display:block;margin:9px 0"><strong>{{localStart(b.startMs)}} · {{displayService(b.service)}} · {{b.durationMinutes}} min</strong>
       <p class="small muted">{{coachLabel(b.coachId)}} · {{b.discipline}} · {{groupLabel(b.participantCount)}} · {{showStatus(b)}}</p><p v-if="b.createdByCoach" class="small"><strong>Fissato dal coach</strong></p><p v-if="b.note" style="white-space:pre-wrap;overflow-wrap:anywhere">{{b.note}}</p>
       <div class="row"><button v-if="canMove(b)" class="secondary" :disabled="busy" @click="beginMove(b)">Sposta</button><button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">{{uiText("Annulla e libera slot")}}</button></div></article>
      
     </section></template>
   </template>
   <template v-else>
    <div class="lf-agenda-coach-commandbar">
     <div v-lf-motion-tabs class="booking-tabs booking-main-tabs lf-agenda-main"><button :class="{selected:coachTab==='calendario'}" @click="coachTab='calendario'">Agenda</button><button :class="{selected:coachTab==='disponibilita'}" @click="coachTab='disponibilita'">Disponibilità</button><button v-if="competitionEnabled" :class="{selected:coachTab==='competizioni'}" @click="coachTab='competizioni'">Gare</button></div>
     <button v-if="coachTab==='calendario'&&coachInboxEnabled()&&session&&!coachAppointmentOpen" type="button" class="primary lf-agenda-create" @click="coachAppointmentOpen=true"><LionIcon name="calendar-plus" :size="19"/> Nuova prenotazione</button>
    </div>
    <template v-if="coachTab==='calendario'">
     <CoachAppointment v-if="coachInboxEnabled()&&session&&coachAppointmentOpen" :key="session.uid" :session="session" :initial-date="selectedDate" @close="coachAppointmentOpen=false" @created="coachAppointmentCreated"/>
     <section class="lf-agenda-toolbar" aria-label="Filtri agenda">
      <div class="lf-agenda-controls"><select v-model="coachFilter" aria-label="Filtra per coach"><option value="all">Tutti i coach</option><option v-for="c in coachChips" :key="c.id" :value="c.id">{{c.name}}</option></select><select :value="upcomingMode?'upcoming':view" aria-label="Vista calendario" @change="($event.target as HTMLSelectElement).value==='upcoming'?openUpcoming():calendarView(($event.target as HTMLSelectElement).value as CalendarView)"><option value="upcoming">Prossimi</option><option value="day">Giorno</option><option value="week">Settimana</option><option value="month">Mese</option></select><button type="button" class="secondary lf-agenda-filter" :aria-expanded="filtersOpen" @click="filtersOpen=!filtersOpen"><LionIcon name="filter" :size="18"/> Filtri</button></div>
      <div v-if="!upcomingMode" class="lf-agenda-date-controls"><button class="secondary" @click="moveDate(-1)" aria-label="Periodo precedente">‹</button><input type="date" :value="selectedDate" aria-label="Data calendario" @change="chooseDate(($event.target as HTMLInputElement).value)"/><button class="secondary" @click="moveDate(1)" aria-label="Periodo successivo">›</button><button class="secondary" @click="today">Oggi</button></div>
      <div v-if="filtersOpen" class="lf-agenda-controls lf-agenda-extra"><label>Servizio<select v-model="serviceFilter"><option value="all">Tutti i servizi</option><option value="fighter">Fighter</option><option value="pesi">Pesi</option></select></label><label v-if="!upcomingMode">Stato<select v-model="history"><option value="next">Prossimi</option><option value="history">Storico</option><option value="all">Tutti</option></select></label><button class="ghost" @click="coachFilter='all';serviceFilter='all';history='all'">Azzera filtri</button></div>
     </section>
     <p v-lf-quiet-loading v-if="rowsLoading" class="muted lf-quiet-status" role="status">Caricamento appuntamenti…</p>
     <section v-else-if="upcomingMode" class="lf-agenda-list" v-lf-entrance="{id:'agenda-list',premiumOnly:true,rows:[{match:'.lf-agenda-group'}]}"><div class="row between"><h2>{{upcoming.length}} appuntamenti</h2><small class="muted">Prossimi 31 giorni</small></div>
      <div v-if="!upcoming.length&&!calendarWarning" class="panel muted lf-agenda-empty" role="status"><span class="lf-r21c-empty-icon"><LionIcon name="calendar" :size="27"/></span><strong>Nessun appuntamento in programma</strong><small>Prova a modificare i filtri oppure crea una nuova prenotazione.</small><div class="lf-r21c-empty-actions"><button v-if="coachInboxEnabled()&&session" type="button" class="primary" @click="coachAppointmentOpen=true"><LionIcon name="calendar-plus" :size="16"/> Nuova prenotazione</button><button type="button" class="secondary" @click="coachTab='disponibilita'">Gestisci disponibilità</button></div></div>
      <div v-for="group in agendaGroups" :key="group.date" class="lf-agenda-group"><h3>{{dateTitle(group.date)}}</h3><div v-for="b in group.bookings" :key="b.id" class="lf-agenda-record"><button type="button" class="lf-agenda-row" :aria-expanded="expandedBooking===b.id" @click="toggleDetails(b.id)"><div class="lf-agenda-time"><b>{{formatTime(b.startMs)}}–{{endTime(b)}}</b><small class="lf-agenda-state">{{showStatus(b)}}</small></div><div class="lf-agenda-person"><strong>{{nameLabel(b.athleteId)}}</strong><small>{{b.discipline}} · {{coachLabel(b.coachId)}} · {{groupLabel(b.participantCount)}}</small></div><i class="coach-dot" :class="coachColor(b.coachId)"/><LionIcon name="chevron" :size="17"/></button><div v-if="expandedBooking===b.id" class="lf-agenda-detail"><p v-if="b.createdByCoach" class="small"><strong>Fissato dal coach</strong></p><p v-if="b.note" style="white-space:pre-wrap;overflow-wrap:anywhere">{{b.note}}</p><p>{{displayService(b.service)}} · {{groupLabel(b.participantCount)}} · {{b.durationMinutes}} min · {{dateTitle(group.date)}}</p><button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">Annulla appuntamento</button></div></div></div>
     </section>
     <section v-else-if="view==='day'" class="panel booking-period"><h3>{{dateTitle(selectedDate)}} · {{todayEvents.length}} {{uiText("appuntamenti")}}</h3>
      <p v-if="!todayEvents.length&&!calendarWarning" class="muted">Nessun appuntamento.</p><div v-for="b in todayEvents" :key="b.id" class="lf-agenda-record"><button type="button" class="lf-agenda-row" :aria-expanded="expandedBooking===b.id" @click="toggleDetails(b.id)"><div class="lf-agenda-time"><b>{{formatTime(b.startMs)}}–{{endTime(b)}}</b><small :class="{'lf-agenda-state':showStatus(b)==='Confermato'}">{{showStatus(b)}}</small></div><div class="lf-agenda-person"><strong>{{nameLabel(b.athleteId)}}</strong><small>{{b.discipline}} · {{coachLabel(b.coachId)}} · {{groupLabel(b.participantCount)}}</small></div><i class="coach-dot" :class="coachColor(b.coachId)"/><LionIcon name="chevron" :size="17"/></button><div v-if="expandedBooking===b.id" class="lf-agenda-detail"><p v-if="b.createdByCoach" class="small"><strong>Fissato dal coach</strong></p><p v-if="b.note" style="white-space:pre-wrap;overflow-wrap:anywhere">{{b.note}}</p><p>{{displayService(b.service)}} · {{groupLabel(b.participantCount)}} · {{b.durationMinutes}} min</p><button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">Annulla appuntamento</button></div></div>
     </section>
     <section v-else-if="view==='week'" class="panel booking-period"><h3>{{uiText("Settimana del")}} {{dateTitle(weekDates[0])}} · {{events.length}} {{uiText("appuntamenti")}}</h3>
      <div v-for="day in weekDates" :key="day" class="week-event-day"><strong>{{dateTitle(day)}}</strong><span class="event-count">{{eventsOn(day).length}}</span><p v-if="!eventsOn(day).length" class="small muted">Nessun appuntamento</p><div v-for="b in eventsOn(day)" :key="b.id" class="lf-agenda-record"><button type="button" class="lf-agenda-row" :aria-expanded="expandedBooking===b.id" @click="toggleDetails(b.id)"><div class="lf-agenda-time"><b>{{formatTime(b.startMs)}}–{{endTime(b)}}</b><small :class="{'lf-agenda-state':showStatus(b)==='Confermato'}">{{showStatus(b)}}</small></div><div class="lf-agenda-person"><strong>{{nameLabel(b.athleteId)}}</strong><small>{{b.discipline}} · {{coachLabel(b.coachId)}} · {{groupLabel(b.participantCount)}}</small></div><i class="coach-dot" :class="coachColor(b.coachId)"/><LionIcon name="chevron" :size="17"/></button><div v-if="expandedBooking===b.id" class="lf-agenda-detail"><p v-if="b.createdByCoach" class="small"><strong>Fissato dal coach</strong></p><p v-if="b.note" style="white-space:pre-wrap;overflow-wrap:anywhere">{{b.note}}</p><p>{{displayService(b.service)}} · {{groupLabel(b.participantCount)}} · {{b.durationMinutes}} min</p><button v-if="canRemove(b)" class="danger" :disabled="busy" @click="cancelBookingRow(b)">Annulla appuntamento</button></div></div></div>
     </section>
     <section v-else class="panel booking-period"><h3>{{monthLabel}} · {{events.length}} {{uiText("appuntamenti")}}</h3>
      <div class="coach-month-grid"><span v-for="(n,i) in ['L','M','M','G','V','S','D']" :key="i" class="coach-month-weekday">{{n}}</span>
       <template v-for="(d,i) in monthDays" :key="i"><span v-if="!d" class="month-empty"/><button v-else class="coach-month-day" :class="{selected:selectedDate===dateInMonth(d)}" @click="chooseMonthDay(dateInMonth(d))"><b>{{Number(d)}}</b><small>{{counts[dateInMonth(d)]||0}} {{uiText("appuntamenti")}}</small><span class="coach-month-dots" :aria-label="coachIdsOn(dateInMonth(d)).map(coachLabel).join(', ')"><span v-for="uid in coachIdsOn(dateInMonth(d))" :key="uid" class="booking-coach-mini"><i class="coach-dot" :class="coachColor(uid)"/>{{coachCountsOn(dateInMonth(d))[uid]||0}}</span></span></button></template>
      </div>
     </section>
     
    </template>
    <AgendaCompetitions v-else-if="coachTab==='competizioni'&&competitionEnabled&&session" :session="session" :events="competitionEvents" :entries="competitionEntries" mode="events" :initial-event-id="selectedCompetitionId" :now="nowMs" :loading="competitionLoading" @back="coachTab='calendario'"/>
    <template v-else><section class="panel coach-availability-compact lf-r21c-availability"><div class="lf-r21c-section-head"><div><h2>{{uiText("Disponibilità del Coach autenticato")}}</h2><p class="muted coach-availability-intro">{{uiText("Solo il Coach proprietario può salvare la propria configurazione. Il titolare può preparare slot degli altri Coach solo con funzioni amministrative dedicate, qui disabilitate.")}}</p></div><span v-if="draft" class="lf-r21c-availability-state" :class="{'is-active':draft.active}">{{draft.active?'Disponibilità attiva':'Disponibilità non attiva'}}</span></div>
      <template v-if="draft">
       <section class="lf-r21c-settings-group" aria-label="Configurazione del Coach"><h3>Impostazioni prenotazione</h3>
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
       </section><section class="lf-r21c-settings-group lf-r21c-weekly" aria-label="Orario settimanale">
       <h3 class="coach-availability-heading">{{uiText("Settimana tipo · massimo 4 fasce per giorno")}}</h3>
       <button class="secondary" type="button" @click="fillDefaultWeek">{{uiText("Precompila Lun–Sab 09:00–13:00 (solo modulo)")}}</button>
       <div class="availability-grid coach-availability-week"><div v-for="day in weekdays" :key="day.id" class="line-card"><div class="row between"><strong>{{day.label}}</strong><input type="checkbox" :checked="draft.weekly[day.id as keyof typeof draft.weekly]?.enabled??false" @change="setWeeklyDay(day.id,'enabled',($event.target as HTMLInputElement).checked)"/></div>
        <div v-for="(band,i) in (draft.weekly[day.id as keyof typeof draft.weekly]?.ranges||[])" :key="i" class="row"><input class="coach-time-input" type="time" step="1800" :value="bandFrom(band)" @change="draft!.weekly[day.id as keyof typeof draft.weekly]!.ranges[i]={from:($event.target as HTMLInputElement).value,to:bandTo(band)};editConfig()"/>
         <input class="coach-time-input" type="time" step="1800" :value="bandTo(band)" @change="draft!.weekly[day.id as keyof typeof draft.weekly]!.ranges[i]={from:bandFrom(band),to:($event.target as HTMLInputElement).value};editConfig()"/>
         <button type="button" class="bare" :disabled="(draft.weekly[day.id as keyof typeof draft.weekly]?.ranges.length||0)<=1" @click="removeBand(day.id,i)">×</button></div>
        <button class="ghost" :disabled="(draft.weekly[day.id as keyof typeof draft.weekly]?.ranges.length||0)>=4" @click="addBand(day.id)">{{uiText("+ Fascia")}}</button></div></div>
       </section><details class="lf-r21c-settings-group lf-r21c-fold"><summary><span>Eccezioni e ferie</span><small>{{Object.keys(draft.exceptions||{}).length}} eccezioni · {{(draft.holidays||[]).length}} periodi ferie</small></summary><div class="lf-r21c-fold-content"><div class="grid2"><label>{{uiText("Giorno")}}<input v-model="exceptDate" type="date"/></label><label>{{uiText("Tipo")}}<select v-model="exceptKind"><option value="closed">{{uiText("Chiudi questo giorno")}}</option><option value="special">{{uiText("Orario speciale")}}</option></select></label>
        <label v-if="exceptKind==='special'">{{uiText("Dalle")}}<input v-model="exceptFrom" type="time" step="1800"/></label><label v-if="exceptKind==='special'">{{uiText("Alle")}}<input v-model="exceptTo" type="time" step="1800"/></label></div>
       <button class="secondary" @click="addException">{{uiText("+ Aggiungi eccezione")}}</button>
       <div v-for="(val,date) in draft.exceptions||{}" :key="date" class="row"><small>{{date}} · {{val.enabled?'Orario speciale':'Chiuso'}}</small><button class="bare" @click="removeException(String(date))">{{uiText("Rimuovi")}}</button></div>
       <div class="grid2"><label>{{uiText("Ferie dal")}}<input v-model="holidayFrom" type="date"/></label><label>{{uiText("Ferie al")}}<input v-model="holidayTo" type="date"/></label></div><button class="secondary" @click="addHoliday">{{uiText("+ Aggiungi ferie")}}</button>
       <div v-for="(holiday,i) in draft.holidays||[]" :key="i" class="row"><small>{{uiText("Ferie")}} {{holiday.from}} — {{holiday.to}}</small><button class="bare" @click="removeHoliday(i)">{{uiText("Rimuovi")}}</button></div></div></details>
       <div class="lf-r21c-save-group"><p v-if="edited" class="lf-r21c-unsaved" role="status">Hai modifiche non salvate. Conferma per aggiornare la disponibilità.</p>
       <p class="muted small">{{uiText("Salvare sincronizza fino a 30 giorni di slot. Quelli aperti non più validi vengono ritirati; le prenotazioni confermate non vengono cancellate. In caso di errore la disponibilità resta inattiva finché non ripeti il salvataggio.")}}</p>
       
       <button class="primary wide" :disabled="busy||status!=='ready'" @click="persistAvailability">{{busy?'Sincronizzazione in corso…':uiText("Salva disponibilità (30 giorni)")}}</button><p v-if="availabilityProgress" class="small green lf-availability-progress" role="status" aria-live="polite">{{availabilityProgress}}</p></div>
       <details class="lf-r21c-settings-group lf-r21c-fold"><summary><span>Preparazione manuale degli slot</span><small>Strumenti avanzati · nessuna sovrascrittura delle prenotazioni</small></summary><div class="lf-r21c-fold-content"><h3>{{uiText("Prepara slot del giorno selezionato")}}</h3><p class="muted small">{{uiText("Crea soltanto slot mancanti e futuri da 30 minuti; non sovrascrive mai quelli esistenti o prenotati.")}}</p>
       <input v-model="selectedDate" type="date"/>
       <button class="primary wide" :disabled="busy||!myConfig||edited" @click="prepareDay">{{uiText("Prepara slot del")}} {{selectedDate}}</button>
       <button class="secondary wide" :disabled="busy||!myConfig||edited" @click="prepareNextWeek">{{uiText("Prepara i prossimi 7 giorni")}}</button>
       <p v-if="edited" class="small muted">{{uiText("Salva prima la configurazione per preparare nuovi slot.")}}</p></div></details>
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

<style scoped>
.lf-agenda13{gap:12px;min-width:0}.lf-agenda13 .booking-intro{padding:8px 0;min-height:0}.lf-agenda13 .booking-intro h1{font-size:clamp(24px,5vw,34px);line-height:1.15}.lf-agenda13 .booking-intro p{margin:4px 0}.lf-agenda13 .booking-top-controls{display:none}.lf-agenda13 .lf-agenda-main{display:flex!important;gap:5px!important;margin:0!important;min-width:0}.lf-agenda13 .lf-agenda-main button{flex:1 1 0!important;min-width:0!important;white-space:normal!important;border-radius:12px!important;padding:10px 7px!important;min-height:44px!important;width:auto!important}.lf-agenda-toolbar{display:grid;gap:9px;min-width:0}.lf-agenda-controls{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) auto;gap:7px;align-items:end}.lf-agenda-controls select,.lf-agenda-date-controls input{width:100%;min-width:0;min-height:44px;margin:0;padding:8px 7px;font-size:13px;color:var(--text);background:var(--card);border:1px solid var(--border);border-radius:10px}.lf-agenda-filter{display:flex;align-items:center;justify-content:center;gap:4px;min-height:44px;padding:8px!important;white-space:nowrap;border-color:var(--mint);color:var(--text)}.lf-agenda-extra{padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--card);grid-template-columns:repeat(2,minmax(0,1fr))}.lf-agenda-extra label{min-width:0;font-size:12px}.lf-agenda-date-controls{display:grid;grid-template-columns:42px minmax(0,1fr) 42px auto;gap:6px}.lf-agenda-date-controls button{padding:6px 8px!important;min-height:44px}.lf-agenda-date-controls input{color-scheme:dark}:global(.theme-light) .lf-agenda-date-controls input{color-scheme:light}.lf-agenda-list,.lf-agenda-group{display:grid;gap:9px;min-width:0}.lf-agenda-list h2{font-size:19px;margin:5px 0}.lf-agenda-group h3{font-size:13px;text-transform:capitalize;margin:6px 0 0;color:var(--muted)}.lf-agenda-record{min-width:0}.lf-agenda-row{width:100%;display:grid;grid-template-columns:minmax(88px,.72fr) minmax(0,1.35fr) auto auto;align-items:center;gap:9px;text-align:left;min-height:70px;border-radius:13px;border:1px solid var(--border);background:var(--card);color:var(--text);padding:11px 10px!important;margin:0!important;min-width:0;box-shadow:none}.lf-agenda-row:hover,.lf-agenda-row[aria-expanded=true]{border-color:var(--mint)}.lf-agenda-time,.lf-agenda-person{display:grid;gap:5px;min-width:0}.lf-agenda-time{padding-right:8px;border-right:1px solid var(--border)}.lf-agenda-time b{font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}.lf-agenda-person strong{font-size:15px;overflow-wrap:anywhere}.lf-agenda-row small{font-size:11px;overflow-wrap:anywhere;color:var(--muted)}.lf-agenda-row .lf-agenda-state{color:var(--mint);border:1px solid var(--mint);border-radius:12px;padding:2px 6px;justify-self:start;font-weight:700}.lf-agenda-detail{padding:9px 12px;border:1px solid var(--border);border-top:0;border-radius:0 0 12px 12px;background:var(--card2)}.lf-agenda-detail p{margin:0 0 7px;font-size:12px;color:var(--muted)}.lf-agenda-athlete-home{display:grid;gap:12px}.lf-agenda-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:18px;padding:20px 16px;min-height:148px;display:flex;flex-direction:column;justify-content:end;background-color:#14292b;background-size:cover;background-position:center;color:white}.lf-agenda-hero h2{font-size:23px;color:white;margin:7px 0}.lf-agenda-hero p{font-size:13px;color:#e0e9e4;margin:0}.lf-agenda-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lf-agenda-tiles button{display:grid;gap:8px;justify-items:start;min-height:82px;color:var(--text);border:1px solid var(--border);border-radius:13px;padding:13px}.lf-agenda-tiles svg{color:var(--mint)}.lf-agenda-hero-cover{position:absolute;inset:0;z-index:-1}.lf-agenda-hero-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(8,18,20,.95),rgba(8,18,20,.15))}.lf-agenda-hero button{align-self:flex-start;margin-top:10px}.lf-agenda-athlete-home .lf-agenda-row{grid-template-columns:minmax(78px,.7fr) minmax(0,1.4fr) auto}.lf-agenda13 .booking-period{padding:12px}.lf-agenda13 .booking-period h3{margin:0 0 10px}.lf-agenda13 .booking-period .lf-agenda-record{margin:7px 0}.lf-agenda13 .booking-period .lf-agenda-row{background:var(--card2)}
@media(max-width:420px){.lf-agenda-row{grid-template-columns:minmax(91px,.8fr) minmax(0,1.2fr) 8px 13px;gap:6px;padding:10px 8px!important}.lf-agenda-time b{font-size:12px}.lf-agenda-person strong{font-size:14px}.lf-agenda-main button{font-size:12px!important}.lf-agenda-controls select{font-size:12px}.lf-agenda-date-controls{grid-template-columns:35px minmax(0,1fr) 35px auto}.lf-agenda-filter{font-size:12px!important}}
</style>

<style scoped>
/* Only the LIVE athlete booking chooser. Images are decorative; text remains legible in both themes. */
.lf-booking-v4-flow .booking-service-card .lf17b-category-photo{display:block!important;width:100%!important;max-width:100%!important;height:clamp(98px,15vw,145px)!important;flex:0 0 auto!important;object-fit:cover!important;border-radius:10px!important;object-position:center;overflow:hidden;box-shadow:none}
.lf-booking-v4-flow .booking-service-card .lf17b-category-fighter{object-position:50% 42%}
.lf-booking-v4-flow .booking-service-card .lf17b-category-pesi{object-position:48% 55%}
.lf-booking-v4-flow .booking-service-card[aria-pressed=true] .lf17b-category-photo{outline:1px solid var(--mint);outline-offset:2px}
</style>

<style scoped>
/* PATCH 30 R2.1 — solo Agenda Coach su desktop: controlli leggibili,
   senza toccare il calendario atleta, le azioni o Premium Motion. */
@media (min-width: 1120px) {
 .lf-agenda13.lf-agenda-coach {
  width:100%;
  max-width:1100px;
  margin-inline:auto;
  gap:15px;
 }
 .lf-agenda13.lf-agenda-coach .booking-intro{padding:0 2px 3px}
 .lf-agenda13.lf-agenda-coach .booking-intro h1{font-size:30px;line-height:1.2}
 .lf-agenda13.lf-agenda-coach .lf-agenda-main{
  align-self:flex-start;
  width:auto;
  max-width:100%;
  gap:8px!important;
  padding:5px;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:15px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-main button{
  flex:0 0 auto!important;
  min-width:145px!important;
  min-height:42px!important;
  padding:10px 18px!important;
  border-radius:10px!important;
 }
 .lf-agenda13.lf-agenda-coach > .primary.wide{
  width:auto;
  min-width:242px;
  max-width:100%;
  align-self:flex-start;
  min-height:48px;
  padding:12px 22px;
  border-radius:12px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-toolbar{
  border:1px solid var(--border);
  border-radius:16px;
  background:var(--card);
  padding:14px;
  gap:12px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-controls:not(.lf-agenda-extra){
  width:100%;
  max-width:815px;
  grid-template-columns:minmax(220px,1.25fr) minmax(170px,.85fr) 118px;
  gap:10px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-controls select{
  padding-inline:12px;
  min-height:46px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-filter{min-height:46px;padding:9px 14px!important}
 .lf-agenda13.lf-agenda-coach .lf-agenda-date-controls{max-width:460px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-extra{
  display:flex;
  flex-wrap:wrap;
  align-items:end;
  max-width:815px;
  padding:12px 0 0;
  border:0;
  border-top:1px solid var(--border);
  border-radius:0;
  background:transparent;
  gap:10px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-extra label{flex:1 1 185px;max-width:270px;margin:0}
 .lf-agenda13.lf-agenda-coach .lf-agenda-extra button{min-height:44px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-list>.row.between{
  min-height:38px;
  gap:12px;
  padding-inline:2px;
 }
 .lf-agenda13.lf-agenda-coach .lf-agenda-list>.panel.muted{
  min-height:112px;
  display:grid;
  place-items:center;
  text-align:center;
  padding:24px;
  border-style:dashed;
  background:var(--card);
 }
}
</style>

<style scoped>
/* PATCH 30 R2.2 — Agenda Coach: complete desktop layout without altering
   athlete screens, mobile controls, booking logic or Premium Motion. */
.lf-agenda-subtitle{font-size:13px;line-height:1.5;color:var(--muted);margin:5px 0 0}
.lf-agenda-coach-commandbar{display:flex;flex-direction:column;gap:10px;min-width:0}
.lf-agenda-coach-commandbar .lf-agenda-create{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;width:100%;max-width:100%;padding:11px 18px}
.lf-agenda-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:128px;text-align:center;padding:22px!important;background:var(--card);border:1px dashed var(--border);border-radius:14px}
.lf-agenda-empty svg{color:var(--mint);opacity:.85}
.lf-agenda-empty strong{font-size:14px;color:var(--text)}
.lf-agenda-empty small{font-size:12px;color:var(--muted);max-width:320px;line-height:1.45}
@media (max-width:900px){.lf-agenda-subtitle{display:none}}
@media (min-width:901px){
 .lf-agenda13.lf-agenda-coach{gap:16px;margin-top:0}
 .lf-agenda13.lf-agenda-coach .booking-intro{padding:0 54px 2px 1px;min-height:0}
 .lf-agenda13.lf-agenda-coach .booking-intro h1{font-size:clamp(27px,2.3vw,33px);line-height:1.14;margin:0!important;letter-spacing:-.025em}
 .lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
 .lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-main{margin:0!important;align-self:auto;flex:0 1 auto}
 .lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-main button{flex:1 1 auto!important;min-width:126px!important}
 .lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-create{width:auto;min-width:205px;flex:0 0 auto;min-height:46px;border-radius:11px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-toolbar{padding:10px 12px;gap:10px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-controls:not(.lf-agenda-extra){max-width:none;grid-template-columns:minmax(220px,1.1fr) minmax(170px,.8fr) 118px;gap:10px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-controls select{min-height:43px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-filter{min-height:43px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-list>.panel.muted.lf-agenda-empty{min-height:136px;display:flex;align-items:center;justify-content:center;border-style:dashed}
}
@media (min-width:901px) and (max-width:1120px){
 .lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-main{flex:1 1 100%}
 .lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-create{flex:0 0 auto}
}
@media (min-width:1121px){
 .lf-agenda13.lf-agenda-coach{max-width:1100px}
 .lf-agenda13.lf-agenda-coach .lf-agenda-main button{min-width:136px!important}
 .lf-agenda13.lf-agenda-coach .lf-agenda-list>.panel.muted.lf-agenda-empty{min-height:148px}
}

/* R8B: participant count is just one booking's metadata. */
.lf-r8b-group-booking h3{font-size:16px;margin:0 0 5px}.lf-r8b-group-booking>p{margin:4px 0 10px}.lf-r8b-people-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.lf-r8b-people-choices button{border:1px solid var(--border);border-radius:11px;min-height:56px;padding:7px 4px;display:grid;justify-items:center;align-content:center;gap:3px;color:var(--text);background:var(--card2);font-size:18px;font-weight:850}.lf-r8b-people-choices button small{font-size:10px;font-weight:650;color:var(--muted)}.lf-r8b-people-choices button.is-chosen{border-color:var(--mint);color:var(--mint);background:var(--green-bg)}.lf-r8b-people-recap{font-size:12px;font-weight:750;color:var(--mint);margin:9px 0}.lf-r8b-people-choices button:focus-visible{outline:2px solid var(--mint);outline-offset:2px}

/* PATCH 30 R9: scoped Athlete Agenda UX only; no data / booking changes. */
.lf-agenda13[data-r9-athlete="true"]{gap:12px!important;max-width:960px;min-width:0}
.lf-agenda13[data-r9-athlete="true"] .booking-intro{padding:0!important;min-height:0!important;margin:0!important}
.lf-agenda13[data-r9-athlete="true"] .booking-intro h1{max-width:none!important;font-size:clamp(25px,4vw,32px);letter-spacing:-.035em;margin:0!important}
.lf-r9-home-intro{font-size:13px;color:var(--muted);line-height:1.45;margin:4px 0 0!important}
.lf-agenda13[data-r9-athlete="true"] .lf-agenda-athlete-home{display:grid;gap:12px;align-content:start;min-width:0}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero{min-height:180px;border:1px solid #376b54;border-radius:18px;padding:19px 18px;background:#112820;justify-content:flex-end;gap:4px}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero .lf-agenda-hero-cover::after{background:linear-gradient(90deg,rgba(4,17,16,.95) 0%,rgba(4,17,16,.65) 61%,rgba(4,17,16,.22) 100%),linear-gradient(0deg,rgba(4,17,16,.7),transparent 85%)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero .eyebrow{color:#72f0b6;font-size:11px;letter-spacing:.14em}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero h2{font-size:clamp(20px,4.7vw,28px);line-height:1.15;margin:5px 0 3px;max-width:92%;overflow-wrap:anywhere;text-wrap:balance}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero p{font-size:12px;line-height:1.55;color:#e0e9e5;max-width:94%;overflow-wrap:anywhere}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero .lf-r9-hero-cta{display:inline-flex;align-items:center;gap:6px;min-height:42px;margin-top:8px;padding:9px 13px!important;align-self:flex-start;background:#162d30;border:1px solid #537c78;color:#fff;font-size:12px;box-shadow:none}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-agenda-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:7px;min-width:0;min-height:100px;padding:14px!important;border:1px solid var(--border);border-radius:15px;background:var(--card);text-align:left;color:var(--text)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile>svg{flex:0 0 auto;color:var(--mint)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile strong{font-size:14px;line-height:1.2;font-weight:850;overflow-wrap:anywhere}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile small{font-size:11px;line-height:1.35;color:var(--muted)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile:hover,.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile:focus-visible{border-color:var(--mint)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile-full{grid-column:1/-1;flex-direction:row;justify-content:flex-start;align-items:center;min-height:77px;gap:13px}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile-full span{display:grid;gap:3px;min-width:0;flex:1}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile-full>svg:last-child{margin-left:auto;color:var(--muted)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-upcoming{display:grid;gap:10px;padding:14px!important;margin:0!important;border-radius:16px;background:var(--card)}
.lf-r9-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.lf-r9-section-heading h2{font-size:clamp(16px,3.2vw,19px);line-height:1.2;margin:0}
.lf-r9-section-heading p{margin:5px 0 0}
.lf-r9-inline-link{border:0;background:transparent;display:inline-flex;align-items:center;gap:2px;color:var(--mint);font-size:12px;font-weight:850;padding:7px 1px!important;min-height:36px}
.lf-r9-empty{display:flex;align-items:center;gap:10px;padding:14px 10px;background:var(--card2);border:1px dashed var(--border);border-radius:12px;min-width:0}
.lf-r9-empty svg{color:var(--mint);flex:0 0 auto}
.lf-r9-empty div{display:grid;gap:4px;min-width:0}
.lf-r9-empty strong{font-size:13px;font-weight:800}
.lf-r9-empty small{font-size:11px;line-height:1.4;color:var(--muted)}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-calendar{display:grid;gap:12px;padding:15px!important;margin:0!important}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-calendar select{width:auto;min-width:112px;min-height:38px;padding:7px 8px;font-size:12px}
.lf-agenda13[data-r9-athlete="true"] .lf-r9-calendar-row{grid-template-columns:minmax(82px,.75fr) minmax(0,1.5fr) auto;min-height:68px}
.lf-r9-calendar-row .lf-agenda-person strong{display:flex;align-items:center;gap:5px}
.lf-r9-calendar-row .lf-agenda-person strong svg{flex-shrink:0;color:var(--mint)}
@media(max-width:650px){.lf-agenda13[data-r9-athlete="true"]{gap:11px!important}.lf-agenda13[data-r9-athlete="true"] .lf-r9-hero{min-height:180px;padding:16px 14px}.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile{min-height:95px;padding:12px!important}.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile-full{min-height:70px}.lf-agenda13[data-r9-athlete="true"] .lf-r9-upcoming{padding:13px!important}}
@media(max-width:365px){.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile strong{font-size:12px}.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile small{font-size:10px}.lf-agenda13[data-r9-athlete="true"] .lf-r9-calendar-row{grid-template-columns:80px minmax(0,1fr) 17px}}
@media(prefers-reduced-motion:reduce){.lf-agenda13[data-r9-athlete="true"] .lf-r9-tile{transition:none!important}}

</style>

<style>
/* R9 targeted override: supersedes the legacy mobile 120px intro spacer. */
.app.as-athlete .main-layout.booking-in-shell .lf-agenda13[data-r9-athlete="true"] .booking-intro{min-height:0!important;padding:0!important;margin:0!important}
</style>

<style scoped>
/* R21C — Desktop Agenda polish. Only styles; all Firestore operations stay in existing methods. */
.lf-agenda13.lf-agenda-coach .booking-intro{padding-bottom:2px}
.lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-main{border-radius:10px}
.lf-agenda13.lf-agenda-coach .lf-agenda-coach-commandbar .lf-agenda-main button{border-radius:7px!important}
.lf-agenda13.lf-agenda-coach .lf-agenda-toolbar{border-radius:10px}
.lf-agenda13.lf-agenda-coach .lf-agenda-controls select,
.lf-agenda13.lf-agenda-coach .lf-agenda-controls button{border-radius:7px}
.lf-agenda-coach .lf-agenda-empty{gap:11px!important;padding:27px 18px!important;border-radius:10px!important}
.lf-agenda-coach .lf-agenda-empty .lf-r21c-empty-icon{display:grid;place-items:center;width:48px;height:48px;background:var(--green-bg);border:1px solid var(--border);border-radius:10px}
.lf-r21c-empty-actions{display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:4px}
.lf-r21c-empty-actions button{min-height:40px;padding:9px 15px;border-radius:7px;display:inline-flex;align-items:center;gap:7px;font-size:12px}
.lf-r21c-empty-actions button:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.lf-r21c-availability{display:grid;gap:14px;padding:16px!important;border-radius:10px}
.lf-r21c-availability .lf-r21c-section-head{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px}
.lf-r21c-availability .lf-r21c-section-head>div{min-width:0;flex:1 1 340px}
.lf-r21c-availability .lf-r21c-section-head h2{font-size:21px}
.lf-r21c-availability .lf-r21c-section-head p{margin-top:5px}
.lf-r21c-availability-state{display:inline-flex;align-items:center;border:1px solid var(--border);background:var(--card2);color:var(--muted);padding:7px 10px;border-radius:7px;font-size:11px;font-weight:750;white-space:nowrap}
.lf-r21c-availability-state.is-active{border-color:var(--mint);background:var(--green-bg);color:var(--mint)}
.lf-r21c-settings-group{padding:14px;border:1px solid var(--border);border-radius:9px;background:var(--card2);min-width:0}
.lf-r21c-settings-group>h3{font-size:14px;margin:0 0 12px}
.lf-r21c-settings-group .coach-availability-heading{margin:0 0 10px}
.lf-r21c-settings-group>.coach-availability-week{margin-top:10px}
.lf-r21c-settings-group .line-card{background:var(--card);border-radius:8px}
.lf-r21c-settings-group label{max-width:100%}
.lf-r21c-fold{padding:0;overflow:visible}
.lf-r21c-fold summary{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:14px;list-style:none;color:var(--text);font-weight:800;font-size:14px}
.lf-r21c-fold summary::-webkit-details-marker{display:none}
.lf-r21c-fold summary::before{content:'+';color:var(--mint);font-size:18px;font-weight:700;line-height:1}
.lf-r21c-fold[open] summary::before{content:'−'}
.lf-r21c-fold summary span{flex:1}
.lf-r21c-fold summary small{font-weight:500;color:var(--muted);font-size:11px}
.lf-r21c-fold summary:focus-visible{outline:2px solid var(--mint);outline-offset:2px;border-radius:8px}
.lf-r21c-fold-content{display:grid;gap:10px;border-top:1px solid var(--border);padding:13px 14px 14px}
.lf-r21c-fold-content>h3{margin:0}
.lf-r21c-fold-content>.grid2{margin:0}
.lf-r21c-save-group{display:grid;gap:9px;border:1px solid var(--border);border-radius:9px;padding:13px;background:var(--card)}
.lf-r21c-save-group>.primary{min-height:44px;border-radius:7px}
.lf-r21c-save-group>p{margin:0}
.lf-r21c-unsaved{border-left:3px solid var(--mint);background:var(--green-bg);padding:9px 11px;font-size:12px;color:var(--text)}
@media(min-width:901px){.lf-agenda13.lf-agenda-coach{max-width:1180px}.lf-r21c-settings-group .coach-availability-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.lf-r21c-settings-group .coach-availability-week{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:680px){.lf-r21c-availability{padding:12px!important;gap:10px}.lf-r21c-settings-group{padding:11px}.lf-r21c-fold{padding:0}.lf-r21c-fold summary{padding:12px;flex-wrap:wrap}.lf-r21c-fold summary small{width:100%;padding-left:26px}.lf-r21c-empty-actions{width:100%}.lf-r21c-empty-actions button{flex:1 1 100%;justify-content:center}}
</style>
