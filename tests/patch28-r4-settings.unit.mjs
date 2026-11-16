import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
const source=readFileSync(new URL('../src/views/Settings.vue',import.meta.url),'utf8')
const {descriptor,errors}=parse(source,{filename:'Settings.vue'})
test('settings use one compact list on desktop and mobile with no per-section premium shadow',()=>{
 const css=descriptor.styles.map(s=>s.content).join('\n');const desktop=css.split('@media (max-width: 767px)')[0]
 assert.match(desktop,/\.lfsettings-flat-list\{display:block;gap:0/)
 assert.doesNotMatch(descriptor.template.content,/lfsettings-group|lfsettings-categories|lfsettings-entry/)
 assert.match(desktop,/\.lfsettings-flat-row>span>small\{[^}]*clip-path:inset\(50%\)/)
 assert.match(desktop,/\.lfsettings-flat-list>\.lfsettings-flat-row\{[^}]*min-height:52px/)
 assert.match(source,/rows:\[\{match:'\.lfsettings-header'\},\{match:'\.lfsettings-flat-list'\}\]/)
 assert.doesNotMatch(source,/Avvisi e promemoria Agenda|lfsettings-(desktop|mobile)-label/)
 assert.match(source,/<b>\{\{uiText\("Notifiche"\)\}\}<\/b>/)
})
test('shared settings compile and retain role gates and inline expansion of operational panels',()=>{
 assert.deepEqual(errors,[]);const script=compileScript(descriptor,{id:'r4-settings'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'Settings.vue',id:'r4-settings',compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
 for(const condition of ["isStagingMode()&&stagingSession&&stagingSession.role!=='atleta'","stagingSession.role==='titolare'",'workPilotAllowed','competitionAvailable','pushAvailable&&stagingSession','calendarPilotEnabled()&&stagingSession','linkedAllowed','canResetPassword','platformAllowed'])assert.ok(source.includes(`v-if="${condition}"`),condition)
 assert.match(source,/<RouterLink v-if="isStagingMode\(\)" class="lfsettings-flat-row" to="\/assistenza"/)
 assert.match(source,/@click="workReportOpen=!workReportOpen;workPilotOpen=false"/)
})

test('compact settings headings separate personalization, enabled features and account without cards',()=>{
 const content=descriptor.template.content, css=descriptor.styles.map(s=>s.content).join('\n');
 const headings=[...content.matchAll(/<h2[^>]*class="lfsettings-section-title"[^>]*>\{\{uiText\("([^"\n]+)"\)\}\}<\/h2>/g)];
 assert.deepEqual(headings.map(m=>m[1]),['Personalizzazione','Funzionalità aggiuntive','Account e assistenza']);
 const [a,b,c]=headings.map(m=>m.index); const groups=[content.slice(a,b),content.slice(b,c),content.slice(c,content.indexOf('class="lfsettings-exit"'))];
 for(const [group,labels] of [[groups[0],['Tema','Lingua','Personalizza palestra','Personalizza dashboard']],[groups[1],['Timbratura GPS','Report mensili','Competizioni e gare','Notifiche','Google Calendar','Cambio rapido profilo','Abbonamento LionFit (Sandbox)','Control Center']],[groups[2],['Modifica profilo','Sicurezza','Privacy','Termini e condizioni','Informazioni','Assistenza e feedback']]]){let last=-1;for(const label of labels){const at=group.indexOf(label);assert.ok(at>last,label);last=at}}
 assert.match(headings[1][0],/v-if="workPilotAllowed\|\|competitionAvailable/);
 assert.match(css,/\.lfsettings-flat-list>\.lfsettings-section-title\{[^}]*font-size:12px[^}]*background:transparent[^}]*box-shadow:none/);
 assert.equal((content.match(/class="lfsettings-flat-list"/g)||[]).length,1);
 const en=JSON.parse(readFileSync(new URL('../src/features/i18n/en.json',import.meta.url),'utf8')); for(const h of headings)assert.ok(en[h[1]]);
})
