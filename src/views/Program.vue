<script setup lang="ts">
/** La pagina Atleta operativa ora riusa la stessa UI validabile con i dati dell'emulatore. */
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import { useLabStore } from '../stores/lab'
import { useRoute } from 'vue-router'
import { computed, defineAsyncComponent } from 'vue'
import AthletePlanContent from '../components/AthletePlanContent.vue'
const lab = useLabStore()
const route=useRoute()
const athleteEmulator=computed(()=>isStagingMode() || (import.meta.env.DEV && route.query.source==='emulator'))
const LiveAthlete=(import.meta.env.DEV||isStagingMode())?defineAsyncComponent(()=>import('./AthleteLiveWorkspace.vue')):null
</script>
<template>
  <component v-if="athleteEmulator && LiveAthlete" :is="LiveAthlete" screen="plan"/>
  <AthletePlanContent v-else
    :athlete-key="lab.athleteId"
    :personal="lab.mySheets"
    :weeks="lab.weeks"
    :groups="lab.grouped"
    :week-id="typeof route.query.week==='string'?route.query.week:(lab.week?.id||'')"
    :initial-day="typeof route.query.day==='string'&&/^[0-6]$/.test(route.query.day)?Number(route.query.day):undefined"
    @update:week-id="id => { lab.weekId = id }"
  />
</template>
