/** PATCH-3 — un solo protocollo per ogni mutazione delle settimane.
 * La barriera weeksVersion riduce il rischio di scritture concorrenti tra client
 * Modern. Per la garanzia server anche contro ROUNDONE vecchio servono Rules
 * con fence obbligatorio + migrazione coordinata: NON dichiarare release pronta.
 * Mai eliminare fisicamente documenti storici.
 */
import {collection,doc,getDoc,getDocs,runTransaction,serverTimestamp,type Firestore,type DocumentData} from 'firebase/firestore'
import {DAY_KEYS,type ProgramDay} from '../../features/sheets/domain'
import {advanceV1Monday,planV1WeekCopies,initialV1WeekDocument,v1LinkedPersonalIds,type V1WeekDocument} from '../../features/sheets/v1WeekCodec'
import {activityDelta,ensureActivityChangesCurrent,activeWeekDateConflict} from '../../features/sheets/weekDraftPolicy'
import {ensureWeekMutationFence,trashWeek,restoreFromTrash} from './sheets'
const segment=(value:string,label:string)=>{
 if(!value||!value.trim()||value.trim()!==value||value.includes('/')||value.includes('..'))throw new Error(label+' non valido.')
 return value
}
const weeks=(db:Firestore,g:string,a:string)=>collection(db,'gyms',segment(g,'Palestra'),'athlete_programs',segment(a,'Atleta'),'weeks')
const refWeek=(db:Firestore,g:string,a:string,w:string)=>doc(weeks(db,g,a),segment(w,'Settimana'))
const fence=(db:Firestore,g:string,a:string)=>doc(db,'gyms',segment(g,'Palestra'),'athlete_programs',segment(a,'Atleta'))
const versionOf=(v:DocumentData|undefined):number=>{
 const n=v?.weeksVersion
 if(!Number.isSafeInteger(n)||n<0)throw new Error('Controllo settimane non valido. Aggiorna il profilo prima di riprovare.')
 return n
}
const bump=(tx:import('firebase/firestore').Transaction,f:ReturnType<typeof fence>,n:number,uid:string)=>{
 if(n>=Number.MAX_SAFE_INTEGER-1)throw new Error('Contatore settimane esaurito.')
 tx.update(f,{weeksVersion:n+1,weeksTouchedAt:serverTimestamp(),weeksTouchedBy:segment(uid,'Coach')})
}
/** 1 sola transazione per tutte le nuove settimane e il relativo fence. */
export async function createV1Program(db:Firestore,gymId:string,athleteId:string,programTitle:string,startMonday:string,totalWeeks:number,coachUid:string):Promise<string[]>{
 segment(coachUid,'Coach')
 if(!Number.isInteger(totalWeeks)||totalWeeks<1||totalWeeks>52)throw new Error('Numero settimane non valido (1–52).')
 const docs=Array.from({length:totalWeeks},(_,i)=>initialV1WeekDocument(programTitle,i+1,totalWeeks,advanceV1Monday(startMonday,i)))
 const f=fence(db,gymId,athleteId),col=weeks(db,gymId,athleteId)
 await ensureWeekMutationFence(db,gymId,athleteId)
 const baseline=versionOf((await getDoc(f)).data())
 const existing=await getDocs(col)
 const known=existing.docs.map(d=>({id:d.id,startDate:d.data().startDate,deletedAt:d.data().deletedAt}))
 if(docs.some(body=>activeWeekDateConflict(known,body.startDate||'')))throw new Error('Una settimana attiva con questa data esiste già: non duplico il programma.')
 const targets=docs.map(()=>doc(col))
 await runTransaction(db,async tx=>{
  const fs=await tx.get(f)
  if(versionOf(fs.data())!==baseline)throw new Error('Un altro Coach ha modificato le settimane: aggiorna prima di creare il programma.')
  bump(tx,f,baseline,coachUid)
  for(const [i,target] of targets.entries())tx.set(target,{...docs[i],createdAt:serverTimestamp()})
 })
 return targets.map(x=>x.id)
}
/** Solo i campi effettivamente modificati: merge di giorni indipendenti,
 * blocco in caso di conflitto sulla stessa attività. */
