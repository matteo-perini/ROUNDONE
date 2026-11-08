<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Presentazione unica Atleta/Admin/Collaboratore. NON scrive dati su Firebase. */
import {computed,ref} from 'vue'
import {RouterLink} from 'vue-router'
import LionIcon from './LionIcon.vue'
import {displayCountry,profileRoleLabel,type ProfileRole} from '../features/profile/roleLabel'
import type {CoachMetrics} from '../features/profile/coachMetrics'
const props=withDefaults(defineProps<{
 role:ProfileRole; name:string; gymName?:string; photo?:string; bio?:string;
 email?:string; location?:string; height?:string; weight?:string;
 settingsTo:string; athleteTo?:string; coachStaffTo?:string; bookingsTo?:string; staffEnabled?:boolean; coachMetrics?:CoachMetrics;
}>(),{gymName:'Lion Fit',photo:'',bio:'',email:'',location:'Italia',height:'',weight:'',athleteTo:'/coach/atleti',coachStaffTo:'/coach/staff',bookingsTo:'/coach/prenotazioni',staffEnabled:true,coachMetrics:()=>({})})
const emit=defineEmits<{(e:'edit'):void;(e:'photo'):void}>()
const active=ref('')
const athlete=computed(()=>props.role==='atleta')
const title=computed(()=>profileRoleLabel(props.role))
const menu=computed(()=>athlete.value?[
 {id:'dati',icon:'user',title:'I miei dati',subtitle:'Informazioni personali e misure'},
 {id:'statistiche',icon:'calendar',title:'Statistiche',subtitle:'Andamento e progressi'},
 {id:'sport',icon:'dumbbell',title:'Preferenze allenamento',subtitle:'Sport, livello e obiettivi'},
 {id:'note',icon:'clipboard',title:'Note personali',subtitle:'Informazioni utili'},
 {id:'documenti',icon:'archive',title:'Documenti',subtitle:'Certificati e allegati'},
 ]:[
 {id:'dati',icon:'user',title:'Profilo personale',subtitle:'Dati del tuo account'},
 {id:'palestra',icon:'gym',title:'Palestra',subtitle:'Informazioni della struttura'},
 {id:'statistiche',icon:'calendar',title:'Statistiche',subtitle:'Gestione e andamento'},
 {id:'note',icon:'clipboard',title:'Note',subtitle:'Informazioni organizzative'},
 ])
