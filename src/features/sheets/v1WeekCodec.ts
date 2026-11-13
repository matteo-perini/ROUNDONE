/**
 * Adattatore senza Firebase: formato delle settimane di ROUNDONE 0.29.7.
 * Firestore usa una MAPPA days con chiavi italiane accentate e non un array.
 * Nessuna conversione deve perdere metadata/estensioni, e salvare le attività
 * non deve MAI riscrivere days interamente o cancellare templateId/templateId2.
 */
import { DAY_KEYS, DAY_NAMES, normalizeDay, type ProgramDay, type ProgramWeek } from './domain.ts'

export type V1DayDocument = {
 activity1?: string
 activity2?: string
 templateId?: string
 templateId2?: string
 [key:string]: unknown
}
export type V1WeekDocument = {
 programTitle?: string
 programId?: string
 weekIndex?: number
 totalWeeks?: number
 startDate?: string
 days?: Partial<Record<typeof DAY_KEYS[number],V1DayDocument>>
 [key:string]: unknown
}
const object = (input:unknown):Record<string,unknown> => input && typeof input==='object' && !Array.isArray(input) ? input as Record<string,unknown> : {}
const str = (value:unknown):string => typeof value==='string' ? value : value==null ? '' : String(value)
const weekNumber = (value:unknown):number|undefined => Number.isSafeInteger(value) && Number(value)>0 ? Number(value):undefined
const dateValid = (iso:string):boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso+'T12:00:00Z')) && new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso

/** Per la UI: le schede sono collegate tramite ID, indipendenti dai titoli. */
export function decodeV1Week(id:string,athleteId:string,raw:V1WeekDocument):ProgramWeek{
 if(!id||!athleteId)throw new Error('ID settimana o atleta mancante.')
 const d=object(raw.days)
 const programTitle=str(raw.programTitle || raw.name || raw.title)
 const weekIndex=weekNumber(raw.weekIndex)
 const label=programTitle ? `${programTitle}${weekIndex?' · Settimana '+weekIndex:''}` : str(raw.startDate||id)
 return {
  id,athleteId,name:label,startDate:str(raw.startDate),
  ...(programTitle?{programTitle}:{}),
  ...(raw.programId?{programId:str(raw.programId)}:{}),
  ...(weekIndex?{weekIndex}:{}),
  ...(weekNumber(raw.totalWeeks)?{totalWeeks:weekNumber(raw.totalWeeks)}:{}),
  ...(raw.deletedAt?{deletedAt:str(raw.deletedAt)}:{}),
  days:DAY_KEYS.map((key,index)=>{
   const source=object(d[key]); const a=str(source.activity1),b=str(source.activity2)
   return normalizeDay({name:DAY_NAMES[index],activities:[a,b].filter(Boolean),activity1:a,activity2:b,templateId:str(source.templateId),templateId2:str(source.templateId2)})
  })
 }
}

/**
 * Ritorno V1 non distruttivo: per modifiche a record già esistenti passare
 * SEMPRE il documento letto da Firestore come `original`, per conservare campi
 * di versioni future, metadata e chiavi aggiuntive dentro days.
 */
export function encodeV1Week(week:ProgramWeek,original:V1WeekDocument={}):V1WeekDocument{
 if(week.days.length!==7)throw new Error('La settimana deve contenere esattamente sette giorni.')
 const originalDays=object(original.days)
 const days:Record<string,V1DayDocument>={}
 for(const [index,key] of DAY_KEYS.entries()){
  const day=week.days[index] as ProgramDay|undefined
  if(!day)throw new Error('Giorno mancante: '+key)
  days[key]={...object(originalDays[key]),activity1:day.activity1,activity2:day.activity2,templateId:day.templateId,templateId2:day.templateId2}
 }
 // Altre chiavi sconosciute nella mappa days rimangono intatte.
 for(const [key,day] of Object.entries(originalDays))if(!(key in days))days[key]=object(day) as V1DayDocument
 const programTitle=week.programTitle ?? original.programTitle ?? week.name
 return {
  ...original,
  programTitle,
  ...((week.programId||original.programId)?{programId:week.programId||original.programId}:{}),
  ...(week.weekIndex!==undefined?{weekIndex:week.weekIndex}:{}),
  ...(week.totalWeeks!==undefined?{totalWeeks:week.totalWeeks}:{}),
  startDate:week.startDate??str(original.startDate),
  days
 }
}

