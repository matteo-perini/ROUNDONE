<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { isStagingMode } from '../integrations/firebase/stagingConfig'
const devMode = import.meta.env.DEV
const FirebaseAccess = defineAsyncComponent(() => import('./StagingAccess.vue'))
</script>
<template>
 <component v-if="isStagingMode()" :is="FirebaseAccess" />
 <div v-else class="access-wrap"><section class="panel access-card">
  <h1>Lion Fit</h1>
  <p v-if="devMode" role="alert">Questa è la modalità DEV di LionFit: gli account Firebase LIVE/STAGING non sono disponibili con npm run dev. Per aprire la schermata di accesso reale utilizza gli script locali AVVIA_LIONFIT_STAGING_5173.cmd oppure AVVIA_LIONFIT_LIVE_SOLO_LETTURA_5173.cmd, dopo aver verificato le rispettive configurazioni .env.</p>
  <p v-else role="alert">Accesso Firebase non configurato per questa build. Non pubblicare questa versione: verifica le impostazioni dell'ambiente.</p>
 </section></div>
</template>
