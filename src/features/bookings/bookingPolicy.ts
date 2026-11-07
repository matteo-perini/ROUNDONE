/**
 * LionFit 2M/L — logica condivisa per Prenotazioni su Firebase Emulator.
 * Funzioni pure riutilizzate da UI e test, senza accessi o modifiche al database.
 */
export const SLOT_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as const
const romeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})
export type Service = 'fighter' | 'pesi'
export type BookingStatus = 'confirmed' | 'cancelled'
export type CalendarView = 'day' | 'week' | 'month'
export type CalendarHistory = 'next' | 'history' | 'all'
export type Booking = { id: string; athleteId: string; coachId: string; service: Service;
  startMs: number; durationMinutes: 60 | 120; status: BookingStatus }
export type BookingFilter = { date: string; view: CalendarView; coachId?: string;
  service?: Service | 'all'; history?: CalendarHistory; nowMs: number }
export type Range = readonly [string, string] | { from: string; to: string }
export type DayConfig = { enabled: boolean; ranges: Range[] }
export type CoachConfig = { coachId: string; active: boolean; services: Record<Service,boolean>;
  durations: Record<Service,60|120>; noticeHours: number; cancelHours: number;
  maxDays: number; mode?: 'always'|'period'; from?: string; to?: string;
  weekly: Partial<Record<(typeof DAYS)[number], DayConfig>>;
  exceptions?: Record<string,DayConfig>; holidays?: {from:string;to:string}[] }
export type Slot = { coachId: string; startMs: number; status: 'open'|'booked'; bookingId: string }

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('DATA_NON_VALIDA')
  const parsed = new Date(date + 'T12:00:00Z')
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date)
    throw new Error('DATA_NON_VALIDA')
}
export function romeParts(ms: number): {date:string; time:string; minute:number} {
  if (!Number.isFinite(ms)) throw new Error('TIMESTAMP_NON_VALIDO')
  const parts = Object.fromEntries(romeFormatter.formatToParts(new Date(ms))
    .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))
  return { date:`${parts.year}-${parts.month}-${parts.day}`,
    time:`${parts.hour}:${parts.minute}`, minute:Number(parts.hour)*60+Number(parts.minute) }
}
export function shiftDate(date:string, days:number):string {
  assertDate(date)
  if (!Number.isInteger(days) || Math.abs(days)>400) throw new Error('OFFSET_NON_VALIDO')
  return new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10)
}
export function mondayOf(date:string):string {
  assertDate(date)
  const dow=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7
  return shiftDate(date,-dow)
}
export function isInPeriod(date:string,view:CalendarView,anchor:string):boolean {
  assertDate(anchor)
  assertDate(date)
  if (view==='day') return date===anchor
  if (view==='week') { const mon=mondayOf(anchor);return date>=mon&&date<=shiftDate(mon,6) }
  if (view==='month') return date.slice(0,7)===anchor.slice(0,7)
  throw new Error('VISTA_NON_VALIDA')
}
export function isHistorical(b: Booking,nowMs:number):boolean {
  return b.status==='cancelled' || b.startMs+b.durationMinutes*60_000<=nowMs
}
export function filterBookings(rows:readonly Booking[],filter:BookingFilter):Booking[] {
  assertDate(filter.date)
  const history=filter.history ?? 'all'
  return rows.filter(b=>{
    if (filter.coachId&&filter.coachId!=='all'&&b.coachId!==filter.coachId) return false
    if (filter.service&&filter.service!=='all'&&b.service!==filter.service) return false
    if (history==='next' && isHistorical(b,filter.nowMs)) return false
    if (history==='history' && !isHistorical(b,filter.nowMs)) return false
    return isInPeriod(romeParts(b.startMs).date,filter.view,filter.date)
  }).sort((a,b)=>a.startMs-b.startMs || a.id.localeCompare(b.id))
}
/** STEP 3Q: conteggi in un solo passaggio dopo il filtro (prima O(n²)).
 * Non cambia quali appuntamenti sono visibili né le Rules Firebase. */
