import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=f=>fs.readFileSync(path.join(base,f),'utf8')
const home=read('src/components/AthleteHomeContent.vue')
const gym=read('src/components/GymIdentity.vue')
const events=read('src/components/AthleteHomeHighlights.vue')
const css=read('src/styles-r14c-dashboard-rebuild.css')
const routes=read('src/router/index.ts')
const live=read('src/views/AthleteLiveWorkspace.vue')
test('one and only one hero background; custom gym cover wins, standard athlete image is fallback',()=>{
 assert.match(home,/<GymIdentity hero>/)
 assert.match(gym,/:src="identity.cover\|\|'\/lionfit-r8a\/athlete-workout-hero.webp'"/)
 assert.match(gym,/lf14-hero-image/)
 assert.match(gym,/identity.logo\|\|'\/v1-preview\/LOGO-APP.png'/)
 assert.doesNotMatch(home,/<GymIdentity compact/)
 assert.match(css,/\.lf15-home \.lf14-gym-hero:before\{display:none!important\}/)
})
test('daily training has fixed official glove photograph and correct activity/sheet states',()=>{
 assert.match(css,/gloves-clean\.jpg/)
 for(const token of ['liveActivities','isRestDay','hasTodayPlan','freeSheets','directSheet','activeSheet=sheet','actionLabel','Nessun allenamento programmato oggi'])assert.ok(home.includes(token),token)
 assert.match(home,/:to="hasTodayPlan\?dayLink:planLink"/)
 assert.match(home,/<SheetDetail v-if="activeSheet"/)
})
test('four approved shortcuts are all clickable and linked to real routes',()=>{
 for(const label of ['Prenota lezione','I miei allenamenti','Le mie schede','Video &amp; Tutorial'])assert.ok(home.includes(label),label)
 assert.match(home,/:to="bookingLink"/)
 assert.match(home,/:to="trainingLink\|\|progressLink"/)
 assert.match(home,/:to="planLink"/)
 assert.match(live,/:training-link="livePath\('\/progressi'\)"/)
 for(const dest of ['/progressi','/piano','/prenotazioni'])assert.ok(routes.includes(`path:'${dest}'`),dest)
})
test('video and tutorial has working accessible Coming Soon dialog, not dead navigation',()=>{
 assert.match(home,/@click="openTutorial"/)
 assert.match(home,/videoOpen\.value=true/)
 assert.match(home,/role="dialog" aria-modal="true"/)
 assert.match(home,/Prossimamente su LionFit/)
 assert.match(home,/e\.key==='Escape'/)
 assert.match(home,/@click="videoOpen=false"/)
})
test('both next appointment and next event have real Firebase-backed data or truthful empty states',()=>{
 assert.match(events,/where\('athleteId','==',uid\)/)
 assert.match(events,/auth\.currentUser\?\.uid!==uid/)
 assert.match(events,/watchCompetitionEvents\(db,gym/)
 assert.match(events,/nextCompetition\(events\.value,now\.value\)/)
 assert.match(events,/PROSSIMA LEZIONE/)
 assert.match(events,/PROSSIMO EVENTO/)
 for(const state of ['Caricamento appuntamenti','Nessuna lezione prenotata','Nessun evento futuro pubblicato','Gare e competizioni non attive'])assert.ok(events.includes(state),state)
 assert.doesNotMatch(events,/(?:setDoc|updateDoc|deleteDoc|addDoc|runTransaction)\s*\(/)
})
test('path and progress card do not fabricate data',()=>{
 assert.match(home,/Giorno \{\{dayNumber\}\} di 7 · calendario settimanale/)
 assert.match(home,/:to="progressLink"/)
 assert.match(home,/Allenamenti, misure e risultati registrati/)
 assert.doesNotMatch(home,/allenamenti completati|\+12%|kcal|record personale:/i)
})
test('R14B fix stays applied; R14C is imported last',()=>{
 assert.match(read('src/views/Home.vue'),/:now-ms="Date\.now\(\)"/)
 assert.match(home,/nowMs\?:number/)
 assert.match(read('src/main.ts'),/import '\.\/styles-r14-athlete-home\.css'/)
 assert.match(read('src/main.ts'),/import '\.\/styles-r14c-dashboard-rebuild\.css'/)
 assert.match(css,/prefers-reduced-motion:reduce/)
})
test('typescripts and stylesheet validate locally',()=>{
 const require=createRequire(import.meta.url)
 const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})()
 const postcss=(()=>{try{return require('postcss')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/postcss')}})()
 for (const [file,txt] of [['Home',home],['Highlights',events],['GymIdentity',gym]]){
  const script=txt.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script,`${file} script`)
  const result=ts.transpileModule(script,{fileName:file+'.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(result.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).map(x=>ts.flattenDiagnosticMessageText(x.messageText,' '))??[],[])
 }
 assert.ok(postcss.parse(css))
})
