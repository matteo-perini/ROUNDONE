<script setup lang="ts">
/** FASE 2E: SOLO LETTURA, SOLO /dev, SOLO Firebase Emulator. */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDocFromServer, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { readVerifiedDevSession } from '../integrations/firebase/devSession'
import type { VerifiedDevSession } from '../integrations/firebase/devSession'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import { resolveLabReadTarget } from '../features/sheets/labReadTarget'
import { watchAthleteSheets } from '../integrations/firestore/sheets'
import type { Groups, Personal, ProgramWeek } from '../features/sheets/domain'
import { visualSheetGroups } from '../features/sheets/semanticDedup'
import AthletePlanContent from '../components/AthletePlanContent.vue'
import LabProtectedArchive from '../components/LabProtectedArchive.vue'
import { archiveItemFromRaw, type HistoricalArchive } from '../features/athletes/labArchive'

const router = useRouter()
const session = shallowRef<VerifiedDevSession | null>(null)
const athleteId = ref('')
const selectedWeekId = ref('')
const state = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
const message = ref('Connessione alla sola lettura Firestore Emulator…')
const result = shallowRef<{ personal: Personal[]; weeks: ProgramWeek[]; groups: Groups } | null>(null)
const historical = ref<HistoricalArchive[]>([])
const syncEvents = ref(0)
const lastLiveUpdate = ref('')
const historyError = ref('')
const visualGroups = computed(() => result.value ? visualSheetGroups(result.value.groups) : null)
let active = true
let stopSheets: Unsubscribe | null = null
let stopArchive: Unsubscribe | null = null
let stopAuth: Unsubscribe | null = null

function closeListeners() {
  stopSheets?.()
  stopSheets = null
  stopArchive?.()
  stopArchive=null
  stopAuth?.()
  stopAuth = null
}

