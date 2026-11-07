<script setup lang="ts">
import { ref } from 'vue'
import { inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDocFromServer } from 'firebase/firestore'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import {
  LAB_GYM_A, LAB_GYM_B, LAB_PERSONAL_ID, LAB_PERSONAS, LAB_TEMPLATE_ID,
  LAB_TEST_PASSWORD, resolveLabRole,
} from '../integrations/firebase/roleLab'

const running = ref(false)
const outcome = ref('Non ancora verificato. Esegui prima 04_PREPARA_UTENTI_TEST_FASE2C.cmd nel laboratorio 0.29.')
const details = ref<string[]>([])
const failures = ref<string[]>([])

/** Solo letture: nessuna scrittura, nessun account demo modificato. */
async function verify(id: typeof LAB_PERSONAS[number]['id']) {
  if (running.value) return
  const selected = LAB_PERSONAS.find(person => person.id === id)
  if (!selected) return
  running.value = true
  details.value = []
  failures.value = []
  outcome.value = `Prove in corso: ${selected.label}…`
  const { db, auth } = getLocalEmulatorClients()
  try {
    await setPersistence(auth, inMemoryPersistence)
    await signOut(auth)
    const login = await signInWithEmailAndPassword(auth, selected.email, LAB_TEST_PASSWORD)
    const uid = login.user.uid
    const ownProfileSnapshot = await getDocFromServer(doc(db, 'users', uid))
    if (!ownProfileSnapshot.exists()) throw new Error('Profilo mancante. Esegui prima lo script di preparazione 2C.')
    const profile = ownProfileSnapshot.data()
    if (profile.gymId !== selected.gymId) throw new Error('Palestra del profilo non corrisponde alla persona di prova.')
    const gymSnapshot = await getDocFromServer(doc(db, 'gyms', selected.gymId))
    if (!gymSnapshot.exists()) throw new Error('Palestra di prova non trovata.')
    const gym = gymSnapshot.data()
    const role = resolveLabRole(uid, login.user.email, profile, gym)
    if (role !== selected.expectedRole) throw new Error('Ruolo rilevato differente dal ruolo previsto.')
    details.value.push(`✓ Login Auth Emulator: ${selected.label}`)
    details.value.push(`✓ Profilo /users/${uid} letto dal server: ${role}`)
    details.value.push(`✓ Palestra associata letta: ${selected.gymId}`)

    // Una palestra esterna deve sempre essere inaccessibile (sia A -> B che B -> A).
    const otherGym = selected.gymId === LAB_GYM_A ? LAB_GYM_B : LAB_GYM_A
    await probe('Palestra esterna bloccata', `gyms/${otherGym}`, false)

    if (selected.gymId === LAB_GYM_A) {
      // Il fixture lega l'UID dell'atleta a gym A (campo solo di laboratorio).
      const athleteUid = gym.labAthleteUid
      if (typeof athleteUid !== 'string' || !athleteUid) throw new Error('ID atleta fixture mancante nella palestra A.')
      await probe('Scheda personale palestra A leggibile', `gyms/${LAB_GYM_A}/athlete_programs/${athleteUid}/personal_templates/${LAB_PERSONAL_ID}`, true)
      await probe('Modello privato del coach', `gyms/${LAB_GYM_A}/templates/${LAB_TEMPLATE_ID}`, role !== 'atleta')
    } else {
      await probe('Modello della palestra A bloccato', `gyms/${LAB_GYM_A}/templates/${LAB_TEMPLATE_ID}`, false)
    }
    outcome.value = 'PASS — identità Auth, ruolo, palestra e permessi Firestore verificati nell’emulatore.'
  } catch (err) {
    const error = err as { code?: string; message?: string }
    failures.value.push(`${error.code ?? 'errore'}: ${error.message ?? 'dettagli non disponibili'}`)
    outcome.value = 'NON SUPERATO — controlla i dettagli qui sotto. Non usare Firebase reale.'
  } finally {
    try { await signOut(auth) } catch { failures.value.push('Non è stato possibile disconnettere la sessione locale.') }
    running.value = false
  }

  async function probe(label: string, path: string, shouldAllow: boolean) {
    try {
      const result = await getDocFromServer(doc(db, path))
      if (!shouldAllow) throw new Error(`${label}: lettura consentita, ma doveva essere NEGATA.`)
      if (!result.exists()) throw new Error(`${label}: documento di test assente.`)
      details.value.push(`✓ ${label}: consentito`)
    } catch (err) {
      const error = err as { code?: string; message?: string }
      if (!shouldAllow && error.code === 'permission-denied') {
        details.value.push(`✓ ${label}: NEGATO dalle regole`)
        return
      }
      throw error
    }
  }
}
</script>

<template>
  <div class="access-wrap">
    <section class="panel access-card">
      <div class="eyebrow">LION FIT MODERN · FASE 2C · SOLO SVILUPPO</div>
      <h1>Verifica <span class="green">ruoli Firebase</span></h1>
      <p class="lead">Utenti fittizi nel progetto <code>demo-lionfit-029</code>: accedi come un ruolo per provare letture consentite e bloccate. Questo strumento non collega ancora il login reale alle schermate Coach/Atleta.</p>
      <div class="notice"><strong>Prima:</strong> lascia attivi gli emulatori Firestore (18080) e Auth (9099), poi esegui <code>04_PREPARA_UTENTI_TEST_FASE2C.cmd</code> nella cartella del laboratorio. Non usare credenziali personali.</div>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0">
        <button v-for="person in LAB_PERSONAS" :key="person.id" class="primary" :disabled="running" @click="verify(person.id)">
          {{ running ? 'Verifica in corso…' : `Prova ${person.label}` }}
        </button>
      </div>
      <p role="status" aria-live="polite"><strong>Risultato:</strong> {{ outcome }}</p>
      <ul v-if="details.length" style="padding-left:1.4rem">
        <li v-for="line in details" :key="line">{{ line }}</li>
      </ul>
      <p v-for="failure in failures" :key="failure"><strong>Errore:</strong> <code>{{ failure }}</code></p>
      <div class="notice">La verifica riguarda esclusivamente i fixture e le regole candidate del laboratorio. Nessuna modifica alle schede reali e nessuna pubblicazione.</div>
      <router-link to="/dev/accesso">Apri i pannelli protetti Fase 2D</router-link><p><router-link to="/dev/emulatore">Torna alla diagnostica Firebase</router-link></p>
    </section>
  </div>
</template>
