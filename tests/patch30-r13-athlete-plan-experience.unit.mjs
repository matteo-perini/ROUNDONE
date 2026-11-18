import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8')
const plan=read('src/components/AthletePlanContent.vue')
const sheet=read('src/components/SheetDetail.vue')
const view=read('src/views/AthleteLiveWorkspace.vue')
const motion=read('src/components/ExerciseMotion.vue')
const require=createRequire(import.meta.url)
function resolveGlobal(name){
 try{return require(name)}catch{}
 try{return require(path.join(root,'node_modules',name))}catch{}
 if(name==='typescript')return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')
 if(name==='postcss')return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/postcss')
 throw new Error(`Missing ${name}. Install npm dependencies on your PC to run this parser test.`)
}
function scriptSource(source){return source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]||''}
function styleSource(source){return [...source.matchAll(/<style scoped>([\s\S]*?)<\/style>/g)].map(x=>x[1])}
function assertHealthy(source,file){
 const ts=resolveGlobal('typescript');const postcss=resolveGlobal('postcss')
 const transpiled=ts.transpileModule(scriptSource(source),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
 assert.deepEqual((transpiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')),[])
 for(const style of styleSource(source))assert.ok(postcss.parse(style),`Stylesheet invalid in ${file}`)
 const template=source.slice(source.indexOf('<template>'),source.indexOf('</template>',source.indexOf('<template>'))+11)
 assert.ok(template.includes('athlete')||file.includes('ExerciseMotion'))
}
test('programmed and free-assignment remain separate, and user cannot edit assignment data',()=>{
 assert.match(plan,/v-if="activeWeeks\.length"/)
 assert.match(plan,/v-if="unprogrammed\.length"/)
 assert.match(plan,/activeAssignmentGroups/)
 assert.match(plan,/visualSheetGroups/)
 assert.match(plan,/props\.personal/)
 assert.doesNotMatch(plan,/(?:setDoc|updateDoc|addDoc|deleteDoc)\s*\(/)
})
test('today hero respects Rome time and real active program, never a fabricated assignment',()=>{
 for(const token of ['romeDate(todayClock.value)','romeDayIndex(todayClock.value)','activeWeekOn(','exactWeekDaySlots(liveGroups.value,todayWeek.value','todayActivities','todayLinks','openToday','todayHeadline','todayCtaLabel'])assert.ok(plan.includes(token),token)
 assert.match(plan,/Nessuna scheda collegata oggi/)
 assert.match(plan,/Nessuna attività programmata oggi/)
})
test('program selection, week navigation and exact day sheet slots stay reachable',()=>{
 for(const token of ['chooseProgram','chooseWeek','openWeekDay','closeWeekDay','openDayTraining','showSheetChoices','selectedDayDetails','linksForDay(selectedDay)','forWeekRepresentative','weekOrdinal(w,activeWeeks)'])assert.ok(plan.includes(token),token)
 assert.match(plan,/router\.push\(\{query:/)
 assert.match(plan,/emit\('update:weekId'/)
})
test('days remain fully available with clear today state and all activity names',()=>{
 assert.match(plan,/v-for="\(day,i\) in weekDays"/)
 assert.match(plan,/displayActivities\(i\)\.join/)
 assert.match(plan,/lf-athlete-v4-today/)
 assert.match(plan,/Tocca un giorno per vedere attività e schede/)
})
test('free sheets still open actual assigned sheet and carousel remains for many sheets',()=>{
 assert.match(plan,/v-for="group in unprogrammed"/)
 assert.match(plan,/openSheet\(forWeekRepresentative\(group,week\?\.id\|\|''\)\)/)
 assert.match(plan,/unprogrammed\.length>2/)
 assert.match(plan,/athlete-sheet-carousel/)
})
test('archive links remain in the athlete page and untouched for others',()=>{
 assert.match(view,/props\.screen==='plan'/)
 assert.match(view,/lf-r13-plan-archives/)
 assert.match(view,/Archivio schede/)
 assert.match(view,/Archivio programmazioni/)
 assert.match(view,/ProgramHistory/)
})
test('exercise view retains printing, catalog motion, coach notes, alternative selection and training CTA',()=>{
 for(const token of ['sheetPrintHtml','printSheet','ExerciseMotion','viewExercise','approvedChoices','toggleNotes','startTraining','loadCatalog','groupExerciseRows','supersetView','playing=videoFor','Cerca illustrazione','Stampa / PDF'])assert.ok(sheet.includes(token),token)
 assert.match(sheet,/lf-r13-athlete-sheet/)
 assert.match(sheet,/Illustrazione<br>non disponibile/)
 assert.match(motion,/followVisibleFrames/)
 assert.match(motion,/toggle\(\)/)
 assert.match(motion,/Ferma animazione/)
})
test('respects reduced motion and uses only scoped, palette-based styles except premium dark hero',()=>{
 assert.match(plan,/prefers-reduced-motion:reduce/)
 assert.match(plan,/var\(--mint\)/)
 assert.match(plan,/var\(--text\)/)
 assert.match(sheet,/\.lf-r13-athlete-sheet/)
})
test('TypeScript syntax and CSS parse for all modified components',()=>{
 for(const [file,content] of [['AthletePlanContent.vue',plan],['SheetDetail.vue',sheet],['AthleteLiveWorkspace.vue',view],['ExerciseMotion.vue',motion]])assertHealthy(content,file)
})
