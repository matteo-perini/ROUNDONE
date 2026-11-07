<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { readVerifiedDevSession, leaveDevSession } from '../integrations/firebase/devSession'
import type { VerifiedDevSession } from '../integrations/firebase/devSession'
import { mayOpenDevScreen, type DevScreen } from '../integrations/firebase/devRoutePolicy'
const router = useRouter()
const route = useRoute()
const session = ref<VerifiedDevSession | null>(null)
const error = ref('')
const busy = ref(true)

onMounted(async () => {
  try {
    const verified = await readVerifiedDevSession()
    const screen: DevScreen = route.path.endsWith('/atleta') ? 'atleta' : 'coach'
    if (!mayOpenDevScreen(verified.role, screen)) throw new Error('Questo ruolo non è autorizzato a visualizzare il pannello richiesto.')
    session.value = verified
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Sessione non verificata.'
  } finally { busy.value = false }
})
async function exit() {
  busy.value = true
  try { await leaveDevSession() } finally {
    session.value = null
    await router.replace('/dev/accesso')
    busy.value = false
  }
}
</script>
<template>
  <div class="access-wrap"><section class="panel access-card">
    <div class="eyebrow">LION FIT MODERN · FASE 2D · SOLO EMULATORE</div>
    <h1>Pannello <span class="green">{{ route.path.endsWith('/atleta') ? 'Atleta' : 'Coach / Titolare' }}</span></h1>
    <p v-if="busy" role="status">Verifica del profilo Firebase in corso…</p>
    <p v-else-if="error" role="alert">Accesso non verificato: {{ error }}</p>
    <template v-else-if="session">
      <p class="lead">Accesso verificato direttamente tramite Firebase Auth e Firestore Emulator.</p>
      <div class="notice">
        <p><strong>Profilo:</strong> {{ session.label }}</p>
        <p><strong>Ruolo verificato:</strong> {{ session.role }}</p>
        <p><strong>Palestra:</strong> {{ session.gymId }}</p>
        <p><strong>Email fittizia:</strong> {{ session.email }}</p>
      </div>
      <div class="notice"><strong>Solo lettura:</strong> questa è la prima schermata protetta del laboratorio, NON il pannello produttivo. Il pannello operativo non è collegato; la lettura delle schede fixture della Fase 2E è in una pagina separata.</div>
      <p><router-link to="/dev/schede-live">Apri schede reali di prova (Fase 2E · sola lettura)</router-link></p>
      <p v-if="session.role==='atleta' && session.gymId==='gym_lab2c_a'"><router-link to="/home?source=emulator"><strong>Apri Area Atleta originale con Firebase · Home / Piano / Archivio (Fase 2M/K) →</strong></router-link></p>
      <p v-if="session.role==='atleta' && session.gymId==='gym_lab2c_a'"><router-link to="/prenotazioni?source=emulator"><strong>Apri Prenotazioni Atleta con Firebase · Blocco unico 2M/L →</strong></router-link></p>
      <p v-if="session.gymId === 'gym_lab2c_a' && session.role !== 'atleta'"><router-link to="/dev/schede-scritture">Apri prova collega/scollega (Fase 2F · solo emulatore)</router-link></p>
      <p v-if="session.role !== 'atleta' && session.gymId==='gym_lab2c_a'"><router-link to="/coach/prenotazioni?source=emulator"><strong>Apri Calendario e disponibilità Coach con Firebase · Blocco unico 2M/L →</strong></router-link></p>
      <p v-if="session.role !== 'atleta'"><router-link to="/dev/atleti-live">Apri Gestione Atleti con dati Firebase (Fase 2M/B · sola lettura)</router-link></p>
      <p v-if="session.role !== 'atleta'"><router-link to="/coach/atleti?source=emulator"><strong>Apri schermata Coach originale con Firebase (Fase 2M/C · sola lettura) →</strong></router-link></p>
      <button class="secondary" :disabled="busy" @click="exit">Esci dall'emulatore</button>
    </template>
    <p style="margin-top:1rem"><router-link to="/dev/accesso">Torna all'accesso del laboratorio</router-link></p>
  </section></div>
</template>