export function countsByDay(rows:readonly Booking[],filter:BookingFilter):Record<string,number> {
  const counts=new Map<string,number>()
  for(const b of filterBookings(rows,filter)){
    const date=romeParts(b.startMs).date
    counts.set(date,(counts.get(date)||0)+1)
  }
  return Object.fromEntries([...counts].sort(([a],[b])=>a.localeCompare(b)))
}
export function countsByCoach(rows:readonly Booking[],filter:BookingFilter):Record<string,number> {
  const counts=new Map<string,number>()
  for(const b of filterBookings(rows,filter))counts.set(b.coachId,(counts.get(b.coachId)||0)+1)
  return Object.fromEntries([...counts].sort(([a],[b])=>a.localeCompare(b)))
}
export function isValidTime(t:string):boolean { return /^([01]\d|2[0-3]):(00|30)$/.test(t) }
function minute(t:string):number { const [h,m]=t.split(':').map(Number);return h*60+m }
function allRanges(day?:DayConfig): [string,string][] {
  return (day?.ranges||[]).map(range=>{
    if(Array.isArray(range))return [range[0],range[1]]
    const object=range as {from:string;to:string}
    return [object.from,object.to]
  }) as [string,string][]
}
function normalizedRanges(day?:DayConfig): [string,string][] {
  return day?.enabled ? allRanges(day) : []
}
export function validateConfig(c:CoachConfig):string|null {
  if (![60,120].includes(c.durations?.fighter)||![60,120].includes(c.durations?.pesi))return 'DURATA_NON_VALIDA'
  if (!Number.isInteger(c.noticeHours)||c.noticeHours<0||c.noticeHours>168)return 'PREAVVISO_NON_VALIDO'
  if (!Number.isInteger(c.cancelHours)||c.cancelHours<0||c.cancelHours>168)return 'DISDETTA_NON_VALIDA'
  if (!Number.isInteger(c.maxDays)||c.maxDays<1||c.maxDays>30)return 'ORIZZONTE_NON_VALIDO'
  if (c.mode==='period' && (!c.from||!c.to||c.from>c.to))return 'PERIODO_NON_VALIDO'
  for (const d of DAYS){const ranges=allRanges(c.weekly?.[d]);if(ranges.length>4)return 'TROPPE_FASCE'
    for(let i=0;i<ranges.length;i++){const [a,b]=ranges[i];if(!isValidTime(a)||!isValidTime(b)||minute(a)>=minute(b))return 'FASCIA_NON_VALIDA'
      if(i>0 && minute(ranges[i-1][1])>minute(a))return 'FASCE_SOVRAPPOSTE'} }
  for (const [date,settings] of Object.entries(c.exceptions??{})) {
    try{assertDate(date)}catch{return 'ECCEZIONE_NON_VALIDA'}
    const ranges=allRanges(settings)
    for(const [a,b] of ranges) if(!isValidTime(a)||!isValidTime(b)||minute(a)>=minute(b))return 'ECCEZIONE_NON_VALIDA'
  }
  for(const x of c.holidays??[]){try{assertDate(x.from);assertDate(x.to)}catch{return 'FERIE_NON_VALIDE'}
    if(x.from>x.to)return 'FERIE_NON_VALIDE'}
  return null
}
export function workingRanges(config:CoachConfig,date:string):[string,string][] {
  assertDate(date)
  if (!config.active || config.mode==='period' && (date<(config.from??'')||date>(config.to??'')))return []
  if((config.holidays??[]).some(h=>h.from<=date&&date<=h.to))return []
  const index=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7
  const day=config.exceptions?.[date]??config.weekly?.[DAYS[index]]
  return normalizedRanges(day)
}
export function isAllowedSlot(config:CoachConfig,ms:number):boolean {
  const local=romeParts(ms)
  return workingRanges(config,local.date).some(([start,end])=>
    minute(start)<=local.minute && local.minute<minute(end))
}
export function slotId(coachId:string,ms:number):string {
  if(!coachId || coachId.includes('/') || !Number.isSafeInteger(ms) || ms%SLOT_MS!==0)
    throw new Error('SLOT_ID_NON_VALIDO')
  return `${coachId}_${ms}`
}
export type SlotCandidate = {startMs:number;endMs:number;date:string;time:string;free:boolean;busy:boolean;late:boolean;slotIds:string[]}
export function candidateSlots(config:CoachConfig,slots:readonly Slot[],service:Service,date:string,nowMs:number):SlotCandidate[] {
  assertDate(date)
  if(validateConfig(config)!==null||!config.active||!config.services[service])return []
  const duration=config.durations[service],count=duration/30
  const nowDate=romeParts(nowMs).date
  if(date<nowDate||date>shiftDate(nowDate,Math.min(config.maxDays,30)))return []
  const byMs=new Map<number,Slot>()
  const duplicates=new Set<number>()
  // Slot simultanei di Coach diversi sono indipendenti: il conflitto vale SOLO all'interno dello stesso Coach.
  for(const s of slots.filter(s=>s.coachId===config.coachId)){
    if(byMs.has(s.startMs))duplicates.add(s.startMs)
    byMs.set(s.startMs,s)
  }
  return [...byMs.values()].sort((a,b)=>a.startMs-b.startMs).flatMap(row=>{
    if(row.coachId!==config.coachId||row.startMs%SLOT_MS!==0||duplicates.has(row.startMs))return []
    const local=romeParts(row.startMs),endMs=row.startMs+duration*60_000
    // Le Rules usano un limite assoluto in millisecondi, non il solo calendario civile.
    if(local.date!==date||romeParts(endMs-1).date!==date||row.startMs>=nowMs+config.maxDays*DAY_MS)return []
    const segments=Array.from({length:count},(_,i)=>byMs.get(row.startMs+i*SLOT_MS))
    if(segments.some((s,i)=>!s||s.coachId!==config.coachId||duplicates.has(row.startMs+i*SLOT_MS)
      ||!isAllowedSlot(config,row.startMs+i*SLOT_MS)))return []
    const busy=segments.some(s=>s?.status!=='open'||s?.bookingId!=='')
    const late=row.startMs<=nowMs+Math.max(config.noticeHours*3_600_000,15*60_000)
    return [{startMs:row.startMs,endMs,date,time:local.time,free:!busy&&!late,busy,late,
      slotIds:segments.map(s=>slotId(config.coachId,s!.startMs))}]
  })
}
export type Canceller = {role:'athlete'|'coach'|'owner';uid:string;gymId:string}
export function canCancel(caller:Canceller,b:Booking,bookingGymId:string,cancelHours:number,nowMs:number):boolean {
  if (caller.gymId!==bookingGymId||b.status!=='confirmed'||b.startMs<=nowMs)return false
  if(caller.role==='athlete')return caller.uid===b.athleteId && b.startMs-nowMs>cancelHours*3_600_000
  if(caller.role==='coach')return caller.uid===b.coachId
  return caller.role==='owner'
}
export function atomicSlotIds(b:Booking):string[] {
  if(![60,120].includes(b.durationMinutes)||b.startMs%SLOT_MS!==0)throw new Error('PRENOTAZIONE_NON_VALIDA')
  return Array.from({length:b.durationMinutes/30},(_,i)=>slotId(b.coachId,b.startMs+i*SLOT_MS))
}

