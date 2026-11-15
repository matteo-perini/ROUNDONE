/** LionFit Progressi 360: pure helpers; no writes to legacy sheets. */
import type {ExerciseRecord,Personal} from '../sheets/domain'
import type {HistoricalArchive} from '../athletes/labArchive'
export type WorkoutSet = {kg:number|null;reps:number|null;position?:number;editIndex?:number}
export type RecordedExercise = {key:string;name:string;plannedSets:string;plannedReps:string;skipped:boolean;sets:WorkoutSet[];plannedKey?:string}
export type ProgressSession = {id:string;athleteId:string;sheetId:string;sheetTitle:string;performedOn:string;createdBy:string;exercises:RecordedExercise[];createdAt?:unknown;corrections?:WorkoutCorrection[]}
export type WorkoutCorrection={exerciseIndex:number;setIndex:number;previous:WorkoutSet;next:WorkoutSet;author:string;at:string}
export type CheckPhoto={side:'front'|'back'|'left'|'right';storagePath:string}
export type ProgressCheck={id:string;athleteId:string;performedOn:string;notes:string;photos:CheckPhoto[];createdBy:string;createdAt?:unknown}
export type ProgressSheet={id:string;title:string;exercises:ExerciseRecord[];historical:boolean;sourceId:string}
const keyFrom=(ex:ExerciseRecord,i:number)=>String(ex.exerciseId||ex.catalogId||ex.id||`position:${i}`)
export function exerciseKey(ex:ExerciseRecord,i:number){return keyFrom(ex,i)}
export function uniqueProgressSheets(personal:readonly Personal[],archive:readonly HistoricalArchive[]):ProgressSheet[]{
 const result=new Map<string,ProgressSheet>()
 // Archive first: include previous programs. Current personal version supersedes snapshots with the same ID.
 for(const a of archive){
  const id=a.sourceTemplateId||a.id
  if(!result.has(id) && a.exercises.length)result.set(id,{id,title:a.title,exercises:a.exercises,historical:true,sourceId:a.id})
 }
 for(const p of personal){
  if(p.exercises.length && !p.deletedAt)result.set(p.id,{id:p.id,title:p.title,exercises:p.exercises,historical:!!p.planDetached,sourceId:p.id})
 }
 return [...result.values()].sort((a,b)=>a.title.localeCompare(b.title,'it'))
}
export function emptyEntries(sheet:ProgressSheet):RecordedExercise[]{
 return sheet.exercises.map((ex,i)=>{
  const parsed=Number.parseInt(String(ex.sets),10), count=Number.isFinite(parsed)?Math.min(Math.max(1,parsed),18):3
  return {key:keyFrom(ex,i),name:ex.name||`Esercizio ${i+1}`,plannedSets:String(ex.sets??''),plannedReps:String(ex.reps??''),skipped:false,sets:Array.from({length:count},()=>({kg:null,reps:null}))}
 })
}
export function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value}
export function normalizeEntries(rows:readonly RecordedExercise[]):RecordedExercise[]{
 if(rows.length>90)throw new Error('La scheda contiene troppi esercizi per una singola registrazione.')
 return rows.map(e=>{
  if(!e.key||!e.name||e.name.length>180||e.sets.length>30)throw new Error('Esercizio o numero serie non valido.')
  if(e.skipped)return {...e,sets:[],skipped:true}
  const sets=e.sets.map((s,i)=>({...s,position:s.position??i+1})).filter(s=>s.kg!==null||s.reps!==null).map(s=>{
   if(s.kg!==null&&(!Number.isFinite(s.kg)||s.kg<0||s.kg>2000))throw new Error('Carico non valido: usa kg da 0 a 2000.')
   if(s.reps!==null&&(!Number.isInteger(s.reps)||s.reps<1||s.reps>300))throw new Error('Ripetizioni non valide: usa numeri interi da 1 a 300.')
   return {kg:s.kg,reps:s.reps,position:s.position}
  })
  return {...e,skipped:false,sets}
 })
}
export function historyExerciseKey(e:Pick<RecordedExercise,'key'|'name'>){return e.key.startsWith('position:')?e.key+'::'+e.name.trim().toLocaleLowerCase('it'):e.key}
export function matchesHistoryExercise(e:Pick<RecordedExercise,'key'|'name'>,key:string){return key.includes('::')?historyExerciseKey(e)===key:e.key===key}
export function exerciseSeries(sessions:readonly ProgressSession[],sheetId:string,key:string,onlyReps:number|null=null){
 return sessions.filter(s=>s.sheetId===sheetId).flatMap(s=>s.exercises.filter(e=>matchesHistoryExercise(e,key)&&!e.skipped).map(e=>{
  const valid=e.sets.filter(x=>x.kg!==null&&x.kg>=0&&(x.reps===null||x.reps>0))
  const chosen=onlyReps===null?valid:valid.filter(x=>x.reps===onlyReps)
  if(!chosen.length)return null
  const max=Math.max(...chosen.map(x=>x.kg!))
  const complete=chosen.filter(x=>x.reps!==null)
  const volume=complete.length?complete.reduce((sum,x)=>sum+x.kg!*x.reps!,0):null
  const candidates=chosen.filter(x=>x.reps!==null&&x.reps<=10)
  const estimate=candidates.length?Math.max(...candidates.map(x=>x.kg!*(1+x.reps!/30))):null
  return {id:s.id,date:s.performedOn,kg:max,reps:chosen.find(x=>x.kg===max)?.reps??null,volume,estimate}
 })).filter((x):x is NonNullable<typeof x>=>x!==null).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
}
export function sheetSummary(sessions:readonly ProgressSession[],sheetId:string){
 const relevant=sessions.filter(s=>s.sheetId===sheetId)
 return relevant.sort((a,b)=>b.performedOn.localeCompare(a.performedOn)).map(s=>{
  const completed=s.exercises.filter(e=>!e.skipped&&e.sets.some(x=>x.kg!==null||x.reps!==null)).length
  const volume=s.exercises.filter(e=>!e.skipped).flatMap(e=>e.sets).reduce((sum,x)=>sum+(x.kg??0)*(x.reps??0),0)
  return {id:s.id,date:s.performedOn,completed,total:s.exercises.length,volume}
 })
}
export function progressMetrics(entries:readonly RecordedExercise[]){
 const completed=entries.filter(e=>!e.skipped&&e.sets.some(s=>s.kg!==null||s.reps!==null)).length
 const volume=entries.filter(e=>!e.skipped).reduce((sum,e)=>sum+e.sets.reduce((ss,s)=>ss+(s.kg??0)*(s.reps??0),0),0)
 const max=Math.max(0,...entries.filter(e=>!e.skipped).flatMap(e=>e.sets.map(s=>s.kg??0)))
 return {completed,total:entries.length,volume,max}
}
/** Per-sheet normalized relative performance: one exercise = one vote, never raw kg average.
 * Each exercise uses first valid best set as reference; missing entries are excluded.
 * Indicator only, not a strength/health diagnosis. */
