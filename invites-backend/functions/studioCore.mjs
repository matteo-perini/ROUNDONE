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
  message:'La tua palestra ti invita a entrare nel team. Crea il tuo account LionFit per iniziare.',
  accent:'#24E58C',theme:'dark',showLogo:true,showCover:true
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
/** Presentation is data-only: no untrusted HTML or URLs are injected by the editor. */
export function presentStudio({gymName,kind,inviteUrl,studio,attachments=[]}){
 const label=kind==='coach'?'collaboratore':'atleta'
 const name=studio?.senderName||safeName(gymName)
 const subject=studio?.subject||`${safeName(gymName)} ti invita su LionFit`
 const intro=studio?.message||`Sei stato invitato a registrarti come ${label} su LionFit.`
 const color=studio?.accent||'#24E58C'
 const dark=!studio||studio.theme==='dark'
 const bg=dark?'#070e16':'#e9eef0',surface=dark?'#111c29':'#ffffff',fg=dark?'#f4f8fa':'#12202a',muted=dark?'#aab9c4':'#52616e'
 const withLogo=attachments.some(a=>a.content_id==='lionfit-logo'),withCover=attachments.some(a=>a.content_id==='lionfit-cover')
 const message=htmlEscape(intro).replace(/\n/g,'<br>')
 return {name,subject,intro,color,dark,bg,surface,fg,muted,withLogo,withCover,message,label}
}

/** Responsive, Gmail/Outlook-friendly HTML composed of real text and links.
 * Uses embedded CID assets: customized tenant logo/cover when available,
 * official LionFit logo/gym photo as independent fallbacks otherwise.
 */
export function renderStudioInviteEmail({gymName,kind,inviteUrl,studio,attachments=[]}){
 // Preserve validation of invite token and ALL THREE existing links.
 const original=makeInviteEmail({gymName,kind,inviteUrl})
 const applied=studio||defaultInviteStudio(gymName)
 const d=presentStudio({gymName,kind,inviteUrl,studio:applied,attachments})
 const f='#f5f9fb', role=d.label==='atleta'?'ATLETA':'COLLABORATORE'
 const panel=d.dark?'#0c1622':'#f2f7f7',border=d.dark?'#273845':'#d3dde0'
 const logo=d.withLogo?`<img src="cid:lionfit-logo" alt="Logo della palestra o di LionFit" width="92" style="display:block;width:92px;max-width:92px;height:auto;border:0;border-radius:16px">`:''
 const cover=d.withCover?`<tr><td style="padding:0 26px 0"><img src="cid:lionfit-cover" alt="Immagine della palestra" width="548" style="display:block;width:100%;max-width:548px;height:auto;border:0;border-radius:16px"></td></tr>`:''
 const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(d.subject)}</title></head>
<body style="margin:0;padding:0;background:${d.bg};font-family:Arial,Helvetica,sans-serif;color:${d.fg}">
<div style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">Hai ricevuto un invito personale su LionFit. Attiva il tuo account per entrare nel team.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${d.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:separate;width:100%;max-width:600px;background:${d.surface};border:1px solid ${border};border-radius:20px;overflow:hidden">
<tr><td style="padding:27px 28px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td width="110" valign="middle" style="width:110px">${logo}</td><td valign="middle" style="padding-left:12px;text-align:right"><div style="font-size:26px;font-weight:900;letter-spacing:1px;color:${d.fg}">LION<span style="color:${d.color}">FIT</span></div><div style="font-size:10px;letter-spacing:2px;font-weight:bold;color:${d.muted};padding-top:3px">INVITO UFFICIALE</div></td></tr></table></td></tr>
${cover}
<tr><td style="padding:28px 32px 12px"><div style="font-size:12px;letter-spacing:2px;color:${d.color};font-weight:bold">INVITO ${role}</div>
<h1 style="font-size:34px;line-height:1.18;margin:15px 0 9px;color:${d.fg};font-weight:900">Benvenuto nel team!</h1>
<p style="margin:0 0 18px;color:${d.color};font-weight:bold;font-size:20px;line-height:1.4">${htmlEscape(d.name)}</p>
<p style="font-size:16px;line-height:1.7;margin:0 0 12px;color:${d.fg}">${d.message}</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:${d.muted}">Questo è un invito personale per entrare come ${d.label}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="${d.color}" style="background:${d.color};border-radius:12px;padding:0"><a href="${htmlEscape(inviteUrl)}" style="display:block;padding:17px 20px;font-weight:800;font-size:17px;line-height:1.3;color:#08151a;text-decoration:none;border-radius:12px">Registrati su LionFit</a></td></tr></table>
<div style="margin:16px 0 20px;padding:13px 16px;border:1px solid ${border};background:${panel};border-radius:12px;color:${d.muted};font-size:13px;line-height:1.6">Invito personale e monouso · valido per <strong>7 giorni</strong></div>
</td></tr>
<tr><td style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${border};padding:20px 0"><div style="font-size:12px;line-height:1.5;color:${d.muted};margin-bottom:12px">Dopo la registrazione puoi utilizzare LionFit anche dal telefono.</div><a href="${htmlEscape(ANDROID)}" style="color:${d.color};font-size:13px;font-weight:bold;text-decoration:underline">Scarica per Android</a><span style="padding:0 8px;color:${d.muted}">·</span><a href="${htmlEscape(APPLE)}" style="color:${d.color};font-size:13px;font-weight:bold;text-decoration:underline">Guida iPhone / iPad</a></td></tr></table></td></tr>
<tr><td align="center" style="padding:0 26px 26px;font-size:11px;line-height:1.6;color:${d.muted}">Se non aspettavi questo invito, puoi ignorare il messaggio.<br>Powered by <strong>LionFit</strong></td></tr></table>
</td></tr></table></body></html>`
 const text=`${d.name} ti invita su LionFit come ${d.label}.\n\n${d.intro}\n\nRegistrati: ${inviteUrl}\n\nAndroid: ${ANDROID}\niPhone/iPad: ${APPLE}\n\nL'invito è personale, valido 7 giorni e può essere usato una sola volta. Se non aspettavi questo invito, ignora il messaggio.\nPowered by LionFit.`
 return {...original,name:d.name,subject:d.subject,text,html,attachments}
}
