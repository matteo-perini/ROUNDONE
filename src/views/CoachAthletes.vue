<script setup lang="ts">
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
const LiveCoachRoster=isOperationalMode()?defineAsyncComponent(()=>import('./LiveCoachAthletes.vue')):null
import { ref, computed, nextTick, defineAsyncComponent } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLabStore } from '../stores/lab'
import LionIcon from '../components/LionIcon.vue'
import SheetDetail from '../components/SheetDetail.vue'
import CoachProgram from './CoachProgram.vue'
import type { Link, Personal } from '../features/sheets/domain'

// Il componente produttivo/demo continua a funzionare senza alcun cambiamento.
// La sorgente Firebase è montata SOLO in DEV, dietro verifica della sessione Auth + Rules.
const route = useRoute()
const firebasePreview = computed(() => import.meta.env.DEV && route.query.source === 'emulator')
const DevCoachLive = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./DevCoachAthletes.vue'))
  : null
const lab = useLabStore()
const q = ref('')
const active = ref('')
const message = ref('')
const createOpen = ref(false)
const showProgram = ref(true)
const programTitle = ref('Preparazione Match')
const programDate = ref('')
const programCount = ref(4)
const preview = ref<Personal | null>(null)
const deleting = ref<{ id: string; title: string; links: Link[] } | null>(null)
const athletes = computed(() => lab.data.athletes.filter(a => (a.name + ' ' + a.email).toLowerCase().includes(q.value.toLowerCase())))
const selected = computed(() => lab.data.athletes.find(a => a.id === active.value))
const groups = computed(() => lab.groupsFor(active.value))

