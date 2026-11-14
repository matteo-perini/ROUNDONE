/** Private competition covers; enabled only after Storage rules have been reviewed. */
import {getApp} from 'firebase/app'
import {getStorage,ref as fileRef,uploadBytes,getBlob,deleteObject} from 'firebase/storage'
import {doc,serverTimestamp,runTransaction,type Firestore} from 'firebase/firestore'
import {compressCheckPhoto} from '../../features/progress/checkPhotoCompression'
import type {StagingSession} from '../firebase/stagingSession'
import type {CompetitionEvent} from '../../features/bookings/competitionModel'
const bucket=String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET||'').trim()
export const competitionCoversEnabled=()=>import.meta.env.VITE_LIONFIT_AGENDA_COVERS_ENABLED==='true'&&/^[A-Za-z0-9.-]{4,160}$/.test(bucket)
const seg=(s:string)=>{if(!/^[\w-]{1,128}$/.test(s))throw new Error('Identificativo non valido.');return s}
const token=(s:string)=>/^[a-f0-9-]{36}$/.test(s)
const media=(gym:string,event:string,id:string)=>{if(!competitionCoversEnabled()||!token(id))throw new Error('Locandine Storage non configurate.');return fileRef(getStorage(getApp('lionfit-verified-staging'),`gs://${bucket}`),`agenda_covers/${seg(gym)}/${seg(event)}/${id}.jpg`)}
export async function readCompetitionCover(gym:string,event:string,id:string){const blob=await getBlob(media(gym,event,id),1_000_000);return URL.createObjectURL(blob)}
async function discard(gym:string,event:string,id:string){if(!id)return;try{await deleteObject(media(gym,event,id))}catch{/* Server cleanup may be needed; never delete a referenced object from client. */}}
export async function replaceCompetitionCover(db:Firestore,s:StagingSession,event:CompetitionEvent,file?:File){
 if(s.role==='atleta'||event.status!=='published'||event.startMs<=Date.now()||!competitionCoversEnabled())throw new Error('Locandina non modificabile.')
 const next=file?crypto.randomUUID():''
 if(file){const blob=await compressCheckPhoto(file);if(blob.size>=1_000_000||blob.type!=='image/jpeg')throw new Error('Locandina non valida.');await uploadBytes(media(s.gymId,event.id,next),blob,{contentType:'image/jpeg'})}
 let previous=''
 try{
  await runTransaction(db,async tx=>{const target=doc(db,'gyms',seg(s.gymId),'competitions',seg(event.id));const snap=await tx.get(target);if(!snap.exists()||snap.data().status!=='published'||snap.data().startAt.toMillis()<=Date.now())throw new Error('Evento non più modificabile.');previous=String(snap.data().coverId||'');tx.update(target,{coverId:next,updatedAt:serverTimestamp(),updatedBy:s.uid})})
 }catch(e){await discard(s.gymId,event.id,next);throw e}
 if(previous!==next)await discard(s.gymId,event.id,previous)
}
