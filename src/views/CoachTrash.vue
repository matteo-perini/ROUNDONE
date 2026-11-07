<script setup lang="ts">
import {ref} from 'vue'
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
import {RouterLink} from 'vue-router'
import LiveCoachTrash from './LiveCoachTrash.vue'
import {useLabStore} from '../stores/lab'
const lab=useLabStore(),notice=ref('')
function restore(kind:'shared'|'personal'|'week',id:string,athleteId:string){try{lab.restoreItem(kind,id,athleteId);notice.value='Ripristinato con lo stesso ID, senza cancellare l’archivio storico.'}catch(e){notice.value=(e as Error).message}}
</script>
<template><LiveCoachTrash v-if="isOperationalMode()"/><div v-else class="stack"><section class="green-hero"><span class="eyebrow">GESTIONE SICURA</span><div class="row between"><h1>Cestino</h1><button class="ghost" @click="notice='Elenco aggiornato dai dati locali.'">↻ Aggiorna elenco</button></div><p>Modelli, schede personali e settimane eliminate: ripristino senza perdere esercizi e attività.</p></section><section v-if="!lab.trashItems.length" class="panel">Il Cestino è vuoto.</section><div class="grid2"><article v-for="item in lab.trashItems" :key="item.kind+'-'+item.athleteId+'-'+item.id" class="panel"><span class="eyebrow">{{item.kind==='shared'?'Scheda archivio Coach':item.kind==='personal'?'Scheda personale':'Settimana'}}</span><h3>{{item.title}}</h3><p class="muted small">{{item.athleteId||'Palestra'}} · {{item.deletedAt}}</p><button class="secondary" @click="restore(item.kind,item.id,item.athleteId)">↩ Ripristina</button></article></div><p v-if="notice" class="notice">{{notice}}</p><p class="notice">Laboratorio locale: il ripristino vero su Firebase richiede autenticazione e Security Rules testate.</p></div></template>
