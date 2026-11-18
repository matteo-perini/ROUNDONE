<script setup lang="ts">
/** PATCH 30 R14 — solo letture per atleta verificato, separate per palestra. */
import {computed,onUnmounted,ref,watch} from 'vue'
import {RouterLink} from 'vue-router'
import {collection,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {getLocalEmulatorClients} from '../integrations/firebase/emulatorClient'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {bookingPaths,toReservation,type LiveReservation} from '../integrations/firestore/liveBookings'
import {upcomingRows} from '../features/bookings/agendaOverview'
import {watchCompetitionEnabled,watchCompetitionEvents} from '../integrations/firestore/competitions'
import {nextCompetition,type CompetitionEvent} from '../features/bookings/competitionModel'
import LionIcon from './LionIcon.vue'
const props=defineProps<{uid:string;gymId:string;bookingLink:string}>()
const reservations=ref<LiveReservation[]>([])
const events=ref<CompetitionEvent[]>([])
const bookingsReady=ref(false),bookingsError=ref(false)
const competitionsEnabled=ref(false),eventsReady=ref(false)
let stops:Unsubscribe[]=[],eventsStop:Unsubscribe|undefined,scope=0
const now=ref(Date.now())
let refresh:ReturnType<typeof setInterval>|undefined
function clear(){stops.forEach(stop=>stop());stops=[];eventsStop?.();eventsStop=undefined;scope++;reservations.value=[];events.value=[];bookingsReady.value=false;bookingsError.value=false;competitionsEnabled.value=false;eventsReady.value=false}
watch(()=>[props.uid,props.gymId],()=>{
 clear()
 if(!/^[\w-]{1,128}$/.test(props.gymId)||!/^[\w-]{1,128}$/.test(props.uid))return
 const id=scope,uid=props.uid,gym=props.gymId
 try{
  const {db,auth}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
  if(auth.currentUser?.uid!==uid)return
  // Stessa query per UID dell'Agenda Atleta: mai leggere le prenotazioni di altri utenti.
  const bookings=query(collection(db,'gyms',gym,bookingPaths.reservations),where('athleteId','==',uid))
  stops.push(onSnapshot(bookings,snap=>{
   if(id!==scope)return
   reservations.value=snap.docs.flatMap(doc=>{const r=toReservation(doc.id,doc.data());return r&&r.athleteId===uid?[r]:[]})
   bookingsReady.value=true
  },()=>{if(id===scope){bookingsError.value=true;bookingsReady.value=true;reservations.value=[]}}))
  stops.push(watchCompetitionEnabled(db,gym,enabled=>{
   if(id!==scope)return
   eventsStop?.();eventsStop=undefined;competitionsEnabled.value=enabled;events.value=[];eventsReady.value=!enabled
   if(enabled)eventsStop=watchCompetitionEvents(db,gym,rows=>{if(id!==scope)return;events.value=rows;eventsReady.value=true},()=>{if(id===scope){eventsReady.value=true;events.value=[]}})
  },()=>{if(id===scope){competitionsEnabled.value=false;eventsReady.value=true}}))
 }catch{bookingsReady.value=true;bookingsError.value=true;eventsReady.value=true}
},{immediate:true})
refresh=setInterval(()=>{now.value=Date.now()},60_000)
onUnmounted(()=>{clear();if(refresh)clearInterval(refresh)})
const nextBookings=computed(()=>upcomingRows(reservations.value,now.value).slice(0,2))
const nextEvent=computed(()=>competitionsEnabled.value?nextCompetition(events.value,now.value):null)
const fmt=(ms:number)=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(ms)
const service=(b:LiveReservation)=>b.service==='fighter'?'Fighter':'Pesi'
</script>
<template>
 <section class="lf15-events" aria-label="Prossima lezione e prossimo evento">
  <article class="lf15-event-card">
   <RouterLink :to="bookingLink" class="lf15-event-content" aria-label="Apri la prossima lezione nell'Agenda">
    <div class="lf15-event-head"><LionIcon name="calendar-plus" :size="21"/><strong>PROSSIMA LEZIONE</strong></div>
    <p v-if="!bookingsReady" class="lf15-event-empty" role="status">Caricamento appuntamenti…</p>
    <p v-else-if="bookingsError" class="lf15-event-empty">Consulta l'Agenda per verificare le lezioni.</p>
    <template v-else-if="nextBookings.length"><strong class="lf15-event-value">{{nextBookings[0].discipline||service(nextBookings[0])}}</strong><small>{{fmt(nextBookings[0].startMs)}}<span v-if="nextBookings[0].participantCount>1"> · {{nextBookings[0].participantCount}} partecipanti</span></small></template>
    <p v-else class="lf15-event-empty">Nessuna lezione prenotata nei prossimi 31 giorni.</p>
    <span class="lf15-event-open">Apri Agenda <LionIcon name="chevron" :size="15"/></span>
   </RouterLink>
  </article>
  <article class="lf15-event-card">
   <RouterLink :to="bookingLink" class="lf15-event-content" aria-label="Apri gli eventi e le gare nell'Agenda">
    <div class="lf15-event-head"><LionIcon name="trophy" :size="21"/><strong>PROSSIMO EVENTO</strong></div>
    <p v-if="!eventsReady" class="lf15-event-empty" role="status">Caricamento eventi…</p>
    <p v-else-if="!competitionsEnabled" class="lf15-event-empty">Gare e competizioni non attive.</p>
    <template v-else-if="nextEvent"><strong class="lf15-event-value">{{nextEvent.title}}</strong><small>{{fmt(nextEvent.startMs)}} · {{nextEvent.location}}</small><small>Evento pubblicato dalla palestra</small></template>
    <p v-else class="lf15-event-empty">Nessun evento futuro pubblicato.</p>
    <span class="lf15-event-open">Apri Agenda <LionIcon name="chevron" :size="15"/></span>
   </RouterLink>
  </article>
 </section>
</template>
