import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'

const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app = read('src/App.vue')
const agenda = read('src/views/LiveBookingWorkspace.vue')

test('Desktop Coach hides redundant back while keeping mobile and athlete back',()=>{
 assert.match(app,/shownRole!==\x27coach\x27 \|\| coachHeaderVisible/)
 assert.match(app,/class="lf-route-back"/)
 assert.match(app,/const coachHeaderMedia=window.matchMedia\('\(max-width: 900px\)'\)/)
})
// R2.3 refines the scope: notifications are opened from the Coach dashboard,
// while the Athlete bell and all PushWelcome listeners remain available.
test('The original InboxBell remains unique, visible in Coach dashboard and never in other Coach screens',()=>{
 assert.match(app,/<InboxBell v-if="!inboxInHeader&&inboxVisibleOnRoute"/)
 assert.match(app,/const inboxVisibleOnRoute=computed\(\(\)=>shownRole\.value!=='coach'\|\|route\.path==='\/coach'\)/)
 assert.match(app,/\.app\.as-coach \.main-layout\.coach-container > \.lf17-bell-wrap/)
 assert.match(app,/position:absolute;top:15px/)
 assert.equal((app.match(/<InboxBell /g)||[]).length,2) // mutually exclusive responsive placements
 assert.doesNotMatch(app,/display:none[^\n]*\.lf17-bell/)
})
test('Desktop agenda header contains explanatory subtitle without removing page heading',()=>{
 assert.match(agenda,/<h1 style="margin:4px 0">\{\{uiText\("Agenda"\)\}\}<\/h1>/)
 assert.match(agenda,/v-if="isCoach" class="lf-agenda-subtitle"/)
 assert.match(agenda,/@media \(max-width:900px\)\{\.lf-agenda-subtitle\{display:none\}\}/)
})
test('Agenda actions grouped in command bar; existing booking, tabs and filters intact',()=>{
 for(const needle of ['class="lf-agenda-coach-commandbar"','v-lf-motion-tabs','@click="coachAppointmentOpen=true"','@created="coachAppointmentCreated"','@click="filtersOpen=!filtersOpen"','v-model="coachFilter"','v-model="serviceFilter"','@click="coachTab=\x27disponibilita\x27"']) assert.ok(agenda.includes(needle),needle)
 assert.match(agenda,/\.lf-agenda13\.lf-agenda-coach \.lf-agenda-coach-commandbar\{display:flex;flex-direction:row/)
})
test('Empty state now shows useful message and preserves list contents',()=>{
 assert.match(agenda,/class="panel muted lf-agenda-empty" role="status"/)
 assert.match(agenda,/Prova a modificare i filtri oppure crea una nuova prenotazione/)
 assert.match(agenda,/v-for="group in agendaGroups"/)
 assert.match(agenda,/v-for="b in group.bookings"/)
})
test('No access, Firestore rules or unrelated screens changed by this patch',()=>{
 assert.match(agenda,/<template v-if="!isCoach">/)
 assert.match(agenda,/\.lf-agenda13\.lf-agenda-coach/)
 assert.match(app,/booking-in-shell':isBooking/)
})
const require=createRequire(import.meta.url)
let compiler
try{compiler=require('@vue/compiler-sfc')}catch{}
test('Vue compiler parses and compiles changed components (if dependencies installed)',{skip:!compiler},()=>{
 for(const [filename,source] of [['src/App.vue',app],['src/views/LiveBookingWorkspace.vue',agenda]]){
  const {descriptor,errors}=compiler.parse(source,{filename})
  assert.deepEqual(errors,[])
  const script=compiler.compileScript(descriptor,{id:filename})
  assert.deepEqual(compiler.compileTemplate({source:descriptor.template.content,filename,id:filename,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
  descriptor.styles.forEach(style=>assert.deepEqual(compiler.compileStyle({source:style.content,filename,id:filename,scoped:style.scoped}).errors,[]))
 }
})
