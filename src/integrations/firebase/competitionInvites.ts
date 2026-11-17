/** PATCH 30 R8B: isolated callable actions. All authorization is rechecked on server. */
import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStagingClients} from './stagingClient'
import {mayWriteLive} from './stagingConfig'
export const competitionInvitesEnabled=()=>import.meta.env.VITE_LIONFIT_COMPETITION_INVITES_ENABLED==='true'
function api<T>(name:string,payload:Record<string,unknown>):Promise<T>{
 if(!mayWriteLive()||!competitionInvitesEnabled())throw new Error('Inviti alle gare non ancora attivati: prima collauda e distribuisci le Cloud Functions dedicate.')
 const auth=getStagingClients().auth
 if(!auth.currentUser)throw new Error('Accesso richiesto.')
 return httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(payload).then(result=>result.data)
}
export function sendCompetitionInvites(eventId:string,athleteIds:string[]){return api<{invited:number;already:number;push:string}>('lfCompetitionInvite',{eventId,athleteIds})}
export function respondToCompetitionInvite(eventId:string,response:'yes'|'no'){return api<{status:string;push:string}>('lfCompetitionRespond',{eventId,response})}
