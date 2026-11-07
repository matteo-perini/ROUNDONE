<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { isStagingMode } from '../integrations/firebase/stagingConfig'
const FirebaseAccess = defineAsyncComponent(() => import('./StagingAccess.vue'))
</script>
<template>
 <component v-if="isStagingMode()" :is="FirebaseAccess" />
 <div v-else class="access-wrap"><section class="panel access-card">
  <h1>Lion Fit</h1>
  <p role="alert">Accesso Firebase non configurato per questa build. Non pubblicare questa versione: verifica le impostazioni dell'ambiente.</p>
 </section></div>
</template>
