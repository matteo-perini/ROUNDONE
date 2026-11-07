<script setup lang="ts">
import {RouterLink,useRoute} from 'vue-router'
import { computed,defineAsyncComponent } from 'vue'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {useLabStore} from '../stores/lab'
import LionIcon from '../components/LionIcon.vue'
import CoachDashboardRedesign from '../components/CoachDashboardRedesign.vue'
const lab=useLabStore(),route=useRoute()
const demoAllowed=import.meta.env.DEV
const emulator=computed(()=>isStagingMode()||(import.meta.env.DEV&&route.query.source==='emulator'))
const LiveCoachDashboard=(import.meta.env.DEV||isStagingMode())?defineAsyncComponent(()=>import('./DevCoachDashboard.vue')):null
const links=[{label:'Gestione atleti',sub:'Programmi e assegnazioni',to:'/coach/atleti',icon:'users'}, {label:'Invita atleta',sub:'Invia email o copia link',to:'/coach/staff',icon:'mail'}, {label:'Libreria esercizi',sub:'Ricerca italiano e inglese',to:'/coach/libreria',icon:'book'}, {label:'Palestra e profilo',sub:'Impostazioni e inviti',to:'/coach/profilo',icon:'settings'}]
</script>
<template><component v-if="emulator && LiveCoachDashboard" :is="LiveCoachDashboard"/><CoachDashboardRedesign v-else-if="demoAllowed" name="Coach" :athletes="lab.data.athletes.length" :templates="lab.data.templates.filter(t=>!t.deletedAt).length" :bookings="null" :programs="lab.data.weeks.filter(w=>!w.deletedAt).length" source="Ambiente dimostrativo" athletes-url="/coach/atleti" create-url="/coach/archivio" calendar-url="/coach/prenotazioni" invite-url="/coach/staff" library-url="/coach/libreria" profile-url="/coach/profilo"/><section v-else class="panel" role="alert">Accesso Firebase non configurato per questa versione. Verifica la configurazione LIVE prima di pubblicare.</section></template>
