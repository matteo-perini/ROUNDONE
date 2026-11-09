/**
 * ADATTATORE FIRESTORE V1 — PRONTO PER TEST SU EMULATORE, NON ATTIVATO NELLA UI.
 * Nessuna inizializzazione Firebase qui: riceve Firestore configurato esternamente.
 * Verificare Rules, autenticazione, indici, concorrenza con Emulator Suite prima di usarlo.
 */
import {
 collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp,
 deleteField, type Firestore, type Unsubscribe, type DocumentData, type Transaction, type DocumentSnapshot,
} from 'firebase/firestore'
import {DAY_KEYS, type DayKey, type ProgramWeek, type Personal, groupSheets, protectedPayload} from '../../features/sheets/domain'
import {decodeV1Week, type V1WeekDocument} from '../../features/sheets/v1WeekCodec'

const part=(v:string,label:string)=>{if(!v||v.includes('/')||v.trim()!==v)throw new Error(`${label} non valido.`);return v}
const path=(gym:string,athlete:string):[string,string,string,string]=>['gyms',part(gym,'Palestra'),'athlete_programs',part(athlete,'Atleta')]
const dayKey=(day:DayKey)=>{if(!DAY_KEYS.includes(day))throw new Error('Giorno non valido.');return day}
const slotKey=(slot:1|2)=>slot===1?'templateId':slot===2?'templateId2':(()=>{throw new Error('Slot non valido.')})()
const rawToWeek=(id:string,athleteId:string,data:DocumentData):ProgramWeek=>decodeV1Week(id,athleteId,data as V1WeekDocument)
const rawToPersonal=(id:string,athleteId:string,d:DocumentData):Personal=>({id,athleteId,title:String(d.title||''),category:String(d.category||'Personalizzata'),exercises:Array.isArray(d.exercises)?d.exercises:[],sourceId:typeof d.sourceSharedTemplateId==='string'?d.sourceSharedTemplateId:typeof d.sourceId==='string'?d.sourceId:undefined,revision:Number(d.revision??0),planDetached:!!d.planDetachedAt,...(d.deletedAt?{deletedAt:String(d.deletedAt)}:{})})
const protectedBody=(s:Personal,uid:string)=>{
 const snapshot=protectedPayload(s,uid,new Date().toISOString())
 return {sourceTemplateId:snapshot.sourceTemplateId,title:snapshot.title,exercises:snapshot.exercises,archiveVersion:1,archivedAt:serverTimestamp(),archivedBy:uid}
}
const root=(db:Firestore,gym:string,athlete:string)=>doc(db,...path(gym,athlete))
const personalDoc=(db:Firestore,g:string,a:string,id:string)=>doc(root(db,g,a),'personal_templates',part(id,'Scheda'))
const archiveDoc=(db:Firestore,g:string,a:string,id:string)=>doc(root(db,g,a),'archive_templates',part(id,'Scheda'))
const weekDoc=(db:Firestore,g:string,a:string,id:string)=>doc(root(db,g,a),'weeks',part(id,'Settimana'))
const templateDoc=(db:Firestore,g:string,id:string)=>doc(db,'gyms',part(g,'Palestra'),'templates',part(id,'Modello'))

/**
 * FASE 2L/B - Coordinamento per atleta sulle mutazioni delle settimane.
 * Il documento padre athlete_programs/{athleteId} e' la barriera di serializzazione:
 * ogni mutazione delle settimane e il cestino delle schede devono leggerlo e
 * incrementare weeksVersion nella STESSA transazione. Non protegge client V1
 * che scrivono direttamente: servono Security Rules obbligatorie al cut-over.
 */
const versionOf=(snap:DocumentSnapshot<DocumentData>):number=>{
 if(!snap.exists())throw new Error('Coordinamento settimane non inizializzato.')
 const n=snap.data().weeksVersion
 if(!Number.isSafeInteger(n)||n<0)throw new Error('Coordinamento settimane non valido: interrompo per sicurezza.')
 return n
}
const bump=(tx:Transaction,fence:ReturnType<typeof root>,snap:DocumentSnapshot<DocumentData>,coachUid:string)=>{
 const n=versionOf(snap)
 if(n>=Number.MAX_SAFE_INTEGER-1)throw new Error('Versione settimane esaurita.')
 tx.update(fence,{weeksVersion:n+1,weeksTouchedAt:serverTimestamp(),weeksTouchedBy:part(coachUid,'Coach')})
}
/** Crea il contatore una sola volta; durante la migrazione V1 il gate Rules deve
 * essere attivato solo dopo che TUTTI i vecchi client non possono piu scrivere.
 * Questa preparazione NON rende da sola sicure le scritture legacy. */
