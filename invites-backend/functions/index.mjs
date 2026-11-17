/** PATCH 30 R2: isolated, OPT-IN backend. No deployment or sending by default. */
import {onCall,HttpsError} from 'firebase-functions/v2/https'
import {defineSecret} from 'firebase-functions/params'
import {initializeApp,getApps} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {validateRequest,makeInviteUrl,idempotencyKey,canSendInvite,quotaPermits,GYM_ID} from './inviteCore.mjs'
import {validateStudio,trustedStudio,defaultInviteStudio,studioMedia,renderStudioInviteEmail} from './studioCore.mjs'

if(!getApps().length)initializeApp()
const resendApiKey=defineSecret('LIONFIT_INVITES_RESEND_API_KEY')
const db=getFirestore(),REGION='europe-west1'
function denied(message='Invio non autorizzato.') {throw new HttpsError('permission-denied',message)}
function safeProject(){
 const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||''
 const allowed=String(process.env.LIONFIT_INVITES_PROJECT_ID||'').trim()
 if(!allowed||project!==allowed||project.startsWith('demo-'))throw new HttpsError('failed-precondition','Servizio inviti non abilitato su questo progetto.')
 if(process.env.FUNCTIONS_EMULATOR==='true')throw new HttpsError('failed-precondition','Invio esterno disabilitato su Emulator.')
 if(process.env.LIONFIT_INVITES_RESEND_ENABLED!=='ENABLED_AFTER_REVIEW')throw new HttpsError('failed-precondition','Resend non è ancora attivo: utilizzare EmailJS.')
 return project
}
function providerName(){
 const from=String(process.env.LIONFIT_INVITES_FROM_EMAIL||'').trim().toLowerCase()
 if(!/^[-a-z0-9_.+]+@[-a-z0-9.]+\.[a-z]{2,}$/.test(from)||/[<>\r\n]/.test(from))throw new HttpsError('failed-precondition','Mittente Resend non configurato.')
 return from
}
const today=()=>new Date().toISOString().slice(0,10).replaceAll('-','')
function studioEnabled(){
 const p=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||''
 if(!process.env.LIONFIT_INVITES_PROJECT_ID||p!==process.env.LIONFIT_INVITES_PROJECT_ID||p.startsWith('demo-')||process.env.LIONFIT_INVITES_STUDIO_ENABLED!=='ENABLED_AFTER_REVIEW')
  throw new HttpsError('failed-precondition','Email Studio cloud non ancora abilitato su questo progetto.')
}
async function studioAccess(req,write=false){
 studioEnabled()
 const uid=req.auth?.uid, gymId=req.data?.gymId
 if(!uid)throw new HttpsError('unauthenticated','Accedi a LionFit.')
 if(typeof gymId!=='string'||!GYM_ID.test(gymId)||Object.keys(req.data||{}).some(k=>!['gymId',...(write?['settings']:[])].includes(k)))throw new HttpsError('invalid-argument','Richiesta non valida.')
 if(req.auth.token.email_verified!==true)denied('Verifica la tua email prima di modificare il modello.')
 const [p,g]=await Promise.all([db.doc(`users/${uid}`).get(),db.doc(`gyms/${gymId}`).get()])
 const profile=p.data(),gym=g.data()
 if(!profile||!gym||profile.gymId!==gymId||profile.role!=='admin'||!['owner','collaborator'].includes(profile.coachRole)||profile.membershipStatus&&profile.membershipStatus!=='active')denied()
 if(write && (profile.coachRole!=='owner'||gym.ownerUid!==uid))denied('Solo il titolare può modificare il modello degli inviti.')
 return {uid,gymId}
}
export const lfReadInviteStudio=onCall({region:REGION,maxInstances:3},async req=>{
 const {gymId}=await studioAccess(req)
 const snap=await db.doc(`gyms/${gymId}/invite_email_studio/config`).get()
 return {settings:trustedStudio(snap.data()?.settings)}
})
export const lfSaveInviteStudio=onCall({region:REGION,maxInstances:3},async req=>{
 const {gymId,uid}=await studioAccess(req,true)
 let settings
 try{settings=validateStudio(req.data?.settings)}catch{throw new HttpsError('invalid-argument','Controlla i campi del modello email.')}
 await db.doc(`gyms/${gymId}/invite_email_studio/config`).set({settings,updatedBy:uid,updatedAt:FieldValue.serverTimestamp(),schemaVersion:1})
 return {saved:true}
})
/** Only an authenticated, active invitation creator may request a single dispatch.
 * The client cannot choose a sender, invite URL, branding or provider key.
 * A transaction claims each token exactly once and limits tenant/creator quotas.
 */
