#!/usr/bin/env node
/** LionFit PATCH 30 R7 — offline, read-only preflight.
 * Never talks to Firebase/Resend or prints API keys. Not a deployment tool.
 */
import {readFileSync,statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,resolve} from 'node:path'
import {makeInviteUrl,canSendInvite,quotaPermits} from '../invites-backend/functions/inviteCore.mjs'
import {defaultInviteStudio,studioMedia,renderStudioInviteEmail} from '../invites-backend/functions/studioCore.mjs'
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const read=file=>readFileSync(resolve(base,file),'utf8')
const results=[]
function check(label,fn){
 try{if(fn()!==true)throw new Error('controllo non soddisfatto');results.push({label,pass:true})}
 catch{results.push({label,pass:false})}
}
const backend=read('invites-backend/functions/index.mjs')
const ui=read('src/integrations/firebase/inviteMail.ts')
const functions=read('invites-backend/firebase.json')
const policy={
 project:process.env.LIONFIT_INVITES_PROJECT_ID||'',
 sendFlag:process.env.LIONFIT_INVITES_RESEND_ENABLED||'',
 studioFlag:process.env.LIONFIT_INVITES_STUDIO_ENABLED||'',
 senderPresent:Boolean(process.env.LIONFIT_INVITES_FROM_EMAIL),
 secretPresent:Boolean(process.env.LIONFIT_INVITES_RESEND_API_KEY)
}
check('Solo Resend tramite Callable Firebase, senza invio diretto dal browser',()=>ui.includes('sendCentralInviteEmail')&&ui.includes('mayWriteLive()')&&!ui.includes('VITE_LIONFIT_INVITES_PROVIDER')&&!ui.includes('api.emailjs.com'))
check('Cloud Function bloccata senza approvazione esplicita',()=>backend.includes("LIONFIT_INVITES_RESEND_ENABLED!=='ENABLED_AFTER_REVIEW'")&&backend.includes("FUNCTIONS_EMULATOR==='true'"))
check('Ruoli, inviti pendenti, quote e idempotenza conservati',()=>/canSendInvite\(/.test(backend)&&/quotaPermits\(/.test(backend)&&/db\.runTransaction\(/.test(backend)&&backend.includes('Idempotency-Key'))
check('Studio separato e non abilitato automaticamente',()=>backend.includes("LIONFIT_INVITES_STUDIO_ENABLED!=='ENABLED_AFTER_REVIEW'"))
check('Backend isolato in codebase dedicata',()=>functions.includes('lionfit-invites')&&functions.includes('nodejs22'))
check('Default logo PNG e copertina JPG embedded sotto 200 KB totali',()=>{
 const a=statSync(resolve(base,'invites-backend/functions/assets/lionfit-logo-default.png')).size
 const b=statSync(resolve(base,'invites-backend/functions/assets/lionfit-cover-default.jpg')).size
 return a>1000&&b>1000&&a+b<200000
})
check('Link monouso sicuri, tre CTA, fallback grafici',()=>{
 const gymId='gym_preflight',token='a'.repeat(48),url=makeInviteUrl('https://www.lionfit.it',gymId,'athlete',token)
 const studio=defaultInviteStudio('Palestra Test')
 const attachments=studioMedia({},studio)
 const mail=renderStudioInviteEmail({gymName:'Palestra Test',kind:'athlete',inviteUrl:url,studio,attachments})
 return mail.html.includes('Registrati')&&mail.html.includes('Scarica per Android')&&mail.html.includes('Guida iPhone')&&mail.html.includes('cid:lionfit-logo')&&mail.html.includes('cid:lionfit-cover')&&attachments.length===2
})
check('Blocco inviti da altre palestre',()=>{
 const uid='owner1',gymId='gym_preflight',now=Date.now()
 const base={uid,profile:{role:'admin',coachRole:'owner',gymId,membershipStatus:'active'},gym:{gymId,ownerUid:uid},invite:{gymId,status:'pending',createdBy:uid,expiresAt:now+86400000},kind:'athlete',recipient:'safe@example.org',now,emailVerified:true}
 return canSendInvite(base)&&!canSendInvite({...base,profile:{...base.profile,gymId:'gym_other'}})&&!canSendInvite({...base,invite:{...base.invite,status:'revoked'}})
})
check('Limiti quantitativi attivi',()=>quotaPermits(0,0)&&!quotaPermits(50,0)&&!quotaPermits(0,15))
for(const r of results)console.log(`${r.pass?'OK':'ERRORE'} · ${r.label}`)
console.log(`\nRisultato: ${results.filter(x=>x.pass).length}/${results.length} controlli locali superati.`)
if(policy.sendFlag==='ENABLED_AFTER_REVIEW'||policy.studioFlag==='ENABLED_AFTER_REVIEW'){
 console.log('ATTENZIONE: almeno un flag di attivazione backend è presente in questo ambiente. Verifica la configurazione prima di qualsiasi deploy.')
}
if(policy.project||policy.senderPresent||policy.secretPresent){
 console.log('Configurazione locale parziale o presente (valori e credenziali non visualizzati).')
}
console.log('Nessuna email inviata, nessuna lettura dati Firebase, nessun deploy effettuato.')
console.log('La verifica DNS Resend, Secret Manager, webhook e il test di consegna richiedono collaudo separato.')
if(results.some(r=>!r.pass))process.exitCode=1
