<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** PATCH 5/7 — Dashboard atleta V3: solo dati assegnati, senza scritture.
 * Il cerchio ora indica il giorno del calendario (lun=1, dom=7),
 * NON gli allenamenti programmati né quelli completati.
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import LionIcon from './LionIcon.vue'
import SheetDetail from './SheetDetail.vue'
import type { ExerciseRecord, ProgramDay } from '../features/sheets/domain'

type HomeSheet = {id:string; title:string; exercises:readonly ExerciseRecord[]}
const props=defineProps<{
 name:string;todayName:string;weekName:string;calendarDay:number
 activities:readonly string[];sheets:readonly HomeSheet[]
 days?:readonly ProgramDay[]
 planLink:string;archiveLink:string;progressLink:string;bookingLink:string;profileLink:string;dayLink:string
 avatarUrl?:string
}>()
const activeSheet=ref<HomeSheet|null>(null)
// Il cerchio entra in animazione solo quando la Home viene aperta.
// Il valore reale viene sempre dalle attività programmate, non dai risultati eseguiti.
const ringReady=ref(false)
let ringFrame=0
onMounted(()=>{ringFrame=requestAnimationFrame(()=>{ringReady.value=true})})
onUnmounted(()=>{if(ringFrame)cancelAnimationFrame(ringFrame)})
const firstName=computed(()=>props.name.trim().split(/\s+/)[0]||'Atleta')
// Il cerchio segue il calendario di Roma, anche nei giorni senza attivita'.
const elapsedDays=computed(()=>Math.min(7,Math.max(1,Math.round(props.calendarDay))))
const hasCurrentWeek=computed(()=>!!props.weekName)
const shortWeekLabel=computed(()=>{
 const name=props.weekName.trim()
 if(!name)return 'Nessuna settimana attiva'
 const found=name.match(/settimana\s*\d+/i)
 return found?.[0]||name
})
const circlePercent=computed(()=>Math.round(elapsedDays.value/7*100))
const todayDisplay=computed(()=>props.todayName.trim() || new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'Europe/Rome'}).format(new Date()))
const visibleActivities=computed(()=>props.activities.map(v=>v.trim()).filter(v=>v&&!/^(OFF|RIPOSO)$/i.test(v)))
const todayTitle=computed(()=>visibleActivities.value.join(' · ') || (props.sheets.length?'Schede assegnate per oggi':'Nessun allenamento oggi'))
const todayNote=computed(()=>props.sheets.length?'Schede collegate':'Consulta il piano per vedere le attività assegnate')
const quick=[
 {label:'Il mio piano',icon:'calendar',key:'plan',subtitle:'Allenamenti'},
 {label:'Il mio profilo',icon:'user',key:'profile',subtitle:'I miei dati'},
 {label:'Prenotazioni',icon:'calendar-plus',key:'booking',subtitle:'Prenota una sessione'},
 {label:'Archivio',icon:'archive',key:'archive',subtitle:'Schede e storico'},
] as const
function target(key:(typeof quick)[number]['key']){
 return key==='plan'?props.planLink:key==='profile'?props.profileLink:key==='booking'?props.bookingLink:props.archiveLink
}
</script>
<template>
 <div class="lf-home-v3 lf-home-approved" aria-label="Dashboard Atleta">
  <section class="lf-v3-intro">
   <div class="lf-v3-greeting">
    <h1>{{uiText('Ciao,')}} {{firstName}}! <span class="lf-v3-wave" aria-hidden="true">👋</span></h1>
    <p>{{uiText('Il tuo allenamento, tutto sotto controllo.')}}</p>
   </div>
  </section>

  <!-- La settimana resta in UNA card orizzontale con il cerchio, non con sette tessere. -->
  <RouterLink :to="planLink" class="lf-v3-progress" :aria-label="`${shortWeekLabel}, giorno ${elapsedDays} di 7 della settimana. Apri il piano`">
   <span class="lf-v3-ring" aria-hidden="true">
    <svg viewBox="0 0 100 100" class="lf-v3-ring-svg">
     <circle class="lf-v3-ring-track" cx="50" cy="50" r="43" pathLength="100"/>
     <circle class="lf-v3-ring-value" cx="50" cy="50" r="43" pathLength="100" stroke-dasharray="100 100" :style="{'stroke-dashoffset':ringReady?100-circlePercent:100}"/>
    </svg>
    <span class="lf-v3-ring-center"><strong>{{`${elapsedDays}/7`}}</strong></span>
   </span>
   <span class="lf-v3-week-summary">
    <strong>{{shortWeekLabel}}</strong>
    <span>{{uiText('Giorno')}} {{elapsedDays}} {{uiText('di')}} 7 · {{uiText('avanzamento settimanale')}}</span>
   </span>
   <LionIcon name="chevron" :size="24" class="lf-v3-week-arrow" />
  </RouterLink>

  <!-- Card del giorno con foto locale esistente: i dati sono SEMPRE quelli live. -->
  <section class="lf-v3-today" aria-label="Allenamento di oggi">
   <div class="lf-v3-today-head"><LionIcon name="calendar" :size="23"/><span>{{uiText('OGGI ·')}} {{uiText(todayDisplay)}}</span></div>
   <div class="lf-v3-today-main">
    <h2>{{uiText(todayTitle)}}</h2>
    <p>{{uiText(todayNote)}}</p>
    <div v-if="sheets.length" class="lf-v3-sheets"><button v-for="sheet in sheets" :key="sheet.id" type="button" @click="activeSheet=sheet" :title="`Apri ${sheet.title}`">{{sheet.title}}</button></div>
   </div>
   <RouterLink :to="dayLink" class="lf-v3-today-cta"><span>{{uiText('Apri scheda di oggi')}}</span><LionIcon name="chevron" :size="23"/></RouterLink>
  </section>

  <!-- Solo quattro azioni rapide: niente riquadro settimanale separato. -->
  <section class="lf-v3-shortcuts" :aria-label="uiText('Accesso rapido')">
   <div class="lf-v3-section-head"><strong>{{uiText('Accesso rapido')}}</strong></div>
   <div class="lf-v3-shortcuts-grid">
    <RouterLink v-for="item in quick" :key="item.key" :to="target(item.key)" class="lf-v3-shortcut">
     <span class="lf-v3-shortcut-icon"><LionIcon :name="item.icon" :size="25"/></span>
     <span class="lf-v3-shortcut-copy"><strong>{{uiText(item.label)}}</strong></span>
    </RouterLink>
   </div>
  </section>
 </div>
 <SheetDetail v-if="activeSheet" :sheet="activeSheet" @close="activeSheet=null" @finish="activeSheet=null"/>
</template>
