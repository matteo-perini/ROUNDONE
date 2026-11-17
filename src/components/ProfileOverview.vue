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
 settingsTo:string; athleteTo?:string; coachStaffTo?:string; bookingsTo?:string; staffEnabled?:boolean; workoutsEnabled?:boolean; coachMetrics?:CoachMetrics;
}>(),{gymName:'Lion Fit',photo:'',bio:'',email:'',location:'Italia',height:'',weight:'',athleteTo:'/coach/atleti',coachStaffTo:'/coach/staff',bookingsTo:'/coach/prenotazioni',staffEnabled:true,workoutsEnabled:false,coachMetrics:()=>({})})
const emit=defineEmits<{(e:'edit'):void;(e:'photo'):void}>()
const active=ref('')
const athlete=computed(()=>props.role==='atleta')
const title=computed(()=>profileRoleLabel(props.role))
const menu=computed(()=>athlete.value?[
 {id:'dati',icon:'user',title:'I miei dati',subtitle:'Informazioni personali e misure'},
 ]:[
 {id:'dati',icon:'user',title:'Profilo personale',subtitle:'Dati del tuo account'},
 {id:'palestra',icon:'gym',title:'Palestra',subtitle:'Informazioni della struttura'},
 ])
function show(id:string){active.value=active.value===id?'':id}
</script>
<template>
 <section class="lfp-profile" :class="athlete?'lfp-athlete':'lfp-coach'" :aria-label="uiText('Il mio profilo')">
  <div class="lfp-heading"><div><h1>{{uiText(athlete?'Il mio profilo':'Profilo & Palestra')}}</h1></div></div>
  <div class="lfp-hero">
   <button class="lfp-avatar" type="button" aria-label="Modifica foto profilo" @click="emit('photo')"><span class="lfp-avatar-crop"><img v-if="photo" :src="photo" alt="Foto del profilo"/><img v-else src="/v1-preview/LOGO-APP.png" alt="Logo Lion Fit"/></span><span class="lfp-camera"><LionIcon name="camera" :size="15"/></span></button>
   <div class="lfp-identity"><h2>{{name||'Profilo'}}</h2><p>{{title}}</p><span class="lfp-gym"><LionIcon name="gym" :size="15"/> {{uiText("Palestra:")}} {{gymName}}</span><p v-if="athlete" class="lfp-location">{{displayCountry(location)}}<span v-if="bio"> · {{bio}}</span></p></div>
   <div class="lfp-hero-actions"><button type="button" class="lfp-edit-button" @click="emit('edit')"><LionIcon name="edit" :size="16"/> {{uiText("Modifica profilo")}}</button></div>
  </div>
  <div class="lfp-facts" :style="athlete?{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}:undefined" aria-label="Dati disponibili">
   <div v-if="athlete"><LionIcon name="calendar"/><b>{{height?height+' cm':uiText('Non registrato')}}</b><small>{{uiText("Altezza")}}</small></div>
   <div v-if="athlete"><LionIcon name="dumbbell"/><b>{{weight?weight+' kg':uiText('Non registrato')}}</b><small>{{uiText("Peso")}}</small></div>
   <RouterLink v-if="!athlete" v-for="metric in [{icon:'users',label:'Atleti iscritti',count:coachMetrics.athletes,to:athleteTo},{icon:'clipboard',label:'Schede archivio',count:coachMetrics.templates,to:'/coach/archivio'},{icon:'calendar',label:'Prenotazioni confermate',count:coachMetrics.bookings,to:bookingsTo},{icon:'user',label:'Allenatori',count:coachMetrics.coaches,to:coachStaffTo}]" :key="metric.label" :to="metric.to" class="lfp-metric-link"><LionIcon :name="metric.icon"/><b>{{metric.count===undefined?uiText('Dato non disponibile'):metric.count}}</b><small>{{uiText(metric.label)}}</small></RouterLink>
  </div>
  <div class="lfp-sections">
   <section class="lfp-section" :class="{'lfp-section-open':active===item.id}" v-for="item in menu" :key="item.id">
    <button type="button" class="lfp-section-button" :aria-expanded="active===item.id" @click="show(item.id)"><span class="lfp-section-icon"><LionIcon :name="item.icon" :size="21"/></span><span class="lfp-section-copy"><strong>{{uiText(item.title)}}</strong></span><LionIcon name="chevron" :size="18"/></button>
    <div v-if="active===item.id" class="lfp-section-content">
     <template v-if="item.id==='dati'"><p><b>{{uiText("Nome:")}}</b> {{name}}</p><p v-if="email"><b>Email:</b> {{email}}</p><p v-if="athlete"><b>{{uiText("Paese:")}}</b> {{displayCountry(location)}}</p><p v-if="height"><b>{{uiText("Altezza:")}}</b> {{height}} cm</p><p v-if="weight"><b>{{uiText("Peso:")}}</b> {{weight}} kg</p><button class="lfp-inline-edit" type="button" @click="emit('edit')">{{uiText("Modifica i miei dati →")}}</button></template>
     <template v-else-if="item.id==='palestra'"><p><b>{{uiText("Palestra:")}}</b> {{gymName}}</p><p class="muted">{{uiText("Il titolare può modificare il nome, il logo e la copertina dalle impostazioni della palestra.")}}</p></template>
    </div>
   </section>
   <RouterLink v-if="athlete && workoutsEnabled" class="lfp-section-button" to="/progressi"><span class="lfp-section-icon"><LionIcon name="dumbbell" :size="21"/></span><span class="lfp-section-copy"><strong>{{uiText("Allenamenti")}}</strong><small>{{uiText("Storico, andamento e obiettivi")}}</small></span><LionIcon name="chevron" :size="18"/></RouterLink>
   <RouterLink v-if="!athlete && staffEnabled && (role==='titolare'||role==='coach-demo')" class="lfp-section-button lfp-mobile-staff" :to="coachStaffTo"><span class="lfp-section-icon"><LionIcon name="users" :size="21"/></span><span class="lfp-section-copy"><strong>{{uiText("Inviti e Team")}}</strong></span><LionIcon name="chevron" :size="18"/></RouterLink>
   <RouterLink class="lfp-section-button lfp-settings-link" :to="settingsTo"><span class="lfp-section-icon"><LionIcon name="settings" :size="21"/></span><span class="lfp-section-copy"><strong>{{uiText("Impostazioni")}}</strong></span><LionIcon name="chevron" :size="18"/></RouterLink>
  </div>
  <div v-if="!athlete" class="lfp-actions"><h3>{{uiText("Azioni rapide")}}</h3><div class="lfp-action-grid"><RouterLink :to="athleteTo"><LionIcon name="users"/> {{uiText("Gestisci atleti")}}</RouterLink><RouterLink :to="bookingsTo"><LionIcon name="calendar"/> {{uiText("Prenotazioni")}}</RouterLink><RouterLink v-if="staffEnabled&&(role==='titolare'||role==='coach-demo')" :to="coachStaffTo"><LionIcon name="gym"/> {{uiText("Inviti e Team")}}</RouterLink></div></div>
 </section>
