/** Progressi data isolated from worksheets. Backend Rules must be installed separately. */
import {collection,doc,onSnapshot,query,limit,orderBy,serverTimestamp,setDoc,updateDoc,type Firestore,type Unsubscribe} from 'firebase/firestore'
import {getApp} from 'firebase/app'
import {getStorage,ref as storageRef,uploadBytes,getBlob,deleteObject} from 'firebase/storage'
import type {ProgressSession,ProgressCheck,RecordedExercise,CheckPhoto} from '../../features/progress/progressModel'
import {normalizeEntries,validDate} from '../../features/progress/progressModel'
import {normalizeGoal,type ProgressGoal,type ProgressGoalStatus,type GoalInput} from '../../features/progress/goalsModel'
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
export function watchProgress(db:Firestore,gym:string,athlete:string,cb:(rows:ProgressSession[])=>void,err:(e:Error)=>void):Unsubscribe{
 return onSnapshot(query(sessionCollection(db,gym,athlete),orderBy('performedOn','desc'),limit(250)),snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()} as ProgressSession))),err)
}
export function watchChecks(db:Firestore,gym:string,athlete:string,cb:(rows:ProgressCheck[])=>void,err:(e:Error)=>void):Unsubscribe{
 return onSnapshot(query(checkCollection(db,gym,athlete),orderBy('performedOn','desc'),limit(80)),snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()} as ProgressCheck))),err)
}
export async function recordSession(db:Firestore,gym:string,athlete:string,sheet:{id:string;title:string},date:string,entries:readonly RecordedExercise[],actor:string){
 if(actor!==athlete)throw new Error('Solo l’Atleta può registrare i propri allenamenti.')
 if(!validDate(date)||date>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw new Error('Data allenamento non valida o futura.')
 const exercises=normalizeEntries(entries)
 if(!exercises.some(e=>e.skipped||e.sets.length))throw new Error('Compila una serie o indica almeno un esercizio saltato.')
 const target=doc(sessionCollection(db,gym,athlete))
 await setDoc(target,{schemaVersion:1,athleteId:athlete,sheetId:segment(sheet.id),sheetTitle:sheet.title.slice(0,160),performedOn:date,createdBy:actor,createdAt:serverTimestamp(),exercises})
 return target.id
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
export async function removeStagedPhoto(storagePath:string):Promise<void>{
 if(!/^progress_photos\/[\w-]+\/[\w-]+\/[\w-]+\/(front|back|left|right)\.jpg$/.test(storagePath))return
 try{await deleteObject(storageRef(privateStorage(),storagePath))}catch{/* orphan handling via admin cleanup */}
}
