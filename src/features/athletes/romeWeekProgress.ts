/** Calendario di Roma, indipendente dall'inizio delle settimane legacy e dalle attività. */
import {romeParts} from '../bookings/bookingPolicy.ts'
export function romeDayIndex(nowMs:number):number{
 const iso=romeParts(nowMs).date
 const day=new Date(iso+'T12:00:00Z').getUTCDay()
 return (day+6)%7 // lun=0, dom=6
}
export function romeWeekDayNumber(nowMs:number):number{return romeDayIndex(nowMs)+1}
/** Verifica appartenenza senza assumere che la data legacy sia lunedì. */
export function isDateInStoredWeek(startDate:string|undefined,nowMs:number):boolean{
 if(!startDate||!/^\d{4}-\d{2}-\d{2}$/.test(startDate))return false
 const start=Date.parse(startDate+'T12:00:00Z')
 if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==startDate)return false
 const current=Date.parse(romeParts(nowMs).date+'T12:00:00Z')
 const delta=Math.round((current-start)/86400000)
 return delta>=0&&delta<7
}
