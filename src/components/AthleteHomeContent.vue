<script setup lang="ts">
/** PATCH 30 R14C — Rebuild Home Atleta, no data/backend mutations. */
import {computed,onUnmounted,ref,watch,nextTick} from 'vue'
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
 trainingLink?:string;avatarUrl?:string
}>()
const activeSheet=ref<HomeSheet|null>(null)
const videoOpen=ref(false)
const videoCloseRef=ref<HTMLButtonElement|null>(null)
const firstName=computed(()=>props.name.trim().split(/\s+/)[0]||'Atleta')
const todayDisplay=computed(()=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',weekday:'long',day:'numeric',month:'long'}).format(new Date(props.nowMs??Date.now())))
const dayNumber=computed(()=>Math.max(1,Math.min(7,Math.round(props.calendarDay))))
const ringStyle=computed(()=>({'--lf15-day-progress':`${(dayNumber.value/7*100).toFixed(2)}%`}))
const currentWeekLabel=computed(()=>{
 if(!props.weekName.trim())return ''
 const found=props.weekName.match(/settimana\s*\d+/i)
 return found?.[0]||props.weekName.trim()
})
const liveActivities=computed(()=>props.activities.map(s=>s.trim()).filter(s=>s&&!/^(off|riposo)$/i.test(s)))
const isRestDay=computed(()=>props.activities.some(s=>/^(off|riposo)$/i.test(s.trim()))&&!liveActivities.value.length&&!props.sheets.length)
const free=computed(()=>props.freeSheets||[])
const hasTodayPlan=computed(()=>props.hasCurrentWeek??!!props.weekName.trim())
const todayHeadline=computed(()=>{
 if(hasTodayPlan.value)return liveActivities.value.join(' · ')||(props.sheets.length?'Scheda disponibile':isRestDay.value?'Giornata di riposo':'Nessuna attività prevista oggi')
 if(free.value.length)return free.value.length===1?free.value[0].title:'Le tue schede disponibili'
 return 'Nessun allenamento programmato oggi'
})
const todayNote=computed(()=>{
 if(hasTodayPlan.value){
  if(props.sheets.length)return `${props.weekName||'Piano attivo'} · ${props.sheets.length} ${props.sheets.length===1?'scheda collegata':'schede collegate'}`
  if(isRestDay.value)return 'Oggi è previsto recupero: il riposo fa parte del percorso.'
  return `${props.weekName||'Programma attivo'} · consulta le attività del giorno.`
 }
 if(free.value.length)return `${free.value.length} ${free.value.length===1?'scheda assegnata':'schede assegnate'} senza programmazione settimanale`
 return 'Nessuna scheda assegnata per oggi. Consulta il tuo piano.'
})
const directSheet=computed(()=>{
 if(hasTodayPlan.value&&props.sheets.length===1)return props.sheets[0]
 if(!hasTodayPlan.value&&free.value.length===1)return free.value[0]
 return null
})
const actionLabel=computed(()=>directSheet.value?'Apri scheda':hasTodayPlan.value&&props.sheets.length>1?'Scegli la scheda':hasTodayPlan.value&&liveActivities.value.length?'Visualizza attività':free.value.length?'Vedi le mie schede':isRestDay.value?'Consulta il piano':'Apri il mio piano')
const hasTrainingAction=computed(()=>!!directSheet.value||props.sheets.length>1)
function openSheet(){if(directSheet.value)activeSheet.value=directSheet.value}
function openTutorial(){videoOpen.value=true}
function onKey(e:KeyboardEvent){if(e.key==='Escape')videoOpen.value=false}
watch(videoOpen,async opened=>{if(opened){await nextTick();videoCloseRef.value?.focus()}})
if(typeof window!=='undefined')window.addEventListener('keydown',onKey)
onUnmounted(()=>{if(typeof window!=='undefined')window.removeEventListener('keydown',onKey)})
</script>
<template>
 <div v-lf-entrance="{id:'athlete-home-r14c',rows:[{match:'.lf14-gym-hero,.lf15-today,.lf15-route,.lf15-event-card,.lf15-progress-link,.lf15-quick-tile'}]}" class="lf-r14-home lf-r14-home-v3 lf15-home" aria-label="Dashboard Atleta">
  <GymIdentity hero>
   <div class="lf15-hero-greeting"><span class="lf15-kicker">BENVENUTO IN LIONFIT</span><h1>{{uiText('Ciao,')}} {{firstName}}! <span aria-hidden="true">👋</span></h1><p>Pronto per il tuo prossimo allenamento?</p></div>
  </GymIdentity>
  <section class="lf15-today" aria-label="Il tuo allenamento di oggi">
   <div class="lf15-today-top"><LionIcon name="dumbbell" :size="20"/><span>OGGI · {{todayDisplay}}</span></div>
   <h2>{{uiText(todayHeadline)}}</h2>
   <p>{{uiText(todayNote)}}</p>
   <div v-if="hasTodayPlan&&sheets.length>1" class="lf15-sheet-list"><button v-for="sheet in sheets" :key="sheet.id" type="button" @click="activeSheet=sheet">{{sheet.title}} <LionIcon name="chevron" :size="15"/></button></div>
   <button v-if="directSheet" type="button" class="lf15-main-cta" @click="openSheet"><LionIcon name="dumbbell" :size="20"/><span>{{uiText(actionLabel)}}</span><LionIcon name="chevron" :size="19"/></button>
   <RouterLink v-else :to="hasTodayPlan?dayLink:planLink" class="lf15-main-cta" :class="{'lf15-main-cta-muted':!hasTrainingAction&&!liveActivities.length}"><LionIcon name="calendar" :size="20"/><span>{{uiText(actionLabel)}}</span><LionIcon name="chevron" :size="19"/></RouterLink>
  </section>
  <RouterLink :to="planLink" class="lf15-route" :aria-label="`Giorno ${dayNumber} di 7 della settimana, ${currentWeekLabel||'nessun programma attivo'}. Apri il piano`">
   <span class="lf15-route-ring" :style="ringStyle" aria-hidden="true"><strong>{{dayNumber}}<small>/7</small></strong></span>
   <span class="lf15-route-content"><small>IL TUO PERCORSO</small><strong>{{currentWeekLabel|| (free.length?'Schede senza programmazione':'Nessun programma attivo')}}</strong><span>Giorno {{dayNumber}} di 7 · calendario settimanale</span><em v-if="hasTodayPlan&&weekName">{{weekName}}</em></span>
   <LionIcon name="chevron" :size="21"/>
  </RouterLink>
  <AthleteHomeHighlights v-if="uid&&gymId" :key="gymId+':'+uid" :uid="uid" :gym-id="gymId" :booking-link="bookingLink"/>
  <section v-else class="lf15-events" aria-label="Prenotazioni ed eventi"><RouterLink :to="bookingLink" class="lf15-event-card"><LionIcon name="calendar-plus" :size="24"/><strong>Prossima lezione</strong><span>Apri l'Agenda</span></RouterLink><RouterLink :to="bookingLink" class="lf15-event-card"><LionIcon name="trophy" :size="24"/><strong>Prossimo evento</strong><span>Apri l'Agenda</span></RouterLink></section>
  <RouterLink :to="progressLink" class="lf15-progress-link"><LionIcon name="progress" :size="27"/><span><strong>I tuoi progressi</strong><small>Allenamenti, misure e risultati registrati</small></span><LionIcon name="chevron" :size="20"/></RouterLink>
  <nav class="lf15-quick-grid" aria-label="Azioni rapide Atleta">
   <RouterLink class="lf15-quick-tile" :to="bookingLink"><LionIcon name="calendar-plus" :size="28"/><span>Prenota lezione</span></RouterLink>
   <RouterLink class="lf15-quick-tile" :to="trainingLink||progressLink"><LionIcon name="dumbbell" :size="28"/><span>I miei allenamenti</span></RouterLink>
   <RouterLink class="lf15-quick-tile" :to="planLink"><LionIcon name="book" :size="28"/><span>Le mie schede</span></RouterLink>
   <button class="lf15-quick-tile lf15-quick-video" type="button" @click="openTutorial"><LionIcon name="info" :size="28"/><span>Video &amp; Tutorial</span><small>In arrivo</small></button>
  </nav>
 </div>
 <SheetDetail v-if="activeSheet" :sheet="activeSheet" @close="activeSheet=null" @finish="activeSheet=null"/>
 <div v-if="videoOpen" class="lf15-video-backdrop" @click.self="videoOpen=false">
  <section class="lf15-video-dialog" role="dialog" aria-modal="true" aria-labelledby="lf15-video-title"><div class="lf15-video-symbol"><LionIcon name="info" :size="29"/></div><h2 id="lf15-video-title">Video &amp; Tutorial</h2><p>Stiamo preparando video, guide agli esercizi e consigli per allenarti con LionFit.</p><strong>Prossimamente su LionFit</strong><button ref="videoCloseRef" type="button" @click="videoOpen=false">Chiudi</button></section>
 </div>
</template>
