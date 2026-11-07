<script setup lang="ts">
/** FASE 2M/B — coach roster di sola lettura; SOLO /dev su Firebase Emulator.
 * Il pannello operativo /coach/atleti e la sua grafica restano INALTERATI.
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { readVerifiedDevSession, type VerifiedDevSession } from '../integrations/firebase/devSession'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import { watchAthleteSheets, assignShared, linkPersonalDay, unlinkPersonalDay, updateActivity, createWeekGuarded, duplicateWeekGuarded, trashWeek, trashPersonal, restoreFromTrash } from '../integrations/firestore/sheets'
import { labCoachRoster, maySelectLabAthlete, type RosterAthlete } from '../features/athletes/coachRoster'
import { visualSheetGroups } from '../features/sheets/semanticDedup'
import { DAY_NAMES, type Groups, type Personal, type ProgramWeek } from '../features/sheets/domain'
import { activeWeekFor, activePersonalFor, assertEmulatorCoachWrite, selectedSlotId, validDayKey } from '../features/athletes/coachLabActions'
import SheetDetail from '../components/SheetDetail.vue'
import AthletePlanContent from '../components/AthletePlanContent.vue'
import { assertLabWeekId, labWeekPayload, nextMondayAfter } from '../features/athletes/labWeekOps'
import { advanceV1Monday } from '../features/sheets/v1WeekCodec'
import { archiveItemFromRaw, assertLabArchiveTarget, canTrashLabPersonal, type HistoricalArchive } from '../features/athletes/labArchive'
import { createLabArchiveFixture } from '../features/athletes/createLabArchiveFixture'
import LabProtectedArchive from '../components/LabProtectedArchive.vue'
import LabCoachTemplateArchive from '../components/LabCoachTemplateArchive.vue'
import {createLabCoachModel,trashLabCoachModel,restoreLabCoachModel} from '../features/athletes/labCoachModelFixture'
import {type CoachModel} from '../features/athletes/coachTemplateArchive'
import {isSelectedModelAssignable} from '../features/athletes/coachAssignmentFlow'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const router = useRouter()
const session = shallowRef<VerifiedDevSession | null>(null)
const athletes = ref<RosterAthlete[]>([])
const search = ref('')
const selectedId = ref('')
const selected = computed(() => athletes.value.find(a => a.id === selectedId.value) ?? null)
const filtered = computed(() => athletes.value.filter(a => `${a.name} ${a.email}`.toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it'))))
const details = shallowRef<{ personal: Personal[]; weeks: ProgramWeek[]; groups: Groups } | null>(null)
const grouped = computed(() => details.value ? visualSheetGroups(details.value.groups) : null)
const weeks = computed(() => details.value?.weeks.filter(w => !w.deletedAt).slice().sort((a,b) => String(a.startDate || a.id).localeCompare(String(b.startDate || b.id))) || [])
// Blocco cumulativo: consultazione schede, programmazione e azioni limitate agli account fittizi.
const slots = [1,2] as const
const weekId = ref('')
const dayIndex = ref(0)
const currentWeek = computed(() => activeWeekFor(weeks.value, weekId.value))
const currentDay = computed(() => currentWeek.value?.days[dayIndex.value] ?? null)
const personalActive = computed(() => activePersonalFor(details.value?.personal ?? []))
const selectedModel = computed(() => sharedArchive.value.find(m=>m.id===templateChoice.value && !m.trashed) ?? null)
const selectedModelReady = computed(() => isSelectedModelAssignable(templateChoice.value,sharedArchive.value,details.value?.personal??[]))
const openedSheet = shallowRef<Personal | null>(null)
const templateList = ref<Array<{id:string;title:string}>>([])
const sharedArchive = ref<CoachModel[]>([])
const history = ref<HistoricalArchive[]>([])
const historyError = ref('')
const restorePersonalId = ref('')
const latestLabFixture = ref('')
const labPersonalActive = computed(() => personalActive.value.filter(s => s.id.startsWith('lab2mf_')))
const deletedLabPersonal = computed(() => details.value?.personal.filter(s=>!!s.deletedAt && s.id.startsWith('lab2mf_')) ?? [])
const canMakeLabArchive = computed(() => writeAvailable.value && selected.value?.email.toLowerCase() === 'athlete2h@lionfit.invalid')
const templateError = ref('')
const templateChoice = ref('')
const personalChoice = ref('')
const allowTestWrites = ref(false)
const working = ref(false)
const actionNotice = ref('')
const draftActivity = ref('')
const draftActivity2 = ref('')
const testWeekLabel = ref('Settimana di prova')
const testWeekDate = ref('')
const restoreWeekId = ref('')
const showAthletePreview = ref(false)
const deletedLabWeeks = computed(() => details.value?.weeks.filter(w => w.deletedAt && w.id.startsWith('lab2me_')) ?? [])
const nextLabDate = computed(() => nextMondayAfter(weeks.value))
const writeAvailable = computed(() => session.value?.gymId === 'gym_lab2c_a' && selected.value?.email.toLowerCase().endsWith('@lionfit.invalid'))

watch([() => selectedId.value, () => currentWeek.value?.id, dayIndex], () => {
  draftActivity.value = currentDay.value?.activity1 ?? ''
  draftActivity2.value = currentDay.value?.activity2 ?? ''
  personalChoice.value = ''
  allowTestWrites.value = false // non mantenere l'abilitazione passando da un atleta/giorno all'altro
})
// Aggiornamenti onSnapshot: sincronizza i campi non modificati localmente,
// ma non sovrascrivere il testo che il Coach sta ancora digitando.
watch([() => currentDay.value?.activity1, () => currentDay.value?.activity2], ([a,b],[prevA,prevB]) => {
  if (draftActivity.value === (prevA ?? '')) draftActivity.value = a ?? ''
  if (draftActivity2.value === (prevB ?? '')) draftActivity2.value = b ?? ''
})
function resetLiveUi() {
  weekId.value = ''; dayIndex.value = 0; openedSheet.value = null
  showAthletePreview.value=false; restoreWeekId.value=''
  personalChoice.value = ''; actionNotice.value = ''; allowTestWrites.value = false
  restorePersonalId.value=''; latestLabFixture.value=''; history.value=[]; historyError.value=''
  templateChoice.value='' // nessun modello predisposto per un atleta precedente
}
function openPersonal(id: string) {
  const found = personalActive.value.find(s => s.id === id)
  if (found) openedSheet.value = found
}
function setWeek(id: string) {
  if (!weeks.value.some(w => w.id===id)) return
  weekId.value = id; dayIndex.value = 0; actionNotice.value = ''
}
function setDay(index: number) {
  validDayKey(index)
  dayIndex.value=index
  draftActivity.value=currentWeek.value?.days[index]?.activity1 || ''
  draftActivity2.value=currentWeek.value?.days[index]?.activity2 || ''
}
async function runWrite(name: string, action: (ctx: {gymId: string; uid: string; athleteId: string})=>Promise<void>) {
  const verified = session.value, athlete = selected.value
  if (working.value) return
  working.value=true; actionNotice.value=''
  try {
    assertEmulatorCoachWrite(verified,athlete,allowTestWrites.value)
    const ctx={gymId:verified.gymId,uid:verified.uid,athleteId:athlete!.id}
    await action(ctx)
    if (!active || selectedId.value!==ctx.athleteId) return
    actionNotice.value=`${name}: operazione confermata su Firebase Emulator.`
    allowTestWrites.value=false // ogni operazione richiede nuovo consenso esplicito
  } catch (e) {
    actionNotice.value=`${name}: ${e instanceof Error ? e.message : String(e)}`
  } finally { allowTestWrites.value=false; working.value=false }
}
function prepareAssignment(id:string) {
  if (!writeAvailable.value) { actionNotice.value='Scelta disponibile solo per gli account fittizi del laboratorio.';return }
  if (!isSelectedModelAssignable(id,sharedArchive.value,details.value?.personal??[])) {
    actionNotice.value='Questo modello non è disponibile per una nuova assegnazione: controlla lo stato nella libreria.'
    return
  }
  templateChoice.value=id
  allowTestWrites.value=false // selezionare non autorizza MAI una scrittura
  actionNotice.value='Modello selezionato. Vai a «Operazioni guidate», autorizza la singola operazione e conferma «Assegna modello».'
}
async function doAssign() {
  const id = templateChoice.value
  if (!templateList.value.some(t=>t.id===id) || !selectedModelReady.value) {
    actionNotice.value='Modello già assegnato, cestinato oppure scheda personale nel cestino: controlla la libreria.';return
  }
  await runWrite('Assegna modello',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await assignShared(db,gymId,athleteId,id,uid)
  })
}
async function doLink(slot:1|2) {
  const week=currentWeek.value,personalId=personalChoice.value,day=dayIndex.value
  if (!week||!personalActive.value.some(s=>s.id===personalId)) {actionNotice.value='Seleziona una settimana e una scheda personale attiva.';return}
  const expected=selectedSlotId(week,day,slot)
  if (expected) { actionNotice.value='Lo slot non è vuoto: scollega prima la scheda esistente.'; return }
  await runWrite('Collega scheda',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await linkPersonalDay(db,gymId,athleteId,week.id,validDayKey(day),slot,personalId,uid,expected)
  })
}
async function doUnlink(slot:1|2) {
  const week=currentWeek.value,day=dayIndex.value,expected=selectedSlotId(week,day,slot)
  if (!week||!expected) {actionNotice.value='Nessuna scheda collegata a questo slot.';return}
  await runWrite('Scollega scheda',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await unlinkPersonalDay(db,gymId,athleteId,week.id,validDayKey(day),slot,expected,uid)
  })
}
async function doSaveActivity(slot:1|2) {
  const week=currentWeek.value,day=dayIndex.value,value=slot===1?draftActivity.value:draftActivity2.value
  if(!week) {actionNotice.value='Seleziona una settimana.';return}
  if(value.length>240) {actionNotice.value='Massimo 240 caratteri.';return}
  await runWrite(`Salva attività ${slot}`,async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await updateActivity(db,gymId,athleteId,week.id,validDayKey(day),slot,value,uid)
  })
}
function newLabId(db: ReturnType<typeof getLocalEmulatorClients>['db'],gymId:string,athleteId:string):string {
  return `lab2me_${doc(collection(db,'gyms',gymId,'athlete_programs',athleteId,'weeks')).id}`
}
async function doCreateWeek() {
  let payload
  try { payload=labWeekPayload(testWeekLabel.value,testWeekDate.value || nextLabDate.value) }
  catch(e) { actionNotice.value=e instanceof Error?e.message:String(e); return }
  await runWrite('Crea settimana di prova',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await createWeekGuarded(db,gymId,athleteId,newLabId(db,gymId,athleteId),payload,uid)
  })
}
async function doDuplicateWeek() {
  const original=currentWeek.value
  if(!original) { actionNotice.value='Seleziona una settimana da duplicare.'; return }
  let monday
  try { monday=advanceV1Monday(String(original.startDate||''),1) }
  catch(e) { actionNotice.value='La settimana non contiene un lunedì valido: impossibile duplicare.'; return }
  await runWrite('Duplica settimana di prova',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await duplicateWeekGuarded(db,gymId,athleteId,original.id,newLabId(db,gymId,athleteId),monday,uid)
  })
}
async function doTrashWeek() {
  const week=currentWeek.value
  if(!week) {actionNotice.value='Seleziona una settimana.';return}
  try { assertLabWeekId(week.id) } catch(e) {actionNotice.value=e instanceof Error?e.message:String(e);return}
  await runWrite('Cestina settimana di prova',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await trashWeek(db,gymId,athleteId,week.id,uid)
  })
}
async function doRestoreWeek() {
  const id=restoreWeekId.value
  try { assertLabWeekId(id) } catch(e) {actionNotice.value=e instanceof Error?e.message:String(e);return}
  if(!deletedLabWeeks.value.some(w=>w.id===id)) {actionNotice.value='La settimana di prova non è nel cestino.';return}
  await runWrite('Ripristina settimana di prova',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await restoreFromTrash(db,gymId,'week',id,uid,athleteId)
  })
}

async function doPrepareLabArchive() {
  if (!canMakeLabArchive.value) { actionNotice.value='Solo Atleta fittizio Fase 2H può creare copie 2M/F.'; return }
  await runWrite('Crea modello, scheda personale e archivio 2M/F',async ()=>{
    const {db}=getLocalEmulatorClients()
    latestLabFixture.value=await createLabArchiveFixture(db,session.value,selected.value,true)
  })
}
async function doTrashLabPersonal(id:string) {
  const athlete=selected.value
  if (!athlete || !canTrashLabPersonal(details.value?.personal??[],details.value?.weeks??[],athlete.id,id,athlete.email)) {
    actionNotice.value='Cestino bloccato: solo schede 2M/F non collegate ad alcuna settimana attiva.'
    return
  }
  await runWrite('Cestina scheda personale 2M/F',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await trashPersonal(db,gymId,athleteId,id,uid)
  })
}
async function doRestoreLabPersonal() {
  const id=restorePersonalId.value
  try { assertLabArchiveTarget(selected.value?.email,id) }
  catch(e) {actionNotice.value=e instanceof Error?e.message:String(e);return}
  if (!deletedLabPersonal.value.some(s=>s.id===id)) { actionNotice.value='Scheda di prova non presente nel cestino.'; return }
  await runWrite('Ripristina scheda personale 2M/F',async ({gymId,uid,athleteId})=>{
    const {db}=getLocalEmulatorClients()
    await restoreFromTrash(db,gymId,'personal',id,uid,athleteId)
  })
}

async function doCreateCoachModel() {
  await runWrite('Crea modello Coach fittizio 2M/H',async ()=>{
    const {db}=getLocalEmulatorClients()
    await createLabCoachModel(db,session.value,selected.value,allowTestWrites.value)
  })
}
async function doTrashCoachModel(id:string) {
  await runWrite('Cestina modello Coach 2M/H',async ()=>{
    const {db}=getLocalEmulatorClients()
    await trashLabCoachModel(db,session.value,selected.value,allowTestWrites.value,id)
  })
}
async function doRestoreCoachModel(id:string) {
  await runWrite('Ripristina modello Coach 2M/H',async ()=>{
    const {db}=getLocalEmulatorClients()
    await restoreLabCoachModel(db,session.value,selected.value,allowTestWrites.value,id)
  })
}
const canTestCoachModel=computed(()=>canMakeLabArchive.value)

const status = ref<'loading' | 'ready' | 'error'>('loading')
const info = ref('Verifica del Coach e lettura elenco atleti dall’emulatore…')
let active = true
let stopRoster: Unsubscribe | null = null
let stopDetails: Unsubscribe | null = null
let stopAuth: Unsubscribe | null = null
let stopTemplates: Unsubscribe | null = null
let stopArchive: Unsubscribe | null = null

function clearDetails() { stopDetails?.(); stopDetails = null; stopArchive?.(); stopArchive=null; details.value = null; resetLiveUi() }
function closeAll() { clearDetails(); stopRoster?.(); stopRoster = null; stopAuth?.(); stopAuth = null; stopTemplates?.(); stopTemplates = null }
function chooseAthlete(id: string) {
  const verified = session.value
  if (!verified || !maySelectLabAthlete(athletes.value, verified.gymId, id)) return
  clearDetails()
  selectedId.value = id
  const { db } = getLocalEmulatorClients()
  stopArchive=onSnapshot(collection(db,'gyms',verified.gymId,'athlete_programs',id,'archive_templates'),snapshot=>{
    if(!active || selectedId.value!==id)return
    history.value=snapshot.docs.map(d=>archiveItemFromRaw(d.id,d.data())).sort((a,b)=>a.title.localeCompare(b.title,'it'))
    historyError.value=''
  },error=>{ if(active&&selectedId.value===id){history.value=[];historyError.value=`Archivio protetto non leggibile: ${error.message}`} })
  stopDetails = watchAthleteSheets(db, verified.gymId, id, next => {
    if (active && selectedId.value === id) details.value = next
  }, error => {
    if (!active) return
    info.value = `Errore lettura schede: ${error.message}`
    status.value = 'error'
    clearDetails()
  })
}
function backToList() { clearDetails(); selectedId.value = ''; info.value = 'Elenco atleti aggiornato in tempo reale dall’emulatore.' }

onMounted(async () => {
  try {
    const verified = await readVerifiedDevSession()
    if (!active) return
    if (!['titolare', 'collaboratore'].includes(verified.role) || !/^gym_lab2c_[ab]$/.test(verified.gymId)) {
      throw new Error('Questa pagina è riservata ai Coach del laboratorio.')
    }
    session.value = verified
    const { db, auth } = getLocalEmulatorClients()
    // I modelli appartengono per ora alla palestra; saranno separati PER COACH solo dopo
    // modello dati e Rules multi-coach. Non fingere che gli archivi siano gia separati.
    stopTemplates = onSnapshot(collection(db, 'gyms', verified.gymId, 'templates'), snapshot => {
      if (!active) return
      sharedArchive.value = snapshot.docs.map(d=>{
        const x=d.data()
        return {id:d.id,title:String(x.title||'Senza titolo'),category:String(x.category||''),
          exercises:Array.isArray(x.exercises)?x.exercises.map((e:unknown)=>typeof e==='object'&&e!==null&&'name' in e?String(e.name):String(e)):[],
          createdBy:String(x.createdBy||''),trashed:!!x.deletedAt}
      }).sort((a,b)=>a.title.localeCompare(b.title,'it'))
      templateList.value = snapshot.docs.filter(d=>!d.data().deletedAt).map(d=>({id:d.id,title:String(d.data().title||'Senza titolo')})).sort((a,b)=>a.title.localeCompare(b.title,'it'))
      if (!templateList.value.some(t=>t.id===templateChoice.value)) templateChoice.value=''
      templateError.value=''
    }, error=>{templateList.value=[];templateError.value=`Archivio non leggibile: ${error.message}`})
    // Query vincolata alla palestra: le Security Rules sono l'autorita' per l'accesso.
    stopRoster = onSnapshot(query(collection(db, 'users'), where('gymId', '==', verified.gymId)), snapshot => {
      if (!active) return
      athletes.value = labCoachRoster(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })), verified.gymId)
      if (selectedId.value && !maySelectLabAthlete(athletes.value, verified.gymId, selectedId.value)) backToList()
      status.value = 'ready'
      info.value = 'Elenco atleti in tempo reale; scritture disabilitate fino al consenso esplicito.'
    }, error => {
      if (!active) return
      status.value = 'error'
      info.value = `Lettura utenti non consentita o non disponibile: ${error.message}`
      closeAll()
    })
    stopAuth = onAuthStateChanged(auth, user => {
      if (!active) return
      if (!user || user.uid !== verified.uid) {
        closeAll()
        athletes.value = []
        void router.replace('/dev/accesso')
      }
    })
  } catch (error) {
    if (!active) return
    closeAll()
    status.value = 'error'
    info.value = error instanceof Error ? error.message : 'Sessione non verificata.'
  }
})
onUnmounted(() => { active = false; closeAll(); athletes.value = [] })
</script>

<template>
  <main :class="props.embedded ? 'stack coach-athletes-screen' : 'access-wrap'">
    <div class="stack" :style="props.embedded ? { width: '100%' } : { width: 'min(1120px,100%)', margin: 'auto' }">
      <div v-if="props.embedded" class="notice" role="status">
        <strong>LABORATORIO FIREBASE · OPERAZIONI GUIDATE</strong> — <RouterLink to="/coach/archivio?source=emulator" class="secondary">Apri Archivio Coach operativo</RouterLink> — Stai utilizzando la schermata originale con dati fittizi. Le scritture richiedono consenso e si applicano SOLO all’emulatore.
        <span v-if="session"> Coach: {{ session.label }} · {{ session.gymId }}</span>
        <p style="margin:6px 0 0" :class="status === 'error' ? 'danger' : 'muted'">{{ info }}</p>
      </div>
      <section v-if="!props.embedded" class="panel">
        <div class="eyebrow">LION FIT MODERN · FASE 2M/D · SOLO EMULATORE</div>
        <h1>Gestione <span class="green">atleti Coach</span></h1>
        <p class="muted">Anteprima con operazioni guidate nell’emulatore, con classi grafiche già presenti in Modern. La schermata originale <code>/coach/atleti</code> non viene modificata.</p>
        <div class="notice" v-if="session">Profilo verificato: <strong>{{session.label}}</strong> · palestra: <code>{{session.gymId}}</code></div>
        <p role="status" :aria-busy="status === 'loading'" :class="status === 'error' ? 'danger' : 'muted'">{{info}}</p>
      </section>

      <template v-if="status === 'ready' && session">
        <template v-if="!selected">
          <section class="panel coach-team-toolbar">
            <div class="coach-team-title"><h2 class="card-heading">TEAM &amp; ATLETI</h2><span class="muted">SELEZIONA UN ATLETA PER ACCEDERE · EMULATORE</span></div>
            <div class="coach-team-tools">
              <button class="secondary" disabled title="Gli elenchi si aggiornano automaticamente">↻ Aggiorna elenco Team</button>
              <button class="primary" disabled title="Gli inviti non sono ancora attivi in questa vista">+ Invita atleta</button>
              <input v-model="search" type="search" placeholder="Cerca atleta per nome..." aria-label="Cerca atleta per nome" />
            </div>
          </section>
          <div class="coach-athlete-count row between">
            <span class="muted">{{ filtered.length }} atleti disponibili</span>
            <button class="secondary" @click="search = ''">Mostra tutti ({{ athletes.length }})</button>
          </div>
          <p v-if="!athletes.length" class="notice">Nessun atleta fittizio in questa palestra. Non viene consultata alcuna altra palestra.</p>
          <p v-else-if="!filtered.length" class="notice">Nessun atleta corrisponde alla ricerca.</p>
          <div class="grid2 coach-athlete-list">
            <button v-for="a in filtered" :key="a.id" class="action-card" @click="chooseAthlete(a.id)">
              <span class="action-icon">🦁</span><div><strong>{{ a.name.toUpperCase() }}</strong><small>{{ a.email.toUpperCase() }}</small></div>
              <b class="green" style="margin-left:auto">GESTISCI →</b>
            </button>
          </div>
        </template>

        <section v-else class="panel coach-selected-athlete">
          <div class="row between coach-selected-head">
            <div><span class="eyebrow">GESTIONE ATLETA · SOLO EMULATORE</span><h2>{{ selected.name.toUpperCase() }}</h2><p class="muted small">{{selected.email}}</p></div>
            <button class="secondary" @click="backToList">← TORNA AGLI ATLETI</button>
          </div>
          <div class="divider"/>
          <p v-if="!details" role="status">Caricamento schede e settimane da Firestore…</p>
          <template v-else>
            <div class="grid2 assignment-columns">
              <div class="panel assignment-panel">
                <h3>📄 SCHEDE SINGOLE SENZA PROGRAMMA</h3>
                <p class="muted small">Schede non collegate a giorni attivi</p>
                <p v-if="!grouped?.unprogrammed.length" class="line-card">Nessuna scheda singola.</p>
                <div v-for="g in grouped?.unprogrammed" :key="g.sheet.id" class="line-card assignment-item">
                  <b>🏋️ {{g.sheet.title}}</b>
                  <p class="small muted">{{g.sheet.exercises.length}} esercizi · {{g.sheetIds.length}} ID originali conservati</p>
                </div>
              </div>
              <div class="panel assignment-panel assignment-scroll">
                <h3>🗓️ SCHEDE IN PROGRAMMA</h3>
                <p class="muted small">Collegamenti alle settimane attive</p>
                <p v-if="!grouped?.programmed.length" class="line-card">Nessuna scheda programmata.</p>
                <div v-for="g in grouped?.programmed" :key="g.sheet.id" class="line-card assignment-item">
                  <b>🏋️ {{g.sheet.title}}</b>
                  <p class="small green">{{g.links.length}} collegamenti · {{g.sheetIds.length}} ID conservati</p>
                  <p v-for="link in g.links" :key="`${link.weekId}-${link.day}-${link.slot}`" class="small muted">{{link.weekName}} · {{link.dayName}} · slot {{link.slot}}</p>
                </div>
              </div>
            </div>
            <h3 style="margin:24px 0 12px">SETTIMANE ATTIVE · {{weeks.length}}</h3>
            <div v-for="week in weeks" :key="week.id" class="line-card" style="margin-bottom:8px">
              <strong>{{week.name}}</strong> <span class="muted small">· {{week.startDate || 'Data non specificata'}}</span>
              <p class="muted small">{{week.days.filter(d => d.activity1 || d.activity2 || d.templateId || d.templateId2).length}} giorni con attività o schede</p>
            </div>
            <div v-if="!weeks.length" class="notice">Nessuna settimana attiva.</div>
            <div v-if="details.groups.orphanLinks.length" class="notice" role="alert">Attenzione: {{details.groups.orphanLinks.length}} collegamenti a schede non attive; nessuna modifica automatica.</div>

            <section class="panel coach-program-compact" style="margin-top:20px">
              <div class="row between"><div><h3>PROGRAMMA ATTUALE · FIREBASE</h3><p class="muted small">Settimana e giorni effettivi dell'atleta selezionato · identificativi originali</p></div>
                <span class="pill pill-neutral">{{weeks.length}} SETTIMANE</span>
              </div>
              <div class="week-pills" aria-label="Seleziona la settimana">
                <button v-for="(w,index) in weeks" :key="w.id" type="button" class="week-pill" :class="{selected:currentWeek?.id===w.id}" :aria-pressed="currentWeek?.id===w.id" @click="setWeek(w.id)">{{index+1}}</button>
              </div>
              <div v-if="currentWeek" class="line-card" style="margin-top:12px">
                <div class="row between"><strong>{{currentWeek.name}}</strong><span class="muted small">{{currentWeek.startDate}}</span></div>
                <div class="week-pills" style="margin-top:12px;flex-wrap:wrap">
                  <button v-for="(d,index) in currentWeek.days" :key="d.name" type="button" class="secondary" :aria-pressed="dayIndex===index" @click="setDay(index)">{{DAY_NAMES[index]}}</button>
                </div>
                <section v-if="currentDay" class="stack" style="margin-top:16px">
                  <h3>{{currentDay.name.toUpperCase()}}</h3>
                  <p class="muted small">Attività 1: {{currentDay.activity1 || 'Nessuna'}} · Attività 2: {{currentDay.activity2 || 'Nessuna'}}</p>
                  <div v-for="slot in slots" :key="slot" class="program-sheet">
                    <div class="row between"><strong>SCHEDA {{slot}} · {{personalActive.find(s=>s.id===selectedSlotId(currentWeek,dayIndex,slot))?.title || (selectedSlotId(currentWeek,dayIndex,slot)?'Riferimento non disponibile':'Slot vuoto')}}</strong>
                      <button v-if="selectedSlotId(currentWeek,dayIndex,slot) && personalActive.some(s=>s.id===selectedSlotId(currentWeek,dayIndex,slot))" class="secondary" type="button" @click="openPersonal(selectedSlotId(currentWeek,dayIndex,slot))">Visualizza</button></div>
                    <div class="row" style="margin-top:8px">
                      <button v-if="!selectedSlotId(currentWeek,dayIndex,slot)" class="secondary" :disabled="working||!allowTestWrites||!personalChoice" @click="doLink(slot)">Collega nello slot {{slot}}</button>
                      <button v-else class="secondary" :disabled="working||!allowTestWrites" @click="doUnlink(slot)">Scollega dallo slot {{slot}}</button>
                    </div>
                  </div>
                </section>
              </div>
              <p v-else class="notice">Nessuna settimana attiva per questo atleta.</p>
              <h3 style="margin:22px 0 10px">ESERCIZI E SCHEDE PERSONALI · {{personalActive.length}}</h3>
              <div class="grid2">
                <button v-for="sheet in personalActive" :key="sheet.id" class="line-card" type="button" style="text-align:left" @click="openPersonal(sheet.id)">
                  <strong>{{sheet.title}}</strong><p class="muted small">{{sheet.exercises.length}} esercizi · ID: {{sheet.id}}</p>
                </button>
              </div>
            </section>
            <LabCoachTemplateArchive :models="sharedArchive" :personal="details.personal" :selected-template-id="templateChoice" :coach-uid="session.uid"
              :can-test-write="canTestCoachModel" :consent="allowTestWrites" :busy="working"
              @create-fixture="doCreateCoachModel" @trash-fixture="doTrashCoachModel" @restore-fixture="doRestoreCoachModel" @stage-assignment="prepareAssignment"
              style="margin-top:20px" />
            <LabProtectedArchive :items="history" :personal="details?.personal ?? []" :athlete-key="selectedId" heading="ARCHIVIO STORICO ATLETA · COPIE IMMUTABILI" style="margin-top:20px" />
            <p v-if="historyError" class="notice" role="alert">{{historyError}}</p>
            <section class="panel" style="margin-top:20px">
              <h3>CESTINO SCHEDE PERSONALI · SOLO PROVA 2M/F</h3>
              <p class="muted small">Le schede storiche precedenti sono protette. Solo il fixture creato qui per l'atleta fittizio 2H può essere cestinato/ripristinato; tutte le settimane attive vengono controllate e nessun documento storico viene cancellato.</p>
              <button class="secondary" :disabled="working||!allowTestWrites||!canMakeLabArchive" @click="doPrepareLabArchive">Crea scheda e archivio fittizi 2M/F</button>
              <p v-if="latestLabFixture" class="muted small">Nuovo ID: <code>{{latestLabFixture}}</code></p>
              <div v-if="canMakeLabArchive" class="grid2">
                <div class="line-card stack">
                  <strong>Schede di prova attive · {{labPersonalActive.length}}</strong>
                  <div v-for="s in labPersonalActive" :key="s.id" class="stack">
                    <span>{{s.title}} · <code>{{s.id}}</code></span>
                    <button class="secondary" :disabled="working||!allowTestWrites||!canTrashLabPersonal(details?.personal??[],details?.weeks??[],selected.id,s.id,selected.email)" @click="doTrashLabPersonal(s.id)">Cestina soltanto questa scheda 2M/F</button>
                  </div>
                </div>
                <div class="line-card stack">
                  <strong>Nel cestino 2M/F · {{deletedLabPersonal.length}}</strong>
                  <select v-model="restorePersonalId" :disabled="working" aria-label="Seleziona scheda 2M/F nel cestino">
                    <option value="">Seleziona scheda fittizia cestinata</option>
                    <option v-for="s in deletedLabPersonal" :key="s.id" :value="s.id">{{s.title}} · {{s.id}}</option>
                  </select>
                  <button class="secondary" :disabled="working||!allowTestWrites||!restorePersonalId" @click="doRestoreLabPersonal">Ripristina scheda 2M/F · stesso ID</button>
                </div>
              </div>
              <p v-else class="notice">Cestino fittizio disponibile solo selezionando l'atleta 2H; archivio sempre consultabile in sola lettura.</p>
            </section>
            <section id="lab-assignment-section" class="panel" style="margin-top:20px">
              <h3>OPERAZIONI GUIDATE · SOLO EMULATORE</h3>
              <p class="muted small">Le scritture sono DISABILITATE per impostazione predefinita. La schermata demo e Firebase di produzione non possono usare queste funzioni. Le nuove Rules 2L/C NON sono ancora pubblicate.</p>
              <p v-if="!writeAvailable" class="notice">Scritture bloccate: non è un account fittizio della palestra A.</p>
              <label v-if="writeAvailable" class="row" style="gap:8px;align-items:center">
                <input v-model="allowTestWrites" type="checkbox" :disabled="working" />
                <span>Autorizzo questa operazione SOLO su dati fittizi del Firebase Emulator</span>
              </label>
              <p v-if="actionNotice" class="notice" role="status">{{actionNotice}}</p>
              <div class="grid2" style="margin-top:14px">
                <div class="line-card stack">
                  <strong>1. ASSEGNA UN MODELLO DELLA PALESTRA</strong>
                  <p class="muted small">Il modello resta nell'archivio della palestra; l'assegnazione personale mantiene il proprio ID e una copia storica protetta.</p>
                  <select v-model="templateChoice" :disabled="!writeAvailable||working" aria-label="Modello condiviso da assegnare">
                    <option value="">Seleziona modello</option><option v-for="t in templateList" :key="t.id" :value="t.id">{{t.title}}</option>
                  </select>
                  <p v-if="templateError" class="notice" role="alert">{{templateError}}</p>
                  <p v-if="selectedModel" class="muted small">Selezionato: <strong>{{selectedModel.title}}</strong> · ID: <code>{{selectedModel.id}}</code></p>
                  <p v-if="selectedModel && !selectedModelReady" class="notice" role="status">Non assegnabile: già presente per questo atleta oppure scheda nel cestino. Non verrà creata una seconda copia.</p>
                  <button class="primary" :disabled="!allowTestWrites||working||!selectedModelReady||!writeAvailable" @click="doAssign">Assegna modello all'atleta</button>
                </div>
                <div class="line-card stack">
                  <strong>2. COLLEGA UNA SCHEDA PERSONALE</strong>
                  <p class="muted small">Seleziona prima settimana e giorno sopra. Le schede disponibili sono quelle già assegnate a questo atleta.</p>
                  <select v-model="personalChoice" :disabled="!writeAvailable||working" aria-label="Scheda personale da collegare">
                    <option value="">Seleziona scheda personale</option><option v-for="s in personalActive" :key="s.id" :value="s.id">{{s.title}}</option>
                  </select>
                  <p class="muted small">Utilizza i comandi Collega/Scollega nei due slot del giorno selezionato.</p>
                </div>
                <div class="line-card stack">
                  <strong>3. AGGIORNA LE DUE ATTIVITÀ</strong>
                  <p class="muted small">Ogni pulsante salva solo il proprio campo, senza riscrivere gli slot delle schede. Il consenso scade dopo ogni salvataggio.</p>
                  <input v-model="draftActivity" type="text" maxlength="240" :disabled="!currentWeek||!writeAvailable||working" aria-label="Testo attività 1" placeholder="Attività 1" />
                  <button class="secondary" :disabled="!allowTestWrites||working||!writeAvailable||!currentWeek" @click="doSaveActivity(1)">Salva attività 1</button>
                  <input v-model="draftActivity2" type="text" maxlength="240" :disabled="!currentWeek||!writeAvailable||working" aria-label="Testo attività 2" placeholder="Attività 2" />
                  <button class="secondary" :disabled="!allowTestWrites||working||!writeAvailable||!currentWeek" @click="doSaveActivity(2)">Salva attività 2</button>
                </div>
                <div class="line-card stack">
                  <strong>4. SINCRONIZZAZIONE AUTOMATICA</strong>
                  <p class="muted small">L'elenco, le schede personali e le settimane sono aggiornati tramite listener onSnapshot. Dopo il salvataggio la vista Atleta 2M/A deve aggiornarsi senza ricaricare la pagina.</p>
                  <p class="muted small">Nessuna cancellazione irreversibile. I test cestino/ripristino restano in fase dedicata.</p>
                </div>
              </div>
            </section>
            <section class="panel" style="margin-top:20px">
              <h3>SETTIMANE DI PROVA · SOLO EMULATORE</h3>
              <p class="muted small">Crea una settimana senza collegamenti, duplica quella selezionata o recupera le copie cestinate. SOLO le settimane con ID <code>lab2me_…</code> possono essere cestinate qui. Nessuna cancellazione definitiva.</p>
              <div class="grid2">
                <div class="line-card stack">
                  <strong>5. CREA UNA SETTIMANA</strong>
                  <label class="muted small" for="lab-week-title">Nome della prova</label>
                  <input id="lab-week-title" v-model="testWeekLabel" type="text" maxlength="55" placeholder="Settimana di prova" :disabled="working||!writeAvailable" />
                  <label class="muted small" for="lab-week-date">Lunedì di inizio</label>
                  <input id="lab-week-date" v-model="testWeekDate" type="date" :placeholder="nextLabDate" :disabled="working||!writeAvailable" />
                  <p class="muted small">Se non imposti una data useremo {{nextLabDate}}.</p>
                  <button class="secondary" :disabled="working||!allowTestWrites||!writeAvailable" @click="doCreateWeek">Crea settimana di prova</button>
                </div>
                <div class="line-card stack">
                  <strong>6. DUPLICA / CESTINA / RIPRISTINA</strong>
                  <p class="muted small">Duplica la settimana selezionata, preservando gli ID delle schede collegate; la copia avrà un nuovo ID.</p>
                  <button class="secondary" :disabled="working||!allowTestWrites||!writeAvailable||!currentWeek" @click="doDuplicateWeek">Duplica settimana selezionata</button>
                  <button class="secondary" :disabled="working||!allowTestWrites||!writeAvailable||!currentWeek?.id.startsWith('lab2me_')" @click="doTrashWeek">Cestina SOLO settimana 2M/E</button>
                  <label for="lab-restore-week" class="muted small">Settimane 2M/E nel cestino</label>
                  <select id="lab-restore-week" v-model="restoreWeekId" :disabled="working||!writeAvailable"><option value="">Seleziona una settimana nel cestino</option><option v-for="w in deletedLabWeeks" :key="w.id" :value="w.id">{{w.name}} · {{w.startDate}}</option></select>
                  <button class="secondary" :disabled="working||!allowTestWrites||!writeAvailable||!restoreWeekId" @click="doRestoreWeek">Ripristina settimana di prova</button>
                </div>
              </div>
            </section>
            <section class="panel" style="margin-top:20px">
              <h3>ANTEPRIMA PIANO ATLETA · SOLA LETTURA</h3>
              <p class="muted small">Questa anteprima usa lo stesso componente grafico del Piano Atleta, ma la sessione resta quella del Coach. Per verificare i permessi dell'Atleta occorre una seconda sessione autenticata.</p>
              <button type="button" class="secondary" :aria-expanded="showAthletePreview" @click="showAthletePreview=!showAthletePreview">{{showAthletePreview?'Nascondi anteprima':'Mostra il piano dell’atleta selezionato'}}</button>
              <AthletePlanContent v-if="showAthletePreview && details" :athlete-key="selectedId" :personal="details.personal" :weeks="details.weeks" :groups="details.groups" />
            </section>
          </template>
        </section>
      </template>
      <section v-if="!props.embedded" class="panel"><router-link to="/dev/pannello/coach">← Torna al pannello Coach del laboratorio</router-link></section>
    </div>
  </main>
  <SheetDetail v-if="openedSheet" :sheet="openedSheet" @close="openedSheet=null" @finish="openedSheet=null" />
</template>