/** PATCH-5: cataloghi visibili in ROUNDONE. Valori salvati non vengono rinominati. */
export const SERVICE_DISCIPLINES:Readonly<Record<Service,readonly string[]>>={
 fighter:['MMA','Boxe','K1','BJJ','Grappling','Karate tradizionale','Karate agonistico','Jiu-jitsu tradizionale'],
 pesi:['Nuova scheda','Consulenza','Programmazione mensile','Aggiornamento','Pesistica','Valutazione']
}
export function disciplineAllowed(service:Service,name:string):boolean{
 // The former label stays valid for historical bookings and older app clients.
 return SERVICE_DISCIPLINES[service].includes(name)||(service==='pesi'&&name==='Aggiornamento scheda')
}
/** Colori basati su UID, non sull'ordine di iscrizione/configurazione. */
export function coachColorIndex(uid:string,buckets=4):number{
 if(!uid||!Number.isSafeInteger(buckets)||buckets<1)throw new Error('COACH_COLOR_NON_VALIDO')
 let hash=2166136261
 for(let i=0;i<uid.length;i++)hash=Math.imul(hash^uid.charCodeAt(i),16777619)
 return (hash>>>0)%buckets
}
export function addCalendarMonth(date:string,delta:number):string{
 assertDate(date)
 if(!Number.isInteger(delta)||Math.abs(delta)>24)throw new Error('MESE_NON_VALIDO')
 const [y,m]=date.split('-').map(Number)
 const first=new Date(Date.UTC(y,m-1+delta,1,12))
 return first.toISOString().slice(0,10)
}
export function bookingDisplayStatus(b:Booking,nowMs:number):'Confermato'|'Concluso'|'Disdetto'{
 if(b.status==='cancelled')return 'Disdetto'
 return b.startMs+b.durationMinutes*60_000<=nowMs?'Concluso':'Confermato'
}
export function calendarCoachDayCounts(rows:readonly Booking[],filter:BookingFilter,date:string):Record<string,number>{
 const visible=filterBookings(rows,filter)
 const out:Record<string,number>={}
 for(const b of visible)if(romeParts(b.startMs).date===date)out[b.coachId]=(out[b.coachId]||0)+1
 return out
}
export function isBookableCalendarDay(config:CoachConfig,service:Service,slots:readonly Slot[],date:string,nowMs:number):boolean{
 return candidateSlots(config,slots,service,date,nowMs).some(s=>s.free)
}
