<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import LionIcon from './LionIcon.vue'
const props=defineProps<{name:string;athletes:number|null;templates:number|null;bookings?:number|null;programs?:number|null;assigned?:number|null;unassigned?:number|null;source:string;athletesUrl:string;createUrl:string;calendarUrl:string;inviteUrl:string;libraryUrl:string;profileUrl:string;loading?:boolean;error?:string}>()
const metrics=computed(()=>[
 {label:'Atleti iscritti',value:props.athletes,icon:'users',sub:'Atleti della palestra'},
 {label:'Schede create',value:props.templates,icon:'dumbbell',sub:'Modelli attivi in archivio'},
 {label:'Prenotazioni',value:props.bookings??null,icon:'calendar',sub:'Conteggio da verificare'},
 {label:'Programmi',value:props.programs??null,icon:'clipboard',sub:'Programmi settimanali'}
])
const actions=computed(()=>[
 {label:'Atleti',to:props.athletesUrl,icon:'users'},
 {label:'Crea scheda',to:props.createUrl,icon:'plus'},
 {label:'Calendario',to:props.calendarUrl,icon:'calendar'},
 {label:'Invita atleta',to:props.inviteUrl,icon:'mail'}
])
</script>
<template>
 <div class="lf-coach-dashboard">
  <header class="lf-coach-greeting"><div><h1>Bentornato, {{name}}! 👊</h1><p>Gestisci atleti, schede, programmi e prenotazioni della tua palestra.</p></div><span class="lf-source-tag">{{source}}</span></header>
  <p v-if="loading" role="status" class="muted">Caricamento dati della palestra…</p>
  <p v-if="error" role="alert" class="notice">{{error}}</p>
  <section class="lf-kpi-grid" aria-label="Statistiche palestra"><article v-for="metric in metrics" :key="metric.label" class="lf-kpi-card"><span class="lf-kpi-icon"><LionIcon :name="metric.icon" :size="24"/></span><div><h2>{{metric.label}}</h2><strong>{{metric.value===null?'—':metric.value}}</strong><small>{{metric.value===null?'Dato non disponibile':metric.sub}}</small></div></article></section>
  <section class="lf-coach-hero-row"><div class="lf-coach-banner"><div><strong>LION <em>FIT</em></strong><span>PANNELLO COACH</span><p>ALLENATI <b>•</b> PIANIFICA <b>•</b> GESTISCI <b>•</b> CRESCI</p></div></div><div class="lf-dashboard-panel lf-coach-actions"><h2><LionIcon name="plus" :size="19"/> Azioni rapide</h2><div class="lf-action-grid"><RouterLink v-for="action in actions" :key="action.label" :to="action.to"><LionIcon :name="action.icon" :size="27"/><span>{{action.label}}</span></RouterLink></div></div></section>
  <section class="lf-coach-detail-grid">
   <article class="lf-dashboard-panel lf-activity-panel"><h2><LionIcon name="dumbbell" :size="18"/> Attività palestra</h2><p class="lf-widget-desc">Prenotazioni, schede e programmi · ultimi 30 giorni</p><div class="lf-no-trend"><LionIcon name="calendar" :size="24"/><strong>Cronologia non ancora disponibile</strong><span>Mostreremo un grafico soltanto quando i dati per giorno saranno verificati.</span></div></article>
   <article class="lf-dashboard-panel"><h2><LionIcon name="clipboard" :size="18"/> Distribuzione contenuti</h2><p class="lf-widget-desc">Conteggi effettivi, senza percentuali inventate</p><div class="lf-distribution-list"><div><span class="lf-legend-dot"></span>Programmi creati <strong>{{programs??'—'}}</strong></div><div><span class="lf-legend-dot lf-dot-light"></span>Schede abbinate a programmi <strong>{{assigned??'—'}}</strong></div><div><span class="lf-legend-dot lf-dot-neutral"></span>Schede non abbinate <strong>{{unassigned??'—'}}</strong></div></div><p class="lf-widget-desc">Le schede e i programmi hanno conteggi distinti.</p></article>
   <article class="lf-dashboard-panel"><div class="lf-widget-head"><h2><LionIcon name="calendar" :size="18"/> Prossimi appuntamenti</h2><RouterLink :to="calendarUrl">Vedi calendario →</RouterLink></div><div class="lf-empty-state">Apri il calendario per consultare gli appuntamenti effettivi della palestra.</div></article>
  </section>
  <section class="lf-coach-bottom-grid"><article class="lf-dashboard-panel"><h2>Stato palestra</h2><div class="lf-summary-line">Atleti iscritti <strong>{{athletes??'—'}}</strong></div><div class="lf-summary-line">Schede archiviate attive <strong>{{templates??'—'}}</strong></div><div class="lf-summary-line">Programmi settimanali <strong>{{programs??'—'}}</strong></div></article><article class="lf-dashboard-panel"><h2>Attività recenti</h2><div class="lf-empty-state">La cronologia verrà mostrata soltanto se presente e autorizzata dalla fonte dati.</div></article><article class="lf-dashboard-panel"><h2>Accesso veloce</h2><div class="lf-access-grid"><RouterLink :to="athletesUrl"><LionIcon name="users"/>Gestione atleti</RouterLink><RouterLink :to="libraryUrl"><LionIcon name="book"/>Libreria esercizi</RouterLink><RouterLink :to="profileUrl"><LionIcon name="settings"/>Profilo e palestra</RouterLink></div></article></section>
 </div>
</template>
