/** Agenda competitions. All writes scoped by the verified Firebase session; Rules remain authoritative. */
import {collection,doc,onSnapshot,where,query,orderBy,limit,serverTimestamp,Timestamp,setDoc,updateDoc,runTransaction,type Firestore,type Unsubscribe} from 'firebase/firestore'
import type {StagingSession} from '../firebase/stagingSession'
import {competitionCategories,normalizeCompetition,type CompetitionEvent,type CompetitionEntry,type CompetitionDraft} from '../../features/bookings/competitionModel'
const seg=(v:string)=>{if(!/^[\w-]{1,128}$/.test(v))throw new Error('Identificativo non valido.');return v}
const entrySeg=(v:string)=>{if(!/^[\w-]{1,257}$/.test(v))throw new Error('Identificativo partecipazione non valido.');return v}
const root=(db:Firestore,gym:string)=>doc(db,'gyms',seg(gym))
const config=(db:Firestore,gym:string)=>doc(root(db,gym),'agenda_config','competitions')
const events=(db:Firestore,gym:string)=>collection(root(db,gym),'competitions')
const entries=(db:Firestore,gym:string)=>collection(root(db,gym),'competition_entries')
export function watchCompetitionEnabled(db:Firestore,gym:string,cb:(enabled:boolean)=>void,err:(e:Error)=>void):Unsubscribe{return onSnapshot(config(db,gym),{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites)cb(snap.exists()&&snap.data().enabled===true)},err)}
export async function setCompetitionEnabled(db:Firestore,s:StagingSession,enabled:boolean){if(s.role!=='titolare')throw new Error('Solo il titolare può gestire il modulo.');await setDoc(config(db,s.gymId),{enabled,updatedBy:s.uid,updatedAt:serverTimestamp()})}
export function watchCompetitionEvents(db:Firestore,gym:string,cb:(rows:CompetitionEvent[])=>void,err:(e:Error)=>void):Unsubscribe{
 return onSnapshot(query(events(db,gym),orderBy('startAt','desc'),limit(200)),snap=>cb(snap.docs.flatMap(d=>{const x=d.data(),startMs=x.startAt?.toMillis?.();if(!Number.isSafeInteger(startMs)||!competitionCategories.includes(x.category)||!['published','cancelled'].includes(x.status))return [];return [{id:d.id,title:String(x.title||''),category:x.category,discipline:String(x.discipline||''),location:String(x.location||''),notes:String(x.notes||''),startMs,status:x.status,createdBy:String(x.createdBy||''),coverId:typeof x.coverId==='string'?x.coverId:''}]})),err)
}
export function watchCompetitionEntries(db:Firestore,gym:string,scope:{athlete:string}|{event:string},cb:(rows:CompetitionEntry[])=>void,err:(e:Error)=>void):Unsubscribe{
 const q='athlete' in scope?query(entries(db,gym),where('athleteId','==',seg(scope.athlete))):query(entries(db,gym),where('eventId','==',seg(scope.event)))
 return onSnapshot(q,snap=>cb(snap.docs.flatMap(d=>{const x=d.data();return ['pending','approved','rejected','withdrawn'].includes(x.status)?[{id:d.id,eventId:String(x.eventId),athleteId:String(x.athleteId),status:x.status,result:String(x.result||'')}]:[]})),err)
}
export async function saveCompetition(db:Firestore,s:StagingSession,d:CompetitionDraft,event?:CompetitionEvent){
 if(s.role==='atleta')throw new Error('Operazione riservata ai Coach.')
 const n=normalizeCompetition(d,Date.now()),{startMs,...fields}=n
 if(event){if(event.status!=='published')throw new Error('Evento annullato.');await updateDoc(doc(events(db,s.gymId),seg(event.id)),{...fields,startAt:Timestamp.fromMillis(startMs),updatedBy:s.uid,updatedAt:serverTimestamp()});return event.id}
 const target=doc(events(db,s.gymId));await setDoc(target,{...fields,startAt:Timestamp.fromMillis(startMs),status:'published',createdBy:s.uid,createdAt:serverTimestamp(),updatedBy:s.uid,updatedAt:serverTimestamp()});return target.id
}
export async function cancelCompetition(db:Firestore,s:StagingSession,id:string){if(s.role==='atleta')throw new Error('Operazione riservata ai Coach.');await updateDoc(doc(events(db,s.gymId),seg(id)),{status:'cancelled',updatedBy:s.uid,updatedAt:serverTimestamp()})}
export async function requestCompetition(db:Firestore,s:StagingSession,eventId:string){
 if(s.role!=='atleta')throw new Error('Operazione riservata all’atleta.')
 const target=doc(entries(db,s.gymId),`${seg(eventId)}_${seg(s.uid)}`)
 await runTransaction(db,async tx=>{const old=await tx.get(target);if(old.exists()){if(old.data().status!=='withdrawn')throw new Error('Richiesta già presente.');tx.update(target,{status:'pending',updatedBy:s.uid,updatedAt:serverTimestamp()})}else tx.set(target,{eventId,athleteId:s.uid,status:'pending',result:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:s.uid})})
}
export async function changeCompetitionEntry(db:Firestore,s:StagingSession,entry:CompetitionEntry,status:'approved'|'rejected'|'withdrawn'){
 if(s.role==='atleta'?(status!=='withdrawn'||entry.athleteId!==s.uid):status==='withdrawn')throw new Error('Operazione non autorizzata.')
 await updateDoc(doc(entries(db,s.gymId),entrySeg(entry.id)),{status,updatedBy:s.uid,updatedAt:serverTimestamp()})
}
export async function saveCompetitionResult(db:Firestore,s:StagingSession,entry:CompetitionEntry,result:string){if(s.role==='atleta'||entry.status!=='approved'||result.trim().length>1000)throw new Error('Risultato non valido.');await updateDoc(doc(entries(db,s.gymId),entrySeg(entry.id)),{result:result.trim(),updatedBy:s.uid,updatedAt:serverTimestamp()})}
