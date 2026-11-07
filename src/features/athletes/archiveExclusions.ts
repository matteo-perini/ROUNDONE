/** Scrittura separata dai listener in sola lettura. SOLO Firebase Emulator. */
import { doc,setDoc,serverTimestamp,type Firestore } from 'firebase/firestore'
export async function hideOneArchiveCopy(db:Firestore,s:{uid:string;gymId:string;role:string},id:string):Promise<void>{
 if(s.role!=='atleta'||(!s.gymId || s.gymId.includes('/') || s.gymId.startsWith('demo-'))||!s.uid||s.uid.includes('/')||!id||id.includes('/'))
  throw new Error('Esclusione archivio non autorizzata.')
 await setDoc(doc(db,'gyms',s.gymId,'athlete_programs',s.uid,'archive_exclusions',id),{
  sourceTemplateId:id,hiddenBy:s.uid,hiddenAt:serverTimestamp()
 })
}
