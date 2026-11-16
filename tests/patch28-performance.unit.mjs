import {assertCurrentRulesPreservePatch24} from './patch29-rules-regression-helper.mjs';
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createBoundedLookup} from '../src/features/bookings/boundedLookup.ts'
import {createSnapshotProjection} from '../src/integrations/firestore/snapshotProjection.ts'
import {applyCorrectionHeads} from '../src/features/progress/progressModel.ts'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const tick=()=>new Promise(r=>setImmediate(r))
test('agenda pool is limited to 4 jobs, deduplicates across snapshots and clears queue on close',async()=>{
 let active=0,max=0;const started=[],done=new Map();const pool=createBoundedLookup(4,async id=>{started.push(id);active++;max=Math.max(max,active);await new Promise(r=>done.set(id,r));active--})
 pool.add(['a','b','c','d','e','f']);pool.add(['a','e','g']);await tick();assert.deepEqual(started,['a','b','c','d']);assert.equal(max,4)
 done.get('a')();await tick();assert.deepEqual(started,['a','b','c','d','e']);pool.close();pool.add(['x']);for(const id of ['b','c','d','e'])done.get(id)();await tick();assert.equal(active,0);assert.equal(started.length,5)
})
test('agenda lookup retries failed jobs without stalling all other work',async()=>{
 const started=[];const pool=createBoundedLookup(2,async id=>{started.push(id);if(id==='a')throw Error('network')});pool.add(['a','b','c']);await tick();assert.deepEqual(started,['a','b','c']);pool.add(['a']);await tick();assert.deepEqual(started,['a','b','c','a']);pool.close()
})
test('incremental projection decodes only changed documents; deletion, order, limit and new subscriber stay correct',()=>{
 const docs=Array.from({length:250},(_,i)=>({id:String(i),value:i}));let decoded=0;const decode=d=>{decoded++;return {id:d.id,value:d.value}};const project=createSnapshotProjection(decode)
 const first=project({docs,docChanges:()=>docs.map(doc=>({type:'added',doc}))});assert.equal(decoded,250)
 const modified={id:'100',value:450},next=[modified,...docs.filter(d=>!['100','0'].includes(d.id)),{id:'250',value:250}]
 const second=project({docs:next,docChanges:()=>[{type:'modified',doc:modified},{type:'removed',doc:docs[0]},{type:'added',doc:next.at(-1)}]});assert.equal(decoded,252);assert.equal(second[0].value,450);assert.equal(second[1],first[1]);assert.equal(second.length,250);assert.ok(!second.some(d=>d.id==='0'))
 const separate=createSnapshotProjection(decode);assert.notEqual(separate({docs:[docs[1]],docChanges:()=>[{type:'added',doc:docs[1]}]})[0],second[1]);assert.equal(decoded,253)
})
test('corrections isolated by exercise and session; order, zero, removal and audit remain identical',()=>{
 const row=(i)=>({key:'ex'+i,name:'Ex '+i,plannedSets:'5',plannedReps:'3',skipped:false,sets:[{kg:10,reps:3,position:1}]})
 const s={id:'one',athleteId:'a',sheetId:'s',sheetTitle:'test',performedOn:'2026-11-15',createdBy:'a',exercises:Array.from({length:90},(_,i)=>row(i))}
 const head=(id,ei,si,previous,next)=>({id,sessionId:'one',exerciseIndex:ei,setIndex:si,latest:{previous,next,author:'a',at:'2026-11-15'},history:[]})
 const heads=[head('1',89,0,{kg:10,reps:3},{kg:0,reps:3}),head('2',2,30+1,{kg:null,reps:null},{kg:15,reps:2}),head('3',0,0,{kg:10,reps:3},{kg:null,reps:null})]
 const other={...s,id:'other'};const rows=applyCorrectionHeads([s,other],heads);assert.equal(rows[0].exercises[89].sets[0].kg,0);assert.deepEqual(rows[0].exercises[2].sets.map(x=>x.position),[1,2]);assert.equal(rows[0].exercises[0].sets.length,0);assert.equal(rows[0].corrections.length,3);assert.equal(rows[1],other);assert.equal(s.exercises[0].sets.length,1)
})
test('secondary tabs: first access only, report photos for athlete only, old callbacks cannot leak into new scope',()=>{
 const source=read('src/components/ProgressWorkspace.vue');const fn=source.slice(source.indexOf('function bindSecondaryTabs(){'),source.indexOf('watch(tab,bindSecondaryTabs)'));const vars={};const calls=[]
 const make=(kind)=>(_db,gym,id,ok,fail)=>{calls.push({kind,gym,id,ok,fail});return()=>{}}
 // The production function is plain JS (no TS-only syntax). Execute it with the same local state shape.
 const harness=new Function('api',`const ref=value=>({value});const {watchChecks,watchGoals,watchCheckShares}=api;const getStagingClients=()=>({db:{}});const context=ref({uid:'c',gymId:'g'}),athleteId=ref('a'),tab=ref('home'),props={role:'coach'},checksState=ref('idle'),goalsState=ref('idle'),checks=ref([]),goals=ref([]),shareReady=ref(false),shareIds=ref([]),writeError=ref(''),goalError=ref('');let alive=true,childEpoch=0,checksStarted=false,shareStarted=false,goalsStarted=false;const shareEnabled=true,stopChild=[];${fn} return {context,athleteId,tab,props,checks,goals,shareIds,checksState,goalsState,bindSecondaryTabs,reset(){childEpoch++;checksStarted=shareStarted=goalsStarted=false;checks.value=[];shareIds.value=[];goals.value=[]}}`)
 const h=harness({watchChecks:make('checks'),watchGoals:make('goals'),watchCheckShares:make('shares')});h.bindSecondaryTabs();assert.equal(calls.length,0);h.tab.value='report';h.bindSecondaryTabs();assert.equal(calls.length,0);h.tab.value='check';h.bindSecondaryTabs();h.bindSecondaryTabs();assert.deepEqual(calls.map(c=>c.kind),['checks','shares']);calls[0].ok(['photo']);assert.deepEqual(h.checks.value,['photo']);h.tab.value='goals';h.bindSecondaryTabs();assert.equal(calls.length,3);h.reset();h.athleteId.value='b';calls[0].ok(['old']);calls[1].ok(['old'],true);calls[2].ok(['old']);assert.deepEqual(h.checks.value,[]);assert.deepEqual(h.shareIds.value,[]);assert.deepEqual(h.goals.value,[]);h.props.role='athlete';h.tab.value='report';h.bindSecondaryTabs();assert.equal(calls.at(-1).kind,'checks');assert.equal(calls.at(-1).id,'b')
})
test('Vue compilation and unchanged server rules fixture',()=>{
 for(const file of ['src/components/ProgressWorkspace.vue','src/views/LiveBookingWorkspace.vue']){const {descriptor,errors}=parse(read(file));assert.equal(errors.length,0);const s=compileScript(descriptor,{id:file});const t=compileTemplate({source:descriptor.template.content,filename:file,id:file,compilerOptions:{bindingMetadata:s.bindings}});assert.equal(t.errors.length,0)}
 assertCurrentRulesPreservePatch24()
})
