<script setup lang="ts">
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
import ProgressWorkspace from '../components/ProgressWorkspace.vue'
</script>
<template><ProgressWorkspace v-if="isOperationalMode()" role="coach"/><section v-else class="panel"><h2>Allenamenti Coach</h2><p>Accedi a LionFit con un account Coach verificato per consultare i Allenamenti degli Atleti.</p></section></template>
