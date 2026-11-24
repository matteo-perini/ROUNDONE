<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/**
 * Fase 2M/A — una sola UI del piano, indipendente dalla sorgente dei dati.
 * La stessa vista usa il Lab locale oppure gli snapshot Firestore Emulator.
 * Nessuna scrittura, nessuna deduplicazione di documenti, solo raggruppamento visivo.
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {useRomeDayClock} from '../features/performance/useRomeDayClock'
import {useRoute,useRouter} from 'vue-router'
import {romeDayIndex,isDateInStoredWeek} from '../features/athletes/romeWeekProgress'
import {forWeekRepresentative,weekDayLinkedSheetNames,exactWeekDaySlots} from '../features/sheets/athleteWeekVisual.ts'
import SheetDetail from './SheetDetail.vue'
import type { Groups, Personal, ProgramWeek } from '../features/sheets/domain'
import { uniqueSemanticSheets, visualSheetGroups } from '../features/sheets/semanticDedup'
import {activeAssignmentGroups,partitionPrograms,weekOrdinal,romeDate,weekEnd} from '../features/sheets/assignmentPolicy'
import {groupActivePrograms,programForWeek,activeWeekOn} from '../features/sheets/programFamilies'

const props = withDefaults(defineProps<{
  athleteKey: string
  personal: (Omit<Personal,'athleteId'> & {athleteId?:string})[]
  weeks: ProgramWeek[]
  groups: Groups
  weekId?: string
  initialDay?: number
  archiveExpired?: boolean
}>(), { weekId: '' })
const emit = defineEmits<{ 'update:weekId': [id: string] }>()
const route=useRoute(),router=useRouter()

const opened = ref<Personal | null>(null)
const showSheetChoices=ref(false)
const selectedDay = ref<number | null>(Number.isInteger(props.initialDay) && props.initialDay! >= 0 && props.initialDay! <= 6 ? props.initialDay! : null)
const allWeeks = computed(() => props.weeks.filter(w => !w.deletedAt))
const todayClock=useRomeDayClock()
const programs=computed(()=>props.archiveExpired?partitionPrograms(allWeeks.value,romeDate(todayClock.value)):groupActivePrograms(allWeeks.value))
const todayIso=()=>romeDate(todayClock.value)
const selectedFamily=computed(()=>{
 const explicit=programForWeek(programs.value,props.weekId)
 if(explicit)return explicit
 const date=todayIso()
 return programs.value.find(p=>!!activeWeekOn(p.weeks,date))||programs.value.find(p=>p.startDate>=date)||programs.value.at(-1)
})
const activeWeeks=computed(()=>selectedFamily.value?.weeks||[])
const week = computed(() => activeWeeks.value.find(w => w.id === props.weekId) ?? activeWeekOn(activeWeeks.value,todayIso())??activeWeeks.value[0])
const weekPosition=computed(()=>week.value?weekOrdinal(week.value,activeWeeks.value):0)
const selectedWeekLabel=computed(()=>`${selectedFamily.value?.title||'Programma'} · Settimana ${weekPosition.value}`)
const liveGroups=computed(()=>props.archiveExpired?activeAssignmentGroups(props.personal.filter((p):p is Personal=>p.athleteId===props.athleteKey),props.weeks,props.athleteKey,todayIso()):props.groups)
const visual = computed(() => visualSheetGroups(liveGroups.value))
const programmed = computed(() => visual.value.programmed.filter(group => group.links.some(link => link.weekId === week.value?.id)))
const unprogrammed = computed(() => visual.value.unprogrammed)
const sheetCount = computed(() => props.archiveExpired ? visual.value.programmed.length+visual.value.unprogrammed.length : uniqueSemanticSheets(props.personal.filter(s => !s.deletedAt)).length)
const weekDays = computed(() => week.value?.days ?? [])
const currentDayIndex = computed(() =>
  isDateInStoredWeek(week.value?.startDate,todayClock.value) ? romeDayIndex(todayClock.value) : -1
)
const selectedDayDetails = computed(() => selectedDay.value === null ? null : weekDays.value[selectedDay.value] ?? null)
// The today card is derived from the actual Rome calendar date, not from a
// manually browsed future week. It never invents an assignment or training.
const todayDayIndex = computed(() => romeDayIndex(todayClock.value))
const todayWeek = computed(() => activeWeekOn(selectedFamily.value?.weeks||[],todayIso())
  ?? programs.value.map(p=>activeWeekOn(p.weeks,todayIso())).find((w): w is ProgramWeek => Boolean(w)))
const todayLinks = computed(() => exactWeekDaySlots(liveGroups.value,todayWeek.value,todayDayIndex.value))
const todayActivities = computed(() => activitiesFor(todayWeek.value,todayDayIndex.value,todayLinks.value.length>0))
const todayProgramTitle = computed(() => programs.value.find(p=>p.weeks.some(w=>w.id===todayWeek.value?.id))?.title||'')
const firstFreeSheet = computed(() => unprogrammed.value[0]?.sheet)
const todayHasPlan = computed(() => Boolean(todayWeek.value))
const todayHeadline = computed(() => {
 if(todayHasPlan.value) return todayActivities.value.join(' · ') || (todayLinks.value.length?'Scheda disponibile':'Giornata senza attività')
 if(firstFreeSheet.value) return firstFreeSheet.value.title
 return programs.value.length?'Nessuna attività programmata oggi':'Il tuo piano personale'
})
const todayMessage = computed(() => {
 if(todayHasPlan.value) return todayLinks.value.length===1?`1 scheda assegnata`:todayLinks.value.length>1?`${todayLinks.value.length} schede assegnate`:'Nessuna scheda collegata oggi'
 if(firstFreeSheet.value) return `${unprogrammed.value.length} ${unprogrammed.value.length===1?'scheda disponibile':'schede disponibili'} senza programmazione`
 return programs.value.length?'Puoi consultare il programma e le settimane qui sotto.':'Le tue schede appariranno qui quando saranno assegnate.'
})
const todayCtaLabel = computed(() => todayHasPlan.value?(todayLinks.value.length===1?'Apri scheda di oggi':'Vedi il programma di oggi'):firstFreeSheet.value?'Apri scheda':'Esplora il piano')
const todayLabel = computed(() => new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Rome'}).format(todayClock.value))
function shortDate(iso?:string):string {
 if(!iso||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return ''
 const value=Date.parse(`${iso}T12:00:00Z`)
 return Number.isFinite(value)?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',timeZone:'UTC'}).format(value):iso
}
function activitiesFor(sourceWeek:ProgramWeek|undefined,index:number,linked=exactWeekDaySlots(liveGroups.value,sourceWeek,index).length>0):string[]{
 const values=sourceWeek?.days[index]?.activities||[]
 return values.filter(value=>value.trim()&&(!linked||!/^(OFF|RIPOSO)$/i.test(value.trim())))
}
function openToday(){
 if(todayWeek.value){
  const onlySheet=todayLinks.value.length===1?todayLinks.value[0]?.sheet:undefined
  if(onlySheet){openSheet(onlySheet);return}
  const target=todayWeek.value.id
  if(week.value?.id!==target)emit('update:weekId',target)
  showSheetChoices.value=false
  selectedDay.value=todayDayIndex.value
  void router.push({query:{...route.query,week:target,day:String(todayDayIndex.value)}})
  return
 }
 const free=unprogrammed.value[0]
 if(free)openSheet(forWeekRepresentative(free,week.value?.id||''))
 else document.getElementById('lf-r13-plan-explore')?.scrollIntoView({behavior:'smooth',block:'start'})
}


// Cache the projection for the selected week, never the Firestore documents.
// Recompute when the real week or assignment groups change, not on every render.
const weekDayProjection=computed(()=>weekDays.value.map((_day,index)=>{
 const links=exactWeekDaySlots(liveGroups.value,week.value,index)
 return {links,activities:activitiesFor(week.value,index,links.length>0)}
}))
function displayActivities(index:number){return weekDayProjection.value[index]?.activities??[]}
function linksForDay(index:number){return weekDayProjection.value[index]?.links??[]}
function uniqueDaysForSheet(group: { links: { weekId: string; dayIndex: number; dayName: string }[] }) {
  const seen = new Set<number>()
  return group.links.filter(link => link.weekId === week.value?.id).filter(link => {
    if (seen.has(link.dayIndex)) return false
    seen.add(link.dayIndex)
    return true
  })
}
function chooseWeek(id: string) { showSheetChoices.value=false; if(!programs.value.some(p=>p.weeks.some(w=>w.id===id)))return;emit('update:weekId', id); void router.replace({query:{...route.query,week:id,day:undefined}}); selectedDay.value = null; opened.value = null }
function chooseProgram(id:string){
 const selected=programs.value.find(p=>p.id===id)
 if(!selected)return
 const target=activeWeekOn(selected.weeks,todayIso())||selected.weeks[0]
 if(target)chooseWeek(target.id)
}
function openSheet(sheet: Personal) { showSheetChoices.value=false;selectedDay.value = null; opened.value = sheet; if(route.query.day!==undefined)void router.replace({query:{...route.query,day:undefined}}) }
function openDayTraining(){
 if(selectedDay.value===null)return
 const slots=linksForDay(selectedDay.value)
 if(slots.length===1){openSheet(slots[0].sheet);return}
 if(slots.length>1)showSheetChoices.value=true
}
function openWeekDay(index:number){showSheetChoices.value=false;selectedDay.value=index;void router.push({query:{...route.query,week:week.value?.id,day:String(index)}})}
function closeWeekDay(){showSheetChoices.value=false;selectedDay.value=null;if(route.query.day!==undefined)void router.replace({query:{...route.query,day:undefined}})}
function onEscape(event:KeyboardEvent){if(event.key==='Escape'&&!opened.value&&selectedDay.value!==null)closeWeekDay()}
onMounted(()=>{
 window.addEventListener('keydown',onEscape)
})
onUnmounted(()=>{
 window.removeEventListener('keydown',onEscape)
})
watch(()=>route.query.day,day=>{selectedDay.value=typeof day==='string'&&/^[0-6]$/.test(day)&&(!props.archiveExpired||!route.query.week||route.query.week===week.value?.id)?Number(day):null})
watch(() => props.athleteKey, () => { selectedDay.value = null; opened.value = null })
watch(() => week.value?.id, (_id, previous) => { if (previous !== undefined) selectedDay.value = null; opened.value = null })
</script>

<template>
  <div v-lf-entrance="{id:'athlete-plan-r13',rows:[{match:'.lf-r13-today,.lf-r13-program'},{within:'.athlete-sheet-grid',match:'.scheme-item'},{within:'.lf-athlete-v4-days',match:'.lf-athlete-v4-day'}]}" class="stack athlete-plan lf-r13-plan" style="gap:14px">
    <section class="lf-r13-heading" aria-label="Riepilogo piano atleta">
      <div>
        <span class="lf-r13-kicker">IL TUO PERCORSO</span>
        <h1>Il mio piano</h1>
        <p>Le attività e le schede assegnate dal Coach, a colpo d'occhio.</p>
      </div>
      <span class="lf-r13-total">{{sheetCount}} {{sheetCount===1?'scheda':'schede'}}<span v-if="programs.length"> · {{programs.length}} {{programs.length===1?'programma':'programmi'}}</span></span>
    </section>

    <section class="lf-r13-today" :class="{'lf-r13-today-unscheduled':!todayHasPlan}" aria-label="Riepilogo di oggi">
      <div class="lf-r13-today-content">
        <div class="lf-r13-today-heading"><span class="lf-r13-today-indicator" aria-hidden="true">●</span><strong>{{todayHasPlan?'IL TUO ALLENAMENTO DI OGGI':firstFreeSheet?'LE TUE SCHEDE':'IL TUO PIANO'}}</strong></div>
        <p class="lf-r13-today-date">{{todayLabel}}<span v-if="todayHasPlan&&todayProgramTitle"> · {{todayProgramTitle}}</span></p>
        <h2>{{todayHeadline}}</h2>
        <p class="lf-r13-today-note">{{todayMessage}}</p>
        <button type="button" class="lf-r13-today-action" @click="openToday">
          {{todayCtaLabel}} <span aria-hidden="true">›</span>
        </button>
      </div>
      <div class="lf-r13-today-art" aria-hidden="true"><span>FIT</span></div>
    </section>

    <section v-if="activeWeeks.length" id="lf-r13-plan-explore" class="panel athlete-week-picker lf-r13-program">
      <div class="lf-r13-block-head"><div><span class="lf-r13-kicker">LA TUA PROGRAMMAZIONE</span><h2>Programma e settimane</h2></div><span class="lf-r13-meta">{{activeWeeks.length}} {{activeWeeks.length===1?'settimana':'settimane'}}</span></div>
      <label class="lf-p11-athlete-select-label" for="lf-p11-athlete-program">Programma selezionato</label>
      <select id="lf-p11-athlete-program" class="lf-p11-athlete-program-select" :value="selectedFamily?.id||''" @change="chooseProgram(($event.target as HTMLSelectElement).value)">
        <option v-for="(p,i) in programs" :key="p.id" :value="p.id">Programma {{i+1}} · {{p.title}}</option>
      </select>
      <p class="lf-p11-program-dates"><span v-if="selectedFamily?.startDate">{{shortDate(selectedFamily.startDate)}} – {{shortDate(selectedFamily.endDate)}}</span><span v-else>Periodo non specificato</span><span class="lf-r13-program-separator"> · </span><strong>Settimana {{weekPosition}}</strong></p>
      <div class="lf-r13-week-header"><strong>Vai alla settimana</strong><span>Scorri per scegliere</span></div>
      <div class="week-pills lf-r13-week-scroll" aria-label="Seleziona la settimana del piano">
        <button v-for="w in activeWeeks" :key="w.id" type="button" class="week-pill lf-r13-week-pill" :aria-label="`Settimana ${weekOrdinal(w,activeWeeks)}: ${w.name}`" :class="{ selected: week?.id === w.id }" :aria-pressed="week?.id === w.id" @click="chooseWeek(w.id)"><span>SETTIMANA</span><strong>{{weekOrdinal(w,activeWeeks)}}</strong></button>
      </div>
    </section>

    <section v-if="activeWeeks.length" class="athlete-week-program lf-r13-schedule">
      <div class="lf-r13-block-head"><div><span class="lf-r13-kicker">CALENDARIO DEL PIANO</span><h2>La tua settimana</h2></div><span class="lf-r13-meta">{{shortDate(week?.startDate)}} – {{shortDate(weekEnd(week?.startDate))}}</span></div>
      <div class="panel athlete-week-program-panel lf-r13-schedule-panel">
        <p class="lf-r13-schedule-caption">{{selectedWeekLabel}} · Tocca un giorno per vedere attività e schede</p>
        <div class="week-days lf-athlete-v4-days" aria-label="Programmazione da lunedì a domenica">
          <button v-for="(day,i) in weekDays" :key="`${week?.id}-${day.name}`" type="button" class="lf-athlete-v4-day" :aria-label="`Apri ${day.name}, ${displayActivities(i).join(', ')||'nessuna attività'}; ${linksForDay(i).length} schede`" :class="{'lf-athlete-v4-today':i===currentDayIndex,'lf-athlete-v4-selected':selectedDay===i}" @click="openWeekDay(i)">
            <span class="lf-athlete-v4-day-label"><strong>{{uiText(day.name.toUpperCase())}}</strong><small v-if="i===currentDayIndex" class="lf-athlete-v4-today-tag">OGGI</small></span>
            <span class="lf-athlete-v4-day-summary"><span v-if="displayActivities(i).length">{{displayActivities(i).join(' · ')}}</span><span v-else class="muted">{{uiText('Nessuna attività')}}</span></span>
            <span class="lf-athlete-v4-day-sheets"><span v-if="linksForDay(i).length" class="lf-r13-day-count">{{linksForDay(i).length}} {{linksForDay(i).length===1?'scheda':'schede'}}</span><span v-else class="muted small">{{uiText('Nessuna scheda')}}</span></span>
            <span class="lf-athlete-v4-chevron" aria-hidden="true">›</span>
          </button>
        </div>
        <p v-if="!weekDays.length" class="muted">{{uiText('Non è ancora stata assegnata una settimana.')}}</p>
      </div>
    </section>

    <section v-if="unprogrammed.length" :id="activeWeeks.length?undefined:'lf-r13-plan-explore'" class="athlete-unscheduled-sheets lf-r13-free-sheets">
      <div class="lf-r13-block-head"><div><span class="lf-r13-kicker">ACCESSO ALLE SCHEDE</span><h2>{{activeWeeks.length?'Schede senza programmazione':'Le mie schede'}}</h2></div><span class="lf-r13-meta">{{unprogrammed.length}} {{unprogrammed.length===1?'scheda':'schede'}}</span></div>
      <p class="lf-r13-free-description">Schede assegnate dal Coach, disponibili anche senza un calendario settimanale.</p>
      <p v-if="unprogrammed.length>2" class="athlete-carousel-hint">{{uiText('Scorri le schede a destra e a sinistra')}} <span aria-hidden="true">↔</span></p>
      <div class="grid2 athlete-sheet-grid" :class="{'athlete-sheet-carousel':unprogrammed.length>2}" :tabindex="unprogrammed.length>2?0:undefined" :aria-label="unprogrammed.length>2?'Schede senza programmazione, scorri orizzontalmente per visualizzarle tutte':undefined">
        <article v-for="group in unprogrammed" :key="group.sheet.id" class="scheme-item lf-r13-free-card">
          <span class="lf-r13-free-icon" aria-hidden="true">▣</span>
          <h3>{{group.sheet.title}}</h3>
          <span class="chip">{{uiText('Assegnata senza programmazione')}}</span>
          <p class="muted small">{{group.sheet.exercises.length}} {{uiText('esercizi · Scheda assegnata')}}</p>
          <button type="button" class="bare green athlete-sheet-open" @click="openSheet(forWeekRepresentative(group,week?.id||''))">{{uiText('APRI SCHEDA ›')}}</button>
        </article>
      </div>
    </section>

    <section v-if="!activeWeeks.length&&!unprogrammed.length" class="panel lf-r13-empty" role="status">Il Coach non ha ancora assegnato schede o programmazioni. Torna qui quando il tuo piano sarà disponibile.</section>
    <p v-if="liveGroups.orphanLinks.length" class="notice" role="alert">{{uiText('Attenzione:')}} {{liveGroups.orphanLinks.length}} {{uiText('collegamenti fanno riferimento a schede assenti o cestinate. Nessuna modifica automatica.')}}</p>
  </div>

  <div v-if="selectedDayDetails" class="modal-overlay athlete-day-overlay lf-r13-day-overlay" @click.self="closeWeekDay()">
    <div class="dialog athlete-day-dialog lf-r13-day-dialog" role="dialog" aria-modal="true" :aria-label="'Programma del ' + selectedDayDetails.name">
      <div class="athlete-day-dialog-head lf-r13-day-head"><div><span class="lf-r13-kicker">DETTAGLIO DEL GIORNO</span><h2>{{uiText(selectedDayDetails.name.toUpperCase())}}</h2></div><button type="button" class="bare" :aria-label="uiText('Chiudi dettagli')" @click="closeWeekDay()">✕</button></div>
      <div class="athlete-day-dialog-body lf-athlete-v4-dialog-body lf-r13-day-body">
        <h3>Attività del giorno</h3>
        <div class="lf-athlete-v4-activities"><div v-for="(activity,i) in selectedDay!==null?displayActivities(selectedDay):[]" :key="i" class="lf-athlete-v4-activity"><span>Attività {{i+1}}</span><strong>{{activity}}</strong></div><p v-if="selectedDay!==null&&!displayActivities(selectedDay).length" class="muted small">Giornata senza attività programmate.</p></div>
        <h3>Schede assegnate</h3>
        <div v-if="selectedDay!==null&&linksForDay(selectedDay).length" class="lf-athlete-v4-linked"><div v-for="link in linksForDay(selectedDay)" :key="link.id" class="lf-athlete-v4-linked-card"><span>Scheda {{link.slot}}</span><strong>{{link.sheet.title}}</strong><button type="button" class="secondary" @click="openSheet(link.sheet)">Apri ›</button></div></div>
        <p v-else class="muted small">Nessuna scheda collegata a questo giorno.</p>
        <button v-if="selectedDay!==null&&linksForDay(selectedDay).length" type="button" class="primary wide lf-athlete-v4-start" @click="openDayTraining">{{linksForDay(selectedDay).length===1?'Apri allenamento del giorno':'Scegli una scheda da aprire'}}</button>
        <div v-if="showSheetChoices&&selectedDay!==null&&linksForDay(selectedDay).length>1" class="lf-athlete-v4-chooser" role="group" aria-label="Scegli la scheda da aprire"><strong>Scegli quale scheda aprire:</strong><button v-for="link in linksForDay(selectedDay)" :key="link.id" type="button" class="secondary wide" @click="openSheet(link.sheet)">Scheda {{link.slot}} · {{link.sheet.title}} ›</button></div>
      </div>
      <div class="athlete-day-dialog-foot"><button type="button" class="secondary" @click="closeWeekDay()">{{uiText('CHIUDI')}}</button></div>
    </div>
  </div>
  <SheetDetail v-if="opened" :sheet="opened" @close="opened=null" @finish="opened=null"/>
</template>


<style scoped>
/* STEP 3L — Il carosello riguarda solo le schede personali non programmate.
   Non modifica la griglia delle schede associate alle settimane. */
