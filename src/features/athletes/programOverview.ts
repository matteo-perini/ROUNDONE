/** PATCH 3/7 — Riepilogo delle settimane assegnate, sola lettura.
 * Un programma esiste anche con giorni privi di schede; una scheda personale
 * da sola NON costituisce un programma. Non inventare date o percentuali.
 */
import type {ProgramWeek} from '../sheets/domain'
import {groupActivePrograms} from '../sheets/programFamilies.ts'
export type ProgramOverview={
 hasProgram:boolean
 phase:'active'|'future'|'expired'|'unknown'|'none'
 weekNumber?:number
 totalWeeks?:number
 remainingPercent?:number
 remainingLabel?:string
 title?:string
}
type Cycle={title:string;start:Date;end:Date;total:number;weeks:ProgramWeek[]}
const DAY_MS=86400000
function parseDate(value?:string):Date|null{
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null
 const [y,m,d]=value.split('-').map(Number)
 const result=new Date(y,m-1,d)
 return result.getFullYear()===y&&result.getMonth()===m-1&&result.getDate()===d?result:null
}
function addDays(date:Date,n:number):Date{const out=new Date(date);out.setDate(out.getDate()+n);return out}
function dayCount(date:Date):number{return Math.round(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/DAY_MS)}
function leftLabel(end:Date,now:Date):string{
 const days=Math.max(0,dayCount(end)-dayCount(now))
 if(days===0)return 'Scadenza oggi'
 if(days===1)return 'Manca 1 giorno'
 if(days<14)return `Mancano ${days} giorni`
 return `Mancano ${Math.ceil(days/7)} settimane`
}
export function programOverview(weeks:readonly ProgramWeek[],now=new Date()):ProgramOverview{
 const live=weeks.filter(week=>!week.deletedAt)
 if(!live.length)return {hasProgram:false,phase:'none'}
 const cycles:Cycle[]=groupActivePrograms(live).flatMap(p=>{
  const start=parseDate(p.startDate),last=parseDate(p.endDate)
  return start&&last?[{title:p.title,start,end:addDays(last,1),total:p.weeks.length,weeks:p.weeks}]:[]
 })
 if(!cycles.length)return {hasProgram:true,phase:'unknown',remainingLabel:'Date non disponibili'}
 // Ogni programma viene trattato come un ciclo indipendente, anche con una pausa.
 const current=cycles.filter(c=>now>=c.start&&now<c.end).sort((a,b)=>b.start.getTime()-a.start.getTime())
 const upcoming=cycles.filter(c=>now<c.start).sort((a,b)=>a.start.getTime()-b.start.getTime())
 const past=cycles.filter(c=>now>=c.end).sort((a,b)=>b.end.getTime()-a.end.getTime())
 const chosen=current[0]||upcoming[0]||past[0]
 if(!chosen)return {hasProgram:true,phase:'unknown',remainingLabel:'Date non disponibili'}
 const phase=now<chosen.start?'future':now>=chosen.end?'expired':'active'
 const frac=phase==='future'?1:phase==='expired'?0:Math.max(0,Math.min(1,(chosen.end.getTime()-now.getTime())/(chosen.end.getTime()-chosen.start.getTime())))
 const currentIndex=chosen.weeks.findIndex(w=>{const start=parseDate(w.startDate);return !!start&&now>=start&&now<addDays(start,7)})
 const nextIndex=chosen.weeks.findIndex(w=>{const start=parseDate(w.startDate);return !!start&&now<start})
 const weekNumber=phase==='future'?1:phase==='expired'?chosen.total:currentIndex>=0?currentIndex+1:nextIndex>=0?nextIndex+1:chosen.total
 const isBreak=phase==='active'&&currentIndex<0
 return {hasProgram:true,phase,title:chosen.title,weekNumber,totalWeeks:chosen.total,
  remainingPercent:Math.round(frac*1000)/10,
  remainingLabel:phase==='expired'?'Programma terminato':phase==='future'?`Inizio ${chosen.start.toLocaleDateString('it-IT',{day:'numeric',month:'short'})}`:isBreak?'Settimana di pausa':leftLabel(chosen.end,now)}
}