export async function ensureWeekMutationFence(db:Firestore,gym:string,athlete:string):Promise<number>{
 const f=root(db,gym,athlete)
 return runTransaction(db,async tx=>{
  const snap=await tx.get(f)
  if(snap.exists()&&snap.data().weeksVersion!==undefined)return versionOf(snap)
  tx.set(f,{weeksVersion:0},{merge:true})
  return 0
 })
}
const weekLinks=(days:unknown):string[]=>{
 if(!days||typeof days!=='object'||Array.isArray(days))throw new Error('Giorni della settimana non validi.')
 const value=days as Record<string,DocumentData>
 if(DAY_KEYS.some(k=>!value[k]||typeof value[k]!=='object'))throw new Error('Mancano giorni della settimana.')
 const ids=new Set<string>()
 for(const d of Object.values(value))for(const key of ['templateId','templateId2']){
  const id=d?.[key]
  if(id!==undefined&&id!==null&&id!=='')ids.add(part(String(id),'ID scheda collegata'))
 }
 return [...ids]
}
const readLinked=(tx:Transaction,db:Firestore,gym:string,athlete:string,days:unknown)=>
 Promise.all(weekLinks(days).map(async id=>{
  const snap=await tx.get(personalDoc(db,gym,athlete,id))
  if(!snap.exists()||snap.data().deletedAt)throw new Error('Una scheda collegata non è attiva: creazione o ripristino bloccati.')
 }))

/** Creazione atomica di una nuova settimana: controlla gli ID personali e
 * incrementa il fence nello stesso commit. Non usare addDoc diretto dalla UI. */
export async function createWeekGuarded(db:Firestore,gym:string,athlete:string,weekId:string,weekData:V1WeekDocument,coachUid:string):Promise<void>{
 if(weekData.deletedAt)throw new Error('Non è possibile creare una settimana già cestinata.')
 if(!weekData.days)throw new Error('I sette giorni sono obbligatori.')
 const w=weekDoc(db,gym,athlete,weekId),f=root(db,gym,athlete)
 await ensureWeekMutationFence(db,gym,athlete)
 await runTransaction(db,async tx=>{
  const [fs,ws]=await Promise.all([tx.get(f),tx.get(w)])
  if(ws.exists())throw new Error('Settimana già presente: non sovrascrivo.')
  await readLinked(tx,db,gym,athlete,weekData.days)
  bump(tx,f,fs,coachUid)
  tx.set(w,{...weekData,createdAt:serverTimestamp()})
 })
}

/** Duplica la settimana dalla versione piu recente nel DB, senza riscrivere
 * la sorgente; blocca ID collegati a schede nel cestino. */
