/** Fase 2M/K: l'Atleta vede SOLO il proprio UID nell'Emulator. Nessuna scrittura.
 * Questa funzione aggiunge una barriera lato client alle Rules, non le sostituisce.
 */
import type { ProgramWeek, Groups } from '../sheets/domain'
import { romeParts } from '../bookings/bookingPolicy.ts'
export type AthleteLabIdentity={uid:string;gymId:string;role:string}
export function assertAthleteLabIdentity(
 session:AthleteLabIdentity,
 profile: { gymId?:unknown;role?:unknown } | undefined,
):{gymId:string;athleteId:string}{
 if(session.gymId!=='gym_lab2c_a'||session.role!=='atleta'||!session.uid||session.uid.includes('/'))
  throw new Error('La vista Atleta Firebase è riservata all’Atleta fittizio autenticato della palestra A.')
 if(profile?.gymId!==session.gymId||profile?.role!=='athlete')
  throw new Error('Il profilo Atleta non corrisponde alla sessione Firebase verificata.')
 return {gymId:session.gymId,athleteId:session.uid}
}
export function liveWeekForDate(weeks: readonly ProgramWeek[],today=new Date()):ProgramWeek|null {
 const active=weeks.filter(w=>!w.deletedAt).sort((a,b)=>String(a.startDate||a.id).localeCompare(String(b.startDate||b.id)))
 const current=romeParts(today.getTime()).date
 return active.find(w=>{if(!w.startDate||!/^\d{4}-\d{2}-\d{2}$/.test(w.startDate))return false
  const elapsed=Math.round((Date.parse(`${current}T12:00:00Z`)-Date.parse(`${w.startDate}T12:00:00Z`))/86400000)
  return elapsed>=0&&elapsed<7
 })??null
}
export function linkedSheetsForDay(groups:Groups,weekId:string,dayIndex:number){
 const found=new Map<string,Groups['programmed'][number]['sheet']>()
 for(const group of groups.programmed)for(const link of group.links)
  if(link.weekId===weekId&&link.dayIndex===dayIndex)found.set(group.sheet.id,group.sheet)
 return [...found.values()]
}
