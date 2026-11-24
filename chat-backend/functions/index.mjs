/** LionFit R22B — callable-only private chat. NO client Firestore permissions.
 * Disabled by default, with explicit pilot/allowlist/all modes; pilot remains the default.
 * No push here: R22C. No public deploy performed by this source file.
 */
import {initializeApp,getApps} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {onCall,HttpsError} from 'firebase-functions/v2/https'
import {readChatRollout,allowedGym,allowedPair,PROD_PROJECT} from './rolloutPolicy.mjs'
import {
 safeId,safeGym,validActor,pairFor,threadIdFor,threadValid,cleanText,
 validMessageKey,publicName,publicMessage,publicThread
} from './model.mjs'
if(!getApps().length)initializeApp()
const db=getFirestore()
const opts={region:'europe-west1',timeoutSeconds:30,memory:'256Mi',maxInstances:3}
const threads=db.collection('lf_private_chat_threads')
const inbox=uid=>db.collection('lf_private_chat_inbox').doc(uid).collection('threads')
const user=uid=>db.doc(`users/${uid}`)
const fail=(code,msg)=>{throw new HttpsError(code,msg)}
function rollout(){
 const pid=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||process.env.FIREBASE_CONFIG&&(()=>{try{return JSON.parse(process.env.FIREBASE_CONFIG).projectId}catch{return ''}})()
 const localDemo=process.env.FUNCTIONS_EMULATOR==='true' && pid==='demo-lionfit-chat'
 if(!localDemo&&!['lionfit-staging-test',PROD_PROJECT].includes(pid))fail('failed-precondition','Progetto Firebase non autorizzato per la Chat.')
 const policy=readChatRollout(process.env,pid)
 if(!policy)fail('failed-precondition','Chat non abilitata o configurazione rollout non valida.')
 return policy
}
function gatePair(pair,roll){
 if(!allowedPair(pair,roll,process.env))fail('permission-denied','Conversazione non abilitata o autorizzazione non valida.')
}
async function actor(req){
 const roll=rollout(),uid=req.auth?.uid
 if(!safeId(uid))fail('unauthenticated','Accedi al tuo account LionFit.')
 const me=(await user(uid).get()).data()
 if(!allowedGym(me?.gymId,roll))fail('permission-denied','Palestra non autorizzata.')
 const gym=(await db.doc(`gyms/${me.gymId}`).get()).data()
 const a=validActor(uid,me,gym)
 if(!a)fail('permission-denied','Profilo o ruolo non attivo.')
 if(roll.mode==='pilot'&&roll.pid===PROD_PROJECT&&uid!==process.env.LF_CHAT_PILOT_COACH_UID&&uid!==process.env.LF_CHAT_PILOT_ATHLETE_UID)fail('permission-denied','Account fuori dal test.')
 return {a,me,gym,roll}
}
async function verifiedPeer(ctx,peerUid){
 if(!safeId(peerUid))fail('invalid-argument','Destinatario non valido.')
 const other=(await user(peerUid).get()).data()
 const pair=pairFor(ctx.a,peerUid,other,ctx.me,ctx.gym)
 if(!pair)fail('permission-denied','Non puoi contattare questo account.')
 gatePair(pair,ctx.roll)
 return {pair,other,peerUid}
}
async function verifiedThread(ctx,id){
 if(!safeId(id))fail('invalid-argument','Conversazione non valida.')
 const ref=threads.doc(id),snap=await ref.get(),d=snap.data()
 if(!d||d.gymId!==ctx.a.gymId)fail('not-found','Conversazione non disponibile.')
 const peerUid=d.coachUid===ctx.a.uid?d.athleteUid:d.athleteUid===ctx.a.uid?d.coachUid:null
 if(!safeId(peerUid))fail('permission-denied','Conversazione non autorizzata.')
 const {pair,other}=await verifiedPeer(ctx,peerUid)
 if(!threadValid(id,d,ctx.a,other,ctx.me,ctx.gym)||threadIdFor(pair)!==id)fail('permission-denied','Conversazione non autorizzata.')
 return {ref,d,peerUid,other,pair}
}
async function allContacts(ctx){
 // Server-scope gymId; no email, private notes, or other profile properties leave the backend.
 // WARNING: limited to 350 profiles per gym; finish pagination/load tests before enabling ALL.
 const snaps=await db.collection('users').where('gymId','==',ctx.a.gymId).limit(350).get()
 const results=[]
 for(const snap of snaps.docs){
  if(snap.id===ctx.a.uid)continue
  const profile=snap.data(),pair=pairFor(ctx.a,snap.id,profile,ctx.me,ctx.gym)
  if(!pair)continue
  try{gatePair(pair,ctx.roll)}catch{continue}
  results.push({uid:snap.id,name:publicName(profile,snap.id),threadId:threadIdFor(pair)})
 }
 return results.sort((a,b)=>a.name.localeCompare(b.name,'it')).slice(0,200)
}
/** Eligibility only controls the pilot UI. All message functions still enforce their own ACL. */
export const lfChatPilotStatus=onCall(opts,async req=>{
 try{
  // Return a uniform denial for visitors and non-pilot accounts, before any profile reads.
  const roll=rollout()
  const uid=req.auth?.uid
  if(!safeId(uid))return {enabled:false}
  if(roll.mode==='pilot'&&roll.pid===PROD_PROJECT&&
    uid!==process.env.LF_CHAT_PILOT_COACH_UID&&uid!==process.env.LF_CHAT_PILOT_ATHLETE_UID)
   return {enabled:false}
  const ctx=await actor(req)
  if(roll.mode!=='pilot')return {enabled:true}
  const peerUid=ctx.a.role==='coach'?process.env.LF_CHAT_PILOT_ATHLETE_UID:process.env.LF_CHAT_PILOT_COACH_UID
  if(!safeId(peerUid))return {enabled:false}
  const other=(await user(peerUid).get()).data()
  const pair=pairFor(ctx.a,peerUid,other,ctx.me,ctx.gym)
  if(!pair)return {enabled:false}
  gatePair(pair,ctx.roll)
  return {enabled:true}
 }catch(e){
  if(e instanceof HttpsError&&['unauthenticated','permission-denied','failed-precondition'].includes(e.code))return {enabled:false}
  throw e
 }
})
export const lfChatContacts=onCall(opts,async req=>{
 const ctx=await actor(req)
 return {rows:await allContacts(ctx)}
})
export const lfChatOpen=onCall(opts,async req=>{
 const ctx=await actor(req),{pair,other,peerUid}=await verifiedPeer(ctx,req.data?.peerUid)
 const id=threadIdFor(pair),ref=threads.doc(id),a=inbox(pair.coachUid).doc(id),b=inbox(pair.athleteUid).doc(id),now=Date.now()
 await db.runTransaction(async tx=>{
  const [meSnap,peerSnap,gymSnap,existing,one,two]=await Promise.all([
   tx.get(user(ctx.a.uid)),tx.get(user(peerUid)),tx.get(db.doc(`gyms/${ctx.a.gymId}`)),
   tx.get(ref),tx.get(a),tx.get(b)
  ])
  const freshMe=meSnap.data(),freshPeer=peerSnap.data(),freshGym=gymSnap.data()
  const actorNow=validActor(ctx.a.uid,freshMe,freshGym)
  const pairNow=actorNow&&pairFor(actorNow,peerUid,freshPeer,freshMe,freshGym)
  if(!pairNow||threadIdFor(pairNow)!==id)fail('permission-denied','Autorizzazione cambiata: aggiorna la Chat.')
  gatePair(pairNow,ctx.roll)
  if(existing.exists){
   if(!threadValid(id,existing.data(),actorNow,freshPeer,freshMe,freshGym))fail('permission-denied','Conversazione non valida.')
   if(!one.exists||!two.exists)fail('failed-precondition','Stato della chat incompleto: contatta l’assistenza.')
   return
  }
  tx.create(ref,{...pair,createdAt:FieldValue.serverTimestamp(),updatedAt:now,lastText:'',lastMessageFrom:'',lastMessageAt:0})
  for(const target of [a,b])tx.create(target,{...pair,updatedAt:now,unread:0,lastText:'',lastSentAt:0,windowStart:0,windowCount:0})
 })
 return {id,peerUid,peerName:publicName(other,peerUid)}
})
export const lfChatList=onCall(opts,async req=>{
 const ctx=await actor(req),rows=[]
 const snaps=await inbox(ctx.a.uid).orderBy('updatedAt','desc').limit(40).get()
 for(const d of snaps.docs){
  const row=d.data(),peerUid=row.coachUid===ctx.a.uid?row.athleteUid:row.athleteUid===ctx.a.uid?row.coachUid:null
  if(!safeId(peerUid)||row.gymId!==ctx.a.gymId)continue
  const other=(await user(peerUid).get()).data()
  const pair=pairFor(ctx.a,peerUid,other,ctx.me,ctx.gym)
  if(!pair||threadIdFor(pair)!==d.id)continue
  try{gatePair(pair,ctx.roll)}catch{continue}
  const item=publicThread(d.id,row,ctx.a.uid,publicName(other,peerUid));if(item)rows.push(item)
 }
 return {rows,unread:rows.reduce((n,r)=>n+r.unread,0)}
})
export const lfChatUnread=onCall(opts,async req=>{
 const ctx=await actor(req)
 const rows=(await inbox(ctx.a.uid).where('unread','>',0).limit(100).get()).docs
 let unread=0
 for(const row of rows){
  const d=row.data(),peer=d.coachUid===ctx.a.uid?d.athleteUid:d.athleteUid===ctx.a.uid?d.coachUid:null
  if(!safeId(peer)||d.gymId!==ctx.a.gymId)continue
  const other=(await user(peer).get()).data(),pair=pairFor(ctx.a,peer,other,ctx.me,ctx.gym)
  if(!pair||threadIdFor(pair)!==row.id)continue
  try{gatePair(pair,ctx.roll)}catch{continue}
  unread+=Number.isSafeInteger(d.unread)&&d.unread>0?d.unread:0
 }
 return {unread:Math.min(unread,999)}
})
export const lfChatHistory=onCall(opts,async req=>{
 const ctx=await actor(req),id=req.data?.threadId
 const {ref}=await verifiedThread(ctx,id)
 let q=ref.collection('messages').orderBy('createdAtMs','desc').limit(45)
 const cursor=req.data?.beforeId
 if(cursor!==undefined){
  if(!validMessageKey(cursor))fail('invalid-argument','Cursore non valido.')
  const d=await ref.collection('messages').doc(cursor).get()
  if(!d.exists)fail('failed-precondition','Cronologia aggiornata: riprova.')
  q=q.startAfter(d)
 }
 const snaps=await q.get()
 return {rows:snaps.docs.map(s=>publicMessage(s.id,s.data())).filter(Boolean).reverse(),beforeId:snaps.size===45?snaps.docs.at(-1)?.id??null:null}
})
export const lfChatSend=onCall(opts,async req=>{
 const ctx=await actor(req),id=req.data?.threadId,key=req.data?.requestId,content=cleanText(req.data?.text)
 if(!validMessageKey(key)||!content)fail('invalid-argument','Messaggio o identificativo non valido.')
 const {ref,pair,peerUid}=await verifiedThread(ctx,id)
 const m=ref.collection('messages').doc(key),sender=inbox(ctx.a.uid).doc(id),recipient=inbox(peerUid).doc(id)
 // Identity and authorizations are re-checked INSIDE the write transaction to prevent
 // messages after revocation, reassignment, or account switches during request processing.
 const result=await db.runTransaction(async tx=>{
  const [myDoc,peerDoc,gymDoc,threadDoc,msgDoc,sDoc,rDoc]=await Promise.all([
   tx.get(user(ctx.a.uid)),tx.get(user(peerUid)),tx.get(db.doc(`gyms/${ctx.a.gymId}`)),tx.get(ref),tx.get(m),tx.get(sender),tx.get(recipient)
  ])
  const freshGym=gymDoc.data(),freshMe=myDoc.data(),freshPeer=peerDoc.data()
  const me=validActor(ctx.a.uid,freshMe,freshGym)
  if(!me||!threadValid(id,threadDoc.data(),me,freshPeer,freshMe,freshGym)||threadIdFor(pair)!==id)fail('permission-denied','Autorizzazione cambiata: aggiorna la Chat.')
  if(msgDoc.exists){if(msgDoc.data()?.fromUid===me.uid&&msgDoc.data()?.text===content)return {id:key,duplicate:true,createdAt:msgDoc.data()?.createdAtMs||0};fail('already-exists','Identificativo messaggio già usato.')}
  if(!sDoc.exists||!rDoc.exists)fail('failed-precondition','Conversazione incompleta.')
  const now=Date.now(),last=sDoc.data()?.lastSentAt||0,windowStart=sDoc.data()?.windowStart||0,windowCount=sDoc.data()?.windowCount||0
  if(now-last<800)fail('resource-exhausted','Invii troppo ravvicinati: attendi un momento.')
  if(now-windowStart<60000&&windowCount>=20)fail('resource-exhausted','Hai raggiunto il limite temporaneo dei messaggi.')
  const newWindow=now-windowStart>=60000
  tx.create(m,{fromUid:me.uid,text:content,createdAt:FieldValue.serverTimestamp(),createdAtMs:now})
  tx.update(ref,{lastText:content.slice(0,90),lastMessageFrom:me.uid,lastMessageAt:now,updatedAt:now})
  tx.update(sender,{lastText:content.slice(0,90),updatedAt:now,lastSentAt:now,windowStart:newWindow?now:windowStart,windowCount:newWindow?1:windowCount+1})
  tx.update(recipient,{lastText:content.slice(0,90),updatedAt:now,unread:FieldValue.increment(1)})
  return {id:key,duplicate:false,createdAt:now}
 })
 return result
})
export const lfChatMarkRead=onCall(opts,async req=>{
 const ctx=await actor(req),id=req.data?.threadId
 const {ref:threadRef,peerUid}=await verifiedThread(ctx,id)
 const ref=inbox(ctx.a.uid).doc(id)
 const seenAt=req.data?.seenAt
 if(!Number.isSafeInteger(seenAt)||seenAt<0)fail('invalid-argument','Lettura non valida.')
 await db.runTransaction(async tx=>{
  const [meSnap,peerSnap,gymSnap,current,thread]=await Promise.all([
   tx.get(user(ctx.a.uid)),tx.get(user(peerUid)),tx.get(db.doc(`gyms/${ctx.a.gymId}`)),tx.get(ref),tx.get(threadRef)
  ])
  const freshMe=meSnap.data(),freshPeer=peerSnap.data(),freshGym=gymSnap.data()
  const actorNow=validActor(ctx.a.uid,freshMe,freshGym)
  if(!actorNow||!threadValid(id,thread.data(),actorNow,freshPeer,freshMe,freshGym))fail('permission-denied','Autorizzazione cambiata: aggiorna la Chat.')
  if(!current.exists||current.data()?.gymId!==ctx.a.gymId||!thread.exists)fail('not-found','Conversazione non disponibile.')
  // Never acknowledge a message newer than the last one actually displayed.
  if((thread.data()?.lastMessageAt||0)>seenAt)return
  if((current.data()?.unread||0)>0)tx.update(ref,{unread:0,readAt:Date.now()})
 })
 return {ok:true}
})