.athlete-plan .athlete-unscheduled-sheets {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.athlete-plan .athlete-unscheduled-sheets .athlete-carousel-hint {
  font-size: 10px;
  color: var(--muted);
  margin: 0 2px 8px;
  line-height: 1.45;
}
.athlete-plan .athlete-unscheduled-sheets .athlete-sheet-grid.athlete-sheet-carousel {
  display: flex;
  flex-wrap: nowrap;
  grid-template-columns: none;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 2px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  padding: 2px 2px 8px;
}
.athlete-plan .athlete-unscheduled-sheets .athlete-sheet-grid.athlete-sheet-carousel > .scheme-item {
  flex: 0 0 calc((100% - 8px) / 2);
  width: calc((100% - 8px) / 2);
  max-width: calc((100% - 8px) / 2);
  min-width: 0;
  box-sizing: border-box;
  scroll-snap-align: start;
  scroll-snap-stop: normal;
}
</style>

<style scoped>
/* PATCH 05 — Piano Atleta V4. Il contenuto delle settimane è soltanto in lettura. */
.athlete-plan .lf-athlete-v4-days{display:grid!important;grid-template-columns:1fr!important;gap:7px!important;overflow:visible!important;margin:0!important}
.athlete-plan .lf-athlete-v4-day{width:100%;min-width:0;display:grid;grid-template-columns:minmax(88px,.75fr) minmax(0,1.4fr) minmax(0,1.5fr) 14px;align-items:center;gap:10px;min-height:58px;padding:9px 12px;border:1px solid var(--outline);border-radius:11px;background:var(--field);color:var(--text);text-align:left;box-sizing:border-box}
.athlete-plan .lf-athlete-v4-day:hover,.athlete-plan .lf-athlete-v4-day:focus-visible{border-color:var(--mint)}
.athlete-plan .lf-athlete-v4-today{border:2px solid var(--mint);background:var(--green-bg)}
.lf-athlete-v4-day-label{display:flex;align-items:center;flex-wrap:wrap;gap:5px;min-width:0}.lf-athlete-v4-day-label strong{color:var(--mint);font-size:11px;font-weight:900}.lf-athlete-v4-today-tag{border:1px solid var(--mint);border-radius:5px;padding:2px 4px;font-size:8px;color:var(--mint)}
.lf-athlete-v4-day-summary{min-width:0;font-size:11px;line-height:1.4;overflow-wrap:anywhere}.lf-athlete-v4-day-sheets{display:flex;flex-wrap:wrap;gap:4px;min-width:0}.lf-athlete-v4-sheet-chip{display:inline-block;max-width:100%;font-size:10px;color:var(--mint);font-weight:750;background:var(--green-bg);border-radius:6px;padding:4px 6px;overflow-wrap:anywhere}.lf-athlete-v4-chevron{font-size:21px;color:var(--mint)}
.lf-athlete-v4-dialog-body{display:grid;gap:9px}.lf-athlete-v4-dialog-body h3{font-size:12px;letter-spacing:.04em;margin:6px 0 0}.lf-athlete-v4-activities,.lf-athlete-v4-linked{display:grid;gap:7px}.lf-athlete-v4-activity,.lf-athlete-v4-linked-card{display:flex;align-items:center;gap:10px;justify-content:space-between;border:1px solid var(--outline);background:var(--field);border-radius:9px;padding:9px 11px;font-size:12px}.lf-athlete-v4-activity span,.lf-athlete-v4-linked-card span{font-size:10px;color:var(--mint);flex:none}.lf-athlete-v4-activity strong,.lf-athlete-v4-linked-card strong{flex:1;overflow-wrap:anywhere;min-width:0}.lf-athlete-v4-linked-card button{padding:6px 9px;font-size:11px}.lf-athlete-v4-start{margin-top:7px}.lf-athlete-v4-chooser{display:grid;gap:7px;padding:11px;border:1px solid var(--outline);border-radius:10px}.lf-athlete-v4-chooser strong{font-size:12px}
@media(max-width:680px){.athlete-plan .lf-athlete-v4-day{grid-template-columns:minmax(77px,1fr) minmax(0,2.1fr) 12px;min-height:54px;padding:9px 10px;gap:7px}.lf-athlete-v4-day-label strong{font-size:10px}.lf-athlete-v4-day-summary{font-size:10px}.lf-athlete-v4-day-sheets{grid-column:2;grid-row:2}.lf-athlete-v4-chevron{grid-column:3;grid-row:1/3}.lf-athlete-v4-linked-card{flex-wrap:wrap}.lf-athlete-v4-linked-card strong{min-width:100px}}
</style>

<style scoped>
.lf-p11-athlete-select-label{display:block;margin-bottom:7px;font-size:11px;font-weight:850;letter-spacing:.045em;color:var(--text)}
.as-athlete .lf-p11-athlete-program-select,.lf-p11-athlete-program-select{width:100%;max-width:100%;min-height:45px;padding:9px 12px;border:1.5px solid var(--outline);border-radius:10px;color:var(--text);background:var(--field);font-size:13px;font-weight:750;cursor:pointer;margin-bottom:5px}
.lf-p11-athlete-program-select:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.lf-p11-program-dates{margin:3px 0 15px;font-size:11px;color:var(--muted)}
</style>

<style scoped>
/* PATCH 30 R13 — Piano Experience 3.0: presentation only, the exact stored IDs
   and all day/sheet selection behavior remain unchanged. */
.lf-r13-plan{width:100%;min-width:0;max-width:100%;}
.lf-r13-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:2px 3px 0}
.lf-r13-kicker{display:block;font-size:10px;font-weight:900;letter-spacing:.13em;color:var(--mint);line-height:1.4}
.lf-r13-heading h1{font-size:clamp(22px,3.6vw,30px);line-height:1.13;margin:5px 0 4px;color:var(--text)}
.lf-r13-heading p{font-size:12px;line-height:1.4;color:var(--muted);margin:0}
.lf-r13-total,.lf-r13-meta{border:1px solid var(--outline);background:var(--card2);color:var(--muted);font-size:10px;font-weight:800;border-radius:99px;padding:7px 10px;white-space:nowrap}
.lf-r13-today{position:relative;isolation:isolate;overflow:hidden;background:linear-gradient(112deg,#0d201d 0%,#102e26 63%,#15543b 100%);border:1px solid rgba(84,230,157,.39);border-radius:18px;padding:clamp(17px,3vw,26px);color:#f5fff9;box-shadow:0 11px 34px rgba(4,23,18,.17)}
.lf-r13-today:before{content:'';position:absolute;pointer-events:none;width:270px;height:270px;border:1px solid rgba(86,248,160,.14);border-radius:50%;right:-110px;top:-125px;box-shadow:0 0 0 29px rgba(86,248,160,.035),0 0 0 64px rgba(86,248,160,.023);z-index:-1}
.lf-r13-today-content{position:relative;z-index:1;max-width:610px}.lf-r13-today-heading{display:flex;align-items:center;gap:8px;color:#65ecac;letter-spacing:.12em;font-size:10px}.lf-r13-today-indicator{font-size:13px}
.lf-r13-today-date{font-size:12px;color:#b8d7c8;margin:10px 0 5px;text-transform:capitalize}
.lf-r13-today h2{color:white;font-weight:900;font-size:clamp(22px,3vw,29px);line-height:1.23;margin:0;overflow-wrap:anywhere}
.lf-r13-today-note{font-size:12px;color:#cce1d8;margin:8px 0 15px;line-height:1.5}
.lf-r13-today-action{display:inline-flex;justify-content:center;align-items:center;gap:12px;min-height:42px;border-radius:11px;background:#43e6a0;color:#05251a!important;border:0;padding:9px 16px;font-size:12px;font-weight:900;text-decoration:none;transition:transform .25s ease,box-shadow .25s ease}
.lf-r13-today-action:hover{transform:translateY(-2px);box-shadow:0 7px 19px rgba(64,229,151,.16)}.lf-r13-today-action:focus-visible{outline:2px solid white;outline-offset:3px}.lf-r13-today-action span{font-size:19px;line-height:1}
.lf-r13-today-art{position:absolute;inset:0 0 auto auto;width:39%;height:100%;display:grid;place-items:center;opacity:.095;overflow:hidden;pointer-events:none}.lf-r13-today-art span{font-size:clamp(70px,18vw,180px);font-style:italic;font-weight:1000;transform:rotate(-20deg);letter-spacing:-.07em;color:#8bffd5}
.lf-r13-program,.lf-r13-schedule-panel{padding:15px!important;border-radius:16px!important}
.lf-r13-block-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 13px}.lf-r13-block-head h2{font-size:clamp(16px,2.5vw,21px);font-weight:900;line-height:1.25;margin:3px 0 0;color:var(--text)}
.lf-r13-program .lf-p11-athlete-select-label{text-transform:none;font-size:11px;color:var(--muted);font-weight:750;letter-spacing:0}
.lf-r13-program .lf-p11-athlete-program-select{margin-bottom:4px!important;border-radius:10px;font-size:13px}
.lf-r13-program .lf-p11-program-dates{margin:2px 0 12px;font-size:11px;line-height:1.4}.lf-r13-program .lf-p11-program-dates strong{color:var(--mint)}
.lf-r13-week-header{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:11px;margin-bottom:9px}.lf-r13-week-header span{color:var(--muted);font-size:10px}
.lf-r13-program .lf-r13-week-scroll{display:flex!important;overflow-x:auto!important;overflow-y:hidden!important;flex-wrap:nowrap!important;gap:8px!important;width:100%;min-width:0;max-width:100%;padding:2px 1px 8px;scroll-snap-type:x proximity;scrollbar-width:thin}
.lf-r13-program .lf-r13-week-pill{flex:0 0 auto!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:94px!important;min-height:53px!important;height:auto!important;border-radius:12px!important;padding:8px 10px!important;border:1px solid var(--outline)!important;background:var(--field)!important;color:var(--text)!important;scroll-snap-align:start;box-shadow:none!important}
.lf-r13-week-pill span{font-size:9px!important;letter-spacing:0!important;white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;color:var(--muted);font-weight:750}.lf-r13-week-pill strong{font-size:18px;line-height:1.1}
.lf-r13-program .lf-r13-week-pill.selected{border-color:var(--mint)!important;background:var(--green-bg)!important;color:var(--mint)!important}
.lf-r13-schedule-panel{min-width:0}.lf-r13-schedule-caption{font-size:11px;color:var(--muted);margin:0 0 10px;line-height:1.4}
.lf-r13-plan .lf-athlete-v4-days{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;margin:0!important}
.lf-r13-plan .lf-athlete-v4-day{display:grid!important;grid-template-columns:minmax(85px,.83fr) minmax(0,2fr) auto 10px!important;grid-template-rows:auto!important;gap:8px!important;min-height:51px!important;padding:9px 12px!important;border-radius:11px!important;align-items:center;transition:border-color .27s ease,background .27s ease,transform .27s ease!important}
.lf-r13-plan .lf-athlete-v4-day:hover{transform:translateX(2px)}
.lf-r13-plan .lf-athlete-v4-today{border:1.5px solid var(--mint)!important;background:var(--green-bg)!important}
.lf-r13-plan .lf-athlete-v4-day-label{grid-column:1;grid-row:1;gap:5px}.lf-r13-plan .lf-athlete-v4-day-label strong{font-size:11px!important}.lf-r13-plan .lf-athlete-v4-day-summary{grid-column:2;grid-row:1;font-size:12px!important;line-height:1.35}.lf-r13-plan .lf-athlete-v4-day-sheets{grid-column:3;grid-row:1;white-space:nowrap}.lf-r13-day-count{color:var(--mint);font-size:10px;font-weight:850;background:var(--green-bg);border-radius:8px;padding:5px 7px}.lf-r13-plan .lf-athlete-v4-chevron{grid-column:4;grid-row:1;font-size:19px}
.lf-r13-free-description{font-size:11px;color:var(--muted);margin:0 0 11px}.lf-r13-free-sheets{min-width:0}.lf-r13-free-card{position:relative;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:7px;border-radius:14px!important;padding:17px!important;background:var(--card2)!important;border:1px solid var(--outline)!important;transition:transform .27s ease,border-color .27s ease}
.lf-r13-free-card:hover{border-color:var(--mint)!important;transform:translateY(-2px)}.lf-r13-free-card h3{margin:0;line-height:1.2;font-size:16px}.lf-r13-free-card p{margin:0}.lf-r13-free-icon{font-size:22px;color:var(--mint)}.lf-r13-free-card .chip{font-size:10px}.lf-r13-free-card .athlete-sheet-open{margin-top:auto;font-size:12px;padding:9px 0 2px;font-weight:900}
.lf-r13-empty{font-size:12px;color:var(--muted);line-height:1.5;padding:18px!important}
.lf-r13-day-dialog{border-radius:17px!important;max-width:640px}.lf-r13-day-head{padding:15px 18px!important;background:var(--card2)!important}.lf-r13-day-head h2{margin:4px 0 0;font-size:21px}.lf-r13-day-body{padding:16px!important;gap:10px!important}.lf-r13-day-body h3{font-size:12px;margin-top:7px}.lf-r13-day-body .lf-athlete-v4-activity,.lf-r13-day-body .lf-athlete-v4-linked-card{border-radius:11px;padding:11px 12px}.lf-r13-day-body .lf-athlete-v4-start{min-height:43px;margin-top:6px}.lf-r13-day-dialog .athlete-day-dialog-foot{padding:10px 16px}
@media(max-width:680px){.lf-r13-heading{align-items:flex-start}.lf-r13-heading p{max-width:360px}.lf-r13-total{font-size:9px}.lf-r13-today{padding:18px 16px}.lf-r13-program,.lf-r13-schedule-panel{padding:13px!important}.lf-r13-plan .lf-athlete-v4-day{grid-template-columns:minmax(76px,85px) minmax(0,1fr) 10px!important;grid-template-rows:auto auto!important;gap:3px 8px!important;min-height:58px!important;padding:9px 11px!important}.lf-r13-plan .lf-athlete-v4-day-summary{grid-column:2;grid-row:1;font-size:11px!important}.lf-r13-plan .lf-athlete-v4-day-sheets{grid-column:2;grid-row:2;white-space:normal;font-size:10px!important}.lf-r13-plan .lf-athlete-v4-chevron{grid-column:3;grid-row:1/3}.lf-r13-plan .lf-athlete-v4-day-label{grid-column:1;grid-row:1/3}.lf-r13-plan .lf-athlete-v4-day-label strong{font-size:10px!important}.lf-r13-plan .lf-r13-day-count{padding:3px 6px}.lf-r13-day-body{padding:12px!important}}
@media(prefers-reduced-motion:reduce){.lf-r13-today-action,.lf-r13-plan .lf-athlete-v4-day,.lf-r13-free-card{transition:none!important}}
</style>