export async function duplicateWeekGuarded(db:Firestore,gym:string,athlete:string,fromId:string,toId:string,startDate:string,coachUid:string):Promise<void>{
 const f=root(db,gym,athlete),from=weekDoc(db,gym,athlete,fromId),to=weekDoc(db,gym,athlete,toId)
 if(from.id===to.id)throw new Error('La copia deve avere un nuovo ID.')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))throw new Error('Data settimana non valida.')
 await ensureWeekMutationFence(db,gym,athlete)
 await runTransaction(db,async tx=>{
  const [fs,old,existing]=await Promise.all([tx.get(f),tx.get(from),tx.get(to)])
  if(!old.exists()||old.data().deletedAt)throw new Error('Settimana sorgente non attiva.')
  if(existing.exists())throw new Error('Settimana di destinazione già presente.')
  await readLinked(tx,db,gym,athlete,old.data().days)
  const d=old.data()
  bump(tx,f,fs,coachUid)
  tx.set(to,{...d,programTitle:String(d.programTitle||'Programma')+' (Copia)',startDate,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 })
}

export function watchAthleteSheets(db:Firestore,gym:string,athlete:string,emit:(s:{personal:Personal[];weeks:ProgramWeek[];groups:ReturnType<typeof groupSheets>})=>void,onError:(error:Error)=>void):Unsubscribe{
 let left:Personal[]|null=null,right:ProgramWeek[]|null=null,disposed=false
 const update=()=>{if(!disposed&&left&&right)emit({personal:left,weeks:right,groups:groupSheets(left,right,athlete)})}
 const error=(e:Error)=>{if(!disposed)onError(e)}
 const stopPersonal=onSnapshot(collection(root(db,gym,athlete),'personal_templates'),snapshot=>{left=snapshot.docs.map(x=>rawToPersonal(x.id,athlete,x.data()));update()},error)
 const stopWeeks=onSnapshot(collection(root(db,gym,athlete),'weeks'),snapshot=>{right=snapshot.docs.map(x=>rawToWeek(x.id,athlete,x.data()));update()},error)
 return ()=>{disposed=true;stopPersonal();stopWeeks()}
}

/** Id modello riutilizzato come id personale per atleta: nessun doppione con stesso modello. */
export async function assignShared(db:Firestore,gym:string,athlete:string,templateId:string,coachUid:string):Promise<'existing'|'created'> {
 const source=templateDoc(db,gym,templateId),personal=personalDoc(db,gym,athlete,templateId),archive=archiveDoc(db,gym,athlete,templateId)
 return runTransaction(db,async tx=>{
  const [model,existing,protectedSnapshot]=await Promise.all([tx.get(source),tx.get(personal),tx.get(archive)])
  if(!model.exists()||model.data().deletedAt)throw new Error('Modello assente o nel Cestino.')
  if(existing.exists()){
   if(existing.data().deletedAt)throw new Error('La scheda personale è nel Cestino: ripristinala, non crearne una nuova.')
   if(!protectedSnapshot.exists())tx.set(archive,protectedBody(rawToPersonal(templateId,athlete,existing.data()),coachUid))
   // Assegnazione ESPLICITA senza programma: riattiva una scheda ritirata.
   if(existing.data().planDetachedAt)tx.update(personal,{planDetachedAt:deleteField(),planDetachedBy:deleteField()})
   return 'existing'
  }
  const d=model.data(),sheet:Personal={id:templateId,athleteId:athlete,title:String(d.title||''),category:String(d.category||'Personalizzata'),exercises:d.exercises||[],sourceId:templateId}
  if(!protectedSnapshot.exists())tx.set(archive,protectedBody(sheet,coachUid))
  tx.set(personal,{title:sheet.title,category:sheet.category,exercises:sheet.exercises,sourceSharedTemplateId:templateId,createdAt:serverTimestamp()})
  return 'created'
 })
}

/** All-in-one V1 assignment from a shared model to one day slot.
 * Same templateId across all three docs and week; repeated call with the already
 * assigned ID is idempotent. The protected archive is NEVER overwritten. */
export async function assignSharedToDay(db:Firestore,gym:string,athlete:string,modelId:string,uid:string,weekId:string,day:DayKey,slot:1|2,expected:string):Promise<'created'|'existing'>{
 const t=templateDoc(db,gym,modelId),p=personalDoc(db,gym,athlete,modelId),a=archiveDoc(db,gym,athlete,modelId)
 const w=weekDoc(db,gym,athlete,weekId),f=root(db,gym,athlete),d=dayKey(day),key=slotKey(slot)
 await ensureWeekMutationFence(db,gym,athlete)
 return runTransaction(db,async tx=>{
  const [fs,model,personal,archived,week]=await Promise.all([tx.get(f),tx.get(t),tx.get(p),tx.get(a),tx.get(w)])
  if(!model.exists()||model.data().deletedAt)throw new Error('Modello non presente nell Archivio o cestinato.')
  if(!week.exists()||week.data().deletedAt)throw new Error('Settimana non attiva.')
  const current=String(week.data().days?.[d]?.[key]||'')
  if(current!==expected && current!==modelId)throw new Error('Un altro Coach ha modificato lo slot: aggiorna prima di riprovare.')
  if(personal.exists()&&personal.data().deletedAt)throw new Error('Scheda personale nel cestino: ripristinala, non duplicarla.')
  // Sostituire una scheda in uno slot e' anche scollegare la precedente.
  // Non lasciarla per errore tra le schede senza programma.
  const replacedId=current&&current!==modelId?current:''
  const previousPersonalRef=replacedId?personalDoc(db,gym,athlete,replacedId):null
  const previousArchiveRef=replacedId?archiveDoc(db,gym,athlete,replacedId):null
  const [previousPersonal,previousArchive]=previousPersonalRef&&previousArchiveRef
   ?await Promise.all([tx.get(previousPersonalRef),tx.get(previousArchiveRef)]):[null,null]
  const raw=personal.exists()?personal.data():model.data()
  const sheet:Personal={id:modelId,athleteId:athlete,title:String(raw.title||''),category:String(raw.category||'Personalizzata'),exercises:Array.isArray(raw.exercises)?raw.exercises:[],sourceId:modelId}
  if(!sheet.title.trim()||!sheet.exercises.length)throw new Error('Scheda senza contenuto: assegnazione annullata.')
  if(!personal.exists())tx.set(p,{title:sheet.title,category:sheet.category,exercises:sheet.exercises,sourceSharedTemplateId:modelId,createdAt:serverTimestamp()})
  if(!archived.exists())tx.set(a,protectedBody(sheet,uid))
  if(previousPersonalRef&&previousPersonal?.exists()){
   if(previousArchiveRef&&!previousArchive?.exists())tx.set(previousArchiveRef,protectedBody(rawToPersonal(replacedId,athlete,previousPersonal.data()),uid))
   tx.update(previousPersonalRef,{planDetachedAt:serverTimestamp(),planDetachedBy:uid})
  }
  if(current!==modelId){bump(tx,f,fs,uid);tx.update(w,{[`days.${d}.${key}`]:modelId,updatedAt:serverTimestamp()})}
  return personal.exists()?'existing':'created'
 })
}

/** Collega una scheda *personale* già assegnata. Controllo ID atteso anti-stale. */
export async function linkPersonalDay(db:Firestore,gym:string,athlete:string,weekId:string,day:DayKey,slot:1|2,sheetId:string,coachUid:string,expectedId:string):Promise<void>{
 const w=weekDoc(db,gym,athlete,weekId),p=personalDoc(db,gym,athlete,sheetId),a=archiveDoc(db,gym,athlete,sheetId),f=root(db,gym,athlete),key=slotKey(slot),d=dayKey(day)
 await ensureWeekMutationFence(db,gym,athlete)
 await runTransaction(db,async tx=>{
  const [fs,ws,ps,as]=await Promise.all([tx.get(f),tx.get(w),tx.get(p),tx.get(a)])
  if(!ws.exists()||ws.data().deletedAt)throw new Error('Settimana non attiva.')
  if(!ps.exists()||ps.data().deletedAt)throw new Error('Scheda personale non attiva.')
  const found=String(ws.data().days?.[d]?.[key]||'')
  if(found!==expectedId)throw new Error('Collegamento cambiato, aggiorna la settimana.')
  const replacedId=found&&found!==sheetId?found:''
  const previousPersonalRef=replacedId?personalDoc(db,gym,athlete,replacedId):null
  const previousArchiveRef=replacedId?archiveDoc(db,gym,athlete,replacedId):null
  const [previousPersonal,previousArchive]=previousPersonalRef&&previousArchiveRef
   ?await Promise.all([tx.get(previousPersonalRef),tx.get(previousArchiveRef)]):[null,null]
  if(!as.exists())tx.set(a,protectedBody(rawToPersonal(sheetId,athlete,ps.data()),coachUid))
  if(previousPersonalRef&&previousPersonal?.exists()){
   if(previousArchiveRef&&!previousArchive?.exists())tx.set(previousArchiveRef,protectedBody(rawToPersonal(replacedId,athlete,previousPersonal.data()),coachUid))
   tx.update(previousPersonalRef,{planDetachedAt:serverTimestamp(),planDetachedBy:coachUid})
  }
  bump(tx,f,fs,coachUid)
  tx.update(w,{[`days.${d}.${key}`]:sheetId,updatedAt:serverTimestamp()})
 })
}

/** Scollega UNO slot e non elimina mai personal_templates o archivio. */
export async function unlinkPersonalDay(db:Firestore,gym:string,athlete:string,weekId:string,day:DayKey,slot:1|2,expectedId:string,coachUid:string):Promise<void>{
 const w=weekDoc(db,gym,athlete,weekId),p=personalDoc(db,gym,athlete,expectedId),a=archiveDoc(db,gym,athlete,expectedId),f=root(db,gym,athlete),key=slotKey(slot),d=dayKey(day)
 await ensureWeekMutationFence(db,gym,athlete)
 await runTransaction(db,async tx=>{
  const [fs,ws,ps,as]=await Promise.all([tx.get(f),tx.get(w),tx.get(p),tx.get(a)])
  if(!ws.exists()||ws.data().deletedAt)throw new Error('Settimana non attiva.')
  if(String(ws.data().days?.[d]?.[key]||'')!==expectedId)throw new Error('Collegamento già modificato: aggiorna prima di scollegare.')
  if(ps.exists()&&!as.exists())tx.set(a,protectedBody(rawToPersonal(expectedId,athlete,ps.data()),coachUid))
  bump(tx,f,fs,coachUid)
  // Scritture ATOMICHE: la scheda resta recuperabile nell'Archivio Atleta,
  // ma non viene proiettata tra le schede attive senza programma.
  // Se l'ID e' collegato in un altro giorno, groupSheets lo mostra comunque
  // tra quelle programmate. Il marker non cancella mai copie storiche.
  if(ps.exists())tx.update(p,{planDetachedAt:serverTimestamp(),planDetachedBy:coachUid})
  tx.update(w,{[`days.${d}.${key}`]:'',updatedAt:serverTimestamp()})
 })
}

/** 2L/C LAB: anche le attività incrementano weeksVersion, per gate server rigoroso. */
export async function updateActivity(db:Firestore,gym:string,athlete:string,weekId:string,day:DayKey,slot:1|2,value:string,coachUid:string):Promise<void>{
 const w=weekDoc(db,gym,athlete,weekId),f=root(db,gym,athlete),field=slot===1?'activity1':slot===2?'activity2':(()=>{throw new Error('Slot attività non valido.')})()
 await ensureWeekMutationFence(db,gym,athlete)
 await runTransaction(db,async tx=>{
  const [fs,snap]=await Promise.all([tx.get(f),tx.get(w)])
  if(!snap.exists()||snap.data().deletedAt)throw new Error('Settimana non attiva.')
  bump(tx,f,fs,coachUid)
  tx.update(w,{[`days.${dayKey(day)}.${field}`]:value,updatedAt:serverTimestamp()})
 })
}

/** Nessuna cancellazione irreversibile: elimina logicamente il modello Coach. */
export async function trashShared(db:Firestore,gym:string,id:string,uid:string):Promise<void>{
 const t=templateDoc(db,gym,id)
 await runTransaction(db,async tx=>{const s=await tx.get(t);if(!s.exists()||s.data().deletedAt)throw new Error('Modello non attivo.');tx.update(t,{deletedAt:serverTimestamp(),deletedBy:uid})})
}
export async function trashWeek(db:Firestore,gym:string,athlete:string,id:string,uid:string):Promise<void>{
 const w=weekDoc(db,gym,athlete,id),f=root(db,gym,athlete)
 await ensureWeekMutationFence(db,gym,athlete)
 await runTransaction(db,async tx=>{const [fs,s]=await Promise.all([tx.get(f),tx.get(w)]);if(!s.exists()||s.data().deletedAt)throw new Error('Settimana non attiva.');bump(tx,f,fs,uid);tx.update(w,{deletedAt:serverTimestamp(),deletedBy:uid})})
}
/**
 * Cestino con protezione anti phantom: legge la versione PRIMA della query,
 * verifica la medesima versione nella transazione, poi la incrementa.
 * Se un altro Coach crea/collega/ripristina una settimana mediante la nuova
 * API mentre la query e' in corso, la transazione fallisce e va ritentata.
 * ATTENZIONE: finche' le Rules permettono addDoc/updateDoc V1 senza fence,
 * questa sola funzione NON puo garantire la protezione completa.
 */
export async function trashPersonal(db:Firestore,gym:string,athlete:string,sheetId:string,uid:string):Promise<void>{
 const f=root(db,gym,athlete),p=personalDoc(db,gym,athlete,sheetId),a=archiveDoc(db,gym,athlete,sheetId)
 await ensureWeekMutationFence(db,gym,athlete)
 const baseline=versionOf(await getDoc(f))
 const snapshot=await getDocs(collection(f,'weeks'))
 const wrefs=snapshot.docs.map(x=>x.ref)
 await runTransaction(db,async tx=>{
  const [fs,ps,as,...weeks]=await Promise.all([tx.get(f),tx.get(p),tx.get(a),...wrefs.map(x=>tx.get(x))])
  if(versionOf(fs)!==baseline)throw new Error('Le settimane sono cambiate durante il controllo: riprova il cestino.')
  if(!ps.exists()||ps.data().deletedAt)throw new Error('Scheda non attiva.')
  for(const w of weeks){if(!w.exists()||w.data().deletedAt)continue
   for(const data of Object.values(w.data().days||{}) as DocumentData[])
    if([data?.templateId,data?.templateId2].some(x=>String(x||'')===sheetId))throw new Error('Scheda ancora collegata: scollega tutti i giorni prima di cestinarla.')
  }
  bump(tx,f,fs,uid)
  if(!as.exists())tx.set(a,protectedBody(rawToPersonal(sheetId,athlete,ps.data()),uid))
  tx.update(p,{deletedAt:serverTimestamp(),deletedBy:uid})
 })
}
export async function restoreFromTrash(db:Firestore,gym:string,kind:'shared'|'personal'|'week',id:string,uid:string,athlete?:string):Promise<void>{
 if(kind!=='shared'&&!athlete)throw new Error('Atleta obbligatorio.')
 const ref=kind==='shared'?templateDoc(db,gym,id):kind==='personal'?personalDoc(db,gym,athlete!,id):weekDoc(db,gym,athlete!,id)
 if(kind==='shared'){
  await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists()||!s.data().deletedAt)throw new Error('Elemento non nel Cestino.');tx.update(ref,{deletedAt:deleteField(),deletedBy:deleteField(),updatedAt:serverTimestamp(),updatedBy:uid})})
  return
 }
 const f=root(db,gym,athlete!)
 await ensureWeekMutationFence(db,gym,athlete!)
 await runTransaction(db,async tx=>{
  const [fs,s]=await Promise.all([tx.get(f),tx.get(ref)])
  if(!s.exists()||!s.data().deletedAt)throw new Error('Elemento non nel Cestino.')
  if(kind==='week')await readLinked(tx,db,gym,athlete!,s.data().days)
  bump(tx,f,fs,uid)
  tx.update(ref,{deletedAt:deleteField(),deletedBy:deleteField(),updatedAt:serverTimestamp(),updatedBy:uid})
 })
}

