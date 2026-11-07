/** Lion Fit V1 0.29.7 — regole di dominio condivise, SENZA side effect e senza Firebase.
 * IDs, non nomi. Le liste sono sempre proiezioni delle stesse settimane attive. */
export const DAY_KEYS = ['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'] as const
export const DAY_NAMES = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'] as const
export type DayKey = typeof DAY_KEYS[number]
export type Slot = 1 | 2
export type ActivitySlot = 1 | 2
/** Campi nativi V1 + campi UI Modern: non restringere dati storici a kg/numero. */
export type ExerciseRecord = { id?: string; name: string; sets: number|string; reps: string; rest?: string; kg?: number; exerciseId?: string; load?: string; notes?: string; supersetWithPrevious?: boolean; supersetRest?: string; catalogId?: string; executionMode?: 'normale'|'superset' }
export type Personal = { id:string; title:string; category:string; exercises: ExerciseRecord[]; athleteId:string; sourceId?:string; revision?:number; deletedAt?:string; deletedBy?:string }
export type SharedTemplate = Omit<Personal,'athleteId'> & { athleteId?:never }
export type ProgramDay = { name:string; activities:string[]; activity1:string; activity2:string; templateId:string; templateId2:string }
export type ProgramWeek = { id:string; name:string; athleteId:string; days:ProgramDay[]; startDate?:string; programTitle?:string; weekIndex?:number; totalWeeks?:number; deletedAt?:string; deletedBy?:string }
export type ProtectedCopy = { id:string; athleteId:string; sourceTemplateId:string; title:string; exercises:ExerciseRecord[]; archiveVersion:1; archivedAt:string; archivedBy:string }
export type ArchiveExclusion = { athleteId:string; templateId:string; excludedAt:string }
export type Link = { weekId:string; weekName:string; weekDate:string; weekNumber:number; day:DayKey; dayName:string; dayIndex:number; slot:Slot; templateId:string }
export type GroupedSheet = { sheet:Personal; links:Link[] }
export type Groups = { programmed:GroupedSheet[]; unprogrammed:GroupedSheet[]; orphanLinks:Link[] }
export const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value)) as T
export const active = (value:{deletedAt?:string}) => !value.deletedAt
export function normalizeDay(day:Partial<ProgramDay> & {name:string}):ProgramDay {
 const activities=Array.isArray(day.activities)?day.activities:[]
 const activity1=String(day.activity1 ?? activities[0] ?? '')
 const activity2=String(day.activity2 ?? activities[1] ?? '')
 return {name:day.name,activities:[activity1,activity2].filter(Boolean),activity1,activity2,templateId:String(day.templateId||''),templateId2:String(day.templateId2||'')}
}
export function normalizeWeek(week:ProgramWeek):ProgramWeek { return {...week,days:week.days.map(normalizeDay)} }
/** Create a new independent fighter program for EXACTLY one athlete, starting on Monday. */
export function buildProgramWeeks(athleteId:string,title:string,monday:string,count:number,idFactory:()=>string):ProgramWeek[]{
 if(!athleteId.trim())throw new Error('Atleta obbligatorio.')
 if(!title.trim()||title.length>90)throw new Error('Nome programma obbligatorio (massimo 90 caratteri).')
 if(!Number.isInteger(count)||count<1||count>52)throw new Error('Durata da 1 a 52 settimane.')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(monday))throw new Error('Data non valida.')
 const start=new Date(monday+'T12:00:00')
 if(Number.isNaN(start.getTime())||start.getDay()!==1||start.toISOString().slice(0,10)!==monday)throw new Error('La data deve essere un lunedì valido.')
 return Array.from({length:count},(_,index)=>{const next=new Date(start);next.setDate(next.getDate()+index*7)
  return {id:idFactory(),athleteId,name:title.trim()+' · Settimana '+(index+1),programTitle:title.trim(),weekIndex:index+1,totalWeeks:count,startDate:next.toISOString().slice(0,10),days:DAY_NAMES.map(name=>normalizeDay({name,activities:name==='Domenica'?['OFF']:[]}))}
 })
}

