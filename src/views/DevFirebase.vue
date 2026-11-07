<script setup lang="ts">
import { ref } from 'vue'
import { doc, getDocFromServer } from 'firebase/firestore'
import { deleteUser, inMemoryPersistence, setPersistence, signInAnonymously, signOut } from 'firebase/auth'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
import { AUTH_EMULATOR_PORT, DIAGNOSTIC_COLLECTION_ID, EMULATOR_HOST, EMULATOR_PROJECT_ID, FIRESTORE_EMULATOR_PORT } from '../integrations/firebase/emulatorPolicy'

const checking = ref(false)
const result = ref('Non ancora verificato. Avvia prima Firebase Emulator Suite nel laboratorio 0.29.')
const errorDetails = ref('')
const authChecking = ref(false)
const authResult = ref('Non ancora verificato. Questo controllo usa soltanto l’emulatore Auth locale.')
const authError = ref('')

/**
 * Smoke test isolato. Non usa login reali, non crea profili Firestore, non
 * assegna ruoli e non tocca l'interfaccia Demo. Crea e rimuove un'utenza
 * anonima temporanea SOLO nell'emulatore, poi chiude la sessione.
 */
async function checkAuth(): Promise<void> {
  if (authChecking.value) return
  authChecking.value = true
  authResult.value = 'Verifica Auth locale in corso…'
  authError.value = ''
  let mustSignOut = false
  try {
    const { auth } = getLocalEmulatorClients()
    // Evita che una sessione di laboratorio resti salvata nel browser.
    await setPersistence(auth, inMemoryPersistence)
    const credentials = await signInAnonymously(auth)
    mustSignOut = true
    if (!credentials.user.uid) throw new Error('Auth Emulator non ha restituito un UID.')
    await deleteUser(credentials.user)
    mustSignOut = false
    authResult.value = 'Auth Emulator risponde. Account anonimo TEMPORANEO creato e rimosso correttamente. Nessun ruolo assegnato.'
  } catch (unknownError) {
    const err = unknownError as { code?: string; message?: string }
    authResult.value = 'Autenticazione locale non verificata. Non modificare Firebase online.'
    authError.value = `${err.code ?? 'errore'}: ${err.message ?? 'dettagli non disponibili'}`
  } finally {
    // Se deleteUser non è riuscito, chiudiamo comunque la sessione locale.
    if (mustSignOut) {
      try { await signOut(getLocalEmulatorClients().auth) } catch { /* diagnostic error already shown */ }
    }
    authChecking.value = false
  }
}


async function check(): Promise<void> {
  if (checking.value) return
  checking.value = true
  result.value = 'Verifica in corso…'
  errorDetails.value = ''
  try {
    // Pre-controllo con timeout: senza emulatore avviato, il pulsante non resta in attesa.
    const aborter = new AbortController()
    const deadline = setTimeout(() => aborter.abort(), 5000)
    try {
      await fetch(`http://${EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/`, {
        method: 'GET', mode: 'no-cors', cache: 'no-store', signal: aborter.signal,
      })
    } finally {
      clearTimeout(deadline)
    }
    const { db } = getLocalEmulatorClients()
    // Una GET anonima a un documento fittizio; zero scritture e zero dati reali.
    // Le regole candidate possono negare la lettura (permission-denied): è previsto.
    await getDocFromServer(doc(db, DIAGNOSTIC_COLLECTION_ID, 'read_only_probe'))
    result.value = 'Firestore Emulator risponde. La lettura di prova è stata consentita.'
  } catch (unknownError) {
    const err = unknownError as { code?: string; message?: string }
    if (err.code === 'permission-denied') {
      result.value = 'Firestore Emulator risponde. Lettura anonima NEGATA dalle regole (previsto).'
    } else {
      result.value = 'Connessione non verificata. Controlla che l’emulatore sia avviato.'
      errorDetails.value = `${err.code ?? 'errore'}: ${err.message ?? 'dettagli non disponibili'}`
    }
  } finally {
    checking.value = false
  }
}
</script>
<template>
  <div class="access-wrap">
    <section class="panel access-card">
      <div class="eyebrow">LION FIT MODERN · STRUMENTO SOLO SVILUPPO</div>
      <h1>Diagnostica <span class="green">Firebase Emulator</span></h1>
      <p class="lead">Questa pagina controlla il collegamento al laboratorio locale: la prima prova legge Firestore in modo anonimo; la seconda crea e rimuove un accesso anonimo di test SOLO nell’emulatore. Non salva schede e non legge dati di produzione.</p>
      <p><strong>Progetto fittizio:</strong> <code>{{ EMULATOR_PROJECT_ID }}</code></p>
      <p><strong>Firestore:</strong> <code>{{ EMULATOR_HOST }}:{{ FIRESTORE_EMULATOR_PORT }}</code></p>
      <p><strong>Auth:</strong> <code>{{ EMULATOR_HOST }}:{{ AUTH_EMULATOR_PORT }}</code> (solo emulatore locale)</p>
      <div class="notice"><strong>Attenzione:</strong> le Security Rules del laboratorio sono candidate e includono problemi ancora da risolvere. Un collegamento riuscito non significa che la migrazione sia pronta per la produzione.</div>
      <button class="primary giant" :disabled="checking" @click="check">{{ checking ? 'Controllo in corso…' : 'Verifica connessione Firestore' }}</button>
      <p role="status" aria-live="polite"><strong>Esito:</strong> {{ result }}</p>
      <p v-if="errorDetails" class="small"><code>{{ errorDetails }}</code></p>
      <hr />
      <h2>Verifica Authentication (fase 2A)</h2>
      <p>Questa prova crea un utente <strong>anonimo temporaneo</strong> esclusivamente nell'emulatore Auth e tenta di eliminarlo subito. Non assegna ruoli Coach o Atleta, non modifica Firestore e non usa account reali.</p>
      <button class="primary giant" :disabled="authChecking" @click="checkAuth">{{ authChecking ? 'Controllo Auth in corso…' : 'Verifica autenticazione locale' }}</button>
      <p role="status" aria-live="polite"><strong>Esito Auth:</strong> {{ authResult }}</p>
      <p v-if="authError" class="small"><code>{{ authError }}</code></p>
      <router-link to="/dev/ruoli">Vai alla Fase 2C: test ruoli</router-link>
      <p><router-link to="/accesso">Torna all'accesso demo</router-link></p>
    </section>
  </div>
</template>
