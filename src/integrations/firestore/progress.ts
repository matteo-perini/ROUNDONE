/** Progressi data isolated from worksheets. Backend Rules must be installed separately. */
import {collection,doc,onSnapshot,query,limit,orderBy,serverTimestamp,setDoc,updateDoc,runTransaction,deleteDoc,type Firestore,type Unsubscribe} from 'firebase/firestore'
import {getApp} from 'firebase/app'
import {getAuth} from 'firebase/auth'
import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStorage,ref as storageRef,uploadBytes,getBlob,deleteObject} from 'firebase/storage'
import type {ProgressSession,ProgressCheck,RecordedExercise,CheckPhoto} from '../../features/progress/progressModel'
import {normalizeEntries,validDate,correctionValues,sameValues,workoutSlot,validWorkoutValues,type CorrectionHead} from '../../features/progress/progressModel'
import {normalizeGoal,type ProgressGoal,type ProgressGoalStatus,type GoalInput} from '../../features/progress/goalsModel'
import {sameWorkout,type PendingWorkout} from '../../features/progress/offlineWorkouts'
import type {PhotoScope,PhotoRequest} from '../../features/progress/checkGallery'
import {MAX_CHECK_PHOTO_BYTES} from '../../features/progress/checkPhotoCompression'
function privateStorage(){
 const bucket=String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET||'').trim()
 if(!/^[A-Za-z0-9.-]{4,160}$/.test(bucket))throw new Error('Storage non configurato: inserisci VITE_FIREBASE_STORAGE_BUCKET dal pannello Firebase nel tuo .env.production.local.')
 return getStorage(getApp('lionfit-verified-staging'),`gs://${bucket}`)
}
const segment=(x:string)=>{if(!/^[\w-]{3,128}$/.test(x))throw new Error('Identificativo non valido');return x}
const root=(db:Firestore,gym:string,athlete:string)=>doc(db,'gyms',segment(gym),'progress',segment(athlete))
export const sessionCollection=(db:Firestore,gym:string,athlete:string)=>collection(root(db,gym,athlete),'sessions')
export const checkCollection=(db:Firestore,gym:string,athlete:string)=>collection(root(db,gym,athlete),'checks')
/** Obiettivi del Coach: append-only + cambi di stato, nessuna cancellazione fisica. */
export const goalCollection=(db:Firestore,gym:string,athlete:string)=>collection(root(db,gym,athlete),'goals')
export function watchGoals(db:Firestore,gym:string,athlete:string,cb:(rows:ProgressGoal[])=>void,err:(e:Error)=>void):Unsubscribe{
 return onSnapshot(query(goalCollection(db,gym,athlete),orderBy('createdAt','desc'),limit(150)),snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()} as ProgressGoal))),err)
}
export async function addGoal(db:Firestore,gym:string,athlete:string,input:GoalInput,coachUid:string){
 if(!coachUid||coachUid===athlete)throw new Error('Solo il Coach può assegnare un obiettivo.')
 const data=normalizeGoal(input)
 const target=doc(goalCollection(db,gym,athlete))
 await setDoc(target,{schemaVersion:1,athleteId:athlete,...data,status:'active',createdBy:coachUid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 return target.id
}
export async function setGoalStatus(db:Firestore,gym:string,athlete:string,goalId:string,status:ProgressGoalStatus,coachUid:string){
 if(!coachUid||coachUid===athlete)throw new Error('Solo il Coach può modificare gli obiettivi.')
 if(!['active','reached','paused','archived'].includes(status))throw new Error('Stato obiettivo non valido.')
 await updateDoc(doc(goalCollection(db,gym,athlete),segment(goalId)),{status,updatedAt:serverTimestamp()})
}
export function watchProgress(db:Firestore,gym:string,athlete:string,cb:(rows:ProgressSession[])=>void,err:(e:Error)=>void,count=250):Unsubscribe{
 return onSnapshot(query(sessionCollection(db,gym,athlete),orderBy('performedOn','desc'),limit(count)),snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()} as ProgressSession))),err)
}
export function watchChecks(db:Firestore,gym:string,athlete:string,cb:(rows:ProgressCheck[])=>void,err:(e:Error)=>void):Unsubscribe{
 return onSnapshot(query(checkCollection(db,gym,athlete),orderBy('performedOn','desc'),limit(80)),snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()} as ProgressCheck))),err)
}
export async function recordSession(db:Firestore,gym:string,athlete:string,sheet:{id:string;title:string},date:string,entries:readonly RecordedExercise[],actor:string,requestId?:string){
 const id=requestId?segment(requestId):doc(sessionCollection(db,gym,athlete)).id
 const result=await syncPendingWorkout(db,gym,athlete,{id,sheet,date,entries:normalizeEntries(entries)},actor)
 if(result==='deleted')throw new Error('Questo allenamento è stato eliminato. Inizia una nuova registrazione.')
 return id
}
export async function recordCheck(db:Firestore,gym:string,athlete:string,date:string,notes:string,photos:CheckPhoto[],actor:string,checkId?:string){
 if(actor!==athlete)throw new Error('Solo l’Atleta può salvare i propri check.')
 if(!validDate(date)||date>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw new Error('Data check non valida.')
 if(notes.length>500||photos.length>4)throw new Error('Check non valido.')
 const target=checkId?doc(checkCollection(db,gym,athlete),segment(checkId)):doc(checkCollection(db,gym,athlete))
 await setDoc(target,{schemaVersion:1,athleteId:athlete,performedOn:date,notes:notes.slice(0,500),createdBy:actor,createdAt:serverTimestamp(),photos})
 return target.id
}
export async function uploadCheckPhoto(gym:string,athlete:string,checkId:string,side:CheckPhoto['side'],blob:Blob):Promise<CheckPhoto>{
 if(blob.type!=='image/jpeg'||blob.size>=MAX_CHECK_PHOTO_BYTES || blob.size===0)throw new Error('Foto troppo grande o formato non valido.')
 const path=`progress_photos/${segment(gym)}/${segment(athlete)}/${segment(checkId)}/${side}.jpg`
 const storage=privateStorage()
 await uploadBytes(storageRef(storage,path),blob,{contentType:'image/jpeg',customMetadata:{athleteId:athlete}})
 return {side,storagePath:path}
}
export async function loadPhoto(storagePath:string):Promise<string>{
 if(!/^progress_photos\/[\w-]+\/[\w-]+\/[\w-]+\/(front|back|left|right)\.jpg$/.test(storagePath))throw new Error('Riferimento foto non valido')
 const storage=privateStorage()
 // Keep reading older Check Zone photos uploaded under the previous 2 MiB limit.
 const blob=await getBlob(storageRef(storage,storagePath),2*1024*1024)
 return URL.createObjectURL(blob)
}
/** Authenticated blob, canonical path and current account checked on both sides of download. */
export async function loadScopedCheckPhoto(scope:PhotoScope,p:PhotoRequest):Promise<string>{
 if(!['front','back','left','right'].includes(p.side)||p.storagePath!==`progress_photos/${segment(scope.gymId)}/${segment(scope.athleteId)}/${segment(p.checkId)}/${p.side}.jpg`)throw new Error('Riferimento foto non valido.')
 const auth=getAuth(getApp('lionfit-verified-staging'))
 if(auth.currentUser?.uid!==scope.actorId)throw new Error('Sessione cambiata.')
 const url=await loadPhoto(p.storagePath)
 if(auth.currentUser?.uid!==scope.actorId){URL.revokeObjectURL(url);throw new Error('Sessione cambiata.')}
 return url
}
export async function removeStagedPhoto(storagePath:string):Promise<void>{
 if(!/^progress_photos\/[\w-]+\/[\w-]+\/[\w-]+\/(front|back|left|right)\.jpg$/.test(storagePath))return
 try{await deleteObject(storageRef(privateStorage(),storagePath))}catch{/* orphan handling via admin cleanup */}
}

/** Original sessions stay immutable. One overlay per set; previous heads are appended verbatim. */
const correctionCollection=(db:Firestore,gym:string,athlete:string)=>collection(root(db,gym,athlete),'session_corrections')
export function watchCorrectionHeads(db:Firestore,gym:string,athlete:string,cb:(rows:CorrectionHead[])=>void,err:(e:Error)=>void){return onSnapshot(correctionCollection(db,gym,athlete),snap=>cb(snap.docs.map(d=>({...d.data(),id:d.id} as CorrectionHead))),err)}
const deletionRef=(db:Firestore,gym:string,athlete:string,id:string)=>doc(root(db,gym,athlete),'session_deletions',segment(id))
/** Server-authorized permanent deletion, including all correction heads. */
export async function deleteWorkout(db:Firestore,gym:string,athlete:string,sessionId:string,actor:string){
 if(actor!==athlete||getAuth(db.app).currentUser?.uid!==actor)throw new Error('Solo l’Atleta può eliminare i propri allenamenti.')
 await httpsCallable<{gymId:string;sessionId:string},{deleted:boolean}>(getFunctions(db.app,'europe-west1'),'lfDeleteWorkout')({gymId:segment(gym),sessionId:segment(sessionId)})
 if(getAuth(db.app).currentUser?.uid!==actor)throw new Error('Account cambiato.')
}
export async function correctWorkout(db:Firestore,gym:string,athlete:string,sessionId:string,exerciseIndex:number,setIndex:number,kg:number|null,reps:number|null,actor:string,expected:{kg:number|null;reps:number|null}){
 if(actor!==athlete)throw new Error('Solo l’Atleta può correggere il proprio allenamento.')
 if(!Number.isInteger(exerciseIndex)||exerciseIndex<0||exerciseIndex>=90||!Number.isInteger(setIndex)||setIndex<0||setIndex>=60)throw new Error('Serie non valida.')
 const next={kg,reps};if(!validWorkoutValues(next))throw new Error('Carico o ripetizioni non validi (0–2000 kg, 1–300 ripetizioni).')
 const target=doc(sessionCollection(db,gym,athlete),segment(sessionId))
 const overlay=doc(correctionCollection(db,gym,athlete),`${sessionId}_${exerciseIndex}_${setIndex}`)
 await runTransaction(db,async tx=>{
  const [snap,head]=await Promise.all([tx.get(target),tx.get(overlay)])
  if(!snap.exists()||snap.data().athleteId!==athlete||snap.data().createdBy!==actor)throw new Error('Allenamento non disponibile.')
  const original={...snap.data(),id:snap.id} as ProgressSession,ex=original.exercises[exerciseIndex]
  const initial=ex?workoutSlot(ex,setIndex):null
  if(!initial||(setIndex<30&&ex.skipped))throw new Error('Serie non disponibile.')
  const previous=head.exists()?{...head.data(),id:head.id} as CorrectionHead:null
  const old=previous?.latest.next||initial
  if(!sameValues(old,expected))throw new Error('I valori sono cambiati: riapri la registrazione.')
  if(sameValues(old,next))throw new Error('Nessuna modifica.')
  const history=previous?[...previous.history,previous.latest]:[]
  if(history.length>=100)throw new Error('Limite correzioni raggiunto per questa serie.')
  tx.set(overlay,{sessionId,exerciseIndex,setIndex,history,latest:{previous:correctionValues(old),next,author:actor,at:serverTimestamp()}})
 })
}
export type RevisionStatus='pending'|'working'|'completed'
export type ProgramRevision={id:string;athleteId:string;sheetId:string;sheetTitle:string;reason:string;notes:string;status:RevisionStatus;createdBy:string;createdAt?:unknown;updatedAt?:unknown;updatedBy?:string}
const revisionCollection=(db:Firestore,gym:string,athlete:string)=>collection(root(db,gym,athlete),'revision_requests')
export function watchRevisions(db:Firestore,gym:string,athlete:string,cb:(r:ProgramRevision[])=>void,err:(e:Error)=>void){return onSnapshot(query(revisionCollection(db,gym,athlete),orderBy('createdAt','desc'),limit(100)),snap=>cb(snap.docs.map(d=>({...d.data(),id:d.id} as ProgramRevision))),err)}
export async function requestRevision(db:Firestore,gym:string,athlete:string,sheet:{id:string;title:string},reason:string,notes:string,actor:string){
 if(actor!==athlete)throw new Error('Richiesta riservata all’Atleta.')
 if(!['Disponibilità','Attrezzatura','Difficoltà','Altro'].includes(reason)||notes.trim().length<1||notes.trim().length>1000)throw new Error('Indica motivo e descrizione (massimo 1000 caratteri).')
 await setDoc(doc(revisionCollection(db,gym,athlete)),{athleteId:athlete,sheetId:segment(sheet.id),sheetTitle:sheet.title.slice(0,160),reason,notes:notes.trim(),status:'pending',createdBy:actor,createdAt:serverTimestamp()})
}
export async function changeRevisionStatus(db:Firestore,gym:string,athlete:string,id:string,status:RevisionStatus,actor:string){
 if(actor===athlete||!actor)throw new Error('Operazione riservata al Coach.')
 const target=doc(revisionCollection(db,gym,athlete),segment(id))
 await runTransaction(db,async tx=>{const snap=await tx.get(target);if(!snap.exists())throw new Error('Richiesta non disponibile.');const row=snap.data();if(row.athleteId!==athlete||!((row.status==='pending'&&status==='working')||(row.status==='working'&&status==='completed')))throw new Error('Stato non valido.');tx.update(target,{status,updatedBy:actor,updatedAt:serverTimestamp()})})
}

/** Fixed document ID and server transaction: retry after lost acknowledgement is idempotent. */
export async function syncPendingWorkout(db:Firestore,gym:string,athlete:string,p:PendingWorkout,actor:string){
 if(actor!==athlete||!validDate(p.date)||p.date>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw new Error('Registrazione non valida.')
 const target=doc(sessionCollection(db,gym,athlete),segment(p.id)), exercises=normalizeEntries(p.entries)
 if(!exercises.some(e=>e.skipped||e.sets.length))throw new Error('Registrazione vuota.')
 return runTransaction(db,async tx=>{
  const [snap,deleted]=await Promise.all([tx.get(target),tx.get(deletionRef(db,gym,athlete,p.id))])
  if(deleted.exists())return 'deleted' as const
  if(snap.exists()){if(!sameWorkout(snap.data(),athlete,{...p,entries:exercises}))throw new Error('Conflitto sul salvataggio: non sovrascrivo.');return 'saved' as const}
  tx.set(target,{schemaVersion:1,athleteId:athlete,sheetId:segment(p.sheet.id),sheetTitle:p.sheet.title.slice(0,160),performedOn:p.date,createdBy:actor,createdAt:serverTimestamp(),exercises})
  return 'saved' as const
 })
}
export const checkSharingEnabled=()=>import.meta.env.VITE_LIONFIT_CHECK_SHARING_ENABLED==='true'
const shareCollection=(db:Firestore,gym:string,athlete:string)=>collection(root(db,gym,athlete),'check_shares')
export function watchCheckShares(db:Firestore,gym:string,athlete:string,cb:(ids:string[],confirmed:boolean)=>void,err:(e:Error)=>void){return onSnapshot(shareCollection(db,gym,athlete),{includeMetadataChanges:true},snap=>cb(snap.docs.map(d=>d.id),!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites),err)}
export async function changeCheckShare(db:Firestore,gym:string,athlete:string,checkId:string,enabled:boolean,actor:string){if(!checkSharingEnabled()||actor!==athlete)throw new Error('Condivisione non disponibile.');const target=doc(shareCollection(db,gym,athlete),segment(checkId));if(enabled)await setDoc(target,{athleteId:athlete,checkId,sharedBy:actor,sharedAt:serverTimestamp()});else await deleteDoc(target)}
