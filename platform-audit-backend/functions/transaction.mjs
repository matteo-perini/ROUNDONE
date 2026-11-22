import {readExemption,auditPayload} from './model.mjs'
// Kept independent of Firebase SDK so atomic state + event writing can be tested.
export async function applyExemptionTransaction({database,gymId,exempt,actorUid,serverTimestamp}){
 const gym=database.doc(`gyms/${gymId}`)
 const billing=database.doc(`platform_billing/${gymId}`)
 const audit=database.collection('platform_audit').doc()
 return database.runTransaction(async tx=>{
  const gymSnap=await tx.get(gym)
  if(!gymSnap.exists)throw new Error('GYM_NOT_FOUND')
  const previous=await tx.get(billing)
  const before=readExemption(previous.exists?previous.data():undefined)
  if(before===exempt)return {changed:false,exempt,auditId:null}
  tx.set(billing,{exempt,updatedAt:serverTimestamp()},{merge:true})
  tx.create(audit,{...auditPayload(gymId,before,exempt,actorUid),createdAt:serverTimestamp()})
  return {changed:true,exempt,auditId:audit.id}
 })
}
