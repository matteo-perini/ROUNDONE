<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** PATCH 5/7 — Dashboard atleta V3: solo dati assegnati, senza scritture.
 * I risultati COMPLETATI non sono memorizzati nel modello operativo corrente:
 * l'indicatore mostra la copertura della programmazione, NON esecuzioni inventate.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import LionIcon from './LionIcon.vue'
import SheetDetail from './SheetDetail.vue'
import type { ExerciseRecord, ProgramDay } from '../features/sheets/domain'

type HomeSheet = {id:string; title:string; exercises:readonly ExerciseRecord[]}
const props=defineProps<{
 name:string;todayName:string;weekName:string
 activities:readonly string[];sheets:readonly HomeSheet[]
 days?:readonly ProgramDay[]
 planLink:string;archiveLink:string;progressLink:string;bookingLink:string;profileLink:string;dayLink:string
 avatarUrl?:string
}>()
const activeSheet=ref<HomeSheet|null>(null)
const firstName=computed(()=>props.name.trim().split(/\s+/)[0]||'Atleta')
const initials=computed(()=>props.name.trim().split(/\s+/).slice(0,2).map(part=>part.slice(0,1).toUpperCase()).join('')||'LF')
const weekdayLabels=['LUN','MAR','MER','GIO','VEN','SAB','DOM'] as const
const todayIndex=computed(()=>{
 const short=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Europe/Rome'}).format(new Date())
 return ({Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6} as Record<string,number>)[short]??0
})
const weekdaySummary=computed(()=>weekdayLabels.map((label,index)=>{
 const day=props.days?.[index]
 const hasActivity=!!day?.activities?.some(a=>a.trim()&&!/^(OFF|RIPOSO)$/i.test(a.trim()))
 return {label,index,planned:hasActivity||!!day?.templateId||!!day?.templateId2}
}))
const plannedDays=computed(()=>weekdaySummary.value.filter(d=>d.planned).length)
const hasCurrentWeek=computed(()=>!!props.weekName)
const circlePercent=computed(()=>hasCurrentWeek.value?Math.round(plannedDays.value/7*100):0)
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
function dayTarget(index:number):string{
 const [pathname,query='']=props.dayLink.split('?')
 const search=new URLSearchParams(query)
 if(!search.has('week'))return props.planLink
 search.set('day',String(index))
 return `${pathname}?${search.toString()}`
}
</script>
<template>
 <div class="lf-home-v3" aria-label="Dashboard Atleta">
  <section class="lf-v3-intro">
   <div class="lf-v3-person">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="uiText('Foto profilo')" class="lf-v3-avatar" />
    <span v-else class="lf-v3-avatar lf-v3-avatar-fallback" aria-hidden="true">{{initials}}</span>
    <div class="lf-v3-greeting"><span class="lf-v3-kicker">{{uiText("LION FIT · AREA ATLETA")}}</span><h1>{{uiText("Ciao,")}} {{firstName}}!</h1><p>{{uiText("Il tuo allenamento, tutto sotto controllo.")}}</p></div>
   </div>
   <div class="lf-v3-week-name"><LionIcon name="calendar" :size="17"/><span>{{weekName||uiText('Nessuna settimana attiva')}}</span></div>
  </section>

  <div class="lf-v3-feature-row">
   <section class="lf-v3-progress" aria-label="Giorni programmati questa settimana">
    <span class="lf-v3-section-label">{{uiText("LA TUA SETTIMANA")}}</span>
    <div class="lf-v3-ring" :style="{'--lf-v3-percent':`${circlePercent}%`}" role="img" :aria-label="hasCurrentWeek?`${plannedDays} giorni programmati su 7`:'Nessuna settimana attiva'">
     <div class="lf-v3-ring-center"><strong>{{hasCurrentWeek?`${plannedDays}/7`:'—'}}</strong><small>{{uiText("giorni con attività")}}</small></div>
    </div>
    <strong class="lf-v3-progress-foot">{{hasCurrentWeek?'Programmazione attuale':'Nessuna programmazione'}}</strong>
    <span class="lf-v3-progress-note">{{uiText("I completamenti reali arriveranno con Progressi.")}}</span>
   </section>

   <section class="lf-v3-today" aria-label="Allenamento di oggi">
    <div class="lf-v3-today-head"><span class="lf-v3-today-badge">{{uiText("OGGI ·")}} {{uiText(todayName)||'—'}}</span><LionIcon name="dumbbell" :size="20"/></div>
    <div class="lf-v3-today-main"><span class="lf-v3-section-label">{{uiText("ALLENAMENTO DEL GIORNO")}}</span><h2>{{uiText(todayTitle)}}</h2><p>{{uiText(todayNote)}}</p>
     <div v-if="sheets.length" class="lf-v3-sheets"><button v-for="sheet in sheets" :key="sheet.id" type="button" @click="activeSheet=sheet" :title="`Apri ${sheet.title}`">{{sheet.title}}</button></div>
    </div>
    <RouterLink :to="dayLink" class="lf-v3-today-cta"><span>{{uiText("Apri scheda di oggi")}}</span><LionIcon name="chevron" :size="18"/></RouterLink>
   </section>
  </div>

  <section class="lf-v3-weekdays" :aria-label="uiText('Giorni della settimana')">
   <div class="lf-v3-section-head"><strong>{{uiText("Questa settimana")}}</strong><RouterLink :to="planLink">{{uiText("Vedi il piano")}} <LionIcon name="chevron" :size="13"/></RouterLink></div>
   <div class="lf-v3-week-strip"><RouterLink v-for="day in weekdaySummary" :key="day.index" :to="dayTarget(day.index)" class="lf-v3-day" :class="{'is-current':day.index===todayIndex,'is-planned':day.planned}" :aria-label="`${day.label}, ${day.planned?'con attività':'senza attività'}`"><span>{{uiText(day.label)}}</span><i aria-hidden="true"/></RouterLink></div>
  </section>

  <section class="lf-v3-shortcuts" :aria-label="uiText('Accesso rapido')">
   <div class="lf-v3-section-head"><strong>{{uiText("Accesso rapido")}}</strong><RouterLink :to="progressLink" class="lf-v3-progress-link"><LionIcon name="progress" :size="16"/> {{uiText("Progressi")}} <LionIcon name="chevron" :size="13"/></RouterLink></div>
   <div class="lf-v3-shortcuts-grid"><RouterLink v-for="item in quick" :key="item.key" :to="target(item.key)" class="lf-v3-shortcut"><span class="lf-v3-shortcut-icon"><LionIcon :name="item.icon" :size="22"/></span><span class="lf-v3-shortcut-copy"><strong>{{uiText(item.label)}}</strong><small>{{uiText(item.subtitle)}}</small></span><LionIcon name="chevron" :size="15" class="lf-v3-chevron"/></RouterLink></div>
  </section>
 </div>
 <SheetDetail v-if="activeSheet" :sheet="activeSheet" @close="activeSheet=null" @finish="activeSheet=null"/>
</template>
