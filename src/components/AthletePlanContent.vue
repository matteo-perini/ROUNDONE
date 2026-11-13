<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/**
 * Fase 2M/A — una sola UI del piano, indipendente dalla sorgente dei dati.
 * La stessa vista usa il Lab locale oppure gli snapshot Firestore Emulator.
 * Nessuna scrittura, nessuna deduplicazione di documenti, solo raggruppamento visivo.
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {romeDayIndex,isDateInStoredWeek} from '../features/athletes/romeWeekProgress'
import {forWeekRepresentative,weekDayLinkedSheetNames,exactWeekDaySlots} from '../features/sheets/athleteWeekVisual.ts'
import SheetDetail from './SheetDetail.vue'
import type { Groups, Personal, ProgramWeek } from '../features/sheets/domain'
import { uniqueSemanticSheets, visualSheetGroups } from '../features/sheets/semanticDedup'
import {groupActivePrograms,programForWeek,activeWeekOn} from '../features/sheets/programFamilies'

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
const showSheetChoices=ref(false)
const selectedDay = ref<number | null>(Number.isInteger(props.initialDay) && props.initialDay! >= 0 && props.initialDay! <= 6 ? props.initialDay! : null)
const allWeeks = computed(() => props.weeks.filter(w => !w.deletedAt))
const programs=computed(()=>groupActivePrograms(allWeeks.value))
const todayIso=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Rome'}).formatToParts(new Date())
 const part=(type:string)=>parts.find(p=>p.type===type)?.value||''
 return `${part('year')}-${part('month')}-${part('day')}`
}
const selectedFamily=computed(()=>{
 const explicit=programForWeek(programs.value,props.weekId)
 if(explicit)return explicit
 const date=todayIso()
 return programs.value.find(p=>!!activeWeekOn(p.weeks,date))||programs.value.find(p=>p.startDate>=date)||programs.value.at(-1)
})
const activeWeeks=computed(()=>selectedFamily.value?.weeks||[])
const week = computed(() => activeWeeks.value.find(w => w.id === props.weekId) ?? activeWeekOn(activeWeeks.value,todayIso())??activeWeeks.value[0])
const weekPosition=computed(()=>activeWeeks.value.findIndex(w=>w.id===week.value?.id)+1)
const selectedWeekLabel=computed(()=>`${selectedFamily.value?.title||'Programma'} · Settimana ${weekPosition.value}`)
const visual = computed(() => visualSheetGroups(props.groups))
const programmed = computed(() => visual.value.programmed.filter(group => group.links.some(link => link.weekId === week.value?.id)))
const unprogrammed = computed(() => visual.value.unprogrammed)
const sheetCount = computed(() => uniqueSemanticSheets(props.personal.filter(s => !s.deletedAt)).length)
const weekDays = computed(() => week.value?.days ?? [])
const todayClock=ref(Date.now())
let clockTimer:ReturnType<typeof setInterval>|null=null
const refreshClock=()=>{todayClock.value=Date.now()}
const currentDayIndex = computed(() =>
  isDateInStoredWeek(week.value?.startDate,todayClock.value) ? romeDayIndex(todayClock.value) : -1
)
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
function chooseWeek(id: string) { showSheetChoices.value=false; if(!activeWeeks.value.some(w=>w.id===id))return;emit('update:weekId', id); void router.replace({query:{...route.query,week:id,day:undefined}}); selectedDay.value = null; opened.value = null }
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
 window.addEventListener('focus',refreshClock)
 document.addEventListener('visibilitychange',refreshClock)
 clockTimer=setInterval(refreshClock,30_000)
})
onUnmounted(()=>{
 window.removeEventListener('keydown',onEscape)
 window.removeEventListener('focus',refreshClock)
 document.removeEventListener('visibilitychange',refreshClock)
 if(clockTimer!==null)clearInterval(clockTimer)
})
watch(()=>route.query.day,day=>{selectedDay.value=typeof day==='string'&&/^[0-6]$/.test(day)?Number(day):null})
watch(() => props.athleteKey, () => { selectedDay.value = null; opened.value = null })
watch(() => week.value?.id, (_id, previous) => { if (previous !== undefined) selectedDay.value = null; opened.value = null })
</script>

<template>
  <div class="stack athlete-plan" style="gap:20px">
    <section class="panel athlete-plan-summary">
      <div class="row between">
        <div><h2 class="card-heading">{{uiText("IL MIO PIANO")}}</h2><p class="muted" style="margin:8px 0 0">{{uiText("SCHEDE E PROGRAMMI ASSEGNATI DAL TUO COACH")}}</p></div>
        <span class="pill pill-neutral">{{ sheetCount }} {{uiText("SCHEDE")}}<span v-if="allWeeks.length"> · {{ programs.length }} PROGRAMMI</span></span>
      </div>
    </section>

    <section v-if="activeWeeks.length" class="panel athlete-week-picker">
      <label class="lf-p11-athlete-select-label" for="lf-p11-athlete-program">SELEZIONA PROGRAMMA</label>
      <select id="lf-p11-athlete-program" class="lf-p11-athlete-program-select" :value="selectedFamily?.id||''" @change="chooseProgram(($event.target as HTMLSelectElement).value)">
        <option v-for="(p,i) in programs" :key="p.id" :value="p.id">Programma {{i+1}} · {{p.title}}</option>
      </select>
      <p class="lf-p11-program-dates">{{selectedFamily?.startDate}} → {{selectedFamily?.endDate}} · {{activeWeeks.length}} settimane</p>
      <div class="row between"><strong>{{uiText("SELEZIONA LA SETTIMANA")}}</strong><span class="muted small">{{ selectedWeekLabel }}</span></div>
      <div class="week-pills" aria-label="Seleziona la settimana del piano">
        <button v-for="(w,i) in activeWeeks" :key="w.id" type="button" class="week-pill" :aria-label="`Settimana ${i+1}: ${w.name}`" :class="{ selected: week?.id === w.id }" :aria-pressed="week?.id === w.id" @click="chooseWeek(w.id)">{{ i+1 }}</button>
      </div>
    </section>

    <section v-if="unprogrammed.length" class="athlete-unscheduled-sheets">
      <div class="row between"><h2 class="section-title">{{uiText("SCHEDE SENZA PROGRAMMAZIONE")}}</h2><span class="pill pill-neutral">{{ unprogrammed.length }} {{uiText("schede diverse")}}</span></div>
      <p v-if="unprogrammed.length > 2" class="athlete-carousel-hint">{{uiText("Scorri le schede a destra e a sinistra")}} <span aria-hidden="true">↔</span></p>
      <div
        class="grid2 athlete-sheet-grid"
        :class="{ 'athlete-sheet-carousel': unprogrammed.length > 2 }"
        :tabindex="unprogrammed.length > 2 ? 0 : undefined"
        :aria-label="unprogrammed.length > 2 ? 'Schede senza programmazione, scorri orizzontalmente per visualizzarle tutte' : undefined"
      >
        <article v-for="group in unprogrammed" :key="group.sheet.id" class="scheme-item">
          <h3>{{group.sheet.title}}</h3>
          <span class="chip">{{uiText('Assegnata senza programmazione')}}</span>
          <p class="muted small">{{group.sheet.exercises.length}} {{uiText("esercizi · Scheda assegnata")}}</p>
          <button type="button" class="bare green athlete-sheet-open" @click="openSheet(forWeekRepresentative(group,week?.id||''))">{{uiText("APRI SCHEDA ›")}}</button>
        </article>
      </div>
      <p v-if="!unprogrammed.length" class="muted small">{{uiText("Non ci sono schede personali senza programmazione.")}}</p>
    </section>

    <section v-if="activeWeeks.length" class="athlete-week-program">
      <div class="row between"><h2 class="section-title">{{uiText("PROGRAMMAZIONE SETTIMANALE")}}</h2><span class="pill pill-neutral">{{ activeWeeks.length }} {{uiText("SETTIMANE")}}</span></div>
      <div class="panel athlete-week-program-panel">
        <div class="row between athlete-week-title"><strong>{{selectedWeekLabel.toUpperCase()}}</strong><span class="pill pill-neutral">{{ week?.startDate || '' }}</span></div>
        <div class="divider"/>
        <div class="week-days lf-athlete-v4-days" aria-label="Programmazione da lunedì a domenica">
          <button v-for="(day,i) in weekDays" :key="`${week?.id}-${day.name}`" type="button" class="lf-athlete-v4-day" :aria-label="`Apri ${day.name}, ${displayActivities(i).join(', ')||'nessuna attività'}; ${linksForDay(i).length} schede`" :class="{'lf-athlete-v4-today':i===currentDayIndex,'lf-athlete-v4-selected':selectedDay===i}" @click="openWeekDay(i)">
            <span class="lf-athlete-v4-day-label"><strong>{{uiText(day.name.toUpperCase())}}</strong><small v-if="i===currentDayIndex" class="lf-athlete-v4-today-tag">OGGI</small></span>
            <span class="lf-athlete-v4-day-summary"><span v-if="displayActivities(i).length">{{displayActivities(i).join(' · ')}}</span><span v-else class="muted">{{uiText('Nessuna attività')}}</span></span>
            <span class="lf-athlete-v4-day-sheets"><span v-for="linked in linksForDay(i)" :key="linked.id" class="lf-athlete-v4-sheet-chip">{{linked.sheet.title}}</span><span v-if="!linksForDay(i).length" class="muted small">{{uiText('Nessuna scheda')}}</span></span>
            <span class="lf-athlete-v4-chevron" aria-hidden="true">›</span>
          </button>
        </div>
        <p v-if="!weekDays.length" class="muted">{{uiText("Non è ancora stata assegnata una settimana.")}}</p>
      </div>
    </section>
    <p v-if="props.groups.orphanLinks.length" class="notice" role="alert">{{uiText("Attenzione:")}} {{ props.groups.orphanLinks.length }} {{uiText("collegamenti fanno riferimento a schede assenti o cestinate. Nessuna modifica automatica.")}}</p>
  </div>

  <div v-if="selectedDayDetails" class="modal-overlay athlete-day-overlay" @click.self="closeWeekDay()">
    <div class="dialog athlete-day-dialog" role="dialog" aria-modal="true" :aria-label="'Programma del ' + selectedDayDetails.name">
      <div class="athlete-day-dialog-head"><div><h2>{{uiText(selectedDayDetails.name.toUpperCase())}}</h2><p class="muted small">{{uiText("PROGRAMMA DEL GIORNO")}}</p></div><button type="button" class="bare" :aria-label="uiText('Chiudi dettagli')" @click="closeWeekDay()">✕</button></div>
      <div class="athlete-day-dialog-body lf-athlete-v4-dialog-body">
        <h3>Attività del giorno</h3>
        <div class="lf-athlete-v4-activities"><div v-for="(activity,i) in selectedDay!==null?displayActivities(selectedDay):[]" :key="i" class="lf-athlete-v4-activity"><span>Attività {{i+1}}</span><strong>{{activity}}</strong></div><p v-if="selectedDay!==null&&!displayActivities(selectedDay).length" class="muted small">Giornata senza attività programmate.</p></div>
        <h3>Schede assegnate</h3>
        <div v-if="selectedDay!==null&&linksForDay(selectedDay).length" class="lf-athlete-v4-linked"><div v-for="link in linksForDay(selectedDay)" :key="link.id" class="lf-athlete-v4-linked-card"><span>Scheda {{link.slot}}</span><strong>{{link.sheet.title}}</strong><button type="button" class="secondary" @click="openSheet(link.sheet)">Apri ›</button></div></div>
        <p v-else class="muted small">Nessuna scheda collegata a questo giorno.</p>
        <button v-if="selectedDay!==null&&linksForDay(selectedDay).length" type="button" class="primary wide lf-athlete-v4-start" @click="openDayTraining">Apri allenamento del giorno</button>
        <div v-if="showSheetChoices&&selectedDay!==null&&linksForDay(selectedDay).length>1" class="lf-athlete-v4-chooser" role="group" aria-label="Scegli la scheda da aprire"><strong>Scegli quale scheda aprire:</strong><button v-for="link in linksForDay(selectedDay)" :key="link.id" type="button" class="secondary wide" @click="openSheet(link.sheet)">Scheda {{link.slot}} · {{link.sheet.title}} ›</button></div>
      </div>
      <div class="athlete-day-dialog-foot"><button type="button" class="secondary" @click="closeWeekDay()">{{uiText("CHIUDI")}}</button></div>
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
