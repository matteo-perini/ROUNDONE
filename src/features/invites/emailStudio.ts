import {resolveSenderName} from '../branding/defaultBranding'

/** PATCH 30 R3: pure, tenant-scoped invite email presentation model.
 * Never trust these fields to authorize an invite, choose a recipient, or select a sender address.
 */
export type InviteEmailStudioSettings={
 senderName:string;subject:string;message:string;accent:string;theme:'dark'|'light';showLogo:boolean;showCover:boolean
}
export const studioDefaults=(gymName:string):InviteEmailStudioSettings=>({
 senderName:resolveSenderName('',gymName),
 subject:'Sei invitato su LionFit!',
 message:'La nostra palestra ti invita a entrare nel team. Registrati per iniziare ad allenarti con noi.',
 accent:'#D6B56B',theme:'dark',showLogo:true,showCover:true
})
const plain=(v:unknown,max:number)=>typeof v==='string' ? v.trim().replace(/[\u0000-\u001f\u007f<>"']/g,' ').replace(/\s+/g,' ').slice(0,max) : ''
const message=(v:unknown)=>typeof v==='string' ? v.trim().replace(/[\u0000-\u0009\u000B-\u001f\u007f]/g,'').slice(0,600) : ''
export function cleanStudio(value:unknown,gymName:string):InviteEmailStudioSettings {
 const d=studioDefaults(gymName),v=value && typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
 return {
  senderName:resolveSenderName(v.senderName,gymName)||d.senderName,
  subject:plain(v.subject,110)||d.subject,
  message:message(v.message)||d.message,
  accent:typeof v.accent==='string'&&/^#[a-fA-F0-9]{6}$/.test(v.accent)?v.accent.toUpperCase():d.accent,
  theme:v.theme==='light'?'light':'dark',
  showLogo:typeof v.showLogo==='boolean'?v.showLogo:d.showLogo,
  showCover:typeof v.showCover==='boolean'?v.showCover:d.showCover
 }
}
// Session-scoped identifiers, never secret tokens; keeping the user ID separates shared PCs.
export const draftKey=(gymId:string,uid:string)=>`lionfit-invite-studio-draft-v1:${encodeURIComponent(gymId)}:${encodeURIComponent(uid)}`
