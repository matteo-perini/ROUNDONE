/** Sessione staging verificata dal server, mai dal ruolo scelto nella UI. */
import {shallowRef} from 'vue'
import {signInWithEmailAndPassword,signOut,browserLocalPersistence,browserSessionPersistence,setPersistence} from 'firebase/auth'
import {doc,getDocFromServer} from 'firebase/firestore'
import {getStagingClients} from './stagingClient'
import {isTestMode,stagingTestGym} from './stagingConfig'
import {clearOfflineForUser} from '../../features/progress/offlineWorkouts'
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
/**
 * Navigazione tra le pagine: evita due letture Firestore ad ogni tocco.
 * La sessione nasce sempre da readStagingSession() (profilo e palestra verificati).
 * Prima di riusarla controlliamo l'utente corrente in Firebase Auth: non basta
 * un ruolo salvato nel browser. Le Firestore Rules restano autoritative su dati
 * e scritture, e le pagine sensibili verificano il loro accesso come prima.
 * Non viene conservata una sessione in localStorage o in altre cache manuali.
 */
export async function readNavigationSession():Promise<StagingSession>{
 const {auth}=getStagingClients()
 await auth.authStateReady()
 const user=auth.currentUser
 if(!user?.email){stagingSession.value=null;throw new Error('Accedi con un account Firebase.')}
 const cached=stagingSession.value
 if(cached?.uid===user.uid && cached.email.toLowerCase()===user.email.toLowerCase())return cached
 // Prima navigazione / cambio account: verifica LIVE completa dal server.
 stagingSession.value=null
 return readStagingSession()
}
export async function signInStaging(email:string,password:string,remember=true){
 const {auth}=getStagingClients()
 await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence)
 await signInWithEmailAndPassword(auth,email,password)
 try{return await readStagingSession()}catch(error){await signOut(auth);stagingSession.value=null;throw error}
}
export async function signOutStaging(){
 const {auth,db}=getStagingClients()
 const user=auth.currentUser
 if(user){const {disconnectPushBeforeLogout}=await import('./pushNotifications');if(!await disconnectPushBeforeLogout())return false}
 if(user&&!clearOfflineForUser(localStorage,db.app.options.projectId||'',user.uid,()=>window.confirm('Uscendo perderai le bozze e gli allenamenti non sincronizzati salvati sul dispositivo. Continuare?')))return false
 stagingSession.value=null
 await signOut(auth)
 return true
}
