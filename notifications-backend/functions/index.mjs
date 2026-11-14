import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,FieldValue} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {logger} from 'firebase-functions';
import {pilotScope,pilotMatches,scopeGym,recipientAllowed} from './pilot.mjs';
import {randomUUID} from 'node:crypto';
import {DAY,MINUTE,hash,prefs,validToken,validId,validDeviceId,activeProfile,jobsForChange,stillValid,wants,message} from './model.mjs';
initializeApp();
const db=getFirestore();
const REGION='europe-west1';
const options={region:REGION,maxInstances:3,timeoutSeconds:60};
const devices=db.collection('lf_push_devices'),jobs=db.collection('lf_push_jobs'),testLimits=db.collection('lf_push_test_limits');
const stamp=ms=>Timestamp.fromMillis(ms);
const allowedProjects=new Set(['app-palestra-b0b9d','lionfit-staging-test']);
function projectGuard(){const id=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;if(!allowedProjects.has(id))throw new HttpsError('failed-precondition','Progetto non autorizzato.');}
async function member(req){
 projectGuard(); const uid=req.auth?.uid;if(!validId(uid))throw new HttpsError('unauthenticated','Accedi a LionFit.');
 const p=(await db.doc(`users/${uid}`).get()).data();if(!validId(p?.gymId)||!activeProfile(p,p.gymId))throw new HttpsError('permission-denied','Profilo non attivo.');
 return {uid,gym:p.gymId,role:p.role};
}
function deviceKey(data){if(!validDeviceId(data?.id))throw new HttpsError('invalid-argument','Dispositivo non valido.');return data.id;}
const publicInfo=d=>({prefs:d.prefs,expires:d.expires,platform:d.platform});
export const lfPushRegister=onCall(options,async req=>{
 const u=await member(req),d=req.data;if(!validToken(d?.token)||!['web','android'].includes(d?.platform))throw new HttpsError('invalid-argument','Registrazione non valida.');
 let p;try{p=prefs(d.prefs)}catch{throw new HttpsError('invalid-argument','Preferenze non valide.');}
 const id=hash(d.token),ref=devices.doc(id),now=Date.now();
 // A token has one owner only; switching account replaces the association.
 // Bound number of active devices per account, allowing refresh of the same token.
 await db.runTransaction(async tx=>{const q=await tx.get(devices.where('uid','==',u.uid).limit(25));const existing=await tx.get(ref);const active=q.docs.filter(s=>s.id!==id&&s.data().expires>now);if(active.length>=10)throw new HttpsError('resource-exhausted','Troppi dispositivi attivi: disattiva quelli inutilizzati.');for(const s of q.docs){if(s.id!==id&&s.data().expires<=now)tx.delete(s.ref)}tx.set(ref,{...u,token:d.token,platform:d.platform,prefs:p,expires:now+90*DAY,updated:now,revision:randomUUID()});});
 return {id,prefs:p,expires:now+90*DAY};
});
export const lfPushSettings=onCall(options,async req=>{
 const u=await member(req),id=deviceKey(req.data),ref=devices.doc(id);let p;
 if(req.data?.prefs!==undefined){try{p=prefs(req.data.prefs)}catch{throw new HttpsError('invalid-argument','Preferenze non valide.');}}
 return db.runTransaction(async tx=>{const d=(await tx.get(ref)).data();if(!d||d.uid!==u.uid||d.gym!==u.gym||d.expires<=Date.now())return {active:false};if(p){tx.update(ref,{prefs:p,updated:Date.now(),expires:Date.now()+90*DAY});return {active:true,...publicInfo({...d,prefs:p,expires:Date.now()+90*DAY})}}return {active:true,...publicInfo(d)};});
});
export const lfPushUnregister=onCall(options,async req=>{
 projectGuard();const uid=req.auth?.uid,id=deviceKey(req.data);if(!uid)throw new HttpsError('unauthenticated','Accedi a LionFit.');
 const ref=devices.doc(id);await db.runTransaction(async tx=>{const d=(await tx.get(ref)).data();if(d?.uid===uid)tx.delete(ref)});return {ok:true};
});
async function removeInvalid(ref,revision){await db.runTransaction(async tx=>{const d=(await tx.get(ref)).data();if(d?.revision===revision)tx.delete(ref)});}
async function sendToDevice(snap,kind,lead=0){
 const d=snap.data();if(!d||!validToken(d.token)||d.expires<=Date.now())return false;
 const n=message(kind,lead);try{await getMessaging().send({token:d.token,notification:n,data:{kind,open:'bookings'},android:{priority:'high',ttl:10*MINUTE,notification:{tag:kind==='test'?'lf-test':undefined}},webpush:{headers:{TTL:'600'},notification:{icon:'/icons/icon-192.png'}}});return true}
 catch(e){const code=e?.code||'';if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code))await removeInvalid(snap.ref,d.revision);logger.warn('FCM delivery rejected',{code:String(code)});return false;}
}
export const lfPushTest=onCall(options,async req=>{
 const u=await member(req),id=deviceKey(req.data),ref=devices.doc(id),rate=testLimits.doc(hash(u.uid)),now=Date.now();
 const snap=await db.runTransaction(async tx=>{const s=await tx.get(ref),prev=await tx.get(rate),d=s.data();if(!d||d.uid!==u.uid||d.gym!==u.gym||d.expires<=now)throw new HttpsError('failed-precondition','Attiva le notifiche sul dispositivo.');if((prev.data()?.at||0)>now-MINUTE)throw new HttpsError('resource-exhausted','Riprova tra un minuto.');tx.set(rate,{at:now});return s});
 if(!await sendToDevice(snap,'test'))throw new HttpsError('unavailable','FCM non ha accettato la notifica di prova.');return {accepted:true};
});
async function enqueue(j){const {id,due,...fields}=j;try{await jobs.doc(id).create({...fields,dueAt:stamp(due),createdAt:stamp(Date.now())});}catch(e){if(e?.code!==6&&e?.code!=='already-exists')throw e;}}
async function dispatch(ref,scope){
 if(!scope)return;
 // Claim before send: repeated triggers/scheduler cannot attempt the same event twice.
 // An ambiguous FCM timeout/crash is NOT retried (best effort, no exactly-once claim).
 const j=await db.runTransaction(async tx=>{const s=await tx.get(ref),d=s.data();if(!d?.dueAt||!scopeGym(scope,d.gym)||d.dueAt.toMillis()>Date.now())return null;tx.update(ref,{dueAt:FieldValue.delete(),purgeAt:stamp(Date.now()+7*DAY),claimedAt:stamp(Date.now())});return d});if(!j)return;
 if(!validId(j.gym)||!validId(j.booking)||!['booked','cancelled','reminder'].includes(j.kind)||j.expires<=Date.now())return;
 const bookingRef=db.doc(`gyms/${j.gym}/spark_booking_reservations/${j.booking}`);
 const b=(await bookingRef.get()).data();if(!pilotMatches(scope,j.gym,b)||!stillValid(j,b,Date.now()))return;
 for(const [uid,role] of [[b.athleteId,'athlete'],[b.coachId,'admin']]){
  const profileRef=db.doc(`users/${uid}`);const profile=(await profileRef.get()).data();if(!activeProfile(profile,j.gym,role))continue;
  const list=await devices.where('uid','==',uid).limit(25).get();
  for(const s of list.docs){const d=s.data();if(!recipientAllowed(j.gym,b,uid,role,profile,d,j,Date.now()))continue;
   // Re-read reservation, device and current membership immediately before sending.
   const [latest,device,currentProfile]=await Promise.all([bookingRef.get(),s.ref.get(),profileRef.get()]);const v=device.data(),current=latest.data();if(!pilotMatches(scope,j.gym,current)||!stillValid(j,current,Date.now())||current.athleteId!==b.athleteId||current.coachId!==b.coachId)return;if(!recipientAllowed(j.gym,current,uid,role,currentProfile.data(),v,j,Date.now()))continue;await sendToDevice(device,j.kind,j.lead);
  }
 }
}
export const lfBookingNotifications=onDocumentWritten({region:REGION,document:'gyms/{gymId}/spark_booking_reservations/{bookingId}',retry:true,maxInstances:3,timeoutSeconds:120},async event=>{
 projectGuard();const scope=pilotScope(process.env);if(!scope)return;const before=event.data?.before.data(),after=event.data?.after.data(),now=Date.now();if(!pilotMatches(scope,event.params.gymId,after))return;const scheduled=jobsForChange(event.params.gymId,event.params.bookingId,before,after,now);
 for(const j of scheduled)await enqueue(j);
 for(const j of scheduled.filter(x=>x.kind!=='reminder'))await dispatch(jobs.doc(j.id),scope);
});
export const lfBookingReminderSweep=onSchedule({region:REGION,schedule:'every 5 minutes',timeZone:'Europe/Rome',maxInstances:1,timeoutSeconds:240},async()=>{
 projectGuard();const scope=pilotScope(process.env);if(!scope)return;const now=stamp(Date.now());const ready=await jobs.where('dueAt','<=',now).orderBy('dueAt').limit(100).get();
 for(let i=0;i<ready.docs.length;i+=10)await Promise.allSettled(ready.docs.slice(i,i+10).map(s=>dispatch(s.ref,scope))).then(results=>{for(const r of results)if(r.status==='rejected')logger.warn('Notification job failed after claim');});
 // Bounded maintenance only for push-owned collections, in explicit all mode.
 if(scope.mode==='all'){
  const old=await jobs.where('purgeAt','<=',now).limit(100).get();if(old.size){const batch=db.batch();old.docs.forEach(s=>batch.delete(s.ref));await batch.commit();}
  const expired=await devices.where('expires','<=',Date.now()).limit(50).get();for(const s of expired.docs)await db.runTransaction(async tx=>{const d=(await tx.get(s.ref)).data();if(d&&d.expires<=Date.now())tx.delete(s.ref);});
 }
});
