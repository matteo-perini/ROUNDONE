/** Calendar-based classification only: no destructive archival or data migration. */
import {groupSheets,linksBySheet,type Personal,type ProgramWeek} from './domain.ts'
import {groupActivePrograms,type ProgramFamily} from './programFamilies.ts'
import {semanticSheetSignature,type TemplateLike} from './semanticDedup.ts'
export function romeDate(now=Date.now()):string{
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return `${v('year')}-${v('month')}-${v('day')}`
}
export function weekEnd(start?:string):string{
 if(!start||!/^\d{4}-\d{2}-\d{2}$/.test(start))return ''
 const ms=Date.parse(start+'T12:00:00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==start)return ''
 return new Date(ms+6*86400000).toISOString().slice(0,10)
}
export function weekExpired(w:Pick<ProgramWeek,'startDate'>,today:string){const end=weekEnd(w.startDate);return !!end&&end<today}
export function weekOrdinal(w:ProgramWeek,all:readonly ProgramWeek[]){return w.weekIndex||Math.max(1,all.findIndex(x=>x.id===w.id)+1)}
export function partitionPrograms(weeks:readonly ProgramWeek[],today:string,archived=false):ProgramFamily[]{
 return groupActivePrograms(weeks).flatMap(p=>{
  const picked=p.weeks.filter(w=>weekExpired(w,today)===archived).map(w=>({...w,weekIndex:weekOrdinal(w,p.weeks)}))
  return picked.length?[{...p,weeks:picked,startDate:picked[0].startDate||'',endDate:weekEnd(picked.at(-1)?.startDate)}]:[]
 })
}
export function activeAssignmentGroups(personal:readonly Personal[],weeks:readonly ProgramWeek[],athlete:string,today:string){
 // Even trashed weeks are evidence of previous programming, not free assignment.
 const all=linksBySheet(weeks.map(w=>({...w,deletedAt:undefined})),athlete),current=weeks.filter(w=>!weekExpired(w,today))
 const groups=groupSheets(personal,current,athlete)
 return {...groups,unprogrammed:groups.unprogrammed.filter(g=>!all.has(g.sheet.id)||g.sheet.unprogrammedAssigned===true)}
}
type Model=TemplateLike & {id:string}
export function assignmentBlock(model:Model,personal:readonly Personal[],weeks:readonly ProgramWeek[],athlete:string,today:string):string{
 if(personalTemplateInTrash(model.id,personal,athlete))return 'Scheda personale nel Cestino: ripristinala prima di assegnarla.'
 const sig=semanticSheetSignature(model)
 const same=(p:Personal)=>p.id===model.id||p.sourceId===model.id||semanticSheetSignature(p)===sig
 const groups=activeAssignmentGroups(personal,weeks,athlete,today)
 const ids=new Set([model.id,...personal.filter(p=>p.athleteId===athlete&&same(p)).map(p=>p.id)])
 const links=linksBySheet(weeks.filter(w=>!weekExpired(w,today)),athlete)
 if([...ids].some(id=>links.has(id)))return 'Scheda già presente nella programmazione attuale o futura.'
 if(groups.unprogrammed.some(g=>same(g.sheet)))return 'Scheda già assegnata senza programmazione.'
 return ''
}
// Assignment writes use the canonical model ID as the personal document ID.
// Never use semantic equality as a trash marker: independent models can have the same content.
export function personalTemplateInTrash(modelId:string,personal:readonly Pick<Personal,'id'|'athleteId'|'deletedAt'>[],athlete:string):boolean{
 return personal.some(p=>p.id===modelId&&p.athleteId===athlete&&!!p.deletedAt)
}
export function availableAssignmentModels<T extends {id:string;deletedAt?:unknown}>(models:readonly T[],personal:readonly Pick<Personal,'id'|'athleteId'|'deletedAt'>[],athlete:string):T[]{
 const trashed=new Set(personal.filter(p=>p.athleteId===athlete&&p.deletedAt).map(p=>p.id))
 return models.filter(m=>!m.deletedAt&&!trashed.has(m.id))
}
export function athleteMatches(name:string,query:string):boolean{
 const norm=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('it').replace(/[’‘'`]/gu,'').replace(/[-‐‑–—]/gu,' ').trim()
 const n=norm(name);return norm(query).split(/\s+/).every(word=>n.includes(word))
}
