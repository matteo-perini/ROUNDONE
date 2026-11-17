import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,statSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const src=readFileSync(new URL('../src/components/ProgressWorkspace.vue',import.meta.url),'utf8')
const asset=p=>statSync(new URL('../'+p,import.meta.url)).size

test('Hero uses a local, compressed, text-free photo with functional live CTA',()=>{
 assert.match(src,/athlete-workout-hero\.webp/)
 assert.match(src,/chosenSheetId\?'Riprendi allenamento':'Inizia allenamento'/)
 assert.match(src,/@click="navigateTab\('record'\)"/)
 assert.match(src,/featuredSheet\.exercises\.length/)
 assert.ok(asset('public/lionfit-r8a/athlete-workout-hero.webp')>1000)
 assert.ok(asset('public/lionfit-r8a/athlete-workout-hero.webp')<150000)
})
test('Four athlete home destinations preserve all existing sections via contextual navigation',()=>{
 for(const [key,title] of [['trend','Progressi'],['history','Storico'],['goals','Obiettivi'],['check','Foto progressi']]){
  assert.match(src,new RegExp(`id:'${key}',icon:'.+',title:'${title}'`))
 }
 assert.match(src,/v-for="item in workoutHub"/)
 assert.match(src,/@click="navigateTab\(item\.id\)"/)
 assert.match(src,/@click="openRevisionForSheet\(null\)"/)
 assert.match(src,/@click="openRevisionForSheet\(selectedSheet\)"/)
 assert.match(src,/revisionSheet\.value=sheet\?\.id\|\|''/)
})
test('Progressi and Altri Sport are unified visually, not in storage',()=>{
 assert.match(src,/tab==='trend'\|\|tab==='multisport'/)
 assert.match(src,/aria-label="Tipi di progressi"/)
 assert.match(src,/aria-label="Scegli la disciplina"/)
 assert.match(src,/navigateTab\('trend'\)/)
 assert.match(src,/navigateTab\('multisport'\)/)
 assert.match(src,/<MultiSportProgress v-if="tab==='multisport'&&context"/)
 assert.match(src,/const historicalSheets=computed\(\(\)=>historySheets\(sessions\.value\)\)/)
})
test('PDF routes still use existing report preparation, with history and progress entry points',()=>{
 assert.match(src,/<template v-if="tab==='report'">/)
 assert.match(src,/\bprintReport\b/)
 assert.match(src,/@click="navigateTab\('report'\)"/)
 assert.match(src,/max\s*4|massimo 4/)
})
test('Photo check keeps private photos, per-pose inputs, gallery and comparisons',()=>{
 assert.match(src,/<h2>Foto progressi<\/h2>/)
 assert.match(src,/photo-pose-placeholder\.svg/)
 assert.ok(asset('public/lionfit-r8a/photo-pose-placeholder.svg')>100)
 assert.match(src,/v-for="side in checkSides/)
 assert.match(src,/@change="chooseFile\(side\[0\],\$event\)"/)
 assert.match(src,/@click="saveCheck"/)
 assert.match(src,/<CheckGallery/)
 assert.match(src,/<CheckComparison/)
})
test('Focus retains real SVG animation, sets, timer and server-record flow',()=>{
 assert.match(src,/focusMode=ref\(false\)/)
 assert.match(src,/@click="enterFocus"/)
 assert.match(src,/ExerciseMotion :exercise="focusExercise\(i\)!"/)
 assert.match(src,/editCell\(i,j,'kg'/)
 assert.match(src,/editCell\(i,j,'reps'/)
 assert.match(src,/timerAnchor/)
 assert.match(src,/lf-r8a-focus-timer/)
 assert.match(src,/timerAnchor\?\.scrollIntoView/)
 assert.match(src,/recordSession\(/)
 assert.match(src,/correctWorkout\(/)
 assert.match(src,/focusRoot/)
 assert.match(src,/prefers-reduced-motion:reduce/)
})
test('Vue script / CSS parse as plain TS and PostCSS in available local tooling',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 const script=src.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
 const template=src.match(/<template>([\s\S]*?)<\/template>\s*<style scoped>/)?.[1]
 assert.ok(script,'script setup exists');assert.ok(template,'template exists')
 const out=ts.transpileModule(script,{fileName:'ProgressWorkspace.vue.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
 assert.deepEqual(out.diagnostics||[],[])
 for(const [,block] of src.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(block)
})
