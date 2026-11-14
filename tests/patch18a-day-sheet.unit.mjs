import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {hasDayEditorIntent,parseDayEditorIntent,resolveEditorAthlete} from '../src/features/sheets/dayEditorContext.ts'
import {belongsToCoach} from '../src/features/athletes/coachMembership.ts'
const require=createRequire(import.meta.url)
const ts=require('typescript')
const q={athleteId:'a2',weekId:'w1',day:'0',slot:'1',expectedSlotId:''}
const roster=[{id:'a1',gymId:'gym1',primaryCoachUid:'coach1'},{id:'a2',gymId:'gym1',primaryCoachUid:'coach2'},{id:'legacy',gymId:'gym1'},{id:'outsider',gymId:'gym2'}]
const visible=roster.filter(x=>belongsToCoach(x,'coach1','miei'))
test('direct day editor uses fixed athlete even when hidden by I miei atleti',()=>{assert.equal(visible.some(a=>a.id==='a2'),false);assert.equal(resolveEditorAthlete(roster,visible,'gym1','a1','a2',true)?.id,'a2')})
test('legacy athlete is selectable by fixed day reference; no fallback when absent',()=>{assert.equal(resolveEditorAthlete(roster,visible,'gym1','a1','legacy',true)?.id,'legacy');assert.equal(resolveEditorAthlete(roster,visible,'gym1','a1','missing',true),null)})
test('fixed or ordinary target never crosses gym',()=>{assert.equal(resolveEditorAthlete(roster,roster,'gym1','a1','outsider',true),null);assert.equal(resolveEditorAthlete(roster,roster,'gym1','outsider','a1',false),null)})
test('ordinary archive selection still respects the roster filter',()=>{assert.equal(resolveEditorAthlete(roster,visible,'gym1','a2','a2',false),null);assert.equal(resolveEditorAthlete(roster,visible,'gym1','a1',undefined,false)?.id,'a1')})
test('slot 1 and 2 on every day retain expected ID',()=>{for(let day=0;day<7;day++)for(const slot of [1,2])assert.deepEqual(parseDayEditorIntent({...q,day:String(day),slot:String(slot),expectedSlotId:'old'}),{athleteId:'a2',weekId:'w1',day,slot,expected:'old'})})
test('malformed or missing slot fails closed rather than saving unattached',()=>{for(const bad of [{...q,slot:'0'},{...q,slot:['1']},{...q,day:''},{...q,day:'7'},{...q,weekId:'bad/id'},{...q,athleteId:null},{...q,expectedSlotId:['old']}]){assert.equal(hasDayEditorIntent(bad),true);assert.equal(parseDayEditorIntent(bad),null)}assert.equal(hasDayEditorIntent({weekId:'w1'}),false)})
// Execute the actual TypeScript adapter against a small transaction double.
// This verifies control flow and all-or-nothing behavior, not Firebase Rules.
function fixture({old=false,fail=false}={}){
 const store=new Map(),f='gyms/gym1/athlete_programs/a2',w=f+'/weeks/w1',t='gyms/gym1/templates',writes=[]
 const exercises=[{name:'Panca',exerciseId:'',sets:'3',reps:'10',load:'',notes:'',supersetWithPrevious:false,supersetRest:''}]
 const days={'lunedì':{templateId:old?'old':'',templateId2:'other',activity1:'Boxe',activity2:'Pesi'}}
 store.set(f,{weeksVersion:4});store.set(w,{days});
 if(old)store.set(f+'/personal_templates/old',{title:'Old',exercises,category:'Allenamento'})
 let n=0
 const clone=x=>structuredClone(x),ref=(p)=>({path:p,id:p.split('/').at(-1)})
 const sql={collection:(base,...parts)=>ref([typeof base==='object'&&base.path?base.path:'',...parts].filter(Boolean).join('/')),
  doc:(base,...parts)=>ref([typeof base==='object'&&base.path?base.path:'',...(parts.length?parts:['auto'+(++n)])].filter(Boolean).join('/')),
  serverTimestamp:()=>({server:true}),deleteField:()=>({delete:true}),
  runTransaction:async(_db,fn)=>{const changes=[];let writing=false;const tx={get:async r=>{assert.equal(writing,false,'reads must precede writes');return{exists:()=>store.has(r.path),data:()=>store.has(r.path)?clone(store.get(r.path)):undefined}},set:(r,data,opts)=>{writing=true;changes.push(['set',r.path,data,opts])},update:(r,data)=>{writing=true;changes.push(['update',r.path,data])}};const result=await fn(tx);if(fail&&changes.some(x=>x[1].startsWith(t+'/')))throw Error('simulated commit denied');for(const [op,p,data,opts] of changes){if(op==='set')store.set(p,opts?.merge?{...store.get(p),...clone(data)}:clone(data));else{const current=clone(store.get(p));for(const [key,value] of Object.entries(data)){const parts=key.split('.');let target=current;for(const part of parts.slice(0,-1))target=target[part]??(target[part]={});target[parts.at(-1)]=clone(value)}store.set(p,current)}}writes.push(changes);return result}
 }
 // Real TS modules, with only Firestore injected. Dependencies resolved locally.
 const cache=new Map();function load(filename){filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);const src=fs.readFileSync(filename,'utf8');const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=id=>{if(id==='firebase/firestore')return sql;if(id.startsWith('.')){const file=path.resolve(path.dirname(filename),id);return load(fs.existsSync(file)?file:file+'.ts')}return require(id)};new Function('require','module','exports',out)(req,mod,mod.exports);return mod.exports}
 const ops=load(fileURLToPath(new URL('../src/integrations/firestore/liveCoachOperations.ts',import.meta.url))),sheets=load(fileURLToPath(new URL('../src/integrations/firestore/sheets.ts',import.meta.url)))
 return {store,f,w,t,exercises,ops,sheets,writes}
}
for(const slot of [1,2])test(`create from Scheda ${slot}: same ID in all records, other slot/activity intact`,async()=>{const {store,f,w,t,exercises,ops,writes}=fixture(),key=slot===1?'templateId':'templateId2',other=slot===1?'templateId2':'templateId';const before=structuredClone(store.get(w).days['lunedì']);const id=await ops.createCoachModelForDay({},'gym1','a2','coach1','New','Allenamento',exercises,'w1','lunedì',slot,before[key]);assert.equal(store.get(w).days['lunedì'][key],id);assert.equal(store.get(w).days['lunedì'][other],before[other]);assert.equal(store.get(w).days['lunedì'].activity1,'Boxe');assert.equal(store.get(w).days['lunedì'].activity2,'Pesi');assert.deepEqual(store.get(t+'/'+id).exercises,store.get(f+'/archive_templates/'+id).exercises);assert.deepEqual(store.get(f+'/personal_templates/'+id).exercises,exercises);assert.equal(store.get(f).weeksVersion,5);assert.equal(writes.filter(x=>x.length).length,1)})
test('replaced old sheet archived and detached, not deleted',async()=>{const {store,f,w,ops,exercises}=fixture({old:true});const id=await ops.createCoachModelForDay({},'gym1','a2','coach1','New','Allenamento',exercises,'w1','lunedì',1,'old');assert.equal(store.get(w).days['lunedì'].templateId,id);assert.equal(store.get(f+'/archive_templates/old').title,'Old');assert.ok(store.get(f+'/personal_templates/old').planDetachedAt)})
test('stale slot denies entire creation; no orphan model, no changed activity',async()=>{const {store,ops,exercises}=fixture();const before=structuredClone(store);await assert.rejects(ops.createCoachModelForDay({},'gym1','a2','coach1','New','Allenamento',exercises,'w1','lunedì',2,''),/modificato lo slot/);assert.deepEqual(store,before)})
test('failed commit preserves all original records',async()=>{const {store,ops,exercises}=fixture({fail:true});const before=structuredClone(store);await assert.rejects(ops.createCoachModelForDay({},'gym1','a2','coach1','New','Allenamento',exercises,'w1','lunedì',1,''),/denied/);assert.deepEqual(store,before)})
test('existing shared-model assignment and ordinary archive creation still work',async()=>{const {store,t,w,f,ops,sheets,exercises}=fixture();const id=await ops.createCoachModel({},'gym1','coach1','Archive','Allenamento',exercises);assert.ok(store.has(t+'/'+id));assert.equal(await sheets.assignSharedToDay({},'gym1','a2',id,'coach1','w1','lunedì',1,''),'created');assert.equal(store.get(w).days['lunedì'].templateId,id);assert.ok(store.has(f+'/archive_templates/'+id))})

