<script setup lang="ts">
/** 2M/G: archivio immutabile, filtri SOLO VISIVI, nessuna scrittura Firebase/localStorage.
 * 'Solo attive' nasconde dal riepilogo le copie cestinate, non le elimina.
 */
import { computed, ref, watch } from 'vue'
import type { Personal } from '../features/sheets/domain'
import type { HistoricalArchive } from '../features/athletes/labArchive'
import { archiveState, archiveCounts, visibleArchives, type ArchiveView } from '../features/athletes/archiveVisibility'
const props = withDefaults(defineProps<{
  items: readonly HistoricalArchive[]
  personal?: readonly Pick<Personal,'id' | 'deletedAt'>[]
  athleteKey?: string
  heading?: string
}>(), {heading:'ARCHIVIO STORICO PROTETTO',personal:()=>[],athleteKey:''})
const view=ref<ArchiveView>('active')
const search=ref('')
const counts=computed(()=>archiveCounts(props.items,props.personal))
const visible=computed(()=>visibleArchives(props.items,props.personal,view.value,search.value))
const labels: Record<Exclude<ArchiveView,'all'>,string>={active:'Attiva',trashed:'Nel cestino',historical:'Solo storico'}
watch(()=>props.athleteKey,()=>{view.value='active';search.value=''})
</script>
<template>
  <section class="panel" aria-label="Archivio storico protetto">
    <h3>{{heading}} · {{counts.all}} copie</h3>
    <p class="muted small">Copie storiche originali, indipendenti dalle schede attive e dal cestino. Visualizzazione soltanto: qui non si cancellano e non si modificano i documenti.</p>
    <label class="muted small" for="lab-archive-filter">Visualizza archivio</label>
    <select id="lab-archive-filter" v-model="view" aria-label="Filtra archivio storico">
      <option value="active">Schede attive ({{counts.active}})</option>
      <option value="trashed">Schede cestinate ({{counts.trashed}})</option>
      <option value="historical">Solo storico ({{counts.historical}})</option>
      <option value="all">Tutte le copie ({{counts.all}})</option>
    </select>
    <input v-model="search" type="search" aria-label="Cerca nell'archivio storico" placeholder="Cerca per titolo, ID o esercizio..." />
    <p class="muted small" role="status">{{visible.length}} copie visualizzate su {{counts.all}}. I filtri non modificano i dati Firebase.</p>
    <p v-if="!counts.all" class="notice">Nessuna copia storica disponibile per questo atleta.</p>
    <p v-else-if="!visible.length" class="notice">Nessuna copia corrisponde a questa vista. Premi «Tutte» per consultare l’intero archivio immutabile.</p>
    <div v-else class="grid2">
      <details v-for="archive in visible" :key="archive.id" class="line-card">
        <summary><strong>{{archive.title}}</strong> <span class="muted small">· {{archive.exercises.length}} esercizi · {{labels[archiveState(archive,personal)]}}</span></summary>
        <p class="muted small">ID conservato: <code>{{archive.id}}</code></p>
        <p class="muted small">Modello origine: <code>{{archive.sourceTemplateId || 'non specificato'}}</code></p>
        <p v-if="archive.archivedAt" class="muted small">Archiviata: {{archive.archivedAt}}</p>
        <ol>
          <li v-for="(exercise,i) in archive.exercises" :key="i">
            {{exercise.name}} · {{exercise.sets}} serie × {{exercise.reps}} ripetizioni
          </li>
        </ol>
      </details>
    </div>
  </section>
</template>
