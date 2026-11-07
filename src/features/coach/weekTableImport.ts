/** ROUNDONE admin.html: importazione non distruttiva della tabella settimanale.
 * Esattamente come V1 prepara SOLO bozze, senza cambiare schede o scrivere Firebase.
 */
import {DAY_NAMES,type ProgramDay} from '../sheets/domain.ts'
export type ImportedDay={dayIndex:number;name:string;activity1:string;activity2:string}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'')
export function parseWeekTable(input:string):ImportedDay[]{
 const rows:ImportedDay[]=[],seen=new Set<number>()
 for(const line of input.split(/\r?\n/).filter(x=>x.trim())){
  const cells=(line.includes('\t')?line.split('\t'):line.split(';')).map(x=>x.trim().replace(/^"|"$/g,''))
  const dayIndex=DAY_NAMES.findIndex(d=>normalize(d)===normalize(cells[0]||''))
  if(dayIndex<0||seen.has(dayIndex))continue
  seen.add(dayIndex)
  rows.push({dayIndex,name:DAY_NAMES[dayIndex],activity1:(cells[1]||'').slice(0,200),activity2:(cells[2]||'').slice(0,200)})
 }
 return rows
}
export function applyWeekTableDraft(days:readonly ProgramDay[],rows:readonly ImportedDay[]):ProgramDay[]{
 if(days.length!==7)throw new Error('La settimana deve contenere sette giorni.')
 const result=days.map(d=>({...d,activities:[...d.activities]}))
 for(const row of rows){
  if(!Number.isInteger(row.dayIndex)||row.dayIndex<0||row.dayIndex>=7)throw new Error('Giorno importato non valido.')
  const day=result[row.dayIndex]
  day.activity1=row.activity1;day.activity2=row.activity2
  day.activities=[row.activity1,row.activity2].filter(Boolean)
 }
 return result
}
