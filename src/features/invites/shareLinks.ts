/** PATCH 30 R4: links are bearer credentials. Never persist or log them here.
 * They are copied/opened only after the Coach explicitly chooses to share.
 */
export type ShareInviteKind='atleta'|'coach'
const TOKEN=/^[a-f0-9]{48}$/
const GYM=/^gym_[a-zA-Z0-9_-]{3,116}$/

export function shareToken(link:string,kind:ShareInviteKind,gymId:string,origin:string):string|null {
 try{
  const u=new URL(link),key=kind==='coach'?'coachInvite':'athleteInvite'
  if(u.origin!==origin||u.pathname!=='/www/index.html'||u.username||u.password||u.hash)return null
  if(!GYM.test(gymId)||u.searchParams.get('gym')!==gymId||u.searchParams.size!==2)return null
  const token=u.searchParams.get(key)||''
  return TOKEN.test(token)?token:null
 }catch{return null}
}

/** WhatsApp is always opened by a real user click, never by an automatic redirect. */
export function shareWhatsappUrl(link:string,kind:ShareInviteKind,gymName:string,gymId:string,origin:string):string {
 if(!shareToken(link,kind,gymId,origin))return ''
 const name=String(gymName||'LionFit').replace(/[\r\n\t\u0000-\u001f]/g,' ').trim().slice(0,70)||'LionFit'
 const context=kind==='coach'
  ?`Ciao! ${name} ti ha invitato come collaboratore su LionFit. Per registrarti usa l'indirizzo email al quale è destinato l'invito e verifica la tua email.`
  :`Ciao! ${name} ti ha invitato come atleta su LionFit.`
 const text=`${context}\nApri il tuo link personale (valido 7 giorni e utilizzabile una sola volta):\n${link}`
 const url=new URL('https://wa.me/')
 url.searchParams.set('text',text)
 return url.href
}
