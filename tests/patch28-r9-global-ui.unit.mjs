import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {parse,compileScript,compileTemplate,compileStyle} from '@vue/compiler-sfc'
const root=new URL('../src/',import.meta.url)
const read=p=>readFileSync(new URL(p,root),'utf8')
function files(dir=''){return readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+e.name+'/'):e.name.endsWith('.vue')?[dir+e.name]:[])}
const template=p=>parse(read(p)).descriptor.template.content
test('all current Vue SFCs parse, compile templates, and compile scoped styles',()=>{
 for(const p of files()){
  const {descriptor,errors}=parse(read(p),{filename:p});assert.deepEqual(errors,[],p)
  const script=descriptor.script||descriptor.scriptSetup?compileScript(descriptor,{id:'r9'}):null
  if(descriptor.template)assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:p,id:'r9',compilerOptions:{bindingMetadata:script?.bindings}}).errors,[],p)
  for(const style of descriptor.styles)assert.deepEqual(compileStyle({source:style.content,filename:p,id:'data-v-r9',scoped:style.scoped}).errors,[],p)
 }
})
test('shell no longer repeats version, but retains both role navigation and accessible back',()=>{
 const a=template('App.vue');assert.doesNotMatch(a,/webVersionLabel|class="version"/);assert.match(a,/@click="requestBackFromUi"/);assert.match(a,/:aria-label="uiText\('Torna indietro'\)"/);assert.match(a,/AthleteBottomNavigation/);assert.match(a,/QuickProfileSwitch/);assert.match(a,/InboxBell/);assert.match(a,/navigationFailure/);assert.match(a,/isLocalProdDev\(\)/)
 assert.doesNotMatch(template('components/AthleteDesktopSidebar.vue'),/appMeta.version/);assert.match(template('views/Settings.vue'),/appVersion/)
})
test('agenda no longer has routine online/return badges; local back and errors are intact',()=>{
 for(const p of ['views/Bookings.vue','views/LiveBookingWorkspace.vue'])assert.doesNotMatch(template(p),/● Online|class="ghost booking-return booking-control"/)
 const l=read('views/LiveBookingWorkspace.vue');assert.match(l,/lionfit:local-back/);assert.match(l,/if\(busy.value\)return true/);assert.match(l,/calendarWarning/);assert.match(l,/availabilityWarning/);assert.match(l,/Conferma prenotazione/)
})
test('profile has one settings shortcut and one save action inside the live editor',()=>{
 assert.equal((template('components/ProfileOverview.vue').match(/:to="settingsTo"/g)||[]).length,1)
 assert.equal((template('views/DevProfileWorkspace.vue').match(/@click="save"/g)||[]).length,1)
 assert.match(read('views/DevProfileWorkspace.vue'),/window.confirm/)
})
test('offline only communicates missing cached data or pending sync, never changes identity or queue logic',()=>{
 const p=template('components/ProgressWorkspace.vue');assert.match(p,/!online&&\(!offlineState\|\|offlineState.queue.length\)/);assert.match(p,/Allenamenti in attesa di sincronizzazione/);assert.match(p,/offlineError/);assert.match(p,/Elimina definitivamente/);assert.match(p,/correctionError/)
})
test('privacy, irreversible GPS setup, licenses, and sandbox boundaries remain explicit',()=>{
 assert.match(template('components/CheckGallery.vue'),/Condividere le foto di questo check/);assert.match(template('components/WorkConfigSettings.vue'),/Confermo e blocco le sedi/);assert.match(template('views/Library.vue'),/Licenza dati:/);assert.match(template('components/SupportTickets.vue'),/email automatiche non sono ancora attive/);assert.match(template('components/BillingSandbox.vue'),/Solo pagamenti simulati/);assert.match(template('views/PlatformAdmin.vue'),/Stripe e sospensioni sono inattivi/)
})
