/** Idempotent recovery of a Firebase Auth identity without users/{uid}.
 * This module only writes the original V1 collections and original IDs.
 * It never deletes Auth users, deletes invites, or bypasses Security Rules.
 */
import type {User} from 'firebase/auth'
import {reload,getIdToken} from 'firebase/auth'
import type {Firestore} from 'firebase/firestore'
import {doc,getDocFromServer,serverTimestamp,writeBatch} from 'firebase/firestore'
import {validInvitation} from '../../features/invites/registration'
import {coachAssignmentWritesReady} from '../../features/athletes/primaryCoachAssignment'
import type {PendingSignup} from '../../features/invites/pendingSignup'

export type RegistrationResult='complete'|'verify-email'
function profileMatches(p:Record<string,unknown>,uid:string,intent:PendingSignup){
 const expectedId=intent.role==='admin'?'gym_'+uid:intent.gymId
 const expectedRole=intent.role==='athlete'?'athlete':'admin'
 return p.email===intent.email&&p.gymId===expectedId&&p.role===expectedRole
}

export async function finishPendingSignup(db:Firestore,user:User,intent:PendingSignup):Promise<RegistrationResult>{
 if(!user.email||user.email.toLowerCase()!==intent.email)throw new Error('L’account autenticato non coincide con l’email della registrazione.')
 const profileRef=doc(db,'users',user.uid)
 const existing=await getDocFromServer(profileRef)
 if(existing.exists()){
  if(!profileMatches(existing.data(),user.uid,intent))throw new Error('Questo account appartiene già a un profilo diverso. Nessun dato modificato.')
  return 'complete'
 }
 const gymId=intent.role==='admin'?'gym_'+user.uid:intent.gymId
 const profileBase={name:intent.name,email:intent.email,role:intent.role==='athlete'?'athlete':'admin',gymId}
 if(intent.role==='admin'){
  const userData={...profileBase,coachRole:'owner',gymName:intent.gymName}
  const batch=writeBatch(db)
  batch.set(doc(db,'gyms',gymId),{name:intent.gymName,inviteCode:'INVITI_MONOUSO',ownerUid:user.uid,createdAt:serverTimestamp()})
  batch.set(profileRef,userData)
  try{await batch.commit()}
  catch(initialError){
   // An interrupted historical signup can have an existing gym but no user document.
   // The published ownerSignup() rule validates ownerUid and gymName in getAfter().
   // Never overwrite that gym; the profile-only retry is server-validated.
   const retry=await getDocFromServer(profileRef)
   if(!retry.exists()){
    const recovery=writeBatch(db);recovery.set(profileRef,userData)
    try{await recovery.commit()}
    catch{throw initialError}
   }else if(!profileMatches(retry.data(),user.uid,intent))throw initialError
  }
  return 'complete'
 }
 validInvitation(gymId,intent.token)
 if(intent.role==='athlete'){
  const inviteRef=doc(db,'gyms',gymId,'athlete_invites',intent.token)
  const inv=await getDocFromServer(inviteRef),data=inv.data()
  if(!data||data.status!=='pending'||data.gymId!==gymId||data.expiresAt?.toMillis?.()<=Date.now())
   throw new Error('Invito atleta non disponibile. Chiedi alla palestra un nuovo link: il tuo account Firebase rimarrà intatto.')
  // createdBy is the historical inviter; it is immutable after the invite is created.
  // The new Rules verify both these UIDs against the original invitation.
  // Do NOT enable these fields before the Rules rollout: a denied batch would
  // otherwise leave an Auth account without its corresponding Firestore profile.
  const inviter=typeof data.createdBy==='string'?data.createdBy.trim():''
  if(coachAssignmentWritesReady() && !inviter)
   throw new Error('Invito privo di Coach creatore: chiedi alla palestra un nuovo invito.')
  const coachFields=coachAssignmentWritesReady()?{invitedByUid:inviter,primaryCoachUid:inviter}:{}
  const batch=writeBatch(db)
  batch.set(profileRef,{...profileBase,gymName:String(data.gymName||''),athleteInviteId:intent.token,...coachFields})
  batch.update(inviteRef,{status:'claimed',claimedBy:user.uid,claimedAt:serverTimestamp()})
  await batch.commit()
  return 'complete'
 }
 // Coach invited: no Firestore profile until Auth email ownership is verified.
 await reload(user);await getIdToken(user,true)
 if(!user.emailVerified)return 'verify-email'
 const inviteRef=doc(db,'gyms',gymId,'coach_invites',intent.token)
 const invite=await getDocFromServer(inviteRef),data=invite.data()
 if(!data||data.status!=='pending'||data.gymId!==gymId||data.email!==intent.email||data.expiresAt?.toMillis?.()<=Date.now())
  throw new Error('Invito coach non disponibile, scaduto o già utilizzato. Non ricreare l’account Firebase.')
 const batch=writeBatch(db)
 batch.set(profileRef,{...profileBase,coachRole:'collaborator',gymName:String(data.gymName||''),coachInviteId:intent.token})
 batch.update(inviteRef,{status:'claimed',claimedBy:user.uid,claimedAt:serverTimestamp()})
 await batch.commit()
 return 'complete'
}