function show(id:string){active.value=active.value===id?'':id}
</script>
<template>
 <section class="lfp-profile" :class="athlete?'lfp-athlete':'lfp-coach'" :aria-label="uiText('Il mio profilo')">
  <div class="lfp-heading"><div><span class="eyebrow">{{uiText("LION FIT · PROFILO")}}</span><h1>{{uiText(athlete?'Il mio profilo':'Profilo & Palestra')}}</h1><p class="muted">{{uiText(athlete?'La tua identità sportiva, in un unico posto.':'Gestisci il tuo profilo e le informazioni della palestra.')}}</p></div><RouterLink :to="settingsTo" class="lfp-gear" :aria-label="uiText('Impostazioni')"><LionIcon name="settings" :size="20"/></RouterLink></div>
  <div class="lfp-hero">
   <button class="lfp-avatar" type="button" aria-label="Modifica foto profilo" @click="emit('photo')"><span class="lfp-avatar-crop"><img v-if="photo" :src="photo" alt="Foto del profilo"/><img v-else src="/v1-preview/LOGO-APP.png" alt="Logo Lion Fit"/></span><span class="lfp-camera"><LionIcon name="camera" :size="15"/></span></button>
   <div class="lfp-identity"><h2>{{name||'Profilo'}}</h2><p>{{title}}</p><span class="lfp-gym"><LionIcon name="gym" :size="15"/> {{gymName}}</span><p v-if="athlete" class="lfp-location">{{displayCountry(location)}}<span v-if="bio"> · {{bio}}</span></p></div>
   <div class="lfp-hero-actions"><button type="button" class="lfp-edit-button" @click="emit('edit')"><LionIcon name="edit" :size="16"/> {{uiText("Modifica profilo")}}</button><RouterLink :to="settingsTo" class="lfp-outline"><LionIcon name="settings" :size="16"/> {{uiText("Impostazioni")}}</RouterLink></div>
  </div>
  <div class="lfp-facts" aria-label="Dati disponibili">
   <div v-if="athlete"><LionIcon name="user"/><b>{{uiText("In aggiornamento")}}</b><small>{{uiText("Età")}}</small></div>
   <div v-if="athlete"><LionIcon name="calendar"/><b>{{height?height+' cm':uiText('In aggiornamento')}}</b><small>{{uiText("Altezza")}}</small></div>
   <div v-if="athlete"><LionIcon name="dumbbell"/><b>{{weight?weight+' kg':uiText('In aggiornamento')}}</b><small>{{uiText("Peso")}}</small></div>
   <div v-if="athlete"><LionIcon name="info"/><b>{{uiText("In aggiornamento")}}</b><small>Body fat</small></div>
   <RouterLink v-if="!athlete" v-for="metric in [{icon:'users',label:'Atleti iscritti',count:coachMetrics.athletes,to:athleteTo},{icon:'clipboard',label:'Schede archivio',count:coachMetrics.templates,to:'/coach/archivio'},{icon:'calendar',label:'Prenotazioni confermate',count:coachMetrics.bookings,to:bookingsTo},{icon:'user',label:'Allenatori',count:coachMetrics.coaches,to:coachStaffTo}]" :key="metric.label" :to="metric.to" class="lfp-metric-link"><LionIcon :name="metric.icon"/><b>{{metric.count===undefined?uiText('Dato non disponibile'):metric.count}}</b><small>{{uiText(metric.label)}}</small></RouterLink>
  </div>
  <div class="lfp-sections">
   <section class="lfp-section" :class="{'lfp-section-open':active===item.id}" v-for="item in menu" :key="item.id">
    <button type="button" class="lfp-section-button" :aria-expanded="active===item.id" @click="show(item.id)"><span class="lfp-section-icon"><LionIcon :name="item.icon" :size="21"/></span><span class="lfp-section-copy"><strong>{{uiText(item.title)}}</strong><small>{{uiText(item.subtitle)}}</small></span><LionIcon name="chevron" :size="18"/></button>
    <div v-if="active===item.id" class="lfp-section-content">
     <template v-if="item.id==='dati'"><p><b>{{uiText("Nome:")}}</b> {{name}}</p><p v-if="email"><b>Email:</b> {{email}}</p><p v-if="athlete"><b>{{uiText("Paese:")}}</b> {{displayCountry(location)}}</p><p v-if="height"><b>{{uiText("Altezza:")}}</b> {{height}} cm</p><p v-if="weight"><b>{{uiText("Peso:")}}</b> {{weight}} kg</p><button class="lfp-inline-edit" type="button" @click="emit('edit')">{{uiText("Modifica i miei dati →")}}</button></template>
     <template v-else-if="item.id==='palestra'"><p><b>{{uiText("Palestra:")}}</b> {{gymName}}</p><p class="muted">{{uiText("Le informazioni e gli orari della struttura saranno disponibili dopo il collegamento alle impostazioni della palestra.")}}</p></template>
     <template v-else-if="item.id==='sport'"><p v-if="bio">{{bio}}</p><p class="muted">{{uiText("Sport, obiettivi e preferenze saranno progressivamente collegati al profilo.")}}</p></template>
     <template v-else><p class="muted">{{uiText("Sezione in aggiornamento: i dati verranno collegati in una versione successiva.")}}</p></template>
    </div>
   </section>
   <RouterLink class="lfp-section-button lfp-settings-link" :to="settingsTo"><span class="lfp-section-icon"><LionIcon name="settings" :size="21"/></span><span class="lfp-section-copy"><strong>{{uiText("Impostazioni")}}</strong><small>{{uiText("Tema, privacy, sicurezza e supporto")}}</small></span><LionIcon name="chevron" :size="18"/></RouterLink>
  </div>
  <div v-if="!athlete" class="lfp-actions"><h3>{{uiText("Azioni rapide")}}</h3><div class="lfp-action-grid"><RouterLink :to="athleteTo"><LionIcon name="users"/> {{uiText("Gestisci atleti")}}</RouterLink><RouterLink :to="bookingsTo"><LionIcon name="calendar"/> {{uiText("Prenotazioni")}}</RouterLink><RouterLink v-if="staffEnabled&&(role==='titolare'||role==='coach-demo')" :to="coachStaffTo"><LionIcon name="gym"/> {{uiText("Coach della palestra")}}</RouterLink><RouterLink :to="settingsTo"><LionIcon name="shield"/> {{uiText("Sicurezza account")}}</RouterLink></div></div>
 </section>
</template>
