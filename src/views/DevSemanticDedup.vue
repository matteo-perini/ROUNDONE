<script setup lang="ts">
/** Laboratorio VISIVO SENZA FIREBASE, SOLO DEV. Nessuna modifica ai dati reali/della demo. */
import { DAY_NAMES, groupSheets, linkDay, normalizeDay, type Personal, type ProgramWeek } from '../features/sheets/domain'
import { semanticSheetSignature, uniqueSemanticSheets, visualSheetGroups } from '../features/sheets/semanticDedup'

const athlete = 'atleta_test_dedup'
const first: Personal = {
 id: 'id_originale_A', athleteId: athlete, title: 'Forza e tecnica', category: 'FIGHTER',
 exercises: [{ id: 'riga_1', name: 'Panca piana', sets: 3, reps: '10', load: '60 kg', rest: '90 sec', notes: 'Controllo', supersetWithPrevious: false }],
}
const identical: Personal = {
 ...first, id: 'id_diverso_B', title: '  FORZA  E TECNICA  ',
 exercises: [{ ...first.exercises[0], id: 'riga_975', name: 'panca PIANA' }],
}
const different: Personal = {
 ...first, id: 'id_diverso_C',
 exercises: [{ ...first.exercises[0], id: 'riga_900', reps: '11' }],
}
const all = [first, identical, different]
let week: ProgramWeek = {
 id: 'settimana_fittizia', name: 'Settimana di prova', athleteId: athlete,
 startDate: '2026-11-02',
 days: DAY_NAMES.map(name => normalizeDay({ name })),
}
week = linkDay(week, athlete, 0, 1, first.id, '')
week = linkDay(week, athlete, 2, 2, identical.id, '')
const raw = groupSheets(all, [week], athlete)
const grouped = visualSheetGroups(raw)
const unique = uniqueSemanticSheets(all)
const tests = [
 { title: 'Due schede con contenuto identico e ID diversi', ok: semanticSheetSignature(first) === semanticSheetSignature(identical) },
 { title: 'Una sola ripetizione diversa = scheda differente', ok: semanticSheetSignature(first) !== semanticSheetSignature(different) },
 { title: '3 documenti originali ancora separati', ok: all.length === 3 && new Set(all.map(s => s.id)).size === 3 },
 { title: 'Entrambi i collegamenti mantengono gli ID autentici', ok: grouped.programmed.length === 1 && grouped.programmed[0].links.some(l => l.templateId === first.id) && grouped.programmed[0].links.some(l => l.templateId === identical.id) },
]
</script>
<template>
 <main class="access-wrap">
  <section class="panel access-card" style="max-width:900px">
   <div class="eyebrow">LION FIT V1 MODERN · TEST SEMANTICO · SOLO SVILUPPO</div>
   <h1>Schede <span class="green">identiche</span></h1>
   <p class="lead">Tre documenti fittizi in memoria, nessuna lettura o scrittura Firebase. La vista unisce soltanto le schede tecnicamente identiche.</p>
   <div class="notice"><strong>Documenti distinti:</strong> {{all.length}} · <strong>Schede diverse visibili:</strong> {{unique.length}} · <strong>Collegamenti reali:</strong> {{raw.programmed.reduce((n,g)=>n+g.links.length,0)}}</div>
   <h2>Controlli</h2>
   <p v-for="test in tests" :key="test.title" :style="{color:test.ok?'#90edbb':'#ffb1ab'}"><strong>{{test.ok?'PASS':'ERRORE'}}</strong> · {{test.title}}</p>
   <h2>Schede in programma (card)</h2>
   <article v-for="g in grouped.programmed" :key="g.sheet.id" class="notice">
    <strong>{{g.sheet.title}}</strong><p>{{g.members.length}} documenti identici · {{g.links.length}} collegamenti reali</p>
    <ul><li v-for="l in g.links" :key="`${l.weekId}-${l.day}-${l.slot}`">{{l.dayName}} · slot {{l.slot}} · <code>{{l.templateId}}</code></li></ul>
   </article>
   <h2>Schede senza programma (card)</h2>
   <article v-for="g in grouped.unprogrammed" :key="g.sheet.id" class="notice">
    <strong>{{g.sheet.title}}</strong><p>{{g.sheet.exercises[0]?.reps}} ripetizioni · ID <code>{{g.sheet.id}}</code></p>
   </article>
   <div class="notice">Questa è una dimostrazione locale. L'algoritmo è collegato anche al Piano, alla Home, all'Archivio e alla pagina di lettura schede dell'emulatore, ma queste funzioni vanno ancora collaudate a schermo sul PC.</div>
   <p><router-link to="/accesso">Torna all'app demo</router-link></p>
  </section>
 </main>
</template>
