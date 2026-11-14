<script setup lang="ts">
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
import ProgressWorkspace from '../components/ProgressWorkspace.vue'
</script>
<template><ProgressWorkspace v-if="isOperationalMode()" role="athlete"/><section v-else class="panel"><h2>Allenamenti</h2><p>Accedi a LionFit con un account Firebase verificato per consultare i Allenamenti.</p></section></template>
