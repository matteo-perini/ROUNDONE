/** PATCH-3: delta per campo delle sole attività V1, senza toccare templateId,
 * templateId2, metadata o altri giorni. Nessuna I/O. */
import {DAY_KEYS,type ProgramDay} from './domain.ts'
export type ActivityChange={path:string;day:typeof DAY_KEYS[number];slot:1|2;expected:string;value:string}
export function activityDelta(base:readonly ProgramDay[],next:readonly ProgramDay[]):ActivityChange[]{
 if(base.length!==7||next.length!==7)throw new Error('I sette giorni sono obbligatori.')
 const changes:ActivityChange[]=[]
 for(const [index,day] of DAY_KEYS.entries())for(const slot of [1,2] as const){
  const key=slot===1?'activity1':'activity2'
  const expected=String(base[index]?.[key]??'')
  const value=String(next[index]?.[key]??'')
  if(value.length>200)throw new Error('Attività troppo lunga (massimo 200 caratteri).')
  if(value!==expected)changes.push({path:`days.${day}.${key}`,day,slot,expected,value})
 }
 return changes
}
export function ensureActivityChangesCurrent(changes:readonly ActivityChange[],days:Record<string,any>):ActivityChange[]{
 const writes:ActivityChange[]=[]
 for(const change of changes){
  const key=change.slot===1?'activity1':'activity2'
  const current=String(days?.[change.day]?.[key]??'')
  if(current===change.value)continue // retry idempotente, nessuna scrittura duplicata
  if(current!==change.expected)throw new Error(`Attività ${change.day} ${change.slot} modificata da un altro Coach: aggiorna e confronta prima di salvare.`)
  writes.push(change)
 }
 return writes
}
export function hasUnsavedActivities(base:readonly ProgramDay[],draft:readonly ProgramDay[]):boolean{
 return base.length===7&&draft.length===7&&activityDelta(base,draft).length>0
}
export function activeWeekDateConflict(items:readonly {id:string;startDate?:string;deletedAt?:unknown}[],startDate:string,exceptId=''):boolean{
 return items.some(w=>w.id!==exceptId&&!w.deletedAt&&w.startDate===startDate)
}
