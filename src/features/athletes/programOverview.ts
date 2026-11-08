/** PATCH 3/7 — Riepilogo delle settimane assegnate, sola lettura.
 * Un programma esiste anche con giorni privi di schede; una scheda personale
 * da sola NON costituisce un programma. Non inventare date o percentuali.
 */
import type {ProgramWeek} from '../sheets/domain'
export type ProgramOverview={
 hasProgram:boolean
 phase:'active'|'future'|'expired'|'unknown'|'none'
 weekNumber?:number
 totalWeeks?:number
 remainingPercent?:number
 remainingLabel?:string
 title?:string
}
type Cycle={title:string;start:Date;end:Date;total:number}
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
function baseTitle(week:ProgramWeek):string{
 return (week.programTitle||week.name||'Programma').replace(/\s*[·-]\s*Settimana\s+\d+.*$/i,'').trim()||'Programma'
}
export function programOverview(weeks:readonly ProgramWeek[],now=new Date()):ProgramOverview{
 const live=weeks.filter(week=>!week.deletedAt)
 if(live.length===0)return {hasProgram:false,phase:'none'}
 const knownCycles=new Map<string,Cycle>()
 const legacy=new Map<string,Date[]>()
 for(const week of live){
  const date=parseDate(week.startDate)
  if(!date)continue
  const title=baseTitle(week)
  const idx=week.weekIndex,tot=week.totalWeeks
  if(typeof idx==='number'&&Number.isSafeInteger(idx)&&idx>=1&&idx<=52&&
     typeof tot==='number'&&Number.isSafeInteger(tot)&&tot>=idx&&tot<=52){
   const start=addDays(date,-7*(idx-1)),end=addDays(start,tot*7)
   knownCycles.set(`${title}|${dayCount(start)}|${dayCount(end)}`,{title,start,end,total:tot})
  }else{
   legacy.set(title,[...(legacy.get(title)||[]),date])
  }
 }
 const cycles=[...knownCycles.values()]
 // Legacy: raggruppa solo settimane contigue dello stesso programma.
 for(const [title,dates] of legacy){
  const distinct=[...new Map(dates.map(d=>[dayCount(d),d])).values()].sort((a,b)=>a.getTime()-b.getTime())
  let batch:Date[]=[]
  const finish=()=>{if(!batch.length)return;const start=batch[0];cycles.push({title,start,end:addDays(batch[batch.length-1],7),total:batch.length});batch=[]}
  for(const date of distinct){
   if(batch.length&&dayCount(date)-dayCount(batch[batch.length-1])!==7)finish()
   batch.push(date)
  }
  finish()
 }
 if(!cycles.length)return {hasProgram:true,phase:'unknown',remainingLabel:'Date non disponibili'}
 // Preferisci il programma attivo più recente; poi quello futuro più vicino;
 // se non ce ne sono, mostra quello scaduto più recente.
 const current=cycles.filter(c=>now>=c.start&&now<c.end).sort((a,b)=>b.start.getTime()-a.start.getTime())
 const upcoming=cycles.filter(c=>now<c.start).sort((a,b)=>a.start.getTime()-b.start.getTime())
 const past=cycles.filter(c=>now>=c.end).sort((a,b)=>b.end.getTime()-a.end.getTime())
 const chosen=current[0]||upcoming[0]||past[0]
 if(!chosen)return {hasProgram:true,phase:'unknown',remainingLabel:'Date non disponibili'}
 const phase=now<chosen.start?'future':now>=chosen.end?'expired':'active'
 const frac=phase==='future'?1:phase==='expired'?0:Math.max(0,Math.min(1,(chosen.end.getTime()-now.getTime())/(chosen.end.getTime()-chosen.start.getTime())))
 const weekNumber=phase==='future'?1:phase==='expired'?chosen.total:Math.min(chosen.total,Math.max(1,Math.floor((dayCount(now)-dayCount(chosen.start))/7)+1))
 return {hasProgram:true,phase,title:chosen.title,weekNumber,totalWeeks:chosen.total,
  remainingPercent:Math.round(frac*1000)/10,
  remainingLabel:phase==='expired'?'Programma terminato':phase==='future'?`Inizio ${chosen.start.toLocaleDateString('it-IT',{day:'numeric',month:'short'})}`:leftLabel(chosen.end,now)}
}
