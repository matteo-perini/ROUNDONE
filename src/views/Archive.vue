<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import {computed,ref,defineAsyncComponent} from 'vue'
import {useRoute} from 'vue-router'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {useLabStore} from '../stores/lab'
import SheetDetail from '../components/SheetDetail.vue'
import {activeLinks} from '../features/sheets/domain'
import type {ProtectedCopy} from '../features/sheets/domain'
import {groupSemanticCopies} from '../features/sheets/semanticDedup'
const route=useRoute()
const athleteEmulator=computed(()=>isStagingMode() || (import.meta.env.DEV && route.query.source==='emulator'))
const LiveAthlete=(import.meta.env.DEV||isStagingMode())?defineAsyncComponent(()=>import('./AthleteLiveWorkspace.vue')):null
const lab=useLabStore(),query=ref(''),viewed=ref<ProtectedCopy|null>(null),notice=ref('')
// Parità visiva V1: una sola card per contenuto identico, NON una sola copia nel DB.
const items=computed(()=>groupSemanticCopies(lab.protectedFor(lab.athleteId))
 .filter(group=>group.sheet.title.toLowerCase().includes(query.value.toLowerCase())))
function isUsed(id:string){return activeLinks(lab.data.weeks,lab.athleteId,id).length>0}
function hideGroup(copies:readonly ProtectedCopy[]){
 try{
  // Prima controlla TUTTE le copie: vietato occultare un ID ancora programmato.
  if(copies.some(s=>isUsed(s.id)))throw new Error('Una delle copie è in uso nella programmazione: nessuna copia nascosta.')
  for(const s of copies)lab.hideProtected(lab.athleteId,s.id)
  viewed.value=null
  notice.value='Gruppo nascosto solo da questo archivio. Tutte le copie protette restano conservate.'
 }catch(e){notice.value=(e as Error).message}
}
</script>
<template><component v-if="athleteEmulator && LiveAthlete" :is="LiveAthlete" screen="archive"/><template v-else><div class="stack" style="gap:18px"><section class="panel athlete-archive-hero"><div class="row between"><h2 class="card-heading">{{uiText("ARCHIVIO")}}</h2><button class="ghost" @click="notice='Archivio aggiornato dallo stato locale.'">↻ Aggiorna</button></div><p class="muted" style="margin:20px 0 0">{{uiText("Qui ritrovi tutte le schede di allenamento ricevute dal coach, già assegnate, ritirate, protette o archiviate.")}}</p></section>
 <section class="panel athlete-archive-list"><div class="row between"><h3>{{uiText("Le mie schede di allenamento")}}</h3><span class="muted">{{items.length}} {{uiText("schede")}}</span></div><input v-model="query" placeholder="Cerca nell'Archivio..."/>
 <div v-for="g in items" :key="g.sheet.id" class="line-card athlete-archive-item"><button class="wide athlete-archive-open" @click="viewed=g.sheet"><b>{{g.sheet.title}}</b><p class="athlete-archive-meta">Copia protetta · consultabile</p></button><button class="secondary wide" :disabled="g.copies.some(s=>isUsed(s.id))" style="margin-top:7px" @click="hideGroup(g.copies)">{{g.copies.some(s=>isUsed(s.id))?'Impossibile eliminare':'Nascondi dall’archivio'}}</button><p v-if="g.copies.some(s=>isUsed(s.id))" class="muted small" style="margin:8px 0 0">Impossibile eliminare: scheda attualmente in uso nella programmazione.</p></div><p v-if="notice" class="notice">{{notice}}</p></section></div><SheetDetail v-if="viewed" :sheet="viewed" @close="viewed=null" @finish="viewed=null"/></template>
</template>
