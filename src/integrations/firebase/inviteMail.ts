/** PATCH 30 R2: an explicit opt-in to centralized email; EmailJS stays the default. */
import {getStagingClients} from './stagingClient'
import {mayWriteLive} from './stagingConfig'
export type CentralInviteKind='athlete'|'coach'
export const centralizedInvitesEnabled=()=>import.meta.env.VITE_LIONFIT_INVITES_PROVIDER==='resend'
export async function sendCentralInviteEmail(input:{gymId:string;kind:CentralInviteKind;link:string;recipient:string;uid:string}) {
 if(!centralizedInvitesEnabled()||!mayWriteLive())throw new Error('Resend non è attivo in questo ambiente.')
 const {auth}=getStagingClients()
 if(!auth.currentUser||auth.currentUser.uid!==input.uid)throw new Error('Sessione cambiata: accedi nuovamente.')
 const u=new URL(input.link),name=input.kind==='coach'?'coachInvite':'athleteInvite'
 const token=u.searchParams.get(name)||''
 if(!/^[a-f0-9]{48}$/.test(token)||u.searchParams.get('gym')!==input.gymId ||u.pathname!=='/www/index.html')throw new Error('Link invito non valido.')
 const {getFunctions,httpsCallable}=await import('firebase/functions')
 const fn=httpsCallable<{gymId:string;kind:CentralInviteKind;token:string;recipient:string},{accepted:boolean;alreadySent:boolean}>(getFunctions(auth.app,'europe-west1'),'lfSendInviteEmail')
 const out=(await fn({gymId:input.gymId,kind:input.kind,token,recipient:input.recipient})).data
 if(auth.currentUser?.uid!==input.uid)throw new Error('Sessione cambiata durante l’invio.')
 if(!out.accepted)throw new Error('Servizio Resend non ha confermato la richiesta.')
 return out
}
