/** LionFit Progressi 360: pure helpers; no writes to legacy sheets. */
import type {ExerciseRecord,Personal} from '../sheets/domain'
import type {HistoricalArchive} from '../athletes/labArchive'
export type WorkoutSet = {kg:number|null;reps:number|null}
export type RecordedExercise = {key:string;name:string;plannedSets:string;plannedReps:string;skipped:boolean;sets:WorkoutSet[]}
export type ProgressSession = {id:string;athleteId:string;sheetId:string;sheetTitle:string;performedOn:string;createdBy:string;exercises:RecordedExercise[];createdAt?:unknown}
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
  const sets=e.sets.filter(s=>s.kg!==null||s.reps!==null).map(s=>{
   if(s.kg!==null&&(!Number.isFinite(s.kg)||s.kg<0||s.kg>2000))throw new Error('Carico non valido: usa kg da 0 a 2000.')
   if(s.reps!==null&&(!Number.isInteger(s.reps)||s.reps<1||s.reps>300))throw new Error('Ripetizioni non valide: usa numeri interi da 1 a 300.')
   return {kg:s.kg,reps:s.reps}
  })
  return {...e,skipped:false,sets}
 })
}
export function exerciseSeries(sessions:readonly ProgressSession[],sheetId:string,key:string,onlyReps:number|null=null){
 return sessions.filter(s=>s.sheetId===sheetId).flatMap(s=>s.exercises.filter(e=>e.key===key&&!e.skipped).map(e=>{
  const valid=e.sets.filter(x=>x.kg!==null&&x.reps!==null&&x.kg>=0&&x.reps>0)
  const chosen=onlyReps===null?valid:valid.filter(x=>x.reps===onlyReps)
  if(!chosen.length)return null
  const max=Math.max(...chosen.map(x=>x.kg!))
  const volume=chosen.reduce((sum,x)=>sum+x.kg!*x.reps!,0)
  const candidates=chosen.filter(x=>x.reps!<=10)
  const estimate=candidates.length?Math.max(...candidates.map(x=>x.kg!*(1+x.reps!/30))):null
  return {id:s.id,date:s.performedOn,kg:max,reps:chosen.find(x=>x.kg===max)?.reps??0,volume,estimate}
 })).filter((x):x is NonNullable<typeof x>=>x!==null).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
}
export function sheetSummary(sessions:readonly ProgressSession[],sheetId:string){
 const relevant=sessions.filter(s=>s.sheetId===sheetId)
 return relevant.sort((a,b)=>b.performedOn.localeCompare(a.performedOn)).map(s=>{
  const completed=s.exercises.filter(e=>!e.skipped&&e.sets.some(x=>x.kg!==null||x.reps!==null)).length
  const volume=s.exercises.flatMap(e=>e.sets).reduce((sum,x)=>sum+(x.kg??0)*(x.reps??0),0)
  return {id:s.id,date:s.performedOn,completed,total:s.exercises.length,volume}
 })
}
export function progressMetrics(entries:readonly RecordedExercise[]){
 const completed=entries.filter(e=>!e.skipped&&e.sets.some(s=>s.kg!==null||s.reps!==null)).length
 const volume=entries.reduce((sum,e)=>sum+e.sets.reduce((ss,s)=>ss+(s.kg??0)*(s.reps??0),0),0)
 const max=Math.max(0,...entries.flatMap(e=>e.sets.map(s=>s.kg??0)))
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
   const key=e.key
   if(!first.has(key))first.set(key,best)
   const baseline=first.get(key)!
   if(baseline>0){sum+=100*best/baseline;count++}
  }
  return {id:s.id,date:s.performedOn,index:count?Math.round(sum/count*10)/10:null,compared:count}
 })
}
