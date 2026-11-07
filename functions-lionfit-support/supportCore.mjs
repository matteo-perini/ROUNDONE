/** LionFit FASE1K - validation/formatting and provider adapter; no Firebase import. */
import { createHash } from 'node:crypto'

export function parseSupportFeedback(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('feedback_missing')
  if (typeof raw.message !== 'string' || raw.message.length < 1 || raw.message.length > 4000) throw new Error('invalid_message')
  if (typeof raw.athleteName !== 'string' || raw.athleteName.length > 150) throw new Error('invalid_sender_name')
  if (raw.athleteId !== undefined && (typeof raw.athleteId !== 'string' || !raw.athleteId)) throw new Error('invalid_athlete_id')
  return {
    name: raw.athleteName.trim() || 'Membro palestra',
    message: raw.message,
    athleteId: typeof raw.athleteId === 'string' ? raw.athleteId : null
  }
}

export function safeDocumentId(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 180 && !value.includes('/') && value !== '.' && value !== '..'
}

export function makeSupportMail(gymId, feedbackId, raw) {
  if (!safeDocumentId(gymId) || !safeDocumentId(feedbackId)) throw new Error('invalid_document_path')
  const parsed = parseSupportFeedback(raw)
  // The display name is client-supplied in legacy ROUNDONE; do not claim verified identity.
  const text = [
    'Nuova richiesta assistenza LionFit',
    'Palestra (ID): ' + gymId,
    'Segnalazione (ID): ' + feedbackId,
    'Nome dichiarato: ' + parsed.name,
    'UID atleta dichiarato: ' + (parsed.athleteId || 'non incluso nel client Coach'),
    '',
    parsed.message
  ].join('\n')
  const key = 'lf-support-' + createHash('sha256').update(gymId + '\0' + feedbackId).digest('hex')
  return {subject: 'LionFit - nuovo messaggio di assistenza', text, idempotencyKey: key}
}

function validEmail(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 }
export async function sendResendEmail({apiKey, recipient, sender, mail, fetchImpl = fetch}) {
  if (typeof apiKey !== 'string' || !apiKey.startsWith('re_') || apiKey.length < 7) throw new Error('resend_key_missing')
  if (!validEmail(recipient)) throw new Error('support_recipient_missing')
  // Resend from can be Name <verified@domain.com> or plain email.
  const senderEmail = typeof sender === 'string' && sender.includes('<') ? sender.match(/<([^>]+)>/)?.[1] : sender
  if (!validEmail(senderEmail)) throw new Error('support_sender_missing')
  if (!mail || typeof mail.text !== 'string' || typeof mail.idempotencyKey !== 'string') throw new Error('mail_invalid')
  const r = await fetchImpl('https://api.resend.com/emails', {
    method:'POST',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':mail.idempotencyKey},
    body:JSON.stringify({from:sender,to:[recipient],subject:mail.subject,text:mail.text}),
    signal:AbortSignal.timeout(10000)
  })
  if (!r.ok) throw new Error('provider_http_' + r.status)
  const data = await r.json()
  if (typeof data.id !== 'string' || !data.id) throw new Error('provider_no_id')
  return {provider:'resend',providerId:data.id}
}
