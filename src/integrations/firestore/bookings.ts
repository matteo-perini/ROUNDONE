/** Firestore Spark bookings 2M/L — accesso esclusivo all'emulatore tramite caller verificato.
 * Non esporta client produzione e non crea client all'importazione.
 */
import { collection, doc, getDocFromServer, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore'
import { candidateSlots, romeParts, slotId, validateConfig, workingRanges, SLOT_MS,
  type CoachConfig, type Service, type Slot, type Booking } from '../../features/bookings/bookingPolicy.ts'

export const BOOKING_GYM = 'gym_lab2c_a' as const
export const bookingPaths = {
 config: 'spark_booking_coaches', slots:'spark_booking_slots', reservations:'spark_booking_reservations'
} as const
export type LiveReservation=Booking & { discipline:string }
export type LiveCoachConfig=CoachConfig & { displayName:string;lastPreparedDate:string }
export function toReservation(id:string,raw:Record<string,unknown>):LiveReservation|null {
 const start=(raw.startAt as {toMillis?:()=>number}|undefined)?.toMillis?.()
 if(typeof start!=='number'||!Number.isSafeInteger(start)||
  !['fighter','pesi'].includes(String(raw.service))||
  ![60,120].includes(Number(raw.durationMinutes))||
  !['confirmed','cancelled'].includes(String(raw.status)))return null
 return {id,startMs:start,athleteId:String(raw.athleteId||''),coachId:String(raw.coachId||''),
  service:raw.service as Service,durationMinutes:raw.durationMinutes as 60|120,
  status:raw.status as 'confirmed'|'cancelled',discipline:String(raw.discipline||'')}
}
export function toSlot(raw:Record<string,unknown>):Slot|null {
 const start=(raw.startAt as {toMillis?:()=>number}|undefined)?.toMillis?.()
 if(typeof start!=='number'||!Number.isSafeInteger(start)||
   !['open','booked'].includes(String(raw.status)))return null
 return {coachId:String(raw.coachId||''),startMs:start,status:raw.status as Slot['status'],
  bookingId:String(raw.bookingId??'')}
}
export function toCoachConfig(id:string,raw:Record<string,unknown>):LiveCoachConfig|null {
 const cfg={...raw,coachId:id} as unknown as LiveCoachConfig
 return cfg.coachId===id && validateConfig(cfg)===null && typeof cfg.displayName==='string' ? cfg:null
}
export function createCoachDefault(uid:string,displayName:string):LiveCoachConfig {
 const weekly:CoachConfig['weekly']={}
 for(const day of ['lun','mar','mer','gio','ven','sab','dom'] as const){
  weekly[day]={enabled:day!=='dom',ranges:[{from:'09:00',to:'13:00'}]}
 }
 return {coachId:uid,displayName:displayName.slice(0,100),active:true,
  services:{fighter:true,pesi:true},durations:{fighter:60,pesi:120},
  noticeHours:1,cancelHours:12,maxDays:30,mode:'always',from:'',to:'',
  weekly,exceptions:{},holidays:[],lastPreparedDate:''}
}
function validOwner(write: {uid:string;gymId:string;role:string},coachId:string){
 if(write.gymId!==BOOKING_GYM||write.uid!==coachId||!['titolare','collaboratore'].includes(write.role))
  throw new Error('OPERAZIONE_COACH_NON_AUTORIZZATA')
}
/** Aggiorna la configurazione esatta del solo Coach autenticato. */
export async function saveCoachConfig(db:Firestore,caller:{uid:string;gymId:string;role:string},cfg:LiveCoachConfig){
 validOwner(caller,cfg.coachId)
 const error=validateConfig(cfg); if(error)throw new Error(error)
 if(cfg.displayName.length>100)throw new Error('NOME_COACH_TROPPO_LUNGO')
 const {coachId,displayName,active,services,durations,noticeHours,cancelHours,maxDays,mode,from,to,
  weekly,exceptions,holidays,lastPreparedDate}=cfg
 await runTransaction(db,async tx=>{
  const target=doc(db,'gyms',BOOKING_GYM,bookingPaths.config,caller.uid)
  await tx.get(target)
  tx.set(target,{coachId,displayName,active,services,durations,noticeHours,cancelHours,maxDays,
   mode:mode||'always',from:from||'',to:to||'',weekly,exceptions:exceptions||{},
   holidays:holidays||[],lastPreparedDate:lastPreparedDate||'',updatedAt:serverTimestamp()})
 })
}
/** Slot canonici, 30 min UTC. Nessuna sovrascrittura di slot esistenti. */
export function openTimesForDate(cfg:CoachConfig,date:string,nowMs:number):number[]{
 if(validateConfig(cfg)!==null || workingRanges(cfg,date).length===0)return []
 const out:number[]=[]
 // Mezzanotte UTC del giorno precedente fino alla fine del successivo:
 // nessuna assunzione su DST, ci basiamo sulla data locale Europe/Rome.
 const start=Date.parse(date+'T00:00:00Z')-24*3600_000
 for(let ms=start;ms<start+72*3600_000;ms+=SLOT_MS){
  if(romeParts(ms).date!==date || ms<=nowMs+30*60_000 || ms>nowMs+29*24*3600_000)continue
  const local=romeParts(ms).time
  if(workingRanges(cfg,date).some(r=>local>=r[0] && local<r[1]))out.push(ms)
 }
 return out
}
export async function prepareDaySlots(db:Firestore,caller:{uid:string;gymId:string;role:string},cfg:LiveCoachConfig,date:string){
 validOwner(caller,cfg.coachId)
 const times=openTimesForDate(cfg,date,Date.now());let created=0,already=0
 if(times.length>32)throw new Error('TROPPI_SLOT_PER_GIORNO')
 for(const startMs of times){
  const target=doc(db,'gyms',BOOKING_GYM,bookingPaths.slots,slotId(cfg.coachId,startMs))
  const done=await runTransaction(db,async tx=>{
   const old=await tx.get(target)
   if(old.exists()){
    const existing=toSlot(old.data())
    if(!existing || existing.startMs!==startMs ||existing.coachId!==cfg.coachId)throw new Error('SLOT_ESISTENTE_NON_COERENTE')
    return false
   }
   tx.set(target,{coachId:cfg.coachId,startAt:Timestamp.fromMillis(startMs),
    endAt:Timestamp.fromMillis(startMs+SLOT_MS),status:'open',bookingId:''})
   return true
  })
  if(done)created++;else already++
 }
 return {created,already}
}
export async function reserve(db:Firestore,caller:{uid:string;gymId:string;role:string},
 cfg:LiveCoachConfig,service:Service,discipline:string,startMs:number){
 if(caller.role!=='atleta'||caller.gymId!==BOOKING_GYM)throw new Error('SOLO_ATLETA')
 if(!discipline.trim()||discipline.trim().length>64)throw new Error('DISCIPLINA_NON_VALIDA')
 if(!Number.isSafeInteger(startMs)||startMs%SLOT_MS)throw new Error('ORARIO_NON_VALIDO')
 const duration=cfg.durations[service]
 if(!cfg.services[service]||!cfg.active||![60,120].includes(duration))throw new Error('SERVIZIO_NON_DISPONIBILE')
 const id=doc(collection(db,'gyms',BOOKING_GYM,bookingPaths.reservations)).id
 await runTransaction(db,async tx=>{
  const cfgRef=doc(db,'gyms',BOOKING_GYM,bookingPaths.config,cfg.coachId)
  const currentCfgSnap=await tx.get(cfgRef)
  const currentCfg=currentCfgSnap.exists()?toCoachConfig(cfg.coachId,currentCfgSnap.data()):null
  if(!currentCfg||!currentCfg.active||!currentCfg.services[service]||currentCfg.durations[service]!==duration)
   throw new Error('CONFIGURAZIONE_COACH_CAMBIATA')
  const times=Array.from({length:duration/30},(_,i)=>startMs+i*SLOT_MS)
  const refs=times.map(ms=>doc(db,'gyms',BOOKING_GYM,bookingPaths.slots,slotId(cfg.coachId,ms)))
  const snapshots=[]
  for(const ref of refs)snapshots.push(await tx.get(ref))
  const slots=snapshots.map(s=>s.exists()?toSlot(s.data()):null)
  if(slots.some((s,i)=>!s||s.coachId!==cfg.coachId||s.startMs!==times[i]||s.status!=='open'||s.bookingId!==''))
   throw new Error('FASCIA_OCCUPATA')
  const valid=candidateSlots(currentCfg,slots as Slot[],service,romeParts(startMs).date,Date.now())
  if(!valid.some(s=>s.startMs===startMs&&s.free))throw new Error('ORARIO_NON_PIU_DISPONIBILE')
  if(startMs <= Date.now()+15*60_000)throw new Error('PREAVVISO_DI_PRENOTAZIONE')
  refs.forEach(ref=>tx.update(ref,{status:'booked',bookingId:id}))
  tx.set(doc(db,'gyms',BOOKING_GYM,bookingPaths.reservations,id),{
   athleteId:caller.uid,coachId:cfg.coachId,service,discipline:discipline.trim(),
   startAt:Timestamp.fromMillis(startMs),durationMinutes:duration,status:'confirmed',createdAt:serverTimestamp()
  })
 },{maxAttempts:5})
 return id
}
export async function cancelReservation(db:Firestore,caller:{uid:string;gymId:string;role:string},
 id:string){
 if(caller.gymId!==BOOKING_GYM||!caller.uid||id.includes('/'))throw new Error('OPERAZIONE_NON_AUTORIZZATA')
 await runTransaction(db,async tx=>{
  const bookingRef=doc(db,'gyms',BOOKING_GYM,bookingPaths.reservations,id)
  const bookingSnap=await tx.get(bookingRef)
  if(!bookingSnap.exists())throw new Error('PRENOTAZIONE_NON_TROVATA')
  const booking=toReservation(bookingSnap.id,bookingSnap.data())
  if(!booking||booking.status!=='confirmed'||booking.startMs<=Date.now())throw new Error('PRENOTAZIONE_NON_ANNULLABILE')
  if(caller.role==='atleta'&&booking.athleteId!==caller.uid)throw new Error('PRENOTAZIONE_NON_TUA')
  if(caller.role==='collaboratore'&&booking.coachId!==caller.uid)throw new Error('COACH_NON_AUTORIZZATO')
  if(!['atleta','titolare','collaboratore'].includes(caller.role))throw new Error('RUOLO_NON_VALIDO')
  const refs=Array.from({length:booking.durationMinutes/30},(_,i)=>
   doc(db,'gyms',BOOKING_GYM,bookingPaths.slots,slotId(booking.coachId,booking.startMs+i*SLOT_MS)))
  const snaps=[];for(const ref of refs)snaps.push(await tx.get(ref))
  if(snaps.some(s=>!s.exists()||s.data().status!=='booked'||s.data().bookingId!==id))throw new Error('SLOT_NON_COERENTI')
  tx.update(bookingRef,{status:'cancelled',cancelledAt:serverTimestamp()})
  refs.forEach(ref=>tx.update(ref,{status:'open',bookingId:''}))
 },{maxAttempts:5})
}
/** Legge con timestamp server: mai fidarsi di data e coach provenienti dall'URL. */
export async function assertBookingLabUser(db:Firestore,session:{uid:string;gymId:string;role:string}){
 if(session.gymId!==BOOKING_GYM||!['atleta','collaboratore','titolare'].includes(session.role))
  throw new Error('ACCOUNT_DI_TEST_NON_AUTORIZZATO')
 const snap=await getDocFromServer(doc(db,'users',session.uid))
 if(!snap.exists()||snap.data().gymId!==BOOKING_GYM||
  snap.data().role!==(session.role==='atleta'?'athlete':'admin'))
  throw new Error('IDENTITA_FIREBASE_NON_VALIDA')
 return {name:String(snap.data().name||session.uid).slice(0,100)}
}