/** Firestore updateDoc: aggiorna solo 14 campi, NON i link nelle settimane. */
export function v1ActivitiesPatch(days:readonly ProgramDay[]):Record<string,string>{
 if(days.length!==7)throw new Error('Servono sette giorni.')
 const patch:Record<string,string>={}
 for(const [i,key] of DAY_KEYS.entries()){
  patch[`days.${key}.activity1`]=str(days[i].activity1).trim()
  patch[`days.${key}.activity2`]=str(days[i].activity2).trim()
 }
 return patch
}

/** Payload delle settimane create: in V1 domenica è OFF di default. */
export function initialV1WeekDocument(programTitle:string,index:number,total:number,monday:string):V1WeekDocument{
 if(!programTitle.trim()||programTitle.trim().length>90)throw new Error('Titolo programma non valido.')
 if(!Number.isInteger(index)||!Number.isInteger(total)||total<1||total>52||index<1||index>total)throw new Error('Numero di settimana non valido.')
 if(!dateValid(monday)||new Date(monday+'T12:00:00Z').getUTCDay()!==1)throw new Error('La data deve essere un lunedì valido.')
 return {programTitle:programTitle.trim(),weekIndex:index,totalWeeks:total,startDate:monday,days:Object.fromEntries(DAY_KEYS.map(day=>[day,{activity1:day==='domenica'?'OFF':'',activity2:'',templateId:'',templateId2:''}]))}
}

/** IDs personali effettivamente usati, indipendenti da nome ed ordine. */
export function v1LinkedPersonalIds(source:V1WeekDocument):string[]{
 const found=new Set<string>()
 const days=object(source.days)
 for(const key of DAY_KEYS){
  const d=object(days[key])
  for(const slot of ['templateId','templateId2']){
   const id=str(d[slot]).trim()
   if(id)found.add(id)
  }
 }
 return [...found]
}

/** Replica la duplicazione della V1: stesso contenuto giorni e link, NUOVO id. */
export function duplicateV1WeekDocument(source:V1WeekDocument,targetMonday:string):V1WeekDocument{
 if(!dateValid(targetMonday))throw new Error('Data di duplicazione non valida.')
 if(!source.days)throw new Error('La settimana origine è priva dei giorni.')
 const days=Object.fromEntries(Object.entries(object(source.days)).map(([key,v])=>[key,{...object(v)}]))
 return {programTitle:str(source.programTitle||'Programma').replace(/\s*\(Copia\)$/i,''),...(source.programId?{programId:source.programId}:{}),startDate:targetMonday,days}
}

/** Calendario puro UTC: niente salti o slittamenti al cambio ora estiva/solare. */
export function advanceV1Monday(startMonday:string,deltaWeeks:number):string{
 if(!Number.isInteger(deltaWeeks)||!dateValid(startMonday)||new Date(startMonday+'T12:00:00Z').getUTCDay()!==1)throw new Error('Data/lunedi non validi.')
 const utc=Date.parse(startMonday+'T12:00:00Z')+deltaWeeks*7*86400000
 return new Date(utc).toISOString().slice(0,10)
}

/** Piano puro per la duplicazione multipla: date consecutive e ID originali invariati. */
export function planV1WeekCopies(source:V1WeekDocument,firstMonday:string,count:number):V1WeekDocument[]{
 if(!Number.isInteger(count)||count<1||count>12)throw new Error('Numero di copie non valido (1–12).')
 return Array.from({length:count},(_,i)=>duplicateV1WeekDocument(source,advanceV1Monday(firstMonday,i)))
}
