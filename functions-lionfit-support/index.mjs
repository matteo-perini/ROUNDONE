/** FASE1K candidate ONLY. DO NOT DEPLOY before release checklist and secrets. */
import {onDocumentCreated} from 'firebase-functions/v2/firestore'
import {defineSecret} from 'firebase-functions/params'
import {initializeApp,getApps} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {makeSupportMail,sendResendEmail} from './supportCore.mjs'

if (!getApps().length) initializeApp()
const resendKey = defineSecret('LIONFIT_SUPPORT_RESEND_API_KEY')
const recipient = defineSecret('LIONFIT_SUPPORT_RECIPIENT')
const sender = defineSecret('LIONFIT_SUPPORT_SENDER')

// A backend trigger, never an HTTP endpoint. The client never sees email secrets.
export const onLionFitSupportCreated = onDocumentCreated({
  document:'gyms/{gymId}/support_feedback/{feedbackId}',
  region:'europe-west1',
  secrets:[resendKey,recipient,sender],
  retry:false,
  maxInstances:2
}, async event => {
  if (!event.data) return
  const {gymId,feedbackId}=event.params
  const db=getFirestore()
  const receipt=db.doc(`gyms/${gymId}/support_dispatch/${feedbackId}`)
  const existing=await receipt.get()
  if (['sent','demo_recorded'].includes(existing.data()?.status)) return
  let mail
  try { mail=makeSupportMail(gymId,feedbackId,event.data.data()) }
  catch {
    await receipt.set({status:'invalid_payload',processedAt:FieldValue.serverTimestamp()},{merge:true})
    return
  }
  // A demo emulator is allowed to record mock delivery only. NEVER send external emails.
  const project=process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || ''
  if (project === 'demo-lionfit-fase1h-storage') {
    await receipt.set({status:'demo_recorded',idempotencyKey:mail.idempotencyKey,processedAt:FieldValue.serverTimestamp()},{merge:true})
    return
  }
  // Fail closed in production. Must be explicitly released AND configured with secrets.
  if (process.env.LIONFIT_SUPPORT_DELIVERY_APPROVED !== 'ENABLED_AFTER_REVIEW') {
    await receipt.set({status:'blocked_release',processedAt:FieldValue.serverTimestamp()},{merge:true})
    return
  }
  try {
    const result=await sendResendEmail({apiKey:resendKey.value(),recipient:recipient.value(),sender:sender.value(),mail})
    await receipt.set({status:'sent',provider:result.provider,providerId:result.providerId,idempotencyKey:mail.idempotencyKey,processedAt:FieldValue.serverTimestamp()},{merge:true})
  } catch (error) {
    // No message contents or provider credentials are logged or stored in receipts.
    await receipt.set({status:'delivery_failed',processedAt:FieldValue.serverTimestamp()},{merge:true})
    console.error('[FASE1K SUPPORT] Delivery failed (details withheld; check configuration)')
    throw error
  }
})
