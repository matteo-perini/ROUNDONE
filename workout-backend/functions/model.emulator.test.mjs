import test from 'node:test'
import assert from 'node:assert/strict'
import {initializeApp,deleteApp} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {deleteOwnedWorkout} from './model.mjs'
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Solo emulatore locale.')
const app=initializeApp({projectId:'demo-lionfit-patch24'},'patch24-backend-integration')
const db=getFirestore(app),uid='ath_patch24',gymId='gym_patch24',sessionId='workout_delete'
const root=db.doc(`gyms/${gymId}/progress/${uid}`),session=root.collection('sessions').doc(sessionId),other=root.collection('sessions').doc('workout_other'),receipt=root.collection('session_deletions').doc(sessionId),corr=root.collection('session_corrections').doc(sessionId+'_0_0'),corrOther=root.collection('session_corrections').doc('workout_other_0_0')
const profile=db.doc('users/'+uid),gym=db.doc('gyms/'+gymId),sheet=db.doc(`gyms/${gymId}/athlete_programs/${uid}/personal_templates/sheet_one`)
const source={athleteId:uid,createdBy:uid,exercises:[{key:'test',sets:[{kg:10,reps:5}]}]}
const args={uid,gymId,sessionId},now=()=>FieldValue.serverTimestamp()
try{
 await test('real Firestore Admin transaction: deletion, correction cleanup, other workout and sheet untouched, retry idempotent',async()=>{
  await Promise.all([profile.set({gymId,role:'athlete',membershipStatus:'active'}),gym.set({ownerUid:'coach_patch24'}),session.set(source),other.set(source),corr.set({sessionId}),corrOther.set({sessionId:'workout_other'}),sheet.set({title:'Scheda originale'})]);
  await assert.rejects(deleteOwnedWorkout(db,{...args,gymId:'gym_wrong'},now));
  await profile.update({membershipStatus:'revoked'});await assert.rejects(deleteOwnedWorkout(db,args,now));assert((await session.get()).exists);
  await profile.update({membershipStatus:'active'});
  await deleteOwnedWorkout(db,args,now);await deleteOwnedWorkout(db,args,now);
  const docs=await db.getAll(session,corr,other,corrOther,sheet,receipt);
  assert.deepEqual(docs.map(d=>d.exists),[false,false,true,true,true,true]);
  assert.deepEqual(Object.keys(docs[5].data()),['deletedAt']);
 });
}finally{await deleteApp(app)}