function select(id: string) {
  active.value = id
  lab.athleteId = id
  message.value = ''
  showProgram.value = true
}
function closeAthlete() { active.value = ''; preview.value = null; deleting.value = null; message.value = '' }
function newProgram() {
  if (!active.value) return
  try {
    lab.createProgram(active.value, programTitle.value, programDate.value, programCount.value)
    createOpen.value = false
    showProgram.value = true
    message.value = 'Programma creato per ' + selected.value?.name + ' nel laboratorio locale.'
  } catch (e) { message.value = (e as Error).message }
}
function weekLinks(links: Link[]) {
  const byWeek = new Map<string, string[]>()
  for (const link of links) byWeek.set(link.weekName, [...(byWeek.get(link.weekName) || []), link.dayName])
  return [...byWeek].map(([week, days]) => `${week} · ${[...new Set(days)].join(' e ')}`).join(' · ')
}
function removeLink(link: Link) {
  try {
    lab.unlinkPersonal(link.weekId, link.dayIndex, link.slot, link.templateId)
    message.value = 'Collegamento rimosso anche dalla settimana. La scheda personale e lo storico restano conservati.'
    const current = deleting.value
    if (current) {
      const updated = lab.groupsFor(active.value).programmed.find(g => g.sheet.id === current.id)
      deleting.value = updated ? { id: updated.sheet.id, title: updated.sheet.title, links: updated.links } : null
    }
  } catch (e) { message.value = (e as Error).message }
}
function removeAssignment(id: string) {
  if (!active.value || !confirm('Spostare l’assegnazione nel Cestino? La copia storica rimane protetta.')) return
  try { lab.removePersonal(active.value, id); message.value = 'Assegnazione spostata nel Cestino; archivio storico protetto.' }
  catch (e) { message.value = (e as Error).message }
}
function copyArchive(id: string) {
  try { lab.copyPersonalToShared(active.value, id); message.value = 'Copia indipendente creata nell’Archivio Coach.' }
  catch (e) { message.value = (e as Error).message }
}
async function manageDays(links: Link[]) {
  const first = links[0]
  if (!first) return
  lab.weekId = first.weekId
  showProgram.value = true
  await nextTick()
  document.getElementById('coach-athlete-program')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function openProgramDatePicker(e:MouseEvent){const input=e.currentTarget as HTMLInputElement;try{input.showPicker?.()}catch{/* date picker nativo gestito dal browser */}}
</script>

<template>
<component v-if="LiveCoachRoster" :is="LiveCoachRoster"/>
<template v-else><component v-if="firebasePreview && DevCoachLive" :is="DevCoachLive" :embedded="true" />
<div v-else class="stack coach-athletes-screen">
  <section class="panel coach-team-toolbar" v-if="!selected">
    <div class="coach-team-title"><h2 class="card-heading">TEAM &amp; ATLETI</h2><span class="muted">SELEZIONA UN ATLETA PER ACCEDERE</span></div>
    <div class="coach-team-tools">
      <button class="secondary" @click="message='Elenco aggiornato dai dati locali.'">↻ Aggiorna elenco Team</button>
      <RouterLink to="/coach/staff" class="primary">+ Invita atleta</RouterLink>
      <input v-model="q" type="search" placeholder="Cerca atleta per nome..." aria-label="Cerca atleta per nome" />
    </div>
  </section>
  <div v-if="!selected" class="coach-athlete-count row between">
    <span class="muted">{{athletes.length}} atleti disponibili</span>
    <button class="secondary" @click="q=''">Mostra tutti ({{lab.data.athletes.length}})</button>
  </div>
  <div v-if="!selected" class="grid2 coach-athlete-list">
    <button v-for="a in athletes" :key="a.id" class="action-card" @click="select(a.id)">
      <span class="action-icon">🦁</span><div><strong>{{a.name.toUpperCase()}}</strong><small>{{a.email.toUpperCase()}}</small></div>
      <b class="green" style="margin-left:auto">GESTISCI →</b>
    </button>
  </div>

  <section v-if="selected" class="panel coach-selected-athlete">
    <div class="row between coach-selected-head">
      <div><span class="eyebrow">GESTIONE ATLETA</span><h2>{{selected.name.toUpperCase()}}</h2></div>
      <button class="secondary" @click="closeAthlete">CHIUDI ✕</button>
    </div>
    <div class="divider"/>
    <div class="grid2 coach-athlete-quick-actions">
      <button class="action-card" @click="createOpen=true"><LionIcon name="calendar"/><div><strong>Nuovo programma</strong><small>Giorni e settimane</small></div></button>
      <RouterLink to="/coach/archivio?mode=personal" class="action-card"><LionIcon name="plus"/><div><strong>Crea scheda personale</strong><small>Parti da zero</small></div></RouterLink>
      <RouterLink to="/coach/archivio" class="action-card"><LionIcon name="book"/><div><strong>Assegna scheda dell'archivio</strong><small>Scegli dall'archivio</small></div></RouterLink>
      <button class="action-card" @click="message='Importazione tabella ancora da migrare dalla V1 originale.'"><LionIcon name="clipboard"/><div><strong>Importa tabella</strong><small>Incolla o collega dati</small></div></button>
    </div>
    <p v-if="message" class="notice coach-athlete-message">{{message}}</p>

    <div class="grid2 assignment-columns">
      <div class="panel assignment-panel">
        <h3>📄 SCHEDE SINGOLE SENZA PROGRAMMA</h3>
        <p class="muted">Assegnate all'atleta ma non collegate a giorni attivi.</p>
        <div v-if="!groups.unprogrammed.length" class="line-card">Nessuna scheda singola senza programma.</div>
        <div v-for="g in groups.unprogrammed" :key="g.sheet.id" class="line-card assignment-item">
          <b>🏋️ {{g.sheet.title}}</b><p class="small muted">Senza programmazione</p>
          <div class="assignment-actions"><button class="secondary" @click="preview=g.sheet">Visualizza</button><button class="secondary" @click="copyArchive(g.sheet.id)">Copia nell'Archivio schede</button><button class="danger" @click="removeAssignment(g.sheet.id)">Rimuovi assegnazione</button></div>
        </div>
      </div>
      <div class="panel assignment-panel assignment-scroll">
        <h3>🗓️ SCHEDE IN PROGRAMMA</h3>
        <p class="muted">Visualizza le assegnazioni e cancellale da qui oppure dai giorni della settimana.</p>
        <div v-if="!groups.programmed.length" class="line-card">Nessuna scheda attualmente collegata.</div>
        <div v-for="g in groups.programmed" :key="g.sheet.id" class="line-card assignment-item">
          <b>🏋️ {{g.sheet.title}}</b>
          <p class="small green assignment-week-label">{{weekLinks(g.links)}}</p>
          <div class="assignment-actions">
            <button class="secondary" @click="preview=g.sheet">Visualizza</button>
            <button class="secondary" @click="copyArchive(g.sheet.id)">Copia nell'Archivio schede</button>
            <button class="secondary" @click="manageDays(g.links)">Gestisci giorni</button>
            <button class="danger" @click="deleting={id:g.sheet.id,title:g.sheet.title,links:g.links}">Cancella</button>
          </div>
        </div>
      </div>
    </div>
    <p v-if="groups.orphanLinks.length" class="notice coach-athlete-message">Attenzione: {{groups.orphanLinks.length}} collegamenti fanno riferimento a schede non attive. Non sono stati rimossi automaticamente.</p>
    <p class="muted small coach-group-totals">{{groups.unprogrammed.length}} schede senza programma · {{groups.programmed.length}} schede in programma · aggiornamento in tempo reale</p>
    <button class="secondary coach-program-toggle" @click="showProgram=!showProgram">▸ ⚙ Manutenzione delle schede esistenti · {{showProgram?'Chiudi programma':'Apri programma'}} {{showProgram?'↑':'↓'}}</button>
    <div v-if="showProgram" id="coach-athlete-program"><CoachProgram embedded /></div>
  </section>

  <div v-if="deleting" class="modal-overlay" @click.self="deleting=null"><div class="dialog coach-delete-dialog">
    <div class="row between"><h2>Cancella collegamenti · {{deleting.title}}</h2><button class="secondary" @click="deleting=null">CHIUDI ✕</button></div>
    <p class="muted small">Scegli il giorno da scollegare. Se rimuovi l'ultimo collegamento, la scheda sparisce dal Piano dell'Atleta ma rimane nel suo Archivio storico.</p>
    <div v-for="link in deleting.links" :key="link.weekId+'-'+link.dayIndex+'-'+link.slot" class="line-card row between coach-delete-row"><span>{{link.weekName}} · <strong>{{link.dayName}}</strong> · Scheda {{link.slot}}</span><button class="danger" @click="removeLink(link)">Scollega</button></div>
  </div></div>
  <div v-if="createOpen" class="modal-overlay" @click.self="createOpen=false"><div class="dialog program-create-dialog">
    <div class="row between"><h2>♧ CREA PROG. FIGHTER</h2><button class="bare" @click="createOpen=false">✕</button></div>
    <label>NOME PROGRAMMA</label><input v-model="programTitle" placeholder="Es. Preparazione Match"/>
    <label>DATA INIZIO (LUNEDÌ)</label><input v-model="programDate" type="date" title="Tocca il campo per aprire il calendario" @click="openProgramDatePicker"/>
    <label>DURATA (SETTIMANE INTERE)</label><input v-model.number="programCount" type="number" min="1" max="52"/>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="secondary" @click="createOpen=false">ANNULLA</button><button class="primary" @click="newProgram">CREA PROGRAMMA</button></div>
  </div></div>
  <SheetDetail v-if="preview" :sheet="preview" @close="preview=null" />
</div>
</template>
</template>
