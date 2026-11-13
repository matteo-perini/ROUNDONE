/** PATCH 11 — Raggruppamento in sola lettura, compatibile con le settimane V1.
 * Solo i programmi creati dalla PATCH 11 hanno un programId persistente.
 * Le settimane legacy senza ID si raggruppano per titolo, senza migrazione.
 */
import type {ProgramWeek} from './domain'

export type ProgramFamily={id:string;title:string;weeks:ProgramWeek[];startDate:string;endDate:string}
export type WeekIdentity={id:string;programId?:string;programTitle?:string;name?:string;startDate?:string;deletedAt?:string}
export function programTitleOf(w:WeekIdentity):string{
 return String(w.programTitle||w.name||'Programma').replace(/\s*(?:·|-)\s*Settimana\s*\d+.*$/i,'').replace(/\s*\(Copia\)$/i,'').trim()||'Programma'
}
export function programKeyOf(w:WeekIdentity):string{
 const pid=typeof w.programId==='string'?w.programId.trim():''
 return pid?'id:'+pid:'legacy:'+programTitleOf(w).toLocaleLowerCase('it')
}
export function groupActivePrograms(weeks:readonly ProgramWeek[]):ProgramFamily[]{
 const buckets=new Map<string,ProgramWeek[]>()
 for(const w of weeks){if(w.deletedAt)continue
  const key=programKeyOf(w);buckets.set(key,[...(buckets.get(key)||[]),w])
 }
 return [...buckets].map(([id,items])=>{
  const ordered=items.slice().sort((a,b)=>(a.startDate||a.id).localeCompare(b.startDate||b.id))
  const lastMonday=ordered.at(-1)?.startDate||''
  const finalDate=lastMonday&&/^\d{4}-\d{2}-\d{2}$/.test(lastMonday)?isoAfterDays(lastMonday,6):lastMonday
  return {id,title:programTitleOf(ordered[0]),weeks:ordered,startDate:ordered[0]?.startDate||'',endDate:finalDate}
 }).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id))
}
export function programForWeek(programs:readonly ProgramFamily[],weekId:string):ProgramFamily|undefined{
 return programs.find(p=>p.weeks.some(w=>w.id===weekId))
}
/** Trova il primo lunedì non occupato, senza inventare una nuova data se mancano date. */
export function firstVacantMonday(weeks:readonly Pick<ProgramWeek,'startDate'|'deletedAt'>[],afterMonday:string,advance:(date:string,weeks:number)=>string):string{
 const occupied=new Set(weeks.filter(w=>!w.deletedAt).map(w=>w.startDate).filter(Boolean))
 let target=advance(afterMonday,1)
 for(let i=0;i<=occupied.size;i++){
  if(!occupied.has(target))return target
  target=advance(target,1)
 }
 throw new Error('Non è disponibile una data di duplicazione.')
}
export function activeWeekOn(weeks:readonly ProgramWeek[],isoDay:string):ProgramWeek|undefined{
 return weeks.find(w=>!w.deletedAt&&!!w.startDate&&isoDay>=w.startDate&&isoDay<isoAfterDays(w.startDate,7))
}
function isoAfterDays(date:string,days:number):string{
 const stamp=Date.parse(date+'T12:00:00Z')
 return Number.isNaN(stamp)?'':new Date(stamp+days*86400000).toISOString().slice(0,10)
}
