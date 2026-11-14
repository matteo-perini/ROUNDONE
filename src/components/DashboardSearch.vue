<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {RouterLink} from 'vue-router'
import {loadCatalog,rankedExercises,type CatalogExercise} from '../features/exercises/catalog'
import {readLegacyExerciseCatalog} from '../integrations/firestore/legacyExerciseCatalog'
import {searchItems,type SearchItem} from '../features/platform/platformModel'
import LionIcon from './LionIcon.vue'
const p=defineProps<{items:SearchItem[];partial?:boolean;emulator?:boolean}>()
const open=ref(false),term=ref(''),catalog=ref<CatalogExercise[]>([]),state=ref<'idle'|'loading'|'ready'|'error'>('idle')
async function toggle(){open.value=!open.value;if(!open.value||state.value==='ready'||state.value==='loading')return;state.value='loading';try{catalog.value=await loadCatalog(p.emulator?undefined:readLegacyExerciseCatalog);state.value='ready'}catch{state.value='error'}}
const results=computed(()=>{if(term.value.trim().length<2)return [];const exerciseRows:SearchItem[]=rankedExercises(catalog.value,term.value,'',8).map(e=>({id:e.id,kind:'Esercizio',title:e.name_it||e.name,detail:e.name,terms:(e.aliases_it||[]).join(' '),to:'/coach/libreria?exerciseId='+encodeURIComponent(e.id)+(p.emulator?'&source=emulator':'')}));return [...searchItems(p.items,term.value),...exerciseRows]})
</script>
<template><div class="lf14-search"><button class="secondary" type="button" :aria-expanded="open" @click="toggle"><LionIcon name="search" :size="18"/> Cerca</button><div v-if="open" class="panel lf14-search-panel"><label>Cerca in LionFit<input v-model="term" type="search" maxlength="100" placeholder="Atleta, scheda, esercizio, lezione…"/></label><p v-if="term.trim().length<2" class="muted small">Digita almeno due caratteri.</p><template v-else><RouterLink v-for="row in results" :key="row.kind+row.id" :to="row.to" class="lf14-search-row" @click="open=false"><small>{{row.kind}}</small><strong>{{row.title}}</strong><span v-if="row.detail" class="muted small">{{row.detail}}</span></RouterLink><p v-if="!results.length" class="muted">Nessun risultato nei dati disponibili.</p><p v-if="partial||state==='error'||state==='loading'" class="muted small">Alcuni dati non sono ancora disponibili.</p></template><p class="muted small">Cerca negli atleti attivi, archivio schede, schede personali caricate, catalogo esercizi e appuntamenti degli ultimi 30 e prossimi 60 giorni.</p></div></div></template>
