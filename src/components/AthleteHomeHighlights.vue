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
import {romeParts} from '../features/bookings/bookingPolicy'
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
 <section class="lf-r14-upcoming" aria-label="Prossimi appuntamenti ed eventi">
  <div class="lf-r14-section-title"><div><span>IL TUO CALENDARIO</span><h2>In arrivo</h2></div><RouterLink :to="bookingLink">Apri Agenda <LionIcon name="chevron" :size="16"/></RouterLink></div>
  <div class="lf-r14-upcoming-grid" :class="{'lf-r14-only-bookings':!competitionsEnabled}">
   <article class="lf-r14-upcoming-card">
    <div class="lf-r14-mini-heading"><LionIcon name="calendar-plus" :size="19"/><strong>Le prossime lezioni</strong></div>
    <p v-if="!bookingsReady" class="lf-r14-muted" role="status">Caricamento appuntamenti…</p>
    <p v-else-if="bookingsError" class="lf-r14-muted">Consulta l'Agenda per verificare gli appuntamenti.</p>
    <div v-else-if="nextBookings.length" class="lf-r14-next-list">
     <RouterLink v-for="b in nextBookings" :key="b.id" :to="bookingLink" class="lf-r14-next-row"><div><strong>{{b.discipline||service(b)}}</strong><small>{{fmt(b.startMs)}} · {{b.durationMinutes}} min<span v-if="b.participantCount>1"> · {{b.participantCount}} persone</span></small></div><LionIcon name="chevron" :size="17"/></RouterLink>
    </div>
    <p v-else class="lf-r14-muted">Nessuna lezione prenotata nei prossimi 31 giorni.</p>
   </article>
   <article v-if="competitionsEnabled" class="lf-r14-upcoming-card">
    <div class="lf-r14-mini-heading"><LionIcon name="progress" :size="19"/><strong>Eventi e gare</strong></div>
    <p v-if="!eventsReady" class="lf-r14-muted" role="status">Caricamento eventi…</p>
    <RouterLink v-else-if="nextEvent" :to="bookingLink" class="lf-r14-next-row"><div><strong>{{nextEvent.title}}</strong><small>{{fmt(nextEvent.startMs)}} · {{nextEvent.location}}</small><small>Evento pubblicato dalla palestra</small></div><LionIcon name="chevron" :size="17"/></RouterLink>
    <p v-else class="lf-r14-muted">Nessun evento futuro pubblicato.</p>
   </article>
  </div>
 </section>
</template>
