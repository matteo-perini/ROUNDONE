<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import {Capacitor} from '@capacitor/core'
import {isLiveMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {pilotAvailable,pilotMobileDevice} from '../features/work/gpsPilot'
import {badgeEnabled} from '../features/work/devicePreference'
import WorkAttendanceBadge from './WorkAttendanceBadge.vue'
import GymIdentity from './GymIdentity.vue'
import DashboardSearch from './DashboardSearch.vue'
import DesktopShellActions from './DesktopShellActions.vue'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {watchDashboard} from '../integrations/firestore/platform'
import {accountKey,type WidgetId,type SearchItem} from '../features/platform/platformModel'
import {RouterLink} from 'vue-router'
import LionIcon from './LionIcon.vue'
import PremiumMetric from './PremiumMetric.vue'
import type {DashboardAppointment,DashboardActivity,DashboardDay} from '../features/coach/dashboardLiveModel'
const props=defineProps<{
 searchItems?:SearchItem[];searchPartial?:boolean;name:string;athletes:number|null;templates:number|null;bookings?:number|null;programs?:number|null;assigned?:number|null;unassigned?:number|null;
 source:string;athletesUrl:string;createUrl:string;calendarUrl:string;inviteUrl:string;libraryUrl:string;profileUrl:string;
 staffUrl?:string;trashUrl?:string;appointments?:DashboardAppointment[];activityDays?:DashboardDay[];recentEvents?:DashboardActivity[];
 historyComplete?:boolean;dataWarnings?:string[];programLoading?:boolean;loading?:boolean;error?:string
}>()
const mobile=pilotMobileDevice(navigator.userAgent,navigator.maxTouchPoints,Capacitor.isNativePlatform()&&['android','ios'].includes(Capacitor.getPlatform()))
const badgeSession=computed(()=>{const s=stagingSession.value;return isLiveMode()&&mayWriteLive()&&mobile&&s&&pilotAvailable(s)&&badgeEnabled(s.uid,s.gymId)?s:null})
const hidden=ref<WidgetId[]>([]);let stopPrefs:(()=>void)|undefined
watch(()=>accountKey(stagingSession.value),()=>{const s=stagingSession.value;stopPrefs?.();hidden.value=[];if(isStagingMode()&&s&&s.role!=='atleta')stopPrefs=watchDashboard(s,v=>hidden.value=v,()=>hidden.value=[])},{immediate:true});onUnmounted(()=>stopPrefs?.())
const visible=(id:WidgetId)=>!hidden.value.includes(id)
const emit=defineEmits<{(e:'refresh-programs'):void}>()
const metrics=computed(()=>[
 {label:'Atleti iscritti',value:props.athletes,icon:'users',sub:'Atleti attivi della palestra'},
 {label:'Schede create',value:props.templates,icon:'dumbbell',sub:'Modelli non cestinati'},
 {label:'Prenotazioni',value:props.bookings??null,icon:'calendar',sub:'Confermate nei prossimi 60 giorni'},
 {label:'Programmi',value:props.programs??null,icon:'clipboard',sub:'Titoli distinti per Atleta'}
])
const actions=computed(()=>[
 {label:'Atleti',to:props.athletesUrl,icon:'users'},
 {label:'Crea scheda',to:props.createUrl,icon:'plus'},
 {label:'Calendario',to:props.calendarUrl,icon:'calendar'},
 {label:'Invita atleta',to:props.inviteUrl,icon:'mail'}
])
const shortcuts=computed(()=>[
 {label:'Gestione atleti',to:props.athletesUrl,icon:'users'},
 {label:'Libreria esercizi',to:props.libraryUrl,icon:'book'},
 {label:'Profilo e palestra',to:props.profileUrl,icon:'settings'},
 ...(props.staffUrl?[{label:'Coach e Staff',to:props.staffUrl,icon:'users'}]:[]),
 ...(props.trashUrl?[{label:'Cestino',to:props.trashUrl,icon:'bin'}]:[])
])
const upcoming=computed(()=>props.appointments?.slice(0,5)||[])
const recent=computed(()=>props.recentEvents?.slice(0,6)||[])
const days=computed(()=>props.activityDays||[])
const hasActivity=computed(()=>days.value.some(d=>d.total>0))
const tallest=computed(()=>Math.max(1,...days.value.map(d=>d.total)))
const barHeight=(count:number)=>count?`${Math.max(3,Math.round(count/tallest.value*100))}%`:'0%'
const eventUrl=(url:string)=>props.source==='Firebase Emulator'?`${url}?source=emulator`:url
const formatDate=(ms:number)=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(ms)
</script>
<template>
 <div v-lf-entrance="{id:'coach-dashboard',ready:!loading&&!error,rows:[{match:'.lf-coach-greeting'},{within:'.lf-kpi-grid',match:'.lf-kpi-card'},{within:'.lf-coach-hero-row',match:'.lf14-brand-container,.lf-coach-actions'},{within:'.lf-coach-detail-grid',match:'.lf-dashboard-panel'},{within:'.lf-coach-bottom-grid',match:'.lf-dashboard-panel'}]}" class="lf-coach-dashboard">
  <WorkAttendanceBadge v-if="badgeSession" :key="`${badgeSession.uid}:${badgeSession.gymId}`" :uid="badgeSession.uid" :gym-id="badgeSession.gymId"/>
  <header class="lf-coach-greeting"><div><h1>Bentornato, {{name}}! 👊</h1></div><div class="lf14-header-actions"><DashboardSearch v-if="searchItems" :items="searchItems" :partial="searchPartial" :emulator="source==='Firebase Emulator'"/><RouterLink class="lf-dashboard-customize" :to="{path:'/impostazioni',query:source==='Firebase Emulator'?{source:'emulator',dashboard:'1'}:{dashboard:'1'}}" aria-label="Personalizza i riquadri della dashboard"><LionIcon name="settings" :size="16"/><span>Personalizza</span></RouterLink><DesktopShellActions/><span v-if="source!=='Firebase Lion Fit'" class="lf-source-tag">{{source}}</span></div></header>

  <p v-lf-quiet-loading v-if="loading" role="status" class="muted lf-quiet-status">Caricamento dati della palestra…</p>
  <p v-if="error" role="alert" class="notice">{{error}}</p>
  <div v-if="dataWarnings?.length" class="lf-dashboard-warnings" role="status">
   <p v-for="(warning,i) in dataWarnings" :key="i">{{warning}}</p>
  </div>
  <section v-if="visible('metrics')" class="lf-kpi-grid" aria-label="Statistiche palestra">
   <article v-for="metric in metrics" :key="metric.label" class="lf-kpi-card"><span class="lf-kpi-icon"><LionIcon :name="metric.icon" :size="24"/></span><div><h2>{{metric.label}}</h2><strong><PremiumMetric :value="metric.value"/></strong><small>{{metric.value===null||metric.value===undefined?'Dato non disponibile':metric.sub}}</small></div></article>
  </section>
  <section v-if="visible('banner')||visible('actions')" class="lf-coach-hero-row" :class="{'lf14-single':!visible('banner')||!visible('actions')}"><div v-if="visible('banner')" class="lf14-brand-container"><GymIdentity v-if="isStagingMode()" compact/><div v-else class="lf-coach-banner"><div><strong>LION <em>FIT</em></strong><span>PANNELLO COACH</span><p>ALLENATI <b>•</b> PIANIFICA <b>•</b> GESTISCI <b>•</b> CRESCI</p></div></div></div><div v-if="visible('actions')" class="lf-dashboard-panel lf-coach-actions"><h2><LionIcon name="plus" :size="19"/> Azioni rapide</h2><div class="lf-action-grid"><RouterLink v-for="action in actions" :key="action.label" :to="action.to"><LionIcon :name="action.icon" :size="27"/><span>{{action.label}}</span></RouterLink></div></div></section>
  <section v-if="visible('activity')||visible('distribution')||visible('appointments')" class="lf-coach-detail-grid lf14-responsive-grid">
   <article v-if="visible('activity')" class="lf-dashboard-panel lf-activity-panel">
    <h2><LionIcon name="dumbbell" :size="18"/> Attività palestra</h2>
    <p class="lf-widget-desc">Ultimi 30 giorni</p>
    <div v-if="hasActivity" class="lf-chart-area" role="img" aria-label="Grafico attività palestra negli ultimi 30 giorni, con eventi datati presenti su Firebase">
     <div v-for="day in days" :key="day.date" class="lf-chart-day" :title="`${day.date}: ${day.booking} prenotazioni confermate, ${day.template} schede create, ${day.week} settimane create`">
      <div class="lf-chart-column"><span class="lf-chart-bar lf-chart-booking" :style="{height:barHeight(day.booking)}"></span><span class="lf-chart-bar lf-chart-template" :style="{height:barHeight(day.template)}"></span><span class="lf-chart-bar lf-chart-week" :style="{height:barHeight(day.week)}"></span></div>
      <small>{{day.label}}</small>
     </div>
    </div>
    <p v-else class="lf-no-trend"><LionIcon name="calendar" :size="24"/><strong>{{historyComplete?'Nessun evento datato negli ultimi 30 giorni':'Dati in caricamento o parziali'}}</strong></p>
    <div class="lf-chart-legend"><span><i class="lf-chart-key lf-chart-booking"></i> Prenotazioni</span><span><i class="lf-chart-key lf-chart-template"></i> Schede</span><span><i class="lf-chart-key lf-chart-week"></i> Settimane</span></div>
    <p v-if="!historyComplete" class="lf-widget-desc">Alcuni dati non sono ancora disponibili: il grafico può essere parziale.</p>
   </article>
   <article v-if="visible('distribution')" class="lf-dashboard-panel">
    <div class="lf-widget-head"><h2><LionIcon name="clipboard" :size="18"/> Distribuzione contenuti</h2><button type="button" class="lf-link-button" :disabled="programLoading||athletes===null" @click="emit('refresh-programs')">{{programLoading?'Aggiorno…':'Aggiorna'}}</button></div>
    
    <div class="lf-distribution-list">
     <div><span class="lf-legend-dot"></span> Programmi per Atleta <strong>{{programs??'—'}}</strong></div>
     <div><span class="lf-legend-dot lf-dot-light"></span> Schede personali collegate <strong>{{assigned??'—'}}</strong></div>
     <div><span class="lf-legend-dot lf-dot-neutral"></span> Schede personali non collegate <strong>{{unassigned??'—'}}</strong></div>
    </div>
    <p class="lf-widget-desc">Programmi distinti per atleta; schede uniche, cestino escluso.</p>
   </article>
   <article v-if="visible('appointments')" class="lf-dashboard-panel">
    <div class="lf-widget-head"><h2><LionIcon name="calendar" :size="18"/> Prossimi appuntamenti</h2><RouterLink :to="calendarUrl">Vedi calendario →</RouterLink></div>
    <p class="lf-widget-desc">Prenotazioni confermate nei prossimi 60 giorni</p>
    <div v-if="upcoming.length" class="lf-appointments-list">
     <RouterLink v-for="booking in upcoming" :key="booking.id" :to="calendarUrl" class="lf-appointment-row"><span class="lf-appointment-date">{{formatDate(booking.startMs)}}</span><span class="lf-appointment-text"><strong>{{booking.athleteName}}</strong><small>{{booking.discipline||booking.service}} · {{booking.coachName}}</small></span><LionIcon name="calendar" :size="16"/></RouterLink>
    </div>
    <p v-else class="lf-empty-state">{{bookings===null||bookings===undefined?'Prenotazioni non disponibili.':'Nessun appuntamento confermato nei prossimi 60 giorni.'}}</p>
   </article>
  </section>
  <section v-if="visible('summary')||visible('recent')||visible('shortcuts')" class="lf-coach-bottom-grid lf14-responsive-grid">
   <article v-if="visible('summary')" class="lf-dashboard-panel"><h2>Stato palestra</h2><div class="lf-summary-line">Atleti iscritti <strong>{{athletes??'—'}}</strong></div><div class="lf-summary-line">Schede archivio attive <strong>{{templates??'—'}}</strong></div><div class="lf-summary-line">Programmi per Atleta <strong>{{programs??'—'}}</strong></div></article>
   <article v-if="visible('recent')" class="lf-dashboard-panel"><h2>Attività recenti</h2><div v-if="recent.length" class="lf-recent-events"><RouterLink v-for="event in recent" :key="event.id" :to="eventUrl(event.url)" class="lf-recent-event"><span>{{event.label}}</span><small>{{formatDate(event.at)}}</small></RouterLink></div><p v-else class="lf-empty-state">{{historyComplete?'Nessun nuovo evento datato negli ultimi 30 giorni.':'Cronologia in caricamento o incompleta.'}}</p></article>
   <article v-if="visible('shortcuts')" class="lf-dashboard-panel"><h2>Accesso veloce</h2><div class="lf-access-grid"><RouterLink v-for="link in shortcuts" :key="link.to" :to="link.to"><LionIcon :name="link.icon"/>{{link.label}}</RouterLink></div></article>
  </section>
 </div>
</template>

<style scoped>
/* R21A: shortcut verso la personalizzazione già esistente; nessun dato o widget modificato. */
.lf-dashboard-customize{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card2);color:var(--text);font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;box-sizing:border-box}
.lf-dashboard-customize:hover{border-color:var(--lf-accent);color:var(--lf-accent)}
.lf-dashboard-customize:focus-visible{outline:2px solid var(--lf-accent);outline-offset:2px}
@media(max-width:600px){.lf-dashboard-customize{margin-top:8px;min-height:38px}}
@media(min-width:901px){
 .lf-coach-dashboard .lf-coach-greeting{min-height:44px;padding-right:0;flex-wrap:wrap;align-items:center}
 .lf-coach-dashboard .lf-coach-greeting>div:first-child{min-width:0;flex:1 1 220px;overflow-wrap:anywhere}
 .lf-coach-dashboard .lf14-header-actions{width:auto;max-width:100%;margin-left:auto;justify-content:flex-end;gap:8px;flex:0 1 auto;flex-wrap:wrap}
 .lf-coach-dashboard .lf14-header-actions :deep(.lf-search-desktop>button),.lf-coach-dashboard .lf-dashboard-customize{height:44px;min-height:44px;box-sizing:border-box}
}
</style>