onMounted(async () => {
  try {
    const verified = await readVerifiedDevSession()
    if (!active) return
    session.value = verified
    const { db, auth } = getLocalEmulatorClients()
    const gym = await getDocFromServer(doc(db, 'gyms', verified.gymId))
    if (!active) return
    if (!gym.exists()) throw new Error('Palestra fixture non disponibile.')
    const uid = gym.data().labAthleteUid
    // La scelta dell'atleta non dipende dall'URL. Il profilo deve appartenere alla stessa palestra.
    const athleteDoc = typeof uid === 'string' && uid && !uid.includes('/')
      ? await getDocFromServer(doc(db, 'users', uid)) : null
    if (!active) return
    const target = resolveLabReadTarget(verified, uid, athleteDoc?.exists() ? athleteDoc.data() : undefined)
    if (!target) {
      state.value = 'empty'
      message.value = 'Questa palestra non ha un atleta fixture: nessun dato della palestra A viene richiesto.'
    } else {
      athleteId.value = target.athleteId
      stopArchive=onSnapshot(collection(db,'gyms',target.gymId,'athlete_programs',target.athleteId,'archive_templates'),snapshot=>{
        if(!active)return
        historical.value=snapshot.docs.map(d=>archiveItemFromRaw(d.id,d.data())).sort((a,b)=>a.title.localeCompare(b.title,'it'))
        historyError.value=''
      },error=>{if(active){historical.value=[];historyError.value=`Archivio protetto non leggibile: ${error.message}`}})
      stopSheets = watchAthleteSheets(db, target.gymId, target.athleteId, value => {
        if (!active) return
        result.value = value
        syncEvents.value += 1
        lastLiveUpdate.value = new Date().toLocaleTimeString('it-IT')
        state.value = 'ready'
        message.value = 'Schede e settimane lette in tempo reale dall’emulatore.'
      }, error => {
        if (!active) return
        state.value = 'error'
        message.value = `Lettura Firestore negata o fallita: ${error.message}`
        closeListeners()
      })
    }
    // Revoca immediata della vista se un'altra azione cambia sessione nello stesso client.
    stopAuth = onAuthStateChanged(auth, user => {
      if (!active) return
      if (!user || user.uid !== verified.uid) {
        closeListeners()
        result.value = null
        void router.replace('/dev/accesso')
      }
    })
  } catch (error) {
    if (!active) return
    closeListeners()
    state.value = 'error'
    message.value = error instanceof Error ? error.message : 'Impossibile leggere il fixture.'
  }
})
onUnmounted(() => { active = false; closeListeners(); result.value = null })
</script>
<template>
  <main class="access-wrap">
    <section class="panel access-card" style="max-width:900px">
      <div class="eyebrow">LION FIT V1 MODERN · FASE 2E · SOLO EMULATORE</div>
      <h1>Schede <span class="green">dal database</span></h1>
      <p class="lead">Prova di sincronizzazione in sola lettura. Nessuna funzione di assegnazione, modifica o cancellazione è abilitata qui.</p>
      <div v-if="session" class="notice">
        <strong>Profilo:</strong> {{ session.label }} · <strong>Palestra:</strong> {{ session.gymId }}
        <p v-if="athleteId"><strong>Atleta fixture:</strong> <code>{{ athleteId }}</code></p>
      </div>
      <p role="status" :aria-busy="state === 'loading'">{{ message }}</p>
      <template v-if="state === 'ready' && result">
        <div class="notice">
          <strong>Letti dall’emulatore:</strong> {{ result.personal.length }} documenti schede, {{ result.weeks.length }} settimane
          <p><strong>Attive in programma:</strong> {{ visualGroups?.programmed.length }} · <strong>Attive senza programma:</strong> {{ visualGroups?.unprogrammed.length }} · <strong>Riferimenti orfani:</strong> {{ result.groups.orphanLinks.length }}</p>
        </div>
        <div class="notice" role="status">
          <strong>Sincronizzazione in tempo reale:</strong> {{syncEvents}} snapshot ricevuti in questa sessione.
          <span v-if="lastLiveUpdate"> Ultimo aggiornamento: {{lastLiveUpdate}}.</span>
          <p class="muted small">Lascia questa pagina aperta e modifica un’attività dalla Gestione Atleti Coach per lo stesso Atleta LAB A. Il numero aumenta senza F5. Questo indicatore non conferma da solo che sia stato il Coach a modificare i dati.</p>
        </div>
        <h2>Schede in programma</h2>
        <p v-if="!visualGroups?.programmed.length">Nessuna scheda programmata nel fixture.</p>
        <div v-for="entry in visualGroups?.programmed" :key="entry.sheet.id" class="notice">
          <strong>{{ entry.sheet.title }}</strong> <code>{{ entry.sheet.id }}</code>
          <p>{{ entry.sheet.exercises.length }} esercizi · {{ entry.links.length }} collegamenti · {{ entry.sheetIds.length }} ID conservati</p>
          <ul>
            <li v-for="link in entry.links" :key="`${link.weekId}-${link.day}-${link.slot}`">
              {{ link.weekName }} · {{ link.dayName }} · slot {{ link.slot }}
            </li>
          </ul>
        </div>
        <h2>Schede singole senza programma</h2>
        <p v-if="!visualGroups?.unprogrammed.length">Nessuna scheda singola nel fixture.</p>
        <div v-for="entry in visualGroups?.unprogrammed" :key="entry.sheet.id" class="notice">
          <strong>{{ entry.sheet.title }}</strong> <code>{{ entry.sheet.id }}</code>
          <p>{{ entry.sheet.exercises.length }} esercizi · senza collegamenti attivi</p>
        </div>
        <h2>Settimane attive</h2>
        <p v-if="!result.weeks.filter(w => !w.deletedAt).length">Nessuna settimana attiva nel fixture.</p>
        <div v-for="week in result.weeks.filter(w => !w.deletedAt)" :key="week.id" class="notice">
          <strong>{{ week.name }}</strong> · <code>{{ week.id }}</code>
          <p>Inizio: {{ week.startDate || 'non specificato' }}</p>
          <ul>
            <li v-for="(day, index) in week.days" :key="index" v-show="day.activity1 || day.activity2 || day.templateId || day.templateId2">
              {{ day.name }}: {{ day.activity1 || '—' }} / {{ day.activity2 || '—' }}
              <span v-if="day.templateId"> · slot 1: <code>{{ day.templateId }}</code></span>
              <span v-if="day.templateId2"> · slot 2: <code>{{ day.templateId2 }}</code></span>
            </li>
          </ul>
        </div>
        <LabProtectedArchive :items="historical" :personal="result.personal" :athlete-key="athleteId" heading="ARCHIVIO PERSONALE STORICO · SOLA LETTURA" />
        <p v-if="historyError" class="notice" role="alert">{{historyError}}</p>
        <p v-if="result.groups.orphanLinks.length" role="alert">Attenzione: esistono riferimenti a schede personali mancanti o cestinate. Non correggere automaticamente i dati.</p>
        <div class="divider" style="margin:24px 0"/>
        <div class="eyebrow">FASE 2M/A · VISTA ATLETA CONDIVISA · SOLO EMULATORE</div>
        <p class="muted">Questa è la stessa interfaccia usata da «Il mio piano» nella Modern. Qui legge soltanto le settimane e schede Firestore di prova; nessuna scrittura è abilitata.</p>
        <AthletePlanContent
          :athlete-key="athleteId"
          :personal="result.personal"
          :weeks="result.weeks"
          :groups="result.groups"
          :week-id="selectedWeekId"
          @update:week-id="id => { selectedWeekId = id }"
        />
      </template>
      <div class="notice">La pagina ascolta due collection tramite <code>onSnapshot</code> e rimuove i listener quando la lasci. I dati arrivano solo dal progetto fittizio <code>demo-lionfit-029</code>.</div>
      <p><router-link :to="session?.role === 'atleta' ? '/dev/pannello/atleta' : '/dev/pannello/coach'">Torna al pannello 2D</router-link></p>
      <p><router-link to="/dev/accesso">Torna all’accesso laboratorio</router-link></p>
    </section>
  </main>
</template>