export function sheetPerformanceTimeline(sessions:readonly ProgressSession[],sheetId:string){
 const relevant=sessions.filter(x=>x.sheetId===sheetId).slice().sort((a,b)=>a.performedOn.localeCompare(b.performedOn)||a.id.localeCompare(b.id))
 const first=new Map<string,number>()
 return relevant.map(s=>{
  let sum=0,count=0
  for(const e of s.exercises){
   if(e.skipped)continue
   const candidates=e.sets.filter(x=>x.kg!==null&&x.reps!==null&&x.kg>0&&x.reps>=1&&x.reps<=10)
   if(!candidates.length)continue
   const best=Math.max(...candidates.map(x=>x.kg!*(1+x.reps!/30)))
   const key=historyExerciseKey(e)
   if(!first.has(key))first.set(key,best)
   const baseline=first.get(key)!
   if(baseline>0){sum+=100*best/baseline;count++}
  }
  return {id:s.id,date:s.performedOn,index:count?Math.round(sum/count*10)/10:null,compared:count}
 })
}

/** Old records compressed empty rows: never infer their original set position. */
export function setLabel(s:WorkoutSet,index:number){return s.position===undefined?`Voce ${(s.editIndex??index)+1}`:`Serie ${s.position}`}
export function historySheets(sessions:readonly ProgressSession[]){const m=new Map<string,string>();for(const s of sessions)if(!m.has(s.sheetId))m.set(s.sheetId,s.sheetTitle);return [...m].map(([id,title])=>({id,title}))}
export function historyExercises(sessions:readonly ProgressSession[],sheetId:string){const m=new Map<string,string>();for(const s of sessions)if(s.sheetId===sheetId)for(const e of s.exercises)if(!m.has(historyExerciseKey(e)))m.set(historyExerciseKey(e),e.name);return [...m].map(([key,name])=>({key,name}))}
export function lastSet(sessions:readonly ProgressSession[],key:string,index:number,date:string,name?:string){
 for(const s of sessions.slice().sort((a,b)=>b.performedOn.localeCompare(a.performedOn)))if(s.performedOn<=date){for(const e of s.exercises)if(e.key===key&&!e.skipped&&(!name||e.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it'))){const found=e.sets.find(r=>r.position===index+1);if(found&&(found.kg!==null||found.reps!==null))return found;const legacy=e.sets.filter(r=>r.position===undefined&&(r.kg!==null||r.reps!==null));if(legacy.length&&index===0)return legacy[legacy.length-1]}}
 return null
}
export function correctedSession(session:ProgressSession,exerciseIndex:number,setIndex:number,kg:number|null,reps:number|null,author:string,at:string){
 if(session.athleteId!==author||session.createdBy!==author)throw new Error('Puoi correggere soltanto i tuoi allenamenti.')
 const ex=session.exercises[exerciseIndex],old=ex?.sets[setIndex];if(!old||ex.skipped)throw new Error('Serie non disponibile.')
 if(kg===null&&reps===null)throw new Error('Inserisci almeno un valore.')
 if(kg!==null&&(!Number.isFinite(kg)||kg<0||kg>2000))throw new Error('Carico non valido.')
 if(reps!==null&&(!Number.isInteger(reps)||reps<1||reps>300))throw new Error('Ripetizioni non valide.')
 const next={...old,kg,reps};if(old.kg===kg&&old.reps===reps)throw new Error('Nessuna modifica.')
 const corrections=session.corrections||[];if(corrections.length>=100)throw new Error('Limite correzioni raggiunto per questa registrazione.')
 return {exercises:session.exercises.map((e,i)=>i===exerciseIndex?{...e,sets:e.sets.map((r,j)=>j===setIndex?next:r)}:e),corrections:[...corrections,{exerciseIndex,setIndex,previous:old,next,author,at}]}
}

export type CorrectionValues={kg:number|null;reps:number|null}
export type CorrectionEvent={previous:CorrectionValues;next:CorrectionValues;author:string;at:unknown}
export type CorrectionHead={id:string;sessionId:string;exerciseIndex:number;setIndex:number;latest:CorrectionEvent;history:CorrectionEvent[]}
export function correctionValues(s:WorkoutSet):CorrectionValues{return {kg:s.kg,reps:s.reps}}
export function sameValues(a:CorrectionValues,b:CorrectionValues){return a.kg===b.kg&&a.reps===b.reps}
function correctionDate(at:unknown):string{if(typeof at==='string')return at;const t=at as {toDate?:()=>Date}|null;return t?.toDate?.().toISOString()||''}
/** The original set offset is immutable; additions use separate slots 30–59.
 * Removed rows never enter the effective session, charts, or report. */
export function hasWorkoutValues(v:CorrectionValues){return v.kg!==null||v.reps!==null}
export function validWorkoutValues(v:CorrectionValues){return (v.kg===null||(Number.isFinite(v.kg)&&v.kg>=0&&v.kg<=2000))&&(v.reps===null||(Number.isInteger(v.reps)&&v.reps>=1&&v.reps<=300))}
export const EMPTY_WORKOUT_VALUES:CorrectionValues={kg:null,reps:null}
export function workoutSlot(ex:RecordedExercise,index:number):WorkoutSet|null{
 if(!Number.isInteger(index)||index<0||index>=60)return null
 if(index<30)return ex.sets[index]||null
 const position=index-29
 if(ex.sets.some(s=>s.position===position))return null // never duplicate an original known position
 return {...EMPTY_WORKOUT_VALUES,position}
}
export function availableWorkoutSlots(original:ProgressSession,heads:readonly CorrectionHead[],exerciseIndex:number){
 const ex=original.exercises[exerciseIndex];if(!ex)return []
 const relevant=new Map(heads.filter(h=>h.sessionId===original.id&&h.exerciseIndex===exerciseIndex).map(h=>[h.setIndex,h.latest.next]))
 const active=Array.from({length:60},(_,i)=>i).filter(i=>{const initial=workoutSlot(ex,i);return initial&&hasWorkoutValues(relevant.get(i)||initial)}).length
 if(active>=30)return []
 const result:{index:number;label:string}[]=[]
 for(let i=0;i<60;i++){
  const initial=workoutSlot(ex,i);if(!initial||hasWorkoutValues(relevant.get(i)||initial))continue
  result.push({index:i,label:initial.position===undefined?`Voce ${i+1} (ripristina)`:`Serie ${initial.position}`})
 }
 return result.sort((a,b)=>(workoutSlot(ex,a.index)?.position??100+a.index)-(workoutSlot(ex,b.index)?.position??100+b.index))
}
export function applyCorrectionHeads(sessions:readonly ProgressSession[],heads:readonly CorrectionHead[]):ProgressSession[]{
 const bySession=new Map<string,CorrectionHead[]>();for(const h of heads){const arr=bySession.get(h.sessionId)||[];arr.push(h);bySession.set(h.sessionId,arr)}
 return sessions.map(s=>{
  const entries=bySession.get(s.id);if(!entries?.length)return s;const corrections:WorkoutCorrection[]=[]
  // Index once per session instead of scanning the same heads for every exercise.
  const byExercise=new Map<number,Map<number,CorrectionHead>>()
  for(const h of entries){let rows=byExercise.get(h.exerciseIndex);if(!rows){rows=new Map();byExercise.set(h.exerciseIndex,rows)}rows.set(h.setIndex,h)}
  const exercises=s.exercises.map((e,ei)=>{
   const relevant=byExercise.get(ei)||new Map<number,CorrectionHead>();const sets:WorkoutSet[]=[]
   const indices=[...e.sets.keys(),...[...relevant.keys()].filter(i=>i>=30).sort((a,b)=>a-b)]
   for(const i of indices){
    const initial=workoutSlot(e,i);if(!initial)continue
    const h=relevant.get(i),row={...initial,...(h?.latest?.next||{}),editIndex:i}
    if(hasWorkoutValues(row))sets.push(row)
    if(h?.latest)for(const ev of [...(h.history||[]),h.latest])corrections.push({exerciseIndex:ei,setIndex:i,previous:{...initial,...ev.previous},next:{...initial,...ev.next},author:ev.author,at:correctionDate(ev.at)})
   }
   // Legacy entries have no known ordinal: keep their original order, then explicit positions.
   sets.sort((a,b)=>(a.position??0)-(b.position??0)||((a.editIndex??0)-(b.editIndex??0)))
   return {...e,skipped:e.skipped&&!sets.length,sets}
  })
  return {...s,exercises,corrections:corrections.sort((a,b)=>a.at.localeCompare(b.at))}
 })
}
