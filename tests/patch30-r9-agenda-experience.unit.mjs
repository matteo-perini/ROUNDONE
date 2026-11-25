import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const booking=read('src/views/LiveBookingWorkspace.vue')
const competition=read('src/components/AgendaCompetitions.vue')

test('R9 home provides three clear actions but preserves accessible booking list',()=>{
 const start=booking.indexOf('<div v-if="athleteTab===\'agenda\'"')
 const end=booking.indexOf('<AgendaCompetitions v-else-if=',start)
 assert.ok(start>0&&end>start)
 const home=booking.slice(start,end)
 assert.match(home,/Prenota lezione/)
 assert.match(home,/Calendario/)
 assert.match(home,/Gare e risultati/)
 assert.match(home,/Le mie prossime lezioni/)
 assert.match(home,/Vedi tutte/)
 assert.doesNotMatch(home,/<strong>Le mie prenotazioni<\/strong>/)
 assert.doesNotMatch(home,/<strong>I miei risultati<\/strong>/)
 assert.match(home,/athleteTab='mie';myHistory='next'/)
 assert.match(home,/v-if="competitionEnabled"/)
 assert.match(home,/v-if="heroEvent"/)
 assert.match(home,/v-else>Lezioni, appuntamenti e gare/)
 assert.match(home,/CompetitionCover/)
})

test('booking, groups, moves and transactions remain in their original paths',()=>{
 for(const marker of ['async function beginMove','async function makeBooking','async function cancelBookingRow','@click="makeBooking"','MAX_PRIVATE_PARTICIPANTS','groupBookingEnabled()','myHistory','canMove(b)','canRemove(b)','cancelBookingRow(b)','await nextTick()'])
  assert.ok(booking.includes(marker),`missing booking feature: ${marker}`)
 assert.match(booking,/class="lf-booking-v4-flow"/)
 assert.match(booking,/src="\/lionfit-redesign\/agenda-fighter.webp"/)
 assert.match(booking,/src="\/lionfit-redesign\/agenda-pesi.webp"/)
 assert.match(booking,/>Le mie prenotazioni<\/button>/)
})

test('athlete calendar keeps real data sources and shows useful empty state',()=>{
 assert.match(booking,/const myCalendarRows=computed\(/)
 assert.match(booking,/confirmedCompetitions\(/)
 assert.match(booking,/upcomingRows\(myRows\.value/)
 assert.match(booking,/r\.kind==='booking'/)
 assert.match(booking,/openCompetition\(r\.id\.slice\(2\)\)/)
 assert.match(booking,/Nessun impegno in questo periodo/)
 assert.match(booking,/calendarPersonalPeriod/)
})

test('competition and results are grouped without removing athlete permissions or coach tools',()=>{
 assert.match(booking,/@mode-change="showAthleteCompetitionMode"/)
 assert.match(booking,/mode==='results'\?'risultati':'competizioni'/)
 assert.match(competition,/mode-change/)
 assert.match(competition,/switchCompetitionMode\('events'\)/)
 assert.match(competition,/switchCompetitionMode\('results'\)/)
 assert.match(competition,/mode==='results'/)
 assert.match(competition,/const results=computed\(/)
 assert.match(competition,/requestCompetition\(/)
 assert.match(competition,/respondToCompetitionInvite/)
 assert.match(competition,/Invita atleti/)
 assert.match(competition,/Salva evento/)
 assert.match(competition,/Ritira partecipazione/)
 assert.match(competition,/v-if="!expanded"/)
})

test('R9 style only affects athlete agenda, preserves global light theme and reduced motion',()=>{
 assert.match(booking,/:data-r9-athlete="!isCoach"/)
 assert.match(booking,/\.lf-agenda13\[data-r9-athlete="true"\] \.booking-intro/)
 assert.match(booking,/min-height:0!important/)
 assert.match(booking,/prefers-reduced-motion:reduce/)
 assert.match(booking,/color:var\(--text\)/)
 assert.match(booking,/background:var\(--card\)/)
 assert.match(booking,/lf-r9-hero/)
 assert.match(booking,/lf-r9-agenda-tiles/)
})

test('changed Vue scripts transpile and every CSS block parses',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const file of ['src/views/LiveBookingWorkspace.vue','src/components/AgendaCompetitions.vue']){
  const s=read(file),script=s.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script,`missing TS script for ${file}`)
  const result=ts.transpileModule(script,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(result.diagnostics||[],[],`invalid TS syntax: ${file}`)
  const styles=[...s.matchAll(/<style(?:\s+scoped)?>([\s\S]*?)<\/style>/g)]
  assert.ok(styles.length>0)
  for(const style of styles)postcss.parse(style[1],{from:file})
 }
})