</template>

<style>
/* PATCH 23: profilo atleta compatto; desktop e coach conservano il layout. */
@media(max-width:767px){
 .app.as-athlete .lfp-athlete{gap:10px;min-width:0}
 .app.as-athlete .lfp-athlete .lfp-heading{margin:0}
 .app.as-athlete .lfp-athlete .lfp-heading :is(.eyebrow,p,.lfp-gear),
 .app.as-athlete .lfp-athlete .lfp-hero-actions>.lfp-outline{display:none}
 .app.as-athlete .lfp-athlete .lfp-heading h1{font-size:24px;margin:0}
 .app.as-athlete .lfp-athlete .lfp-hero{padding:14px;gap:12px;min-width:0;border-radius:16px}
 .app.as-athlete .lfp-athlete .lfp-hero .lfp-avatar{width:72px!important;height:72px!important;min-width:72px!important;min-height:72px!important;max-width:72px!important;max-height:72px!important;flex:0 0 72px!important}
 .app.as-athlete .lfp-athlete .lfp-identity h2{font-size:18px;line-height:1.25;overflow-wrap:anywhere;margin-bottom:4px}
 .app.as-athlete .lfp-athlete .lfp-identity p{margin-bottom:4px;font-size:12px;overflow-wrap:anywhere}
 .app.as-athlete .lfp-athlete .lfp-gym{max-width:100%;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;padding:4px 7px;font-size:11px}
 .app.as-athlete .lfp-athlete .lfp-gym svg{flex:none}
 .app.as-athlete .lfp-athlete .lfp-location{margin-top:6px!important;margin-bottom:0}
 .app.as-athlete .lfp-athlete .lfp-hero-actions{width:100%;min-width:0;flex-direction:row;gap:0}
 .app.as-athlete .lfp-athlete .lfp-edit-button{width:100%;min-height:44px;font-size:13px}
 .app.as-athlete .lfp-athlete .lfp-facts{gap:8px}
 .app.as-athlete .lfp-athlete .lfp-facts>div{min-height:64px;padding:8px;gap:3px}
 .app.as-athlete .lfp-athlete .lfp-facts b{font-size:14px}
 .app.as-athlete .lfp-athlete .lfp-facts small{font-size:11px}
 .app.as-athlete .lfp-athlete .lfp-sections{grid-template-columns:minmax(0,1fr);gap:0;padding:0 10px;background:var(--card);border:1px solid var(--border);border-radius:14px}
 .app.as-athlete .lfp-athlete .lfp-sections>.lfp-section,.app.as-athlete .lfp-athlete .lfp-sections>.lfp-section-button{border:0;border-radius:0;background:transparent;box-shadow:none}
 .app.as-athlete .lfp-athlete .lfp-sections>*+*{border-top:1px solid var(--border)}
 .app.as-athlete .lfp-athlete .lfp-section-button{padding:8px 3px;min-height:52px;gap:10px;box-sizing:border-box}
 .app.as-athlete .lfp-athlete .lfp-section-icon{width:34px;height:34px}
 .app.as-athlete .lfp-athlete .lfp-section-copy strong{font-size:14px}
 .app.as-athlete .lfp-athlete .lfp-section-copy small{font-size:11px;line-height:1.35;margin-top:2px}
 .app.as-athlete .lfp-athlete .lfp-section-content{padding:10px 8px 12px;overflow-wrap:anywhere}
 .app.as-athlete .lfp-athlete .lfp-section-button:focus-visible,.app.as-athlete .lfp-athlete .lfp-edit-button:focus-visible{outline:2px solid var(--mint);outline-offset:-2px}
}
</style>
