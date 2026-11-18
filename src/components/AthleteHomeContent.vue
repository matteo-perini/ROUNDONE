<script setup lang="ts">
/** PATCH 30 R14 — Home Atleta di sola lettura: dati dal piano effettivo e dall'Agenda. */
import {computed,ref} from 'vue'
import {RouterLink} from 'vue-router'
import {uiText} from '../features/i18n/interfaceLanguage'
import type {ExerciseRecord,ProgramDay} from '../features/sheets/domain'
import LionIcon from './LionIcon.vue'
import GymIdentity from './GymIdentity.vue'
import SheetDetail from './SheetDetail.vue'
import AthleteHomeHighlights from './AthleteHomeHighlights.vue'
type HomeSheet={id:string;title:string;exercises:readonly ExerciseRecord[]}
const props=defineProps<{
 name:string;todayName:string;weekName:string;calendarDay:number;nowMs?:number
 activities:readonly string[];sheets:readonly HomeSheet[];freeSheets?:readonly HomeSheet[];hasCurrentWeek?:boolean
 days?:readonly ProgramDay[];gymId?:string;uid?:string
 planLink:string;archiveLink:string;progressLink:string;bookingLink:string;profileLink:string;dayLink:string
 avatarUrl?:string
}>()
const activeSheet=ref<HomeSheet|null>(null)
const firstName=computed(()=>props.name.trim().split(/\s+/)[0]||'Atleta')
const todayDisplay=computed(()=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',weekday:'long',day:'numeric',month:'long'}).format(new Date(props.nowMs??Date.now())))
const dayNumber=computed(()=>Math.max(1,Math.min(7,Math.round(props.calendarDay))))
const currentWeekLabel=computed(()=>{
 if(!props.weekName.trim())return ''
 const found=props.weekName.match(/settimana\s*\d+/i)
 return found?.[0]||props.weekName.trim()
})
const liveActivities=computed(()=>props.activities.map(s=>s.trim()).filter(s=>s&&!/^(off|riposo)$/i.test(s)))
const isRestDay=computed(()=>props.activities.some(s=>/^(off|riposo)$/i.test(s.trim()))&&!liveActivities.value.length&&!props.sheets.length)
const free=computed(()=>props.freeSheets||[])
const hasTodayPlan=computed(()=>!!props.hasCurrentWeek)
const todayHeadline=computed(()=>{
 if(hasTodayPlan.value)return liveActivities.value.join(' · ')||(props.sheets.length?'Scheda disponibile':isRestDay.value?'Giornata di riposo':'Nessuna attività prevista oggi')
 if(free.value.length)return free.value.length===1?free.value[0].title:'Le tue schede disponibili'
 return 'Nessun allenamento programmato oggi'
})
const todayNote=computed(()=>{
 if(hasTodayPlan.value){
  if(props.sheets.length)return `${props.sheets.length} ${props.sheets.length===1?'scheda collegata':'schede collegate'} al programma`
  return isRestDay.value?'Il recupero fa parte del percorso.':'Consulta le attività e i prossimi giorni dal Piano.'
 }
 if(free.value.length)return `${free.value.length} ${free.value.length===1?'scheda assegnata':'schede assegnate'} senza programmazione settimanale`
 return 'Il Coach non ha ancora assegnato attività per oggi.'
})
const directSheet=computed(()=>{
 if(hasTodayPlan.value&&props.sheets.length===1)return props.sheets[0]
 if(!hasTodayPlan.value&&free.value.length===1)return free.value[0]
 return null
})
const actionLabel=computed(()=>directSheet.value?'Apri scheda':hasTodayPlan.value&&props.sheets.length>1?'Scegli scheda di oggi':hasTodayPlan.value&&liveActivities.value.length?'Visualizza attività di oggi':free.value.length?'Vedi le mie schede':'Consulta il mio piano')
const hasTrainingAction=computed(()=>!!directSheet.value||props.sheets.length>1)
function openSheet(){if(directSheet.value)activeSheet.value=directSheet.value}
</script>
<template>
 <div v-lf-entrance="{id:'athlete-home-r14',rows:[{match:'.lf-r14-identity,.lf-r14-today,.lf-r14-progress,.lf-r14-upcoming'}]}" class="lf-r14-home" aria-label="Dashboard Atleta">
  <section class="lf-r14-identity" aria-label="Benvenuto e palestra">
   <div class="lf-r14-greeting"><span class="lf-r14-eyebrow">LA TUA AREA ATLETA</span><h1>{{uiText('Ciao,')}} {{firstName}}! <span aria-hidden="true">👋</span></h1><p>Il tuo percorso, le attività e gli appuntamenti in un unico posto.</p></div>
   <GymIdentity compact/>
  </section>
  <section class="lf-r14-today" aria-label="Allenamento di oggi">
   <div class="lf-r14-today-label"><LionIcon name="calendar" :size="19"/><span>OGGI · {{todayDisplay}}</span></div>
   <h2>{{uiText(todayHeadline)}}</h2>
   <p>{{uiText(todayNote)}}</p>
   <div v-if="hasTodayPlan&&sheets.length>1" class="lf-r14-sheet-chips"><button v-for="sheet in sheets" :key="sheet.id" type="button" @click="activeSheet=sheet">{{sheet.title}} <span aria-hidden="true">›</span></button></div>
   <button v-if="directSheet" type="button" class="lf-r14-primary-action" @click="openSheet()"><span>{{uiText(actionLabel)}}</span><LionIcon name="chevron" :size="19"/></button>
   <RouterLink v-else :to="hasTodayPlan?dayLink:planLink" class="lf-r14-primary-action" :class="{'lf-r14-secondary-action':!hasTrainingAction&&!liveActivities.length}"><span>{{uiText(actionLabel)}}</span><LionIcon name="chevron" :size="19"/></RouterLink>
  </section>
  <RouterLink :to="planLink" class="lf-r14-progress" :aria-label="`Giorno ${dayNumber} di 7 della settimana, ${currentWeekLabel||'nessun programma attivo'}. Apri il piano`">
   <span class="lf-r14-progress-circle" aria-hidden="true"><strong>{{dayNumber}}<small>/7</small></strong></span>
   <span class="lf-r14-progress-copy"><small>IL TUO PERCORSO</small><strong>{{currentWeekLabel|| (free.length?'Schede senza programmazione':'Nessun programma attivo')}}</strong><span>Giorno {{dayNumber}} di 7 · calendario settimanale</span></span>
   <LionIcon name="chevron" :size="19"/>
  </RouterLink>
  <AthleteHomeHighlights v-if="uid&&gymId" :key="gymId+':'+uid" :uid="uid" :gym-id="gymId" :booking-link="bookingLink"/>
  <section v-else class="lf-r14-home-agenda-link"><RouterLink :to="bookingLink">Visualizza Agenda e prenotazioni <LionIcon name="chevron" :size="16"/></RouterLink></section>
 </div>
 <SheetDetail v-if="activeSheet" :sheet="activeSheet" @close="activeSheet=null" @finish="activeSheet=null"/>
</template>
