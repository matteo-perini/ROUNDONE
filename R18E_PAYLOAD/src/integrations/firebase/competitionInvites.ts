/** PATCH 30 R8B: isolated callable actions. All authorization is rechecked on server. */
import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStagingClients} from './stagingClient'
import {mayWriteLive} from './stagingConfig'
// Client visibility only; the server always rechecks gym, role and active membership.
// Missing scope preserves the single-gym pilot. All gyms requires EXPLICIT opt-in.
export const competitionInvitesEnabled=(gymId?:string)=>{
 if(import.meta.env.VITE_LIONFIT_COMPETITION_INVITES_ENABLED!=='true')return false
 if(gymId!==undefined&&!/^[A-Za-z0-9_-]{1,128}$/.test(gymId))return false
 const scope=String(import.meta.env.VITE_LIONFIT_COMPETITION_SCOPE||'pilot')
 if(scope==='all')return true
 if(scope!=='pilot')return false
 const pilot=String(import.meta.env.VITE_LIONFIT_COMPETITION_PILOT_GYM_ID||'')
 return /^[A-Za-z0-9_-]{1,128}$/.test(pilot)&&(!gymId||gymId===pilot)
}
function api<T>(name:string,payload:Record<string,unknown>):Promise<T>{
 if(!mayWriteLive()||!competitionInvitesEnabled())throw new Error('Inviti alle gare non ancora attivati: prima collauda e distribuisci le Cloud Functions dedicate.')
 const auth=getStagingClients().auth
 if(!auth.currentUser)throw new Error('Accesso richiesto.')
 return httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(payload).then(result=>result.data)
}
export function sendCompetitionInvites(eventId:string,athleteIds:string[]){return api<{invited:number;already:number;push:string}>('lfCompetitionInvite',{eventId,athleteIds})}
export function respondToCompetitionInvite(eventId:string,response:'yes'|'no'){return api<{status:string;push:string}>('lfCompetitionRespond',{eventId,response})}
