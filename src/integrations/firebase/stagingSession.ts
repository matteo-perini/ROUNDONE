/** Sessione staging verificata dal server, mai dal ruolo scelto nella UI. */
import {shallowRef} from 'vue'
import {signInWithEmailAndPassword,signOut,browserLocalPersistence,browserSessionPersistence,setPersistence} from 'firebase/auth'
import {doc,getDocFromServer} from 'firebase/firestore'
import {getStagingClients} from './stagingClient'
import {isTestMode,stagingTestGym} from './stagingConfig'
import {resolveLegacyGymRole} from '../../features/auth/legacyRole'
export type StagingSession={uid:string;email:string;gymId:string;role:'atleta'|'titolare'|'collaboratore';label:string}
export const stagingSession=shallowRef<StagingSession|null>(null)
function safeId(x:unknown){return typeof x==='string' && x.length>=3 && x.length<=120 && !x.includes('/') && !x.includes('..')}
export async function readStagingSession():Promise<StagingSession>{
 const {auth,db}=getStagingClients()
 await auth.authStateReady()
 const user=auth.currentUser
 if(!user?.email)throw new Error('Accedi con un account Firebase.')
 const p=await getDocFromServer(doc(db,'users',user.uid))
 if(!p.exists())throw new Error('Profilo utente non presente su Firebase.')
 const d=p.data(),gymId=d.gymId
 if(!safeId(gymId))throw new Error('Identificativo palestra non valido.')
 if(isTestMode() && (!stagingTestGym() || gymId!==stagingTestGym()))throw new Error('In STAGING sono autorizzati solo gli account della palestra fittizia di collaudo. Nessun account importato è stato modificato.')
 if(typeof d.email==='string' && d.email.toLowerCase()!==user.email.toLowerCase())throw new Error('Email account diversa dal profilo.')
 const g=await getDocFromServer(doc(db,'gyms',gymId))
 if(!g.exists())throw new Error('Palestra non trovata su Firebase.')
 const role=resolveLegacyGymRole(user.uid,d,g.data())
 const result={uid:user.uid,email:user.email,gymId,role,label:String(d.name||user.email).slice(0,80)}
 stagingSession.value=result
 return result
}
export async function signInStaging(email:string,password:string,remember=true){
 const {auth}=getStagingClients()
 await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence)
 await signInWithEmailAndPassword(auth,email,password)
 try{return await readStagingSession()}catch(error){await signOut(auth);stagingSession.value=null;throw error}
}
export async function signOutStaging(){
 stagingSession.value=null
 const {auth}=getStagingClients()
 await signOut(auth)
}
