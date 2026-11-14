/** A roster filter is presentation only: never use it to resolve a fixed athlete
 * coming from a specific day or personal editor. No fallback to another athlete. */
export type DayEditorIntent={athleteId:string;weekId:string;day:number;slot:1|2;expected:string}
type Query=Readonly<Record<string,unknown>>
const validId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v&&!v.includes('/')
export const hasDayEditorIntent=(q:Query)=>q.day!==undefined||q.slot!==undefined
export function parseDayEditorIntent(q:Query):DayEditorIntent|null{
 if(!validId(q.athleteId)||!validId(q.weekId)||typeof q.day!=='string'||! /^[0-6]$/.test(q.day)|| (q.slot!=='1'&&q.slot!=='2'))return null
 const expected=q.expectedSlotId===undefined?'':q.expectedSlotId
 if(expected!==''&&!validId(expected))return null
 return {athleteId:q.athleteId,weekId:q.weekId,day:Number(q.day),slot:Number(q.slot) as 1|2,expected}
}
export function resolveEditorAthlete<T extends {id:string;gymId:string}>(all:readonly T[],visible:readonly T[],gymId:string,selectedId:string,fixedId:unknown,fixed:boolean):T|null{
 const id=fixed?fixedId:selectedId
 if(!validId(id)||!validId(gymId))return null
 return (fixed?all:visible).find(a=>a.id===id&&a.gymId===gymId)??null
}
