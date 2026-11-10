/** One-time assignment of a Coach label to pre-author-attribution shared templates.
 * Does NOT edit sheet bodies, revision numbers, programs, student assignments or archives.
 * Concurrent writes are guarded by Firestore transactions; no bulk/implicit migration.
 */
import {doc,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore'
import {hasRecordedCreator} from '../../features/coach/legacyTemplateAttribution'

const safeDocId=(x:string)=>!!x && x.length<=160 && !x.includes('/') && !x.includes('..')

export async function attributeLegacyTemplate(
 db:Firestore,gymId:string,ownerUid:string,modelId:string,coachUid:string,
):Promise<void>{
 if(![gymId,ownerUid,modelId,coachUid].every(safeDocId))throw new Error('ID di palestra, Coach o scheda non valido.')
 if(ownerUid===coachUid){/* Owner may assign the template to themselves. */}
 const gymRef=doc(db,'gyms',gymId)
 const coachRef=doc(db,'users',coachUid)
 const modelRef=doc(db,'gyms',gymId,'templates',modelId)
 await runTransaction(db,async tx=>{
  const [gymSnap,coachSnap,modelSnap]=await Promise.all([
   tx.get(gymRef),tx.get(coachRef),tx.get(modelRef),
  ])
  if(!gymSnap.exists() || gymSnap.data().ownerUid!==ownerUid)
   throw new Error('Solo il titolare registrato della palestra può attribuire le schede storiche.')
  if(!coachSnap.exists())throw new Error('Coach destinatario non presente.')
  const coach=coachSnap.data()
  if(coach.gymId!==gymId || coach.role!=='admin'||coach.membershipStatus&&coach.membershipStatus!=='active')
   throw new Error('Il Coach non risulta attivo nella stessa palestra.')
  if(!modelSnap.exists())throw new Error('Scheda storica non presente.')
  const model=modelSnap.data()
  if(hasRecordedCreator(model.createdBy))
   throw new Error('Scheda già attribuita: nessuna modifica effettuata.')
  // Preserve existing ID, title, exercises, timestamps, creator history, revision and trash flags.
  tx.update(modelRef,{
   createdBy:coachUid,
   legacyCreatorAssignedBy:ownerUid,
   legacyCreatorAssignedAt:serverTimestamp(),
  })
 })
}
