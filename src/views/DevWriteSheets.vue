<script setup lang="ts">
/** FASE 2F, esclusivamente /dev e progetto Firebase Emulator fittizio.
 * Prova reversibile del solo slot: lab2e_week_2 / mercoledì / templateId2.
 * NON collegare questa pagina alla UI operativa o alla produzione. */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDocFromServer, type Unsubscribe } from 'firebase/firestore'
import { readVerifiedDevSession } from '../integrations/firebase/devSession'
import type { VerifiedDevSession } from '../integrations/firebase/devSession'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import { linkPersonalDay, unlinkPersonalDay, watchAthleteSheets } from '../integrations/firestore/sheets'
import { assertLabWriteFixture, resolveLabWriteTarget, LAB_2F_DAY, LAB_2F_SHEET_ID, LAB_2F_WEEK_ID } from '../features/sheets/labWriteTarget'
import type { LabWriteTarget } from '../features/sheets/labWriteTarget'
import type { Personal, ProgramWeek, Groups } from '../features/sheets/domain'

const router = useRouter()
const session = shallowRef<VerifiedDevSession | null>(null)
const target = shallowRef<LabWriteTarget | null>(null)
const result = shallowRef<{personal:Personal[];weeks:ProgramWeek[];groups:Groups}|null>(null)
const stage = ref<'loading'|'ready'|'error'>('loading')
const message = ref('Verifica degli account e delle schede sintetiche…')
const busy = ref(false)
let active = true
let stopAuth:Unsubscribe|null = null
let stopSheets:Unsubscribe|null = null

function stopListeners() { stopSheets?.(); stopAuth?.(); stopSheets=null; stopAuth=null }
const currentSlot = computed(() => result.value?.weeks.find(w => w.id === LAB_2F_WEEK_ID)?.days[2]?.templateId2 ?? null)
const fixtureReady = computed(() => stage.value === 'ready' && !!result.value?.personal.find(s => s.id === LAB_2F_SHEET_ID && !s.deletedAt)
 && !!result.value?.weeks.find(w => w.id === LAB_2F_WEEK_ID && !w.deletedAt))
const actionAllowed = computed(() => fixtureReady.value && !busy.value && (currentSlot.value === '' || currentSlot.value === LAB_2F_SHEET_ID))

async function resolveTargetFor(sessionNow:VerifiedDevSession):Promise<LabWriteTarget> {
 const {db}=getLocalEmulatorClients()
 const gym = await getDocFromServer(doc(db,'gyms',sessionNow.gymId))
 if (!gym.exists()) throw new Error('Palestra fixture non presente nell’emulatore.')
 const athleteUid = gym.data().labAthleteUid
 const profile = typeof athleteUid==='string' && athleteUid && !athleteUid.includes('/')
  ? await getDocFromServer(doc(db,'users',athleteUid)) : null
 return resolveLabWriteTarget(sessionNow,athleteUid,profile?.exists()?profile.data():undefined)
}

onMounted(async()=>{
 try {
  const verified = await readVerifiedDevSession()
  const resolved = await resolveTargetFor(verified)
  if(!active)return
  session.value=verified;target.value=resolved
  const {db,auth}=getLocalEmulatorClients()
  stopSheets=watchAthleteSheets(db,resolved.gymId,resolved.athleteId, s=>{
    if(!active)return
    result.value=s;stage.value='ready';message.value='Dati sincronizzati con Firestore Emulator. Nessuna scrittura automatica.'
  }, e=>{if(!active)return;stage.value='error';message.value=`Lettura negata: ${e.message}`;stopListeners()})
  stopAuth=onAuthStateChanged(auth,user=>{
    if (!active)return
    if(!user || user.uid!==verified.uid){stopListeners();result.value=null;void router.replace('/dev/accesso')}
  })
 } catch(e) {
  if(!active)return
  stage.value='error';message.value=e instanceof Error?e.message:'Impossibile verificare i fixture.'
  stopListeners()
 }
})
onUnmounted(()=>{active=false;stopListeners();result.value=null})

