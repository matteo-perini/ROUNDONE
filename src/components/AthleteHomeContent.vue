<script setup lang="ts">
/** Home Atleta: struttura visuale derivata da ROUNDONE/www/athlete.html.
 * Solo presentazione: le schede vengono lette dai flussi già esistenti (Lab / Firestore).
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import LionIcon from './LionIcon.vue'
import SheetDetail from './SheetDetail.vue'
import type { ExerciseRecord } from '../features/sheets/domain'
import type { ProgramDay } from '../features/sheets/domain'

type HomeSheet = {id:string; title:string; exercises:readonly ExerciseRecord[]}
const props=defineProps<{
 name:string
 todayName:string
 weekName:string
 activities:readonly string[]
 sheets:readonly HomeSheet[]
 days?:readonly ProgramDay[]
 planLink:string
 archiveLink:string
 teamLink:string
 profileLink:string
 dayLink:string
}>()
const activeSheet=ref<HomeSheet|null>(null)
const firstName=computed(()=>props.name.trim().split(/\s+/)[0]||'Atleta')
const visibleActivities=computed(()=>{const entries=props.activities.filter(v=>v.trim());return props.sheets.length?entries.filter(v=>!/^(OFF|RIPOSO)$/i.test(v.trim())):entries})
const todayTitle=computed(()=>visibleActivities.value.length ? visibleActivities.value.join(' · ') : props.sheets.length?'SCHEDE ASSEGNATE PER OGGI':'Nessuna attività programmata')
const quick=[{label:'Il mio piano',icon:'calendar',key:'plan',sub:'Schede e programmi'},{label:'Profilo',icon:'user',key:'profile',sub:'Dati e preferenze'},{label:'Team',icon:'users',key:'team',sub:'La tua palestra'},{label:'Archivio',icon:'archive',key:'archive',sub:'Le tue schede'}] as const
const weekdayLabels=['LUN','MAR','MER','GIO','VEN','SAB','DOM'] as const
const todayIndex=computed(()=>{const now=new Date(); const day=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Europe/Rome'}).format(now);return ({Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6} as Record<string,number>)[day]??0})
const weekdaySummary=computed(()=>weekdayLabels.map((label,index)=>({label,index,planned:!!props.days?.[index]?.activities?.some(a=>a.trim()&&!/^(OFF|RIPOSO)$/i.test(a.trim()))})))
function target(key:(typeof quick)[number]['key']){
 return key==='plan'?props.planLink:key==='profile'?props.profileLink:key==='team'?props.teamLink:props.archiveLink
}
</script>
<template>
 <div class="lf-athlete-home" aria-label="Home Atleta">
  <section class="lf-athlete-intro">
   <div class="lf-home-slogan">ALLENATI <span>•</span> PIANIFICA <span>•</span> EVOLVI</div>
   <h1>Ciao, {{firstName}}! 👋</h1>
   <p>Le tue schede, i piani di allenamento e il tuo team, in un unico posto.</p>
  </section>
  <section class="lf-today-card" aria-label="Allenamento di oggi">
   <div class="lf-today-card-top"><span class="lf-today-pill">OGGI · {{todayName||'—'}}</span><span>{{weekName||'Nessuna settimana'}}</span></div>
   <div class="lf-today-content"><h2>{{todayTitle}}</h2><p>{{sheets.length?sheets.map(s=>s.title).join(' · '):'Consulta il tuo piano per i dettagli della giornata.'}}</p></div>
   <div class="lf-today-actions"><button v-for="(sheet,i) in sheets" :key="sheet.id" type="button" class="lf-today-sheet-btn" @click="activeSheet=sheet">Scheda {{i+1}}</button><RouterLink :to="dayLink" class="lf-today-go" aria-label="Apri l'allenamento del giorno">➜</RouterLink></div>
  </section>
  <section class="lf-week-overview" aria-label="Riepilogo della settimana">
   <div class="lf-section-heading"><h2><LionIcon name="calendar" :size="23"/> La tua settimana</h2><RouterLink :to="planLink">Vedi piano →</RouterLink></div>
   <div class="lf-week-row"><RouterLink v-for="day in weekdaySummary" :key="day.index" :to="planLink" class="lf-day-tile" :class="{'is-today':day.index===todayIndex,'has-plan':day.planned}" :aria-label="`${day.label}: ${day.planned?'attività programmata':'nessuna attività indicata'}`"><b>{{day.label}}</b><span class="lf-day-marker" aria-hidden="true">{{day.planned?'•':'○'}}</span></RouterLink></div>
   <p class="lf-week-help">I simboli indicano le attività programmate, non gli allenamenti completati.</p>
  </section>
  <section class="lf-home-shortcuts"><h2>ACCESSO RAPIDO</h2><div class="lf-home-shortcut-grid"><RouterLink v-for="item in quick" :key="item.key" :to="target(item.key)" class="lf-home-shortcut"><span class="lf-home-shortcut-icon"><LionIcon :name="item.icon" :size="25"/></span><span><strong>{{item.label}}</strong><small>{{item.sub}}</small></span><span class="lf-shortcut-arrow">›</span></RouterLink></div></section>
 </div>
 <SheetDetail v-if="activeSheet" :sheet="activeSheet" @close="activeSheet=null" @finish="activeSheet=null"/>
</template>
