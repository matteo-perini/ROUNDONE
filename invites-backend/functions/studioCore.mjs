/** Pure server validation and presentation of invitation emails.
 * No user-provided URLs, no sender addresses, no credentials, no network calls.
 * PATCH 30 R7: use the same fallback brand as the R5.1 welcome/email preview.
 */
import {readFileSync} from 'node:fs'
import {safeName,htmlEscape,makeInviteEmail,ANDROID,APPLE} from './inviteCore.mjs'
export const EMAIL_STUDIO_FIELDS=['senderName','subject','message','accent','theme','showLogo','showCover']
export function validateStudio(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!EMAIL_STUDIO_FIELDS.includes(k))||EMAIL_STUDIO_FIELDS.some(k=>!(k in raw)))throw new Error('invalid studio fields')
 const {senderName,subject,message,accent,theme,showLogo,showCover}=raw
 const oneLine=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\r\n<>\u0000-\u001f\u007f]/.test(v) && v.trim()===v
 if(!oneLine(senderName,70)||!oneLine(subject,110)||typeof message!=='string'||message.length<1||message.length>600||/[\u0000-\u0009\u000b-\u001f\u007f]/.test(message)||message.trim()!==message||!/^#[0-9a-fA-F]{6}$/.test(accent)||!['dark','light'].includes(theme)||typeof showLogo!=='boolean'||typeof showCover!=='boolean')throw new Error('invalid studio data')
 return {senderName:safeName(senderName),subject,message,accent:accent.toUpperCase(),theme,showLogo,showCover}
}
export function trustedStudio(raw){try{return validateStudio(raw)}catch{return null}}

/** Default when there is no saved model. This is NOT persisted to Firestore. */
export function defaultInviteStudio(gymName){
 return {
  senderName:safeName(String(gymName||'').trim()||'LionFit Team'),
  subject:'Sei invitato su LionFit!',
  message:'La nostra palestra ti invita a entrare nel team. Registrati per iniziare ad allenarti con noi.',
  accent:'#D6B56B',theme:'dark',showLogo:true,showCover:true
 }
}
export function imagePart(data,max=120000){
 if(typeof data!=='string'||data.length>max)return null
 const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data)
 if(!m||m[2].length%4!==0)return null
 // Most mail clients do not display WebP reliably; fallback PNG/JPEG is used instead.
 if(m[1]==='webp')return null
 return {content:m[2],filename:m[1]==='png'?'lionfit-logo.png':'lionfit-logo.jpg',content_type:`image/${m[1]}`}
}
/** Embedded fixed app assets: no remote image fetch, even for user-provided gym data. */
const DEFAULT_ASSETS=Object.freeze({
 logo:{bytes:readFileSync(new URL('./assets/lionfit-logo-default.png',import.meta.url)),filename:'lionfit-logo-default.png',content_type:'image/png'},
 cover:{bytes:readFileSync(new URL('./assets/lionfit-cover-default.jpg',import.meta.url)),filename:'lionfit-cover-default.jpg',content_type:'image/jpeg'}
})
function defaultMedia(kind){
 const a=DEFAULT_ASSETS[kind]
 return {content:a.bytes.toString('base64'),filename:a.filename,content_type:a.content_type}
}
export function studioMedia(appearance,settings){
 const attachments=[]
 const options=settings||defaultInviteStudio('')
 if(options.showLogo){
  const pic=imagePart(appearance?.logo,120000)||defaultMedia('logo')
  attachments.push({...pic,content_id:'lionfit-logo'})
 }
 if(options.showCover){
  const pic=imagePart(appearance?.cover,420000)||defaultMedia('cover')
  attachments.push({...pic,filename:pic.filename.replace('logo','cover'),content_id:'lionfit-cover'})
 }
 return attachments
}
export function presentStudio({gymName,kind,inviteUrl,studio,attachments=[]}){
 const label=kind==='coach'?'collaboratore':'atleta'
 const name=studio?.senderName||safeName(gymName)
 const subject=studio?.subject||`${safeName(gymName)} ti invita su LionFit`
 const intro=studio?.message||`Sei stato invitato a registrarti come ${label} su LionFit.`
 const color=studio?.accent||'#D6B56B'
 const dark=!studio||studio.theme==='dark'
 const bg=dark?'#10141b':'#f4f5f7',surface=dark?'#171f2c':'#ffffff',fg=dark?'#f6f6f6':'#17231d',muted=dark?'#a6adb8':'#475569'
 const withLogo=attachments.some(a=>a.content_id==='lionfit-logo'),withCover=attachments.some(a=>a.content_id==='lionfit-cover')
 const p=htmlEscape(intro).replace(/\n/g,'<br>')
 const block=`${withLogo?'<p><img src="cid:lionfit-logo" alt="Logo palestra" style="max-width:130px;max-height:90px;object-fit:contain"></p>':''}<p style="color:${color};font-size:22px;font-weight:700">${htmlEscape(name)}</p>${withCover?'<p><img src="cid:lionfit-cover" alt="Foto palestra" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px"></p>':''}`
 return {name,subject,intro,block,bg,surface,fg,muted,color,p,label}
}
export function renderStudioInviteEmail({gymName,kind,inviteUrl,studio,attachments=[]}){
 // Preserve server validation of the invitation URL and ALL three existing CTAs.
 const original=makeInviteEmail({gymName,kind,inviteUrl})
 const applied=studio||defaultInviteStudio(gymName)
 const d=presentStudio({gymName,kind,inviteUrl,studio:applied,attachments})
 const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:${d.bg};color:${d.fg};font:16px/1.5 Arial,sans-serif;padding:24px"><main style="max-width:540px;margin:auto;background:${d.surface};border:1px solid ${d.muted};border-radius:16px;padding:24px">${d.block}<h1 style="font-size:24px">Benvenuto nel team!</h1><p>${d.p}</p><p>Invito personale per ${htmlEscape(d.label)}.</p><p style="margin:28px 0"><a href="${htmlEscape(inviteUrl)}" style="display:inline-block;background:${d.color};color:#111;padding:14px 22px;border-radius:9px;text-decoration:none;font-weight:bold">Registrati</a></p><p>L'invito è personale, monouso e valido 7 giorni.</p><hr style="border:0;border-top:1px solid ${d.muted}"><p><a href="${ANDROID}" style="color:${d.color}">Scarica per Android</a> &nbsp;·&nbsp; <a href="${APPLE}" style="color:${d.color}">Guida iPhone / iPad</a></p><small style="color:${d.muted}">Powered by LionFit</small></main></body></html>`
 const text=`${d.name} ti invita su LionFit come ${d.label}.\n${d.intro}\nRegistrati: ${inviteUrl}\n\nAndroid: ${ANDROID}\niPhone/iPad: ${APPLE}\n\nL'invito scade dopo 7 giorni e può essere usato una sola volta.`
 return {...original,name:d.name,subject:d.subject,text,html,attachments}
}
