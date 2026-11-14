import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {exerciseGroup,libraryGroupOptions,exercisesInGroup} from '../src/features/exercises/libraryGroups.ts'
import {rankedExercises} from '../src/features/exercises/catalog.ts'
const catalog=JSON.parse(fs.readFileSync(new URL('../public/v1-preview/exercise-library/data/exercises.json',import.meta.url),'utf8'))
const rows=Array.isArray(catalog)?catalog:catalog.exercises
const original=structuredClone(rows)
const expected={chest:163,back:203,shoulders:143,arms:329,legs:286,core:169,cardio:29,neck:2}
test('all 1324 real exercises have one of the eight known groups - no orphans or duplicates',()=>{
 assert.equal(rows.length,1324);assert.equal(new Set(rows.map(x=>x.id)).size,rows.length)
 const options=libraryGroupOptions(rows)
 assert.deepEqual(Object.fromEntries(options.map(x=>[x.id,x.count])),expected)
 const selected=options.flatMap(o=>exercisesInGroup(rows,o.id))
 assert.equal(selected.length,rows.length);assert.equal(new Set(selected.map(x=>x.id)).size,rows.length)
 assert.deepEqual(selected.map(x=>x.id).sort(),rows.map(x=>x.id).sort())
 assert.deepEqual(rows,original)
})
test('all groups are accessible with empty search and keep catalogue order and IDs',()=>{
 for(const option of libraryGroupOptions(rows)){
  const scoped=exercisesInGroup(rows,option.id)
  assert.deepEqual(rankedExercises(scoped,'','',scoped.length),scoped)
  assert.equal(scoped.length,option.count)
 }
 assert.deepEqual(exercisesInGroup(rows,''),rows)
})
test('search only returns results within selected group',()=>{
 for(const [group,term] of [['chest','bench press'],['arms','curl'],['legs','squat'],['core','crunch']]){
  const scoped=exercisesInGroup(rows,group),results=rankedExercises(scoped,term,'',scoped.length)
  assert.ok(results.length>0,`${group}: ${term}`)
  assert.ok(results.every(x=>exerciseGroup(x)===group))
 }
})
test('primary target takes precedence over body region and secondary muscles',()=>{
 assert.equal(exerciseGroup({target:'biceps',bodyPart:'back',secondaryMuscles:['lats']}),'arms')
 assert.equal(exerciseGroup({target:'glutes',bodyPart:'upper legs'}),'legs')
})
test('legacy, missing and normalized data fall back safely',()=>{
 assert.equal(exerciseGroup({target:'NEW',bodyPart:' Upper_Legs '}),'legs')
 assert.equal(exerciseGroup({target:'BICIPITI'}),'arms')
 assert.equal(exerciseGroup({bodyPart:'Collo'}),'neck')
 assert.equal(exerciseGroup({target:'new muscle'}),'other')
 assert.equal(exerciseGroup({}),'other')
 assert.equal(exerciseGroup({target:123,bodyPart:null}),'other')
})
test('Other is displayed only when needed, with count, and unknown exercises remain searchable',()=>{
 assert.ok(!libraryGroupOptions(rows).some(x=>x.id==='other'))
 const unknown={id:'future',name:'New movement',target:'unknown'}
 const extended=[...rows,unknown]
 assert.deepEqual(libraryGroupOptions(extended).at(-1),{id:'other',label:'Altro',count:1})
 const scoped=exercisesInGroup(extended,'other')
 assert.deepEqual(rankedExercises(scoped,'new movement','',scoped.length),[unknown])
})
test('all Italian and English labels, IDs and counts',()=>{
 const it=libraryGroupOptions(rows,'it'),en=libraryGroupOptions(rows,'en')
 assert.deepEqual(it.map(x=>x.label),['Petto','Schiena','Spalle','Braccia','Gambe e glutei','Addome','Cardio','Collo'])
 assert.deepEqual(en.map(x=>x.label),['Chest','Back','Shoulders','Arms','Legs and glutes','Abs and core','Cardio','Neck'])
 assert.deepEqual(it.map(({id,count})=>({id,count})),en.map(({id,count})=>({id,count})))
})
test('both library modes share the same groups without removing fullscreen or selection controls',()=>{
 const view=fs.readFileSync(new URL('../src/views/Library.vue',import.meta.url),'utf8')
 assert.match(view,/libraryGroupOptions\(all.value,interfaceLanguage.value\)/)
 assert.match(view,/exercisesInGroup\(all.value,muscle.value\)/)
 assert.match(view,/rankedExercises\(scoped,terms.value,'',scoped.length\)/)
 assert.match(view,/lf-library-picker-overlay/)
 assert.match(view,/v-if="selectionMode" type="button" class="lf-library-select"/)
 assert.match(view,/v-if="selectionMode&&pending"/)
})
