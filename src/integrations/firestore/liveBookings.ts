/** Firestore Spark bookings 2M/L — accesso esclusivo all'emulatore tramite caller verificato.
 * Non esporta client produzione e non crea client all'importazione.
 */
import { collection, doc, documentId, getDocFromServer, getDocs, query, where, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore'
import { candidateSlots, romeParts, slotId, validateConfig, workingRanges, disciplineAllowed, SLOT_MS,
  type CoachConfig, type Service, type Slot, type Booking } from '../../features/bookings/bookingPolicy.ts'

// La palestra e sempre quella derivata dal profilo Auth verificato.
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
 return {coachId:uid,displayName:displayName.slice(0,100),active:false,
  services:{fighter:true,pesi:true},durations:{fighter:60,pesi:120},
  noticeHours:12,cancelHours:12,maxDays:30,mode:'always',from:'',to:'',
  weekly,exceptions:{},holidays:[],lastPreparedDate:''}
}
function safeGym(gym:string){return !!gym && gym.length<=120 && !gym.includes('/') && !gym.includes('..') && !gym.startsWith('demo-')}
function validatedGym(gym:string){if(!safeGym(gym))throw new Error('PALESTRA_NON_VALIDA');return gym}
function validOwner(write: {uid:string;gymId:string;role:string},coachId:string){
 if(!safeGym(write.gymId)||write.uid!==coachId||!['titolare','collaboratore'].includes(write.role))
  throw new Error('OPERAZIONE_COACH_NON_AUTORIZZATA')
}
/** Aggiorna la configurazione esatta del solo Coach autenticato. */
export async function saveCoachConfig(db:Firestore,caller:{uid:string;gymId:string;role:string},cfg:LiveCoachConfig){
 const BOOKING_GYM=validatedGym(caller.gymId)
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
 if(validateConfig(cfg)!==null)return []
 const ranges=workingRanges(cfg,date)
 if(!ranges.length)return []
 const out:number[]=[]
 // Mezzanotte UTC del giorno precedente fino alla fine del successivo:
 // nessuna assunzione su DST, ci basiamo sulla data locale Europe/Rome.
 const start=Date.parse(date+'T00:00:00Z')-24*3600_000
 for(let ms=start;ms<start+72*3600_000;ms+=SLOT_MS){
  if(romeParts(ms).date!==date || ms<=nowMs+30*60_000 || ms>nowMs+29*24*3600_000)continue
  const local=romeParts(ms).time
  if(ranges.some(r=>local>=r[0] && local<r[1]))out.push(ms)
 }
 return out
}
export async function prepareDaySlots(db:Firestore,caller:{uid:string;gymId:string;role:string},cfg:LiveCoachConfig,date:string){
 const BOOKING_GYM=validatedGym(caller.gymId)
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
 const BOOKING_GYM=validatedGym(caller.gymId)
 if(caller.role!=='atleta'||caller.gymId!==BOOKING_GYM)throw new Error('SOLO_ATLETA')
 if(!discipline.trim()||discipline.trim().length>64||!disciplineAllowed(service,discipline.trim()))throw new Error('DISCIPLINA_NON_VALIDA')
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
 const BOOKING_GYM=validatedGym(caller.gymId)
 if(caller.gymId!==BOOKING_GYM||!caller.uid||id.includes('/'))throw new Error('OPERAZIONE_NON_AUTORIZZATA')
 await runTransaction(db,async tx=>{
  const bookingRef=doc(db,'gyms',BOOKING_GYM,bookingPaths.reservations,id)
  const bookingSnap=await tx.get(bookingRef)
  if(!bookingSnap.exists())throw new Error('PRENOTAZIONE_NON_TROVATA')
  const booking=toReservation(bookingSnap.id,bookingSnap.data())
  if(!booking||booking.status!=='confirmed'||booking.startMs<=Date.now())throw new Error('PRENOTAZIONE_NON_ANNULLABILE')
  if(caller.role==='atleta'){
   if(booking.athleteId!==caller.uid)throw new Error('PRENOTAZIONE_NON_TUA')
   const cfg=await tx.get(doc(db,'gyms',BOOKING_GYM,bookingPaths.config,booking.coachId))
   if(!cfg.exists()||!Number.isInteger(cfg.data().cancelHours)||booking.startMs-Date.now()<=cfg.data().cancelHours*3_600_000)
    throw new Error('PREAVVISO_DISDETTA_SCADUTO')
  }
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
/** PATCH-5: sync disponibilità simile a V1, senza toccare gli appuntamenti booked.
 * Non fa delete fisico di prenotazioni. Temporaneamente disattiva la config
 * (riduce i nuovi booking durante sync) e usa transazioni CAS in blocchi.
 * Se una transazione fallisce, resta disattiva per sicurezza: ripetere.
 */
export async function synchronizeCoachAvailability(db:Firestore,caller:{uid:string;gymId:string;role:string},desired:LiveCoachConfig,days=30):Promise<{created:number;retired:number;keptBooked:number;unchanged:number;days:number}>{
 const BOOKING_GYM=validatedGym(caller.gymId)
 validOwner(caller,desired.coachId)
 if(!Number.isInteger(days)||days<1||days>30)throw new Error('GIORNI_NON_VALIDI')
 const invalid=validateConfig(desired);if(invalid)throw new Error(invalid)
 const now=Date.now(),start=now-now%SLOT_MS,end=now+(days+1)*24*3_600_000
 const col=collection(db,'gyms',BOOKING_GYM,bookingPaths.slots)
 const configRef=doc(db,'gyms',BOOKING_GYM,bookingPaths.config,caller.uid)
 // 1) disattiva: anche dopo un errore i booking futuri non ripartono su orari obsoleti
 await saveCoachConfig(db,caller,{...desired,active:false,lastPreparedDate:desired.lastPreparedDate||''})
 const planning={...desired,active:desired.active}
 const expected=new Map<string,number>()
 if(planning.active){
  const startDay=romeParts(now).date
  for(let i=0;i<=days;i++){
   const date=shiftRomeDate(startDay,i)
   for(const ms of openTimesForDate(planning,date,now)){
    if(ms>now&&ms<end)expected.set(slotId(caller.uid,ms),ms)
   }
  }
 }
 const lower=`${caller.uid}_${String(start).padStart(13,'0')}`
 const upper=`${caller.uid}_${String(end).padStart(13,'0')}`
 const read=await getDocs(query(col,where(documentId(),'>=',lower),where(documentId(),'<',upper)))
 const ids=[...new Set([...read.docs.map(d=>d.id),...expected.keys()])].sort()
 const report={created:0,retired:0,keptBooked:0,unchanged:0,days}
 for(let i=0;i<ids.length;i+=40){
  const batch=ids.slice(i,i+40)
  const delta=await runTransaction(db,async tx=>{
   // Tutte le letture PRIMA delle scritture; gli ID mantengono il formato originale.
   const snapshots=await Promise.all(batch.map(id=>tx.get(doc(col,id))))
   const partial={created:0,retired:0,keptBooked:0,unchanged:0}
   for(let j=0;j<batch.length;j++){
    const key=batch[j],ref=doc(col,key),snap=snapshots[j],ms=expected.get(key)
    if(snap.exists()){
     const slot=toSlot(snap.data())
     if(!slot||slot.coachId!==caller.uid||slotId(slot.coachId,slot.startMs)!==key)
      throw new Error('SLOT_NON_COERENTE: interrotto senza modifica di questo blocco')
     if(slot.status==='booked'){partial.keptBooked++;continue}
     if(ms===undefined){tx.delete(ref);partial.retired++}
     else partial.unchanged++
    }else if(ms!==undefined){
     tx.set(ref,{coachId:caller.uid,startAt:Timestamp.fromMillis(ms),endAt:Timestamp.fromMillis(ms+SLOT_MS),status:'open',bookingId:''})
     partial.created++
    }
   }
   return partial
  },{maxAttempts:5})
  report.created+=delta.created;report.retired+=delta.retired
  report.keptBooked+=delta.keptBooked;report.unchanged+=delta.unchanged
 }
 // 3) riattiva solo a completamento; in caso di errore rimane inattivo.
 await saveCoachConfig(db,caller,{...desired,lastPreparedDate:romeParts(Date.now()).date})
 return report
}
/** No DST arithmetic on epoch for calendar dates. */
function shiftRomeDate(date:string,days:number):string{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)
}

/** Legge con timestamp server: mai fidarsi di data e coach provenienti dall'URL. */
export async function assertBookingLiveUser(db:Firestore,session:{uid:string;gymId:string;role:string}){
 const BOOKING_GYM=validatedGym(session.gymId)
 if(!safeGym(session.gymId)||!['atleta','collaboratore','titolare'].includes(session.role))
  throw new Error('ACCOUNT_NON_AUTORIZZATO')
 const snap=await getDocFromServer(doc(db,'users',session.uid))
 if(!snap.exists()||snap.data().gymId!==session.gymId||
  snap.data().role!==(session.role==='atleta'?'athlete':'admin'))
  throw new Error('IDENTITA_FIREBASE_NON_VALIDA')
 return {name:String(snap.data().name||session.uid).slice(0,100)}
}
