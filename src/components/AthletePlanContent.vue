<script setup lang="ts">
/**
 * Fase 2M/A — una sola UI del piano, indipendente dalla sorgente dei dati.
 * La stessa vista usa il Lab locale oppure gli snapshot Firestore Emulator.
 * Nessuna scrittura, nessuna deduplicazione di documenti, solo raggruppamento visivo.
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {romeParts} from '../features/bookings/bookingPolicy'
import {forWeekRepresentative,weekDayLinkedSheetNames,exactWeekDaySlots} from '../features/sheets/athleteWeekVisual.ts'
import SheetDetail from './SheetDetail.vue'
import type { Groups, Personal, ProgramWeek } from '../features/sheets/domain'
import { uniqueSemanticSheets, visualSheetGroups } from '../features/sheets/semanticDedup'

const props = withDefaults(defineProps<{
  athleteKey: string
  personal: (Pick<Personal, 'title' | 'exercises'> & { deletedAt?: string })[]
  weeks: ProgramWeek[]
  groups: Groups
  weekId?: string
  initialDay?: number
}>(), { weekId: '' })
const emit = defineEmits<{ 'update:weekId': [id: string] }>()
const route=useRoute(),router=useRouter()

const opened = ref<Personal | null>(null)
const selectedDay = ref<number | null>(Number.isInteger(props.initialDay) && props.initialDay! >= 0 && props.initialDay! <= 6 ? props.initialDay! : null)
const activeWeeks = computed(() => props.weeks.filter(w => !w.deletedAt)
  .sort((a, b) => (a.startDate || a.id).localeCompare(b.startDate || b.id)))
const week = computed(() => activeWeeks.value.find(w => w.id === props.weekId) ?? activeWeeks.value[0])
const visual = computed(() => visualSheetGroups(props.groups))
const programmed = computed(() => visual.value.programmed.filter(group => group.links.some(link => link.weekId === week.value?.id)))
const unprogrammed = computed(() => visual.value.unprogrammed)
const sheetCount = computed(() => uniqueSemanticSheets(props.personal.filter(s => !s.deletedAt)).length)
const weekDays = computed(() => week.value?.days ?? [])
const currentDayIndex = computed(() => {
  const start = week.value?.startDate
  if (!start) return -1
  const startDay = new Date(`${start}T12:00:00Z`)
  if (!Number.isFinite(startDay.getTime())) return -1
  const todayDate=romeParts(Date.now()).date
  const diff = Math.round((Date.parse(`${todayDate}T12:00:00Z`)-startDay.getTime()) / 86400000)
  return diff >= 0 && diff < 7 ? diff : -1
})
const selectedDayDetails = computed(() => selectedDay.value === null ? null : weekDays.value[selectedDay.value] ?? null)

function displayActivities(index:number){
 const values=weekDays.value[index]?.activities||[]
 const linked=linksForDay(index).length>0
 return values.filter(value=>value.trim()&&(!linked||!/^(OFF|RIPOSO)$/i.test(value.trim())))
}
function linksForDay(index: number) {
 // The two assignments in the selected day are authoritative; never use the
 // representative sheet of a group of visually equivalent documents.
 return exactWeekDaySlots(props.groups,week.value,index)
}
function uniqueDaysForSheet(group: { links: { weekId: string; dayIndex: number; dayName: string }[] }) {
  const seen = new Set<number>()
  return group.links.filter(link => link.weekId === week.value?.id).filter(link => {
    if (seen.has(link.dayIndex)) return false
    seen.add(link.dayIndex)
    return true
  })
}
function chooseWeek(id: string) { if(!activeWeeks.value.some(w=>w.id===id))return;emit('update:weekId', id); void router.replace({query:{...route.query,week:id,day:undefined}}); selectedDay.value = null; opened.value = null }
function openSheet(sheet: Personal) { selectedDay.value = null; opened.value = sheet; if(route.query.day!==undefined)void router.replace({query:{...route.query,day:undefined}}) }
function openWeekDay(index:number){selectedDay.value=index;void router.push({query:{...route.query,week:week.value?.id,day:String(index)}})}
function closeWeekDay(){selectedDay.value=null;if(route.query.day!==undefined)void router.replace({query:{...route.query,day:undefined}})}
function onEscape(event:KeyboardEvent){if(event.key==='Escape'&&!opened.value&&selectedDay.value!==null)closeWeekDay()}
onMounted(()=>window.addEventListener('keydown',onEscape))
onUnmounted(()=>window.removeEventListener('keydown',onEscape))
watch(()=>route.query.day,day=>{selectedDay.value=typeof day==='string'&&/^[0-6]$/.test(day)?Number(day):null})
watch(() => props.athleteKey, () => { selectedDay.value = null; opened.value = null })
watch(() => week.value?.id, (_id, previous) => { if (previous !== undefined) selectedDay.value = null; opened.value = null })
</script>

<template>
  <div class="stack athlete-plan" style="gap:20px">
    <section class="panel athlete-plan-summary">
      <div class="row between">
        <div><h2 class="card-heading">IL MIO PIANO</h2><p class="muted" style="margin:8px 0 0">SCHEDE E PROGRAMMI ASSEGNATI DAL TUO COACH</p></div>
        <span class="pill pill-neutral">{{ sheetCount }} SCHEDE<span v-if="activeWeeks.length"> · {{ activeWeeks.length }} SETTIMANE</span></span>
      </div>
    </section>

    <section v-if="activeWeeks.length" class="panel athlete-week-picker">
      <div class="row between"><strong>SELEZIONA LA SETTIMANA</strong><span class="muted small">{{ week?.name || 'Nessuna settimana' }}</span></div>
      <div class="week-pills" aria-label="Seleziona la settimana del piano">
        <button v-for="(w,i) in activeWeeks" :key="w.id" type="button" class="week-pill" :aria-label="`Settimana ${i+1}: ${w.name}`" :class="{ selected: week?.id === w.id }" :aria-pressed="week?.id === w.id" @click="chooseWeek(w.id)">{{ i+1 }}</button>
      </div>
    </section>

    <section v-if="activeWeeks.length && programmed.length" class="athlete-scheduled-sheets">
      <div class="row between"><div><h2 class="section-title">SCHEDE IN PROGRAMMA</h2><span class="muted small">{{ week?.startDate || '' }}</span></div><span class="pill">{{ programmed.length }} schede diverse</span></div>
      <div class="grid2 athlete-sheet-grid">
        <article v-for="group in programmed" :key="group.sheet.id" class="scheme-item">
          <h3>{{ group.sheet.title }}</h3>
          <span class="chip athlete-sheet-state">In programma · {{ uniqueDaysForSheet(group).length }} {{ uniqueDaysForSheet(group).length === 1 ? 'giorno' : 'giorni' }}</span>
          <p class="muted small athlete-sheet-days">{{ uniqueDaysForSheet(group).map(l => l.dayName.slice(0,3).toLowerCase()).join(' · ') }}</p>
          <button type="button" class="bare green athlete-sheet-open" @click="openSheet(forWeekRepresentative(group,week?.id||''))">APRI SCHEDA ›</button>
        </article>
      </div>
      <p v-if="!programmed.length" class="notice">Nessuna scheda collegata a questa settimana.</p>
    </section>

    <section v-if="unprogrammed.length" class="athlete-unscheduled-sheets">
      <div class="row between"><h2 class="section-title">SCHEDE SENZA PROGRAMMAZIONE</h2><span class="pill pill-neutral">{{ unprogrammed.length }} schede diverse</span></div>
      <p v-if="unprogrammed.length > 2" class="athlete-carousel-hint">Scorri le schede a destra e a sinistra <span aria-hidden="true">↔</span></p>
      <div
        class="grid2 athlete-sheet-grid"
        :class="{ 'athlete-sheet-carousel': unprogrammed.length > 2 }"
        :tabindex="unprogrammed.length > 2 ? 0 : undefined"
        :aria-label="unprogrammed.length > 2 ? 'Schede senza programmazione, scorri orizzontalmente per visualizzarle tutte' : undefined"
      >
        <article v-for="group in unprogrammed" :key="group.sheet.id" class="scheme-item">
          <h3>{{group.sheet.title}}</h3>
          <span class="chip">{{ activeWeeks.length ? 'Non collegata alle settimane attive' : 'Scheda personale' }}</span>
          <p class="muted small">{{group.sheet.exercises.length}} esercizi · Scheda assegnata</p>
          <button type="button" class="bare green athlete-sheet-open" @click="openSheet(forWeekRepresentative(group,week?.id||''))">APRI SCHEDA ›</button>
        </article>
      </div>
      <p v-if="!unprogrammed.length" class="muted small">Non ci sono schede personali senza programmazione.</p>
    </section>

    <section v-if="activeWeeks.length" class="athlete-week-program">
      <div class="row between"><h2 class="section-title">PROGRAMMAZIONE SETTIMANALE</h2><span class="pill pill-neutral">{{ activeWeeks.length }} SETTIMANE</span></div>
      <div class="panel athlete-week-program-panel">
        <div class="row between athlete-week-title"><strong>{{ week?.name.toUpperCase() || 'NESSUNA SETTIMANA' }}</strong><span class="pill pill-neutral">{{ week?.startDate || '' }}</span></div>
        <div class="divider"/>
        <div class="week-days">
          <button v-for="(day,i) in weekDays" :key="`${week?.id}-${day.name}`" type="button" class="day-card" :aria-label="`Apri il programma di ${day.name}`" :class="{ 'day-card-today': i===currentDayIndex, 'day-card-selected': selectedDay===i, 'day-card-sunday': i===6 }" @click="openWeekDay(i)">
            <h3>{{ day.name.toUpperCase() }}</h3>
            <p v-for="(activity,j) in displayActivities(i)" :key="j" class="athlete-day-activity-label">{{ activity.toUpperCase() }}</p>
            <p v-for="(linked,i2) in weekDayLinkedSheetNames(props.groups,week?.id||'',i)" :key="'sheet-'+i2" class="day-card-sheet-activity">{{linked}}</p>
            <p v-if="!displayActivities(i).length&&!weekDayLinkedSheetNames(props.groups,week?.id||'',i).length" class="muted">RIPOSO</p>
            <div class="day-card-detail">DETTAGLI <span aria-hidden="true">›</span></div>
          </button>
        </div>
        <p v-if="!weekDays.length" class="muted">Non è ancora stata assegnata una settimana.</p>
      </div>
    </section>
    <p v-if="props.groups.orphanLinks.length" class="notice" role="alert">Attenzione: {{ props.groups.orphanLinks.length }} collegamenti fanno riferimento a schede assenti o cestinate. Nessuna modifica automatica.</p>
  </div>

  <div v-if="selectedDayDetails" class="modal-overlay athlete-day-overlay" @click.self="closeWeekDay()">
    <div class="dialog athlete-day-dialog" role="dialog" aria-modal="true" :aria-label="'Programma del ' + selectedDayDetails.name">
      <div class="athlete-day-dialog-head"><div><h2>{{ selectedDayDetails.name.toUpperCase() }}</h2><p class="muted small">PROGRAMMA DEL GIORNO</p></div><button type="button" class="bare" aria-label="Chiudi dettagli" @click="closeWeekDay()">✕</button></div>
      <div class="athlete-day-dialog-body"><h3>PROGRAMMAZIONE DEL GIORNO</h3>
        <p v-for="(activity,i) in selectedDay!==null?displayActivities(selectedDay):[]" :key="i" class="athlete-day-activity">{{ activity.toUpperCase() }}</p>
        <p v-if="selectedDay!==null&&!displayActivities(selectedDay).length" class="muted">Nessuna attività prevista.</p>
        <div v-if="selectedDay !== null && linksForDay(selectedDay).length" class="athlete-day-linked">
          <div v-for="link in linksForDay(selectedDay)" :key="link.id" class="athlete-day-sheet-row"><p class="athlete-day-sheet-title">SCHEDA {{link.slot}}: {{link.sheet.title}}</p><button type="button" class="primary wide athlete-day-open-sheet" @click="openSheet(link.sheet)">APRI SCHEDA {{link.slot}}</button></div>
        </div>
        <p v-else class="muted small">Nessuna scheda collegata a questo giorno.</p>
      </div>
      <div class="athlete-day-dialog-foot"><button type="button" class="secondary" @click="closeWeekDay()">CHIUDI</button></div>
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
