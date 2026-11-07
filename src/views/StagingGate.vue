<script setup lang="ts">
import {stagingSession} from '../integrations/firebase/stagingSession'
import {RouterLink} from 'vue-router'
</script>
<template><section class="panel stack" style="gap:16px"><h1>Modulo in integrazione</h1>
<p>Hai effettuato l'accesso allo staging come <b>{{stagingSession?.label||'utente'}}</b>. Questa funzione non è stata ancora autorizzata sul database reale: i dati demo non vengono mostrati.</p>
<p class="muted">La grafica e le logiche del laboratorio sono conservate; per abilitare le scritture servono Rules e test di compatibilità ROUNDONE.</p>
<RouterLink v-if="stagingSession?.role==='atleta'" class="primary" to="/home">TORNA ALLA HOME</RouterLink>
<RouterLink v-else class="primary" to="/coach">TORNA ALLA DASHBOARD</RouterLink></section></template>