export const lfSendInviteEmail=onCall({region:REGION,secrets:[resendApiKey],maxInstances:3,timeoutSeconds:45,memory:'256MiB'},async req=>{
 safeProject()
 const uid=req.auth?.uid
 if(!uid)throw new HttpsError('unauthenticated','Accedi a LionFit.')
 let input
 try{input=validateRequest(req.data)}catch{throw new HttpsError('invalid-argument','Dati invito non validi.')}
 const {gymId,kind,token,recipient}=input
 const fromAddress=providerName()
 const base=String(process.env.LIONFIT_INVITES_PUBLIC_BASE||'').trim()
 if(process.env.LIONFIT_INVITES_PROJECT_ID==='app-palestra-b0b9d' && base!=='https://www.lionfit.it')throw new HttpsError('failed-precondition','URL inviti produzione non verificato.')
 let inviteUrl
 try{inviteUrl=makeInviteUrl(base,gymId,kind,token)}catch{throw new HttpsError('failed-precondition','URL pubblico inviti non configurato.')}
 const key=idempotencyKey(input)
 const invitation=db.doc(`gyms/${gymId}/${kind==='coach'?'coach_invites':'athlete_invites'}/${token}`)
 const dispatch=db.doc(`gyms/${gymId}/invitation_dispatch/${kind}_${token}`)
 const gymRef=db.doc(`gyms/${gymId}`),profileRef=db.doc(`users/${uid}`)
 const day=today()
 const gymQuota=db.doc(`gyms/${gymId}/invitation_mail_quotas/${day}`)
 const userQuota=db.doc(`gyms/${gymId}/invitation_mail_quotas/${day}_${uid}`)
 const now=Date.now()
 const claimed=await db.runTransaction(async tx=>{
  const [p,g,i,d,q,u]=await Promise.all([tx.get(profileRef),tx.get(gymRef),tx.get(invitation),tx.get(dispatch),tx.get(gymQuota),tx.get(userQuota)])
  const profile=p.data(),gym=g.data(),invite=i.data()
  const expiry=invite?.expiresAt?.toMillis?.()
  if(!canSendInvite({uid,profile,gym:{...gym,gymId},invite:{...invite,expiresAt:expiry},kind,recipient,now,emailVerified:req.auth.token.email_verified===true}))denied()
  if(d.exists){
   const old=d.data()
   if(old?.recipient!==recipient||old?.createdBy!==uid)denied('Questo invito è già associato a un altro destinatario.')
   if(old?.status==='accepted')return {alreadySent:true}
   throw new HttpsError('failed-precondition','Invio già avviato. Non ripetere automaticamente: controlla il recapito o genera un nuovo invito.')
  }
  if(!quotaPermits(q.data()?.count||0,u.data()?.count||0))throw new HttpsError('resource-exhausted','Limite email della palestra raggiunto. Riprova domani.')
  tx.create(dispatch,{status:'sending',kind,recipient,createdBy:uid,createdAt:FieldValue.serverTimestamp(),idempotencyKey:key,provider:'resend'})
  tx.set(gymQuota,{count:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true})
  tx.set(userQuota,{count:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true})
  return {alreadySent:false,gymName:String(gym.name||gym.gymName||invite.gymName||'LionFit')}
 })
 if(claimed.alreadySent)return {accepted:true,alreadySent:true}
 // Server-only tenant settings and existing gym images. Never accept branding from the sender's request.
 const [modelDoc,appearanceDoc]=await Promise.all([
  db.doc(`gyms/${gymId}/invite_email_studio/config`).get(),
  db.doc(`gyms/${gymId}/identity/appearance`).get()
 ])
 const studio=trustedStudio(modelDoc.data()?.settings)||defaultInviteStudio(claimed.gymName)
 const attachments=studioMedia(appearanceDoc.data(),studio)
 const mail=renderStudioInviteEmail({gymName:claimed.gymName,kind,inviteUrl,studio,attachments})
 // Never log recipient addresses, tokens, emails, or provider credentials.
 let response
 try{
  response=await fetch('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(25000),
   headers:{Authorization:`Bearer ${resendApiKey.value()}`,'Content-Type':'application/json','Idempotency-Key':key},
   body:JSON.stringify({from:`${mail.name} <${fromAddress}>`,to:[recipient],subject:mail.subject,html:mail.html,text:mail.text,...(mail.attachments?.length?{attachments:mail.attachments}:{})})
  })
 }catch{
  await dispatch.set({status:'unknown_delivery',finishedAt:FieldValue.serverTimestamp()},{merge:true})
  throw new HttpsError('unavailable','Stato della consegna sconosciuto. Non inviare di nuovo lo stesso invito.')
 }
 if(!response.ok){
  await dispatch.set({status:'rejected',providerHttpStatus:response.status,finishedAt:FieldValue.serverTimestamp()},{merge:true})
  throw new HttpsError('unavailable','Resend non ha accettato l’email. Controlla dominio, mittente e configurazione.')
 }
 let result
 try{result=await response.json()}catch{result={}}
 await dispatch.set({status:'accepted',providerId:typeof result?.id==='string'?result.id.slice(0,160):'',finishedAt:FieldValue.serverTimestamp()},{merge:true})
 return {accepted:true,alreadySent:false}
})
