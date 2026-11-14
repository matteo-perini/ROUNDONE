import type {ProgressSheet,RecordedExercise} from './progressModel.ts'
import type {ExerciseRecord} from '../sheets/domain.ts'
import {normalizeEntries,validDate} from './progressModel.ts'
export type OfflineScope={project:string;gym:string;uid:string}
export type WorkoutDraft={sheet:ProgressSheet;entries:RecordedExercise[];prescription:ExerciseRecord[];alternatives:Record<number,number>;date:string;step:number;guided:boolean}
export type PendingWorkout={id:string;sheet:{id:string;title:string};date:string;entries:RecordedExercise[]}
export type OfflineState={version:1;sheets:ProgressSheet[];draft:WorkoutDraft|null;queue:PendingWorkout[]}
export const blankOffline=():OfflineState=>({version:1,sheets:[],draft:null,queue:[]})
export const offlineKey=(s:OfflineScope)=>'lionfit.offline.v1:'+JSON.stringify([s.project,s.gym,s.uid])
export function readOffline(storage:Pick<Storage,'getItem'>,scope:OfflineScope):OfflineState|null{
 const raw=storage.getItem(offlineKey(scope));if(!raw)return null
 const s=JSON.parse(raw) as OfflineState
 if(s.version!==1||!Array.isArray(s.sheets)||!Array.isArray(s.queue)||!('draft' in s))throw new Error('Dati offline non leggibili. Non saranno sovrascritti.')
 return s
}
export function saveOffline(storage:Pick<Storage,'setItem'>,scope:OfflineScope,state:OfflineState){storage.setItem(offlineKey(scope),JSON.stringify(state))}
export function queueWorkout(state:OfflineState,id:string,draft:WorkoutDraft):OfflineState{
 if(!/^[\w-]{3,128}$/.test(id)||!validDate(draft.date))throw new Error('Registrazione non valida.')
 const entries=normalizeEntries(draft.entries)
 if(!entries.some(e=>e.skipped||e.sets.length))throw new Error('Compila una serie o indica un esercizio saltato.')
 if(state.queue.some(x=>x.id===id))return state
 if(state.queue.length>=40)throw new Error('Troppi allenamenti in attesa. Sincronizza prima di salvarne altri.')
 return {...state,draft:null,queue:[...state.queue,{id,sheet:{id:draft.sheet.id,title:draft.sheet.title},date:draft.date,entries}]}
}
export function acknowledgeWorkout(state:OfflineState,id:string):OfflineState{return {...state,queue:state.queue.filter(x=>x.id!==id)}}
export function cacheSheet(state:OfflineState,sheet:ProgressSheet):OfflineState{
 const sheets=state.sheets.filter(x=>x.id!==sheet.id)
 if(sheets.length>=30)throw new Error('Limite di 30 schede scaricate: rimuovine una prima di continuare.')
 return {...state,sheets:[...sheets,JSON.parse(JSON.stringify(sheet))]}
}
export function sameWorkout(existing:Record<string,unknown>,athlete:string,p:PendingWorkout){
 const canonical=(x:unknown):string=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)
 return existing.athleteId===athlete&&existing.createdBy===athlete&&existing.sheetId===p.sheet.id&&existing.sheetTitle===p.sheet.title.slice(0,160)&&existing.performedOn===p.date&&canonical(existing.exercises)===canonical(p.entries)
}
// Called on voluntary sign-out; leave storage intact unless the user confirms loss of unsynced work.
export function clearOfflineForUser(storage:Storage,project:string,uid:string,confirmLoss:()=>boolean):boolean{
 const keys:string[]=[];let hasUnsaved=false
 for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith('lionfit.offline.v1:'))continue;let scope:unknown;try{scope=JSON.parse(k.slice('lionfit.offline.v1:'.length))}catch{continue}if(!Array.isArray(scope)||scope[0]!==project||scope[2]!==uid)continue;keys.push(k);try{const s=JSON.parse(storage.getItem(k)||'null');if(s?.queue?.length||s?.draft)hasUnsaved=true}catch{hasUnsaved=true}}
 if(hasUnsaved&&!confirmLoss())return false
 for(const k of keys)storage.removeItem(k)
 return true
}
