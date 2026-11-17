/** R3: these callables are OPT-IN. No Firestore client writes or new Rules required. */
import {getStagingClients} from './stagingClient'
import {mayWriteLive} from './stagingConfig'
import type {InviteEmailStudioSettings} from '../../features/invites/emailStudio'
export const inviteStudioCloudEnabled=()=>import.meta.env.VITE_LIONFIT_INVITES_STUDIO_PROVIDER==='cloud'
async function studioCall<T>(name:string,payload:Record<string,unknown>,uid:string):Promise<T>{
 if(!inviteStudioCloudEnabled())throw new Error('Salvataggio cloud non ancora abilitato.')
 const {auth}=getStagingClients()
 if(!auth.currentUser||auth.currentUser.uid!==uid)throw new Error('Account cambiato: riaccedi.')
 const {getFunctions,httpsCallable}=await import('firebase/functions')
 const fn=httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)
 const out=(await fn(payload)).data
 if(auth.currentUser?.uid!==uid)throw new Error('Account cambiato durante l’operazione.')
 return out
}
export async function loadGymInviteStudio(gymId:string,uid:string){
 return studioCall<{settings:InviteEmailStudioSettings|null}>('lfReadInviteStudio',{gymId},uid)
}
export async function saveGymInviteStudio(gymId:string,uid:string,settings:InviteEmailStudioSettings){
 if(!mayWriteLive())throw new Error('Salvataggio disabilitato in questo ambiente.')
 return studioCall<{saved:boolean}>('lfSaveInviteStudio',{gymId,settings},uid)
}
