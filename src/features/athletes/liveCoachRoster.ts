import type {RosterProfile,RosterAthlete} from './coachRoster'
import {coachMembership} from './coachMembership'
export type {RosterAthlete}
export function labCoachRoster(docs:readonly RosterProfile[],gymId:string):RosterAthlete[]{
 if(!gymId||gymId.includes('/')||gymId.startsWith('demo-'))throw new Error('Palestra non valida.')
 return docs.flatMap(({id,data})=>{
  if(!id||id.includes('/')||data.gymId!==gymId||data.role!=='athlete')return []
  const name=[data.name,data.surname].filter(v=>typeof v==='string'&&v.trim()).join(' ').trim()
  return [{id,gymId,name:name||`Atleta ${id.slice(0,6)}`,email:String(data.email||''),...coachMembership(data)}]
 }).sort((a,b)=>a.name.localeCompare(b.name,'it'))
}
export function maySelectLabAthlete(xs:readonly RosterAthlete[],gymId:string,id:string){return !!id&&xs.some(a=>a.id===id&&a.gymId===gymId)}