export async function saveV1WeekActivities(db:Firestore,gymId:string,athleteId:string,weekId:string,days:readonly ProgramDay[],baseline:readonly ProgramDay[],coachUid:string):Promise<void>{
 segment(coachUid,'Coach')
 const changes=activityDelta(baseline,days)
 if(!changes.length)return
 const w=refWeek(db,gymId,athleteId,weekId),f=fence(db,gymId,athleteId)
 await ensureWeekMutationFence(db,gymId,athleteId)
 await runTransaction(db,async tx=>{
  const [fs,ws]=await Promise.all([tx.get(f),tx.get(w)])
  if(!ws.exists()||ws.data().deletedAt)throw new Error('Settimana inesistente o nel Cestino.')
  const writes=ensureActivityChangesCurrent(changes,ws.data().days||{})
  if(!writes.length)return
  bump(tx,f,versionOf(fs.data()),coachUid)
  tx.update(w,{...Object.fromEntries(writes.map(x=>[x.path,x.value])),updatedAt:serverTimestamp()})
 })
}
/** Duplicazione atomica in N lunedì consecutivi: una sola transazione,
 * un solo incremento weeksVersion, nessuna copia se un controllo fallisce.
 * Si conservano gli ID delle schede collegate e non si toccano gli archivi.
 */
export async function duplicateV1Weeks(db:Firestore,gymId:string,athleteId:string,sourceId:string,firstMonday:string,count:number,coachUid:string):Promise<string[]>{
 segment(coachUid,'Coach')
 if(!Number.isInteger(count)||count<1||count>12)throw new Error('Scegli da 1 a 12 duplicazioni per operazione.')
 const targetsMondays=Array.from({length:count},(_,i)=>advanceV1Monday(firstMonday,i))
 const f=fence(db,gymId,athleteId),col=weeks(db,gymId,athleteId)
 await ensureWeekMutationFence(db,gymId,athleteId)
 const baseline=versionOf((await getDoc(f)).data())
 const all=await getDocs(col)
 const known=all.docs.map(d=>({id:d.id,startDate:d.data().startDate,deletedAt:d.data().deletedAt}))
 if(known.filter(w=>!w.deletedAt).length+count>52)throw new Error('Massimo 52 settimane attive. Riduci il numero di copie.')
 if(targetsMondays.some(date=>activeWeekDateConflict(known,date)))throw new Error('Una data è già occupata da una settimana attiva. Nessuna copia è stata creata.')
 const refs=targetsMondays.map(()=>doc(col)),source=refWeek(db,gymId,athleteId,sourceId)
 await runTransaction(db,async tx=>{
  const [fs,snap]=await Promise.all([tx.get(f),tx.get(source)])
  if(versionOf(fs.data())!==baseline)throw new Error('Un altro Coach ha modificato il programma. Aggiorna la pagina e riprova.')
  if(!snap.exists()||snap.data().deletedAt)throw new Error('La settimana di origine non è più disponibile.')
  const bodies=planV1WeekCopies(snap.data() as V1WeekDocument,firstMonday,count)
  // Letture tutte prima delle scritture, anche con più copie.
  const ids=v1LinkedPersonalIds(bodies[0])
  const pp=await Promise.all(ids.map(id=>tx.get(doc(db,'gyms',segment(gymId,'Palestra'),'athlete_programs',segment(athleteId,'Atleta'),'personal_templates',segment(id,'Scheda')))))
  if(pp.some(s=>!s.exists()||s.data().deletedAt))throw new Error('Una scheda collegata non è disponibile. Nessuna duplicazione eseguita.')
  bump(tx,f,baseline,coachUid)
  for(const [i,target] of refs.entries())tx.set(target,{...bodies[i],createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 },{maxAttempts:5})
 return refs.map(x=>x.id)
}
/** Retrocompatibilità con i vecchi caller che chiedono una sola settimana. */
export async function duplicateV1Week(db:Firestore,gymId:string,athleteId:string,sourceId:string,targetMonday:string,coachUid:string):Promise<string>{
 const ids=await duplicateV1Weeks(db,gymId,athleteId,sourceId,targetMonday,1,coachUid)
 return ids[0]
}
/** Sola lettura, tutte le settimane e non soltanto la selezione UI. */
export async function inspectActiveV1Links(db:Firestore,gymId:string,athleteId:string,personalId:string):Promise<Array<{weekId:string;day:string;slot:1|2}>>{
 segment(personalId,'Scheda')
 const all=await getDocs(weeks(db,gymId,athleteId))
 const result:Array<{weekId:string;day:string;slot:1|2}>=[]
 for(const w of all.docs){if(w.data().deletedAt)continue
  for(const day of DAY_KEYS){const d=w.data().days?.[day]
   if(d?.templateId===personalId)result.push({weekId:w.id,day,slot:1})
   if(d?.templateId2===personalId)result.push({weekId:w.id,day,slot:2})
  }
 }
 return result
}
export async function trashV1Week(db:Firestore,gymId:string,athleteId:string,weekId:string,coachUid:string):Promise<void>{
 await trashWeek(db,gymId,athleteId,weekId,coachUid)
}
export async function restoreV1Week(db:Firestore,gymId:string,athleteId:string,weekId:string,coachUid:string):Promise<void>{
 await restoreFromTrash(db,gymId,'week',weekId,coachUid,athleteId)
}