test('new personal sheet automatically creates reusable model and protected history with same ID in a single commit',async()=>{const {store,f,t,w,exercises,ops,writes}=fixture();const week=structuredClone(store.get(w));const id=await ops.createCoachPersonal({},'gym1','a2','coach1','Personal','Allenamento',exercises);assert.equal(store.get(t+'/'+id).title,'Personal');assert.deepEqual(store.get(t+'/'+id).exercises,store.get(f+'/archive_templates/'+id).exercises);assert.equal(store.get(f+'/personal_templates/'+id).sourceSharedTemplateId,id);assert.deepEqual(store.get(w),week);assert.equal(writes.filter(x=>x.length).length,1)})
test('new personal creation leaves no partial copy on failed commit',async()=>{const {store,ops,exercises}=fixture({fail:true});const before=structuredClone(store);await assert.rejects(ops.createCoachPersonal({},'gym1','a2','coach1','Personal','Allenamento',exercises),/denied/);assert.deepEqual(store,before)})
test('editing personal sheet preserves reusable model, protected history and IDs',async()=>{const {store,f,t,ops,exercises}=fixture();const id=await ops.createCoachPersonal({},'gym1','a2','coach1','Personal','Allenamento',exercises);const history=structuredClone(store.get(f+'/archive_templates/'+id)),model=structuredClone(store.get(t+'/'+id));await ops.updateCoachPersonal({},'gym1','a2','coach1',id,0,'Edited','Allenamento',exercises);assert.equal(store.get(f+'/personal_templates/'+id).title,'Edited');assert.deepEqual(store.get(f+'/archive_templates/'+id),history);assert.deepEqual(store.get(t+'/'+id),model)})
