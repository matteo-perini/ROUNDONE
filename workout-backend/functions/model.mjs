/** Deletion is physical and atomic. An ID-only receipt prevents stale offline replay. */
export const CONTROL_UID='bngmYLSrq5fTXlvxm62aAzGSoWJ3'
export const MAX_HEADS=450
export class WorkoutError extends Error { constructor(code,message){super(message);this.code=code} }
const fail=(code,msg)=>{throw new WorkoutError(code,msg)}
export const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{3,128}$/.test(x)
export function verifyRequest(auth,data,project){
 if(project!=='app-palestra-b0b9d')fail('failed-precondition','Progetto non autorizzato.')
 const uid=auth?.uid
 if(!validId(uid)||uid===CONTROL_UID||auth?.token?.email_verified!==true||auth?.token?.lionfitSuperAdmin===true)fail('permission-denied','Account non autorizzato.')
 if(!data||typeof data!=='object'||Object.keys(data).length!==2||!validId(data.gymId)||!validId(data.sessionId))fail('invalid-argument','Allenamento non valido.')
 return {uid,gymId:data.gymId,sessionId:data.sessionId}
}
export function authorizeProfile(p,gym,uid,gymId){
 if(!p||p.gymId!==gymId||p.role!=='athlete'||(Object.hasOwn(p,'membershipStatus')?p.membershipStatus:'active')!=='active'||!gym||gym.ownerUid===uid)fail('permission-denied','Solo l’atleta attivo può eliminare i propri allenamenti.')
}
export async function deleteOwnedWorkout(db,{uid,gymId,sessionId},timestamp){
 if(!validId(uid)||!validId(gymId)||!validId(sessionId))fail('invalid-argument','Allenamento non valido.')
 const root=db.doc(`gyms/${gymId}/progress/${uid}`)
 const target=root.collection('sessions').doc(sessionId)
 const receipt=root.collection('session_deletions').doc(sessionId)
 return db.runTransaction(async tx=>{
  const [p,g,source,marker]=await tx.getAll(db.doc(`users/${uid}`),db.doc(`gyms/${gymId}`),target,receipt)
  authorizeProfile(p.data(),g.data(),uid,gymId)
  if(marker.exists){if(source.exists)fail('failed-precondition','Stato incoerente. Contatta l’assistenza.');return {deleted:true}}
  if(!source.exists)fail('not-found','Allenamento non disponibile.')
  const original=source.data()
  if(original.athleteId!==uid||original.createdBy!==uid)fail('permission-denied','Allenamento non autorizzato.')
  const heads=await tx.get(root.collection('session_corrections').where('sessionId','==',sessionId).limit(MAX_HEADS+1))
  if(heads.size>MAX_HEADS)fail('resource-exhausted','Troppe correzioni da eliminare insieme. Contatta l’assistenza: nessun dato è stato eliminato.')
  for(const head of heads.docs)tx.delete(head.ref)
  tx.delete(target)
  tx.create(receipt,{deletedAt:timestamp()})
  return {deleted:true}
 })
}
