/** PATCH 30 R8B: invitation-only callable backend; independent from Resend and current push jobs.
 * Server flag disabled by default. NO triggering on competition publication.
 * Uses exactly the existing seven competition_entries fields so the existing Rules
 * continue to allow coach results and roster reads; server writes via Admin SDK.
 */
import {initializeApp} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {getMessaging} from 'firebase-admin/messaging'
import {onCall,HttpsError} from 'firebase-functions/v2/https'
import {logger} from 'firebase-functions'
import {validId,validEventId,validRecipients,activeMember,canInviteEvent,isInvitationPending,pilotAllowed} from './inviteModel.mjs'
initializeApp()
const db=getFirestore(),REGION='europe-west1'
const opts={region:REGION,maxInstances:3,timeoutSeconds:60,concurrency:20}
function enabled(){
 if(process.env.LF_COMPETITION_INVITES_ENABLED!=='true')throw new HttpsError('failed-precondition','Inviti alle gare non ancora attivati.')
 const id=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT
 if(!id||id!==process.env.LF_COMPETITION_PROJECT_ID)throw new HttpsError('failed-precondition','Progetto Firebase non autorizzato.')
 if(!process.env.LF_COMPETITION_PILOT_GYM_ID)throw new HttpsError('failed-precondition','Palestra pilota non configurata.')
}
async function caller(req,role){
 enabled();const uid=req.auth?.uid
 if(!validId(uid))throw new HttpsError('unauthenticated','Accesso richiesto.')
 const p=(await db.doc(`users/${uid}`).get()).data(),gym=p?.gymId
 if(!validId(gym)||!activeMember(p,gym,role)||!pilotAllowed(gym,process.env.LF_COMPETITION_PILOT_GYM_ID))throw new HttpsError('permission-denied','Profilo non autorizzato o fuori dalla palestra pilota.')
 return {uid,gym,role}
}
const eventRef=(g,e)=>db.doc(`gyms/${g}/competitions/${e}`)
const entryRef=(g,e,u)=>db.doc(`gyms/${g}/competition_entries/${e}_${u}`)
const configRef=g=>db.doc(`gyms/${g}/agenda_config/competitions`)
const now=()=>Date.now()
async function pushTo(uid,gym,role,title,body,eventId){
 try{
  // Recheck current membership before considering any device for a push.
  const profile=(await db.doc(`users/${uid}`).get()).data()
  if(!activeMember(profile,gym,role)||!pilotAllowed(gym,process.env.LF_COMPETITION_PILOT_GYM_ID))return
  const rows=await db.collection('lf_push_devices').where('uid','==',uid).limit(15).get()
  const tokens=rows.docs.map(x=>x.data()).filter(x=>x?.gym===gym&&x.role===role&&x.expires>now()&&typeof x.token==='string'&&x.token.length>=20).map(x=>x.token)
  if(!tokens.length)return
  const results=await Promise.allSettled(tokens.map(token=>getMessaging().send({token,notification:{title,body},data:{kind:'competition-invite',open:'bookings',eventId},android:{priority:'high',ttl:600000},webpush:{headers:{TTL:'600'},notification:{icon:'/icons/icon-192.png'}}})))
  const rejected=results.filter(r=>r.status==='rejected').length
  if(rejected)logger.warn('Competition push partial rejection',{rejected,count:tokens.length})
 }catch(e){logger.warn('Competition push unavailable',{code:String(e?.code||'unknown')})}
}
export const lfCompetitionInvite=onCall(opts,async req=>{
 const u=await caller(req,'admin'),{eventId,athleteIds}=req.data||{}
 if(!validEventId(eventId)||!validRecipients(athleteIds))throw new HttpsError('invalid-argument','Evento o partecipanti non validi (massimo 35).')
 const [cfg,event,profiles]=await Promise.all([configRef(u.gym).get(),eventRef(u.gym,eventId).get(),db.getAll(...athleteIds.map(uid=>db.doc(`users/${uid}`)))])
 if(cfg.data()?.enabled!==true||!canInviteEvent(event.data(),now()))throw new HttpsError('failed-precondition','Gara non disponibile.')
 if(profiles.some((s,i)=>s.id!==athleteIds[i]||!activeMember(s.data(),u.gym,'athlete')))throw new HttpsError('permission-denied','Uno o più atleti non appartengono alla palestra.')
 const created=[];let already=0
 // Each entry is deterministically keyed; retries/duplicate clicks cannot re-invite.
 for(const athleteId of athleteIds){
  const didCreate=await db.runTransaction(async tx=>{
   const [configSnap,eventSnap,entrySnap]=await Promise.all([tx.get(configRef(u.gym)),tx.get(eventRef(u.gym,eventId)),tx.get(entryRef(u.gym,eventId,athleteId))])
   if(configSnap.data()?.enabled!==true||!canInviteEvent(eventSnap.data(),now()))throw new HttpsError('failed-precondition','La gara è stata annullata o disattivata.')
   if(entrySnap.exists)return false // existing voluntary request or invitation never overwritten
   tx.create(entryRef(u.gym,eventId,athleteId),{eventId,athleteId,status:'pending',result:'',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),updatedBy:u.uid})
   return true
  })
  if(didCreate)created.push(athleteId);else already++
 }
 const title=String(event.data()?.title||'una gara').slice(0,90)
 await Promise.all(created.map(id=>pushTo(id,u.gym,'athlete','LionFit · Invito a una gara',`Il tuo Coach ti ha invitato a ${title}. Apri l'Agenda e rispondi.`,eventId)))
 return {invited:created.length,already,push:'best-effort'} // no claim of delivery
})
export const lfCompetitionRespond=onCall(opts,async req=>{
 const u=await caller(req,'athlete'),{eventId,response}=req.data||{}
 if(!validEventId(eventId)||!['yes','no'].includes(response))throw new HttpsError('invalid-argument','Risposta non valida.')
 const target=entryRef(u.gym,eventId,u.uid)
 const updated=await db.runTransaction(async tx=>{
  const [cfg,event,entry]=await Promise.all([tx.get(configRef(u.gym)),tx.get(eventRef(u.gym,eventId)),tx.get(target)])
  if(cfg.data()?.enabled!==true||!canInviteEvent(event.data(),now()))throw new HttpsError('failed-precondition','Gara non disponibile.')
  if(!entry.exists||!isInvitationPending(entry.data())||entry.data().athleteId!==u.uid)throw new HttpsError('failed-precondition','Nessun invito in attesa per questo atleta.')
  const inviter=entry.data().updatedBy
  tx.update(target,{status:response==='yes'?'approved':'rejected',updatedAt:FieldValue.serverTimestamp(),updatedBy:u.uid})
  return {inviter,title:String(event.data()?.title||'Gara').slice(0,90)}
 })
 const recipient=(await db.doc(`users/${updated.inviter}`).get()).data()
 if(activeMember(recipient,u.gym,'admin'))await pushTo(updated.inviter,u.gym,'admin','LionFit · Risposta a una gara',`Un atleta ha risposto: ${response==='yes'?'Partecipo':'Non partecipo'} · ${updated.title}.`,eventId)
 return {status:response==='yes'?'approved':'rejected',push:'best-effort'}
})
