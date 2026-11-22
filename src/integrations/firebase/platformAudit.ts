/** R21G: opt-in until Functions and production Rules have both been verified. */
import {getStagingClients} from './stagingClient'
import {verifyPlatformAccess} from './platformAccess'
import {mayWriteLive} from './stagingConfig'
export const platformAuditEnabled=()=>import.meta.env.VITE_LIONFIT_PLATFORM_AUDIT==='ENABLED_AFTER_RULES_DEPLOY'
export type CommercialAuditEntry={id:string;kind:'commercial.exemption.changed';gymId:string;beforeExempt:boolean|null;afterExempt:boolean;actorUid:string;atMillis:number|null}
export type CommercialAuditPage={rows:CommercialAuditEntry[];cursor:string|null;more:boolean}
async function invoke<T>(name:'lfPlatformSetCommercialPreference'|'lfPlatformListCommercialAudit',payload:Record<string,unknown>):Promise<T>{
 if(!platformAuditEnabled())throw new Error('Registro audit non ancora attivato.')
 if(!await verifyPlatformAccess())throw new Error('Accesso Super Admin non verificato.')
 const {auth}=getStagingClients(),uid=auth.currentUser?.uid
 if(!uid)throw new Error('Accedi nuovamente al Control Center.')
 const {getFunctions,httpsCallable}=await import('firebase/functions')
 const result=await httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(payload)
 if(auth.currentUser?.uid!==uid||!await verifyPlatformAccess(false))throw new Error('Account cambiato durante la verifica.')
 return result.data
}
export async function auditedCommercialPreference(gymId:string,exempt:boolean){
 if(!mayWriteLive())throw new Error('Scritture non abilitate in questo ambiente.')
 return invoke<{changed:boolean;exempt:boolean;auditId:string|null}>('lfPlatformSetCommercialPreference',{gymId,exempt})
}
export async function listCommercialAudit(cursor:string|null=null){
 return invoke<CommercialAuditPage>('lfPlatformListCommercialAudit',cursor?{cursor}:{})
}
