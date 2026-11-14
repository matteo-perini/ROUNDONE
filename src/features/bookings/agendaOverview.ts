import {romeParts, type Booking, type Service} from './bookingPolicy.ts'
/** Upcoming list independent of the calendar selection; the backend window is bounded. */
export function upcomingRows<T extends Booking>(rows:readonly T[],now:number,coach='all',service:Service|'all'='all'):T[]{
 return rows.filter(b=>b.status==='confirmed'&&b.startMs+b.durationMinutes*60_000>now&&b.startMs<now+31*86_400_000&&(coach==='all'||b.coachId===coach)&&(service==='all'||b.service===service)).sort((a,b)=>a.startMs-b.startMs||a.id.localeCompare(b.id))
}
export function groupAgendaRows<T extends Booking>(rows:readonly T[]){
 const groups=new Map<string,T[]>()
 for(const row of rows){const date=romeParts(row.startMs).date;const group=groups.get(date)||[];group.push(row);groups.set(date,group)}
 return [...groups].map(([date,bookings])=>({date,bookings}))
}
export function upcomingQueryWindow(now:number){return {from:now-2*60*60_000,to:now+31*86_400_000}}
/** The existing Firestore protocol supports disjoint moves as old cancellation + new reservation in one commit. */
export function disjointMove(old:Booking,newStart:number):boolean{
 return Number.isSafeInteger(newStart)&&newStart%1_800_000===0&&old.startMs!==newStart&&(newStart>=old.startMs+old.durationMinutes*60_000||newStart+old.durationMinutes*60_000<=old.startMs)
}