/** PATCH-3: backfill ID conservativo SOLO su invocazione esplicita del Coach.
 * Non riscrive archive_templates esistenti. Ogni documento ancora assente
 * viene creato nella stessa transazione che ne legge la personale.
 * Non finge di recuperare il contenuto di un backup originale inesistente:
 * salva la fotografia ORA disponibile in personal_templates. */
export async function backfillProtectedLegacy(db:Firestore,gym:string,athlete:string,uid:string,limit=100):Promise<{checked:number;created:number;alreadyPresent:number;pending:number}>{
 part(uid,'Coach')
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Limite backfill non valido.')
 const [original,protectedDocs]=await Promise.all([
  getDocs(collection(root(db,gym,athlete),'personal_templates')),
  getDocs(collection(root(db,gym,athlete),'archive_templates')),
 ])
 const existing=new Set(protectedDocs.docs.map(d=>d.id))
 const missing=original.docs.filter(d=>!existing.has(d.id))
 let created=0
 for(const item of missing.slice(0,limit)){
  const pp=personalDoc(db,gym,athlete,item.id),aa=archiveDoc(db,gym,athlete,item.id)
  const result=await runTransaction(db,async tx=>{
   const [personal,archive]=await Promise.all([tx.get(pp),tx.get(aa)])
   if(archive.exists())return false
   if(!personal.exists())throw new Error('Scheda personale rimossa durante il backfill: interrompo.')
   const candidate=rawToPersonal(item.id,athlete,personal.data())
   // protectedPayload rifiuta schede prive di esercizi e titoli incompleti
   tx.set(aa,protectedBody(candidate,uid))
   return true
  })
  if(result)created++
 }
 return {checked:original.size,created,alreadyPresent:original.size-missing.length,pending:Math.max(0,missing.length-limit)}
}
