<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LAB_PERSONAS } from '../integrations/firebase/roleLab'
import { enterDevSession } from '../integrations/firebase/devSession'
import { devRouteForRole } from '../integrations/firebase/devRoutePolicy'

const router = useRouter()
const busy = ref(false)
const error = ref('')
async function enter(id: typeof LAB_PERSONAS[number]['id']) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const session = await enterDevSession(id)
    await router.push(devRouteForRole(session.role))
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Accesso di laboratorio non riuscito.'
  } finally { busy.value = false }
}
</script>
<template>
  <div class="access-wrap"><section class="panel access-card">
    <div class="eyebrow">LION FIT MODERN · FASE 2D · SOLO SVILUPPO</div>
    <h1>Sessioni <span class="green">Firebase Emulator</span></h1>
    <p class="lead">Accessi fittizi, separati dalla demo. Il ruolo è verificato sui documenti Firestore dell'emulatore, non scelto dal browser.</p>
    <div class="notice"><strong>Prima:</strong> lascia attivi Firestore 18080 e Auth 9099 ed esegui lo script di preparazione utenti 2C. Nessuna connessione a Firebase reale.</div>
    <div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0">
      <button v-for="person in LAB_PERSONAS" :key="person.id" class="primary" :disabled="busy" @click="enter(person.id)">{{ busy ? 'Verifica in corso…' : `Entra: ${person.label}` }}</button>
    </div>
    <p v-if="error" role="alert"><strong>Accesso negato:</strong> {{ error }}</p>
    <div class="notice">Questa fase mostra un pannello verificato e di sola lettura. Le schermate normali Coach/Atleta continuano a usare dati demo nel browser: non sono ancora sincronizzate con Firebase.</div>
    <router-link to="/dev/ruoli">Test dei permessi Fase 2C</router-link>
  </section></div>
</template>
