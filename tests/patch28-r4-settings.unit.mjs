import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
const source=readFileSync(new URL('../src/views/Settings.vue',import.meta.url),'utf8')
const {descriptor,errors}=parse(source,{filename:'Settings.vue'})
test('settings use one compact list on desktop and mobile with no per-section premium shadow',()=>{
 const css=descriptor.styles.map(s=>s.content).join('\n');const desktop=css.split('@media (max-width: 767px)')[0]
 assert.match(desktop,/\.lfsettings-categories\{display:block;gap:0/)
 assert.match(desktop,/\.lfsettings-categories>\.lfsettings-group\{[^}]*background:transparent;[^}]*box-shadow:none!important/)
 assert.match(desktop,/\.lfsettings-group>h2,[\s\S]*?clip-path:inset\(50%\)/)
 assert.match(desktop,/\.lfsettings-group>\.lfsettings-entry\{[^}]*min-height:52px/)
 assert.match(source,/rows:\[\{match:'\.lfsettings-header'\},\{match:'\.lfsettings-categories'\}\]/)
 assert.doesNotMatch(source,/Avvisi e promemoria Agenda|lfsettings-(desktop|mobile)-label/)
 assert.match(source,/<b>\{\{uiText\("Notifiche"\)\}\}<\/b>/)
})
test('shared settings compile and retain role gates and inline expansion of operational panels',()=>{
 assert.deepEqual(errors,[]);const script=compileScript(descriptor,{id:'r4-settings'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'Settings.vue',id:'r4-settings',compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
 for(const condition of ["isStagingMode()&&stagingSession&&stagingSession.role!=='atleta'","stagingSession.role==='titolare'",'workPilotAllowed','competitionAvailable','pushAvailable&&stagingSession','calendarPilotEnabled()&&stagingSession','linkedAllowed','canResetPassword','platformAllowed'])assert.ok(source.includes(`v-if="${condition}"`),condition)
 assert.match(source,/<button[^>]*:aria-expanded="ticketsOpen"[^>]*>[\s\S]*?<SupportTickets v-if="ticketsOpen&&isStagingMode\(\)"\/>\s*<\/section>/)
 assert.match(source,/@click="workReportOpen=!workReportOpen;workPilotOpen=false"/)
})
