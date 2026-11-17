import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const read = file => readFileSync(new URL('../'+file,import.meta.url), 'utf8')
const hub = read('src/components/InviteTeamHub.vue')
const agenda = read('src/views/LiveBookingWorkspace.vue')
const app = read('src/App.vue')

test('desktop invitation grid has a bounded two-column layout only above 1240px',()=>{
 assert.match(hub, /@media \(min-width: 1240px\)\s*\{/)
 assert.match(hub, /max-width:1120px/)
 assert.match(hub, /grid-template-columns:minmax\(0,1\.55fr\) minmax\(310px,1fr\)/)
 assert.match(hub, /grid-template-areas:[\s\S]*?"heading heading"[\s\S]*?"choices sections"[\s\S]*?"form sections"/)
})
test('invitation form and all existing slot actions are unchanged',()=>{
 for(const slot of ['athlete','coach','status','pending','team','settings']) assert.match(hub,new RegExp(`<slot name="${slot}"`))
 assert.match(hub,/role="group"/)
 assert.match(hub,/:aria-pressed="selected==='atleta'"/)
 assert.match(hub, /<details class="staff-details lf-invite-detail">/)
 assert.match(hub, /@media\(max-width:340px\)/)
})
test('agenda styling applies only to coach role and to desktop width',()=>{
 assert.match(agenda, /:class="\{'lf-agenda-coach':isCoach\}"/)
 assert.match(agenda, /@media \(min-width: 1120px\)/)
 assert.match(agenda, /\.lf-agenda13\.lf-agenda-coach \.lf-agenda-main button/)
 assert.match(agenda, /\.lf-agenda13\.lf-agenda-coach > \.primary\.wide/)
 assert.match(agenda, /\.lf-agenda13\.lf-agenda-coach \.lf-agenda-toolbar/)
 assert.match(agenda, /\.lf-agenda13\.lf-agenda-coach \.lf-agenda-extra/)
})
test('all Agenda booking flows and filters preserve their bindings and events',()=>{
 for(const name of ['coachFilter','filtersOpen','upcomingMode','view','serviceFilter','history','coachAppointmentOpen','calendarView','moveDate','chooseDate']){
  assert.ok(agenda.includes(name),`existing behavior ${name} must remain`)
 }
 assert.match(agenda, /@click="coachAppointmentOpen=true"/)
 assert.match(agenda, /@click="filtersOpen=!filtersOpen"/)
 assert.match(agenda, /@created="coachAppointmentCreated"/)
 assert.match(agenda, /v-lf-motion-tabs/)
 assert.match(agenda, /v-lf-entrance=/)
 assert.match(agenda, /<template v-if="!isCoach">/)
})
test('app navigation and booking route remain unchanged',()=>{
 assert.match(app, /booking-in-shell':isBooking/)
 assert.match(app, /<RouterView\/>/)
 assert.match(app, /const coachNav=/)
})
const require=createRequire(import.meta.url)
let compiler
try{compiler=require('@vue/compiler-sfc')}catch{}
test('changed Vue components compile with real compiler when installed',{skip:!compiler},()=>{
 for(const [filename,source] of [['src/components/InviteTeamHub.vue',hub],['src/views/LiveBookingWorkspace.vue',agenda]]){
  const {descriptor,errors}=compiler.parse(source,{filename})
  assert.deepEqual(errors,[])
  const script=compiler.compileScript(descriptor,{id:filename})
  assert.deepEqual(compiler.compileTemplate({source:descriptor.template.content,filename,id:filename,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
  descriptor.styles.forEach(style=>assert.deepEqual(compiler.compileStyle({source:style.content,filename,id:filename,scoped:style.scoped}).errors,[]))
 }
})
