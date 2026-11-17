import {collection,doc,limit,onSnapshot,orderBy,query,serverTimestamp,setDoc,updateDoc,type Firestore} from 'firebase/firestore'
import {validate,type Result,type ResultData} from '../../features/multisport/model'
import type {MultiSnapshot} from '../../features/multisport/syncPolicy'
const segment=(s:string)=>{if(!/^[A-Za-z0-9_-]{1,128}$/.test(s))throw Error('Identificativo non valido.');return s}
const root=(db:Firestore,gym:string,athlete:string)=>collection(db,'gyms',segment(gym),'progress',segment(athlete),'multisport_results')
/** Coach and athlete subscribe to the exact same real-time collection. Metadata is
 * separate from document data; a pending local write is not a confirmed result. */
export function watchMulti(db:Firestore,gym:string,athlete:string,n:number,cb:(snapshot:MultiSnapshot)=>void,err:(e:Error)=>void){
 return onSnapshot(query(root(db,gym,athlete),orderBy('performedOn','desc'),limit(n+1)),{includeMetadataChanges:true},s=>cb({rows:s.docs.slice(0,n).map(d=>({...d.data(),id:d.id} as Result)),fromCache:s.metadata.fromCache,pending:s.metadata.hasPendingWrites,more:s.size>n}),err)
}
export async function saveMulti(db:Firestore,gym:string,athlete:string,actor:string,r:ResultData,editing?:Result){
 const data=validate(r),col=root(db,gym,athlete);segment(actor)
 if(editing){
  if(editing.createdBy!==actor||editing.athleteId!==athlete||editing.sport!==data.sport)throw Error('Puoi modificare solo i risultati inseriti da te.')
  await updateDoc(doc(col,segment(editing.id)),{...data,updatedBy:actor,updatedAt:serverTimestamp()})
 }else await setDoc(doc(col),{...data,archived:false,athleteId:athlete,createdBy:actor,updatedBy:actor,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
}
export async function archiveMulti(db:Firestore,gym:string,athlete:string,actor:string,r:Result){
 segment(actor)
 if(r.createdBy!==actor||r.athleteId!==athlete)throw Error('Risultato non modificabile.')
 await updateDoc(doc(root(db,gym,athlete),segment(r.id)),{archived:!r.archived,updatedBy:actor,updatedAt:serverTimestamp()})
}