async function changeLink(action:'link'|'unlink') {
 if(!target.value||!session.value||!actionAllowed.value)return
 busy.value=true
 try {
  const now=await readVerifiedDevSession()
  if(now.uid!==session.value.uid || now.gymId!==session.value.gymId || now.role!==session.value.role) {
   throw new Error('Sessione cambiata: rientra e ripeti il test.')
  }
  const confirmedTarget = await resolveTargetFor(now)
  if(confirmedTarget.athleteId !== target.value.athleteId)throw new Error('Atleta fixture cambiato.')
  const {db}=getLocalEmulatorClients()
  const base=['gyms',confirmedTarget.gymId,'athlete_programs',confirmedTarget.athleteId] as const
  const [week,sheet]=await Promise.all([
   getDocFromServer(doc(db,...base,'weeks',LAB_2F_WEEK_ID)),
   getDocFromServer(doc(db,...base,'personal_templates',LAB_2F_SHEET_ID)),
  ])
  const current=assertLabWriteFixture(week.exists()?week.data():undefined,sheet.exists()?sheet.data():undefined)
  if((action==='link' && current!=='')||(action==='unlink' && current!==LAB_2F_SHEET_ID)) {
   message.value=action==='link'?'La scheda è già collegata.':'La scheda è già scollegata.';return
  }
  const explanation=action==='link'
   ? 'COLLEGARE la scheda fittizia senza programma a Mercoledì, slot 2, della Settimana 2? L’archivio protetto sarà creato se manca. Solo emulatore locale.'
   : 'SCOLLEGARE soltanto Mercoledì, slot 2, della Settimana 2? La scheda personale e l’archivio protetto resteranno intatti. Solo emulatore locale.'
  if(!window.confirm(explanation)){message.value='Nessuna modifica effettuata.';return}
  if(action==='link') {
   await linkPersonalDay(db,confirmedTarget.gymId,confirmedTarget.athleteId,LAB_2F_WEEK_ID,LAB_2F_DAY,2,LAB_2F_SHEET_ID,now.uid,'')
  } else {
   await unlinkPersonalDay(db,confirmedTarget.gymId,confirmedTarget.athleteId,LAB_2F_WEEK_ID,LAB_2F_DAY,2,LAB_2F_SHEET_ID,now.uid)
  }
  const archive=await getDocFromServer(doc(db,...base,'archive_templates',LAB_2F_SHEET_ID))
  if(!archive.exists())throw new Error('Il collegamento è stato aggiornato, ma manca la copia storica: verifica prima di altri test.')
  message.value=action==='link'
   ? 'Collegamento eseguito. Archivio protetto presente. Verifica aggiornamento nella schermata Atleta.'
   : 'Scollegamento eseguito. Scheda personale e archivio protetto conservati.'
 } catch(e) {message.value=`Operazione non completata: ${e instanceof Error?e.message:String(e)}`}
 finally {busy.value=false}
}
</script>

<template>
  <main class="access-wrap"><section class="panel access-card" style="max-width:900px">
    <div class="eyebrow">LION FIT V1 MODERN · FASE 2F · SOLO EMULATORE</div>
    <h1>Prova <span class="green">collega / scollega</span></h1>
    <p class="lead">Esperimento controllato sulla stessa struttura V1, con transazioni Firestore. Solo fixture della palestra A e solo slot di test predefinito.</p>
    <div v-if="session" class="notice"><strong>Coach verificato:</strong> {{ session.label }} · <strong>Palestra:</strong> {{ session.gymId }}</div>
    <div class="notice"><strong>Oggetto fisso:</strong> Settimana 2 · Mercoledì · slot 2 · scheda <code>lab2e_sheet_singola</code>. Nessun elemento può essere scelto manualmente. Non operare su dati di produzione.</div>
    <p role="status" :aria-busy="busy || stage === 'loading'">{{ message }}</p>
    <template v-if="stage==='ready' && result">
      <div class="notice">
        <p><strong>Schede programmate:</strong> {{ result.groups.programmed.length }} · <strong>senza programma:</strong> {{ result.groups.unprogrammed.length }} · <strong>riferimenti orfani:</strong> {{ result.groups.orphanLinks.length }}</p>
        <p><strong>Slot Mercoledì 2:</strong> {{ currentSlot === '' ? 'VUOTO' : currentSlot === LAB_2F_SHEET_ID ? 'SCHEDA DI PROVA COLLEGATA' : 'OCCUPATO DA ALTRA SCHEDA: BLOCCATO' }}</p>
      </div>
      <p v-if="!fixtureReady" role="alert">Fixture di prova non disponibile. Riesegui seed:2e solo se necessario e non forzare operazioni manuali.</p>
      <p v-if="fixtureReady && currentSlot !== '' && currentSlot !== LAB_2F_SHEET_ID" role="alert">Slot occupato da una scheda diversa: nessuna scrittura consentita.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0">
        <button :disabled="!actionAllowed || currentSlot !== ''" @click="changeLink('link')">Collega scheda di prova</button>
        <button class="secondary" :disabled="!actionAllowed || currentSlot !== LAB_2F_SHEET_ID" @click="changeLink('unlink')">Scollega dallo slot di prova</button>
      </div>
    </template>
    <div class="notice">Per provare la sincronizzazione in tempo reale, apri <code>/dev/schede-live</code> come Atleta A in una seconda sessione del browser. Dopo il collegamento, le schede in programma passano da 2 a 3; dopo lo scollegamento tornano a 2. La scheda e l'archivio non vengono cancellati.</div>
    <p><router-link to="/dev/schede-live">Torna alle schede in sola lettura</router-link></p>
    <p><router-link to="/dev/accesso">Torna all'accesso laboratorio</router-link></p>
  </section></main>
</template>
