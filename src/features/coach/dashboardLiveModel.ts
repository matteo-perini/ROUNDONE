/** Read-only projections for the LIVE Coach dashboard. No writes, queries or ACLs here.
 * Every counter is tied to a concrete source; missing timestamps are never invented.
 */
export type DashboardTemplate={id:string;title:string;deletedAt?:unknown;createdMs?:number}
export type DashboardWeek={id:string;name:string;programTitle?:string;programId?:string;deletedAt?:unknown;createdMs?:number;days:Record<string,unknown>}
export type DashboardPersonal={id:string;title?:string;deletedAt?:unknown}
export type DashboardAthleteWeeks={athleteId:string;weeks:DashboardWeek[];personal:DashboardPersonal[]}
export type DashboardBooking={id:string;athleteId:string;coachId:string;startMs:number;createdMs?:number;discipline:string;service:string;status:'confirmed'|'cancelled'}
export type DashboardAppointment=DashboardBooking &{athleteName:string;coachName:string}
export type DashboardActivity={id:string;kind:'booking'|'template'|'week';label:string;at:number;url:string}
export type DashboardDay={date:string;label:string;booking:number;template:number;week:number;total:number}
export const DASHBOARD_DAY_MS=86_400_000
const validMs=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0
const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',year:'numeric'})
export const romeDay=(ms:number)=>dayFormatter.format(new Date(ms))

/** One unique personal-template ID per athlete. One program ID (or legacy title) per athlete,
 * even if a program contains 52 week documents. This is NOT the count of weeks.
 */
export function summarizeAthletePrograms(rows:readonly DashboardAthleteWeeks[]){
 const programs=new Set<string>(),linked=new Set<string>(),unlinked=new Set<string>()
 let activeWeeks=0,athletesWithProgram=0
 const weeksForActivity:{id:string;athleteId:string;name:string;createdMs:number}[]=[]
 for(const row of rows){
  const weeks=row.weeks.filter(w=>!w.deletedAt)
  if(weeks.length)athletesWithProgram++
  activeWeeks+=weeks.length
  const linkedIds=new Set<string>()
  for(const week of weeks){
   const title=String(week.programTitle||week.name||'Programma senza titolo').replace(/\s*[·-]\s*Settimana\s+\d+.*$/i,'').trim().toLocaleLowerCase('it')
   programs.add(row.athleteId+'|'+(week.programId?'id:'+week.programId:'legacy:'+title.replace(/\s*\(copia\)$/i,'')))
   for(const day of Object.values(week.days||{})){
    if(!day||typeof day!=='object')continue
    const data=day as Record<string,unknown>
    for(const key of ['templateId','templateId2']){
     const id=typeof data[key]==='string'?data[key].trim():''
     if(id)linkedIds.add(id)
    }
   }
   if(validMs(week.createdMs))weeksForActivity.push({id:week.id,athleteId:row.athleteId,name:week.name,createdMs:week.createdMs})
  }
  for(const personal of row.personal){
   if(personal.deletedAt)continue
   const key=row.athleteId+'|'+personal.id
   if(linkedIds.has(personal.id))linked.add(key)
   else unlinked.add(key)
  }
 }
 return {programs:programs.size,athletesWithProgram,activeWeeks,assigned:linked.size,unassigned:unlinked.size,weeksForActivity}
}
export function upcomingDashboardBookings(bookings:readonly DashboardBooking[], now:number, athleteNames:Readonly<Record<string,string>>, uid:string, horizonDays=60):DashboardAppointment[]{
 return bookings.filter(b=>b.status==='confirmed'&&b.startMs>=now&&b.startMs<now+horizonDays*DASHBOARD_DAY_MS)
  .sort((a,b)=>a.startMs-b.startMs).map(b=>({...b,athleteName:athleteNames[b.athleteId]||'Atleta',coachName:b.coachId===uid?'Tu':'Coach della palestra'}))
}
/** A day represents scheduled (not necessarily attended) appointments plus
 * new archive templates and newly CREATED program weeks with known timestamps.
 */
export function buildDashboardActivity(bookings:readonly DashboardBooking[],templates:readonly DashboardTemplate[],weeks:readonly {id:string;athleteId:string;name:string;createdMs:number}[],now:number):{days:DashboardDay[];recent:DashboardActivity[]}{
 const currentDay=romeDay(now)
 const anchor=Date.parse(currentDay+'T12:00:00Z')
 const days:Array<DashboardDay>=Array.from({length:30},(_,i)=>{
  const date=romeDay(anchor-(29-i)*DASHBOARD_DAY_MS)
  return {date,label:date.slice(8,10),booking:0,template:0,week:0,total:0}
 })
 const byDate=new Map(days.map(d=>[d.date,d]))
 const count=(ms:number,key:'booking'|'template'|'week')=>{
  if(!validMs(ms))return
  const day=byDate.get(romeDay(ms));if(day){day[key]++;day.total++}
 }
 const recent:DashboardActivity[]=[]
 const addRecent=(event:DashboardActivity)=>{
  if(validMs(event.at)&&event.at<=now&&event.at>=now-30*DASHBOARD_DAY_MS)recent.push(event)
 }
 for(const b of bookings){
  if(b.status!=='confirmed')continue
  count(b.startMs,'booking')
  if(validMs(b.createdMs))addRecent({id:'b-'+b.id,kind:'booking',label:'Nuova prenotazione · '+(b.discipline||b.service),at:b.createdMs,url:'/coach/prenotazioni'})
 }
 for(const t of templates){
  if(t.deletedAt||!validMs(t.createdMs))continue
  count(t.createdMs,'template')
  addRecent({id:'t-'+t.id,kind:'template',label:'Scheda creata · '+t.title,at:t.createdMs,url:'/coach/archivio'})
 }
 for(const w of weeks){
  count(w.createdMs,'week')
  addRecent({id:'w-'+w.athleteId+'-'+w.id,kind:'week',label:'Settimana programmata · '+w.name,at:w.createdMs,url:'/coach/atleti'})
 }
 recent.sort((a,b)=>b.at-a.at)
 return {days,recent:recent.slice(0,6)}
}
