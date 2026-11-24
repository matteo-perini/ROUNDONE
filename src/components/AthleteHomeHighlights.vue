<script lang="ts">
/** PATCH 30 R14 — solo letture per atleta verificato, separate per palestra. */
import {collection,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {getLocalEmulatorClients} from '../integrations/firebase/emulatorClient'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {bookingPaths,toReservation,type LiveReservation} from '../integrations/firestore/liveBookings'
import {watchCompetitionEnabled,watchCompetitionEvents} from '../integrations/firestore/competitions'
import {type CompetitionEvent} from '../features/bookings/competitionModel'
import {createVerifiedSessionStream} from '../features/performance/verifiedSessionStreams'
import type {StreamPublish} from '../features/performance/warmSessionStream'
type Highlights={reservations:LiveReservation[];events:CompetitionEvent[];bookingsReady:boolean;bookingsError:boolean;competitionsEnabled:boolean;eventsReady:boolean;eventsError:boolean}
const emptyHighlights=():Highlights=>({reservations:[],events:[],bookingsReady:false,bookingsError:false,competitionsEnabled:false,eventsReady:false,eventsError:false})
const highlightStream=createVerifiedSessionStream<Highlights>()
function startHighlights(uid:string,gym:string,live:boolean,publish:StreamPublish<Highlights>){
 let state=emptyHighlights(),active=true,eventsStop:Unsubscribe|undefined,eventsEpoch=0,configReady=false,eventsFailed=false
 const stops:Unsubscribe[]=[]
 function update(patch:Partial<Highlights>){if(!active)return;state={...state,...patch};publish(state,state.bookingsReady&&!state.bookingsError&&configReady&&state.eventsReady&&!eventsFailed)}
 function stopEvents(){eventsEpoch++;eventsStop?.();eventsStop=undefined}
 try{
  const {db,auth}=live?getStagingClients():getLocalEmulatorClients()
  if(auth.currentUser?.uid!==uid)throw new Error('Sessione cambiata')
  const bookings=query(collection(db,'gyms',gym,bookingPaths.reservations),where('athleteId','==',uid))
  stops.push(onSnapshot(bookings,{includeMetadataChanges:live},snap=>{
   if(!active||auth.currentUser?.uid!==uid||(live&&(snap.metadata.fromCache||snap.metadata.hasPendingWrites)))return
   update({reservations:snap.docs.flatMap(doc=>{const r=toReservation(doc.id,doc.data());return r&&r.athleteId===uid?[r]:[]}),bookingsReady:true,bookingsError:false})
  },()=>update({bookingsError:true,bookingsReady:true,reservations:[]})))
  stops.push(watchCompetitionEnabled(db,gym,enabled=>{
   if(!active||auth.currentUser?.uid!==uid)return
   // Metadata-only updates and the same enabled flag must not reopen events.
   if(configReady&&enabled===state.competitionsEnabled)return
   configReady=true;eventsFailed=false;stopEvents();update({competitionsEnabled:enabled,events:[],eventsReady:!enabled,eventsError:false})
   if(enabled){const epoch=eventsEpoch;eventsStop=watchCompetitionEvents(db,gym,rows=>{if(active&&epoch===eventsEpoch&&auth.currentUser?.uid===uid)update({events:rows,eventsReady:true,eventsError:false})},()=>{if(active&&epoch===eventsEpoch){eventsFailed=true;update({eventsReady:true,events:[],eventsError:true})}},live)}
  },()=>{if(active){configReady=false;eventsFailed=true;stopEvents();update({competitionsEnabled:false,eventsReady:true,events:[],eventsError:true})}}))
 }catch{configReady=false;eventsFailed=true;stopEvents();stops.splice(0).forEach(stop=>stop());update({bookingsReady:true,bookingsError:true,eventsReady:true,eventsError:true,events:[],reservations:[]})}
 return()=>{active=false;stopEvents();stops.forEach(stop=>stop())}
}
</script>
<script setup lang="ts">
import {computed,onUnmounted,shallowRef,ref,watch} from 'vue'
import {RouterLink} from 'vue-router'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {accountKey} from '../features/platform/platformModel'
import {beginSessionDataAudit} from '../features/performance/sessionDataAudit'
import {upcomingRows} from '../features/bookings/agendaOverview'
import {nextCompetition} from '../features/bookings/competitionModel'
import LionIcon from './LionIcon.vue'
const props=defineProps<{uid:string;gymId:string;bookingLink:string}>()
const state=shallowRef(emptyHighlights())
const reservations=computed(()=>state.value.reservations),events=computed(()=>state.value.events)
const bookingsReady=computed(()=>state.value.bookingsReady),bookingsError=computed(()=>state.value.bookingsError)
const competitionsEnabled=computed(()=>state.value.competitionsEnabled),eventsReady=computed(()=>state.value.eventsReady),eventsError=computed(()=>state.value.eventsError)
let stop:(()=>void)|undefined,scope=0
const now=ref(Date.now())
function clear(){scope++;stop?.();stop=undefined;state.value=emptyHighlights()}
watch([()=>props.uid,()=>props.gymId,()=>accountKey(stagingSession.value)],()=>{
 clear()
 if(!/^[\w-]{1,128}$/.test(props.gymId)||!/^[\w-]{1,128}$/.test(props.uid))return
 const id=scope,uid=props.uid,gym=props.gymId,live=isStagingMode(),s=stagingSession.value
 const audit=beginSessionDataAudit('home-highlights')
 const next=(v:Highlights)=>{if(id===scope){state.value=v;if(v.bookingsReady&&v.eventsReady)audit(v.bookingsError||v.eventsError?'error':'ready')}}
 const reset=()=>{if(id===scope)state.value=emptyHighlights()}
 if(live){if(s?.uid!==uid||s.gymId!==gym||s.role!=='atleta')return;stop=highlightStream.acquire(s,publish=>startHighlights(uid,gym,true,publish),{next,reset})}
 else stop=startHighlights(uid,gym,false,next)
},{immediate:true,flush:'sync'})
const refresh=setInterval(()=>{if(!document.hidden)now.value=Date.now()},60_000)
function visible(){if(!document.hidden)now.value=Date.now()}
document.addEventListener('visibilitychange',visible)
onUnmounted(()=>{clear();clearInterval(refresh);document.removeEventListener('visibilitychange',visible)})
const nextBookings=computed(()=>upcomingRows(reservations.value,now.value).slice(0,2))
const nextEvent=computed(()=>competitionsEnabled.value?nextCompetition(events.value,now.value):null)
const dateFormat=new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
const fmt=(ms:number)=>dateFormat.format(ms)
const service=(b:LiveReservation)=>b.service==='fighter'?'Fighter':'Pesi'
</script>
<template>
 <section class="lf15-events" aria-label="Prossima lezione e prossimo evento">
  <article class="lf15-event-card">
   <RouterLink :to="bookingLink" class="lf15-event-content" aria-label="Apri la prossima lezione nell'Agenda">
    <div class="lf15-event-head"><LionIcon name="calendar-plus" :size="21"/><strong>PROSSIMA LEZIONE</strong></div>
    <div v-if="!bookingsReady" class="lf15-event-loading" role="status"><span class="lf15-event-sr">Caricamento appuntamenti…</span><i aria-hidden="true"/><i aria-hidden="true"/></div>
    <p v-else-if="bookingsError" class="lf15-event-empty">Consulta l'Agenda per verificare le lezioni.</p>
    <template v-else-if="nextBookings.length"><strong class="lf15-event-value">{{nextBookings[0].discipline||service(nextBookings[0])}}</strong><small>{{fmt(nextBookings[0].startMs)}}<span v-if="nextBookings[0].participantCount>1"> · {{nextBookings[0].participantCount}} partecipanti</span></small></template>
    <p v-else class="lf15-event-empty">Nessuna lezione prenotata nei prossimi 31 giorni.</p>
    <span class="lf15-event-open">Apri Agenda <LionIcon name="chevron" :size="15"/></span>
   </RouterLink>
  </article>
  <article class="lf15-event-card">
   <RouterLink :to="bookingLink" class="lf15-event-content" aria-label="Apri gli eventi e le gare nell'Agenda">
    <div class="lf15-event-head"><LionIcon name="trophy" :size="21"/><strong>PROSSIMO EVENTO</strong></div>
    <div v-if="!eventsReady" class="lf15-event-loading" role="status"><span class="lf15-event-sr">Caricamento eventi…</span><i aria-hidden="true"/><i aria-hidden="true"/></div>
    <p v-else-if="eventsError" class="lf15-event-empty">Consulta l’Agenda per verificare gli eventi.</p>
    <p v-else-if="!competitionsEnabled" class="lf15-event-empty">Gare e competizioni non attive.</p>
    <template v-else-if="nextEvent"><strong class="lf15-event-value">{{nextEvent.title}}</strong><small>{{fmt(nextEvent.startMs)}} · {{nextEvent.location}}</small><small>Evento pubblicato dalla palestra</small></template>
    <p v-else class="lf15-event-empty">Nessun evento futuro pubblicato.</p>
    <span class="lf15-event-open">Apri Agenda <LionIcon name="chevron" :size="15"/></span>
   </RouterLink>
  </article>
 </section>
</template>