export function assertId(id:string,label:string){if(!id||!String(id).trim())throw new Error(label+' mancante.')}
export function assertSlot(index:number):asserts index is 0|1 {if(index!==0&&index!==1)throw new Error('Slot non valido.')}
export function assertDay(index:number){if(!Number.isInteger(index)||index<0||index>6)throw new Error('Giorno non valido.')}
/** Tutte le settimane attive, non soltanto quella aperta nell'interfaccia. */
export function linksBySheet(weeks:readonly ProgramWeek[],athleteId:string):Map<string,Link[]> {
 const map=new Map<string,Link[]>()
 const ordered=weeks.filter(w=>w.athleteId===athleteId&&active(w)).slice().sort((a,b)=>String(a.startDate||a.id).localeCompare(String(b.startDate||b.id)))
 for(const [i,w] of ordered.entries()) for(let dayIndex=0;dayIndex<7;dayIndex++) {
  const day=w.days[dayIndex];if(!day)continue
  for(const slot of [1,2] as const){const id=String(slot===1?day.templateId:day.templateId2||'').trim();if(!id)continue
   const entry:Link={weekId:w.id,weekName:w.name,weekDate:w.startDate||'',weekNumber:i+1,day:DAY_KEYS[dayIndex],dayName:DAY_NAMES[dayIndex],dayIndex,slot,templateId:id}
   map.set(id,[...(map.get(id)||[]),entry])
  }
 }
 return map
}
export function groupSheets(personal:readonly Personal[],weeks:readonly ProgramWeek[],athleteId:string):Groups {
 const links=linksBySheet(weeks,athleteId),available=new Set<string>()
 const programmed:GroupedSheet[]=[],unprogrammed:GroupedSheet[]=[]
 for(const sheet of personal){if(sheet.athleteId!==athleteId||!active(sheet))continue;available.add(sheet.id);const found=links.get(sheet.id)||[]
  ;(found.length?programmed:unprogrammed).push({sheet,links:found})
 }
 const orphanLinks=[...links].filter(([id])=>!available.has(id)).flatMap(([,items])=>items)
 return {programmed,unprogrammed,orphanLinks}
}
export function activeLinks(weeks:readonly ProgramWeek[],athleteId:string,sheetId:string):Link[]{return linksBySheet(weeks,athleteId).get(sheetId)||[]}
export function protectedPayload(sheet:Personal,archivedBy:string,at:string):ProtectedCopy{
 if(!sheet.title.trim()||sheet.title.length>200||sheet.exercises.length<1||sheet.exercises.length>250)throw new Error('Titolo o elenco esercizi non valido per la copia protetta.')
 return {id:sheet.id,athleteId:sheet.athleteId,sourceTemplateId:sheet.id,title:sheet.title,exercises:copy(sheet.exercises),archiveVersion:1,archivedAt:at,archivedBy}
}
/** Operazioni che agiscono sullo slot esatto: nessuna ricerca per titolo. */
export function linkDay(week:ProgramWeek,athleteId:string,dayIndex:number,slot:Slot,sheetId:string,expectedCurrentId?:string):ProgramWeek {
 if(week.athleteId!==athleteId||!active(week))throw new Error('Settimana non disponibile per questo atleta.')
 assertDay(dayIndex);assertId(sheetId,'ID scheda')
 const out=copy(week),day=out.days[dayIndex];if(!day)throw new Error('Giorno mancante.')
 const key=slot===1?'templateId':'templateId2';if(expectedCurrentId!==undefined&&day[key]!==expectedCurrentId)throw new Error('Collegamento cambiato da un altro coach: aggiorna prima di riprovare.')
 day[key]=sheetId;return out
}
export function unlinkDay(week:ProgramWeek,athleteId:string,dayIndex:number,slot:Slot,expectedSheetId:string):ProgramWeek {
 if(!expectedSheetId)throw new Error('ID atteso mancante.');return linkDaySlotEmpty(week,athleteId,dayIndex,slot,expectedSheetId)
}
function linkDaySlotEmpty(week:ProgramWeek,athleteId:string,dayIndex:number,slot:Slot,expectedId:string):ProgramWeek {
 if(week.athleteId!==athleteId||!active(week))throw new Error('Settimana non disponibile per questo atleta.')
 assertDay(dayIndex)
 const out=copy(week),day=out.days[dayIndex];if(!day)throw new Error('Giorno mancante.')
 const key=slot===1?'templateId':'templateId2';if(day[key]!==expectedId)throw new Error('La scheda è cambiata nello slot: aggiornare prima di scollegare.')
 day[key]='';return out
}
/** Le attività non devono cancellare/sovrascrivere templateId e templateId2. */
export function changeActivity(week:ProgramWeek,dayIndex:number,slot:ActivitySlot,value:string):ProgramWeek{
 assertDay(dayIndex);const out=copy(week),day=out.days[dayIndex];if(!day)throw new Error('Giorno mancante.')
 if(slot===1)day.activity1=value;else day.activity2=value
 day.activities=[day.activity1,day.activity2].filter(Boolean);return out
}
/** I documenti d'archivio sono copie indipendenti, non riferimenti vivi. */
export function canHideProtected(sheetId:string,personal:readonly Personal[],weeks:readonly ProgramWeek[],athleteId:string):boolean{
 return activeLinks(weeks,athleteId,sheetId).length===0
}
