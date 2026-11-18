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
export type InviteStudioAccess={settings:InviteEmailStudioSettings|null;canEdit:boolean;isOwner:boolean;editorUids:string[]}
export async function loadGymInviteStudio(gymId:string,uid:string,kind:'athlete'|'coach'='athlete'){
 return studioCall<InviteStudioAccess>('lfReadInviteStudio',{gymId,kind},uid)
}
export async function saveGymInviteStudio(gymId:string,uid:string,settings:InviteEmailStudioSettings,kind:'athlete'|'coach'='athlete'){
 if(!mayWriteLive())throw new Error('Salvataggio disabilitato in questo ambiente.')
 return studioCall<{saved:boolean}>('lfSaveInviteStudio',{gymId,settings,kind},uid)
}

export async function saveGymInviteStudioEditors(gymId:string,uid:string,editorUids:string[]){
 if(!mayWriteLive())throw new Error('Salvataggio disabilitato in questo ambiente.')
 return studioCall<{saved:boolean;editorUids:string[]}>('lfSetInviteStudioEditors',{gymId,editorUids},uid)
}
