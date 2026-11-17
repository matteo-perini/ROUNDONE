/** Pure validation/template helpers: never read secrets, contact Resend or Firestore here. */
import {createHash} from 'node:crypto'
export const INVITE_TOKEN=/^[a-f0-9]{48}$/
export const GYM_ID=/^[a-zA-Z0-9_-]{3,120}$/
export const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
export const ANDROID='https://github.com/matteo-perini/ROUNDONE/releases/latest/download/LionFit.apk'
export const APPLE='https://www.lionfit.it/www/ios.html'
export function normalizeEmail(value) {
 const email=typeof value==='string'?value.trim().toLowerCase():''
 if(email.length>254||!EMAIL.test(email)||/\r|\n/.test(email))throw new Error('invalid recipient')
 return email
}
export function validateRequest(data) {
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).some(k=>!['gymId','kind','token','recipient'].includes(k)))throw new Error('invalid input')
 const {gymId,kind,token}=data
 if(typeof gymId!=='string'||!GYM_ID.test(gymId)||!['athlete','coach'].includes(kind)||
  typeof token!=='string'||!INVITE_TOKEN.test(token))throw new Error('invalid invite')
 return {gymId,kind,token,recipient:normalizeEmail(data.recipient)}
}
export function safeName(value) {
 const v=String(value||'').replace(/[\r\n<>"'\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,70)
 return v||'LionFit'
}
export function makeInviteUrl(base,gymId,kind,token) {
 if(typeof base!=='string'||!base.trim())throw new Error('missing public base')
 const b=new URL(base)
 if(b.protocol!=='https:'||b.username||b.password||b.search||b.hash||b.pathname!=='/' || b.port)throw new Error('unsafe public base')
 if(!GYM_ID.test(gymId)||!INVITE_TOKEN.test(token)||!['coach','athlete'].includes(kind))throw new Error('invalid invite')
 const u=new URL('/www/index.html',b)
 u.searchParams.set('gym',gymId)
 u.searchParams.set(kind==='coach'?'coachInvite':'athleteInvite',token)
 return u.href
}
export function htmlEscape(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function makeInviteEmail({gymName,kind,inviteUrl}) {
 if(!['coach','athlete'].includes(kind))throw new Error('invalid invite kind')
 const u=new URL(inviteUrl)
 if(u.protocol!=='https:')throw new Error('unsafe link')
 const name=safeName(gymName),label=kind==='coach'?'collaboratore':'atleta'
 const subject=`${name} ti invita su LionFit`
 const text=`${name} ti ha invitato a registrarti come ${label} su LionFit.\nRegistrati: ${inviteUrl}\n\nAndroid: ${ANDROID}\niPhone/iPad: ${APPLE}\n\nL'invito scade dopo 7 giorni e può essere usato una sola volta.`
 const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#10141b;color:#f6f6f6;font:16px/1.5 Arial,sans-serif;padding:24px"><main style="max-width:540px;margin:auto;border:1px solid #343b46;border-radius:16px;padding:24px"><p style="color:#d6b56b;font-weight:700;font-size:22px">${htmlEscape(name)}</p><h1 style="font-size:24px">Benvenuto nel team!</h1><p>Sei stato invitato a registrarti come ${htmlEscape(label)} su LionFit.</p><p style="margin:28px 0"><a href="${htmlEscape(inviteUrl)}" style="background:#d6b56b;color:#111;padding:14px 22px;border-radius:9px;text-decoration:none;font-weight:bold">Registrati</a></p><p>L'invito è personale, monouso e valido 7 giorni.</p><hr style="border:0;border-top:1px solid #343b46"><p><a href="${ANDROID}" style="color:#d6b56b">Scarica per Android</a> &nbsp;·&nbsp; <a href="${APPLE}" style="color:#d6b56b">Guida iPhone / iPad</a></p><small style="color:#a6adb8">Powered by LionFit</small></main></body></html>`
 return {name,subject,text,html}
}
export function idempotencyKey({gymId,kind,token}) {
 return 'lionfit-invite-v1-'+createHash('sha256').update(`${gymId}:${kind}:${token}`).digest('hex')
}
export function canSendInvite({uid,profile,gym,invite,kind,recipient,now=Date.now(),emailVerified}) {
 if(!uid||!profile||!gym||!invite||!GYM_ID.test(profile.gymId||'')||profile.gymId!==invite.gymId||profile.gymId!==gym.gymId)return false
 if(!emailVerified || profile.role!=='admin'||profile.membershipStatus && profile.membershipStatus!=='active')return false
 if(!['owner','collaborator'].includes(profile.coachRole))return false
 if(kind==='coach' && (gym.ownerUid!==uid || profile.coachRole!=='owner'))return false
 if(kind==='athlete' && profile.coachRole==='owner' && gym.ownerUid!==uid)return false
 if(kind==='athlete' && profile.coachRole==='collaborator' && gym.ownerUid===uid)return false
 if(invite.status!=='pending'||invite.createdBy!==uid||!invite.expiresAt||!Number.isFinite(invite.expiresAt)||invite.expiresAt<=now)return false
 if(kind==='coach' && String(invite.email||'').toLowerCase()!==recipient)return false
 return true
}
export function quotaPermits(gymTotal,userTotal,gymMax=50,userMax=15){return Number.isInteger(gymTotal)&&Number.isInteger(userTotal)&&gymTotal>=0&&userTotal>=0&&gymTotal<gymMax&&userTotal<userMax}
