import { getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, initializeAuth, getAuth, setPersistence, signInWithEmailAndPassword, signOut, updateCurrentUser, type Auth } from 'firebase/auth'
import { doc, getDocFromServer, getFirestore, waitForPendingWrites } from 'firebase/firestore'
import { shallowRef, ref } from 'vue'
import { getStagingClients } from './stagingClient'
import { isLiveMode } from './stagingConfig'
import { isControlIdentity } from '../../features/platform/controlAccess'
import { resolveLegacyGymRole } from '../../features/auth/legacyRole'
import { makePair, parsePair, parseSwitch, sideOf, opposite, uidFor, switchIntent, matchesIntent, type ProfilePair, type LinkIdentity, type LinkSide } from '../../features/auth/linkedProfileModel'
import { stagingSession } from './stagingSession'
import { readOffline } from '../../features/progress/offlineWorkouts'

export const linkedPair=shallowRef<ProfilePair|null>(null)
export const linkedBusy=ref(false)
export const linkedNotice=ref('')
const key=()=>`lionfit.linked.v1:${getStagingClients().auth.app.options.projectId}`
const pendingKey=()=>key()+':pending'
const markerKey=()=>key()+':initialized'
export const linkedDeviceSupported=()=>typeof navigator!=='undefined'&&!!navigator.locks&&typeof navigator.locks.request==='function'
async function exclusive<T>(task:()=>Promise<T>,requireLock=true):Promise<T>{
 if(!linkedDeviceSupported()){if(requireLock)throw new Error('Cambio rapido non supportato da questo browser. Aggiorna il dispositivo.');return task()}
 return navigator.locks.request(key()+':operation',{ifAvailable:true},async lock=>{
  if(!lock)throw new Error('Operazione profili in corso in un’altra finestra. Riprova.');return task()
 })
}
function readPair(){return parsePair(localStorage.getItem(key()))}
function refreshPair(){try{linkedPair.value=isLiveMode()?readPair():null}catch{linkedPair.value=null}}
export function startLinkedProfileObserver(){if(!isLiveMode())return;refreshPair();window.addEventListener('storage',e=>{if(e.key===key()||e.key===null)refreshPair()})}
function named(side:LinkSide):Auth{
 const main=getStagingClients().auth, name=`lionfit-linked-v1-${side}`
 const app=getApps().find(a=>a.name===name)
 return app?getAuth(app):initializeAuth(initializeApp(main.app.options,name),{persistence:browserLocalPersistence})
}
async function verified(auth:Auth):Promise<LinkIdentity>{
 await auth.authStateReady();const u=auth.currentUser
 if(!u?.email||isControlIdentity(u.uid))throw new Error('Sessione non disponibile. Accedi di nuovo.')
 const token=await u.getIdTokenResult(true)
 if(token.claims.lionfitSuperAdmin===true)throw new Error('Account Control escluso dal cambio rapido.')
 // Resolve identity using server reads authenticated by THIS Auth instance.
 const db=getFirestore(auth.app), profile=await getDocFromServer(doc(db,'users',u.uid))
 if(!profile.exists()||auth.currentUser?.uid!==u.uid)throw new Error('Profilo non disponibile.')
 const d=profile.data();const gid=d.gymId
 if(typeof gid!=='string'||!/^[-\w]{1,128}$/.test(gid)||d.email?.toLowerCase()!==u.email.toLowerCase()||(d.membershipStatus!==undefined&&d.membershipStatus!=='active'))throw new Error('Profilo non autorizzato.')
 const gym=await getDocFromServer(doc(db,'gyms',gid));if(!gym.exists()||auth.currentUser?.uid!==u.uid)throw new Error('Palestra non disponibile.')
 return {uid:u.uid,gymId:gid,role:resolveLegacyGymRole(u.uid,d,gym.data()),email:u.email,label:String(d.name||u.email).slice(0,80)}
}
function assertSide(p:ProfilePair,side:LinkSide,s:LinkIdentity){if(sideOf(p,s)!==side)throw new Error('Il profilo collegato non è più autorizzato. Scollegalo e collegalo nuovamente.')}
function scrubPending(){sessionStorage.removeItem(pendingKey())}
async function clearInternal(){
 if(!isLiveMode())return
 scrubPending();const had=localStorage.getItem(markerKey())||localStorage.getItem(key())
 localStorage.removeItem(key());linkedPair.value=null
 if(had){const results=await Promise.allSettled((['coach','athlete'] as const).map(async side=>{const a=named(side);await a.authStateReady();await signOut(a)}));if(results.some(r=>r.status==='rejected'))throw new Error('Non è stato possibile rimuovere tutte le sessioni collegate. Riprova.')}
 localStorage.removeItem(markerKey())
}
export async function clearLinkedProfiles(){
 if(!isLiveMode())return
 if(linkedBusy.value)throw new Error('Operazione profili in corso.')
 linkedBusy.value=true;try{await exclusive(clearInternal,false)}finally{linkedBusy.value=false}
}
export async function linkAthleteAccount(email:string,password:string){
 if(!isLiveMode()||linkedBusy.value)throw new Error('Operazione non disponibile.')
 linkedBusy.value=true;linkedNotice.value=''
 try{await exclusive(async()=>{
 let success=false,started=false
 try{
  const main=getStagingClients().auth, coach=await verified(main)
  if(coach.role==='atleta')throw new Error('Attiva il cambio rapido dal profilo Coach.')
  if(readPair())throw new Error('Scollega prima i profili esistenti.')
  if(!email.trim()||!password)throw new Error('Inserisci email e password del tuo profilo atleta.')
  await clearInternal();localStorage.setItem(markerKey(),'1');started=true
  const athleteAuth=named('athlete');await athleteAuth.authStateReady();await setPersistence(athleteAuth,browserLocalPersistence)
  const credential=await signInWithEmailAndPassword(athleteAuth,email.trim(),password)
  const athlete=await verified(athleteAuth),pair=makePair(coach,athlete)
  if(credential.user.uid!==athlete.uid||main.currentUser?.uid!==coach.uid)throw new Error('Account cambiato. Riprova.')
  const coachAuth=named('coach');await coachAuth.authStateReady();await setPersistence(coachAuth,browserLocalPersistence);await updateCurrentUser(coachAuth,main.currentUser)
  assertSide(pair,'coach',await verified(coachAuth))
  if(main.currentUser?.uid!==coach.uid)throw new Error('Account cambiato. Riprova.')
  // Explicit opt-in to remembering the two sessions on this device.
  await setPersistence(main,browserLocalPersistence)
  localStorage.setItem(key(),JSON.stringify(pair));linkedPair.value=pair;success=true
 }finally{if(started&&!success){try{await clearInternal()}catch{/* marker retained for cleanup */}}}
 })}finally{linkedBusy.value=false}
}
export async function requestProfileSwitch(){
 if(!isLiveMode()||linkedBusy.value)return
 linkedBusy.value=true;linkedNotice.value=''
 try{await exclusive(async()=>{
  const main=getStagingClients().auth,p=readPair(),s=await verified(main),from=sideOf(p,s)
  if(!p||!from)throw new Error('Profili non collegati.')
  const to=opposite(from),target=named(to);assertSide(p,to,await verified(target))
  const offline=readOffline(localStorage,{project:main.app.options.projectId||'',gym:s.gymId,uid:s.uid})
  if(offline?.queue.length||offline?.draft)throw new Error('Completa e sincronizza gli allenamenti in corso prima di cambiare profilo.')
  // Do not switch while Firestore still has local writes queued for the current user.
  let timer:ReturnType<typeof setTimeout>|undefined
  try{await Promise.race([waitForPendingWrites(getStagingClients().db),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Sincronizzazione in corso. Riprova tra poco.')),8000)})])}finally{clearTimeout(timer)}
  const sourceBackup=named(from);await sourceBackup.authStateReady();await updateCurrentUser(sourceBackup,main.currentUser);assertSide(p,from,await verified(sourceBackup))
  const intent=switchIntent(p,from)
  const {pushFeatureEnabled,deactivatePush}=await import('./pushNotifications')
  if(pushFeatureEnabled())try{await deactivatePush(false)}catch{throw new Error('Impossibile scollegare le notifiche. Riprova.')}
  if(main.currentUser?.uid!==s.uid||!matchesIntent(readPair(),intent))throw new Error('Account cambiato. Riprova.')
  // Save intent only; no credentials. Auth changes at the next bootstrap, before Vue/Router mount.
  sessionStorage.setItem(pendingKey(),JSON.stringify(intent));window.location.replace('/')
 })}catch(e){linkedNotice.value=e instanceof Error?e.message:'Cambio profilo non riuscito.';linkedBusy.value=false}
}
export async function finishProfileSwitchAtBoot(){
 if(!isLiveMode())return
 try{
  const raw=sessionStorage.getItem(pendingKey());if(!raw)return
  scrubPending();await exclusive(async()=>{const intent=parseSwitch(raw),p=readPair();if(!intent||!p||!matchesIntent(p,intent))throw new Error('Cambio profilo annullato.')
  const main=getStagingClients().auth;const source=await verified(main);assertSide(p,intent.from,source)
  const target=named(intent.to),s=await verified(target);assertSide(p,intent.to,s)
  if(main.currentUser?.uid!==uidFor(p,intent.from)||target.currentUser?.uid!==uidFor(p,intent.to)||!matchesIntent(readPair(),intent))throw new Error('Account cambiato. Riprova.')
  // Firebase officially clones a user from another Auth in the same project.
  const previous=main.currentUser
  await updateCurrentUser(main,target.currentUser)
  try{const confirmed=await verified(main);assertSide(p,intent.to,confirmed);stagingSession.value=confirmed}catch(e){stagingSession.value=null;try{await updateCurrentUser(main,previous);const restored=await verified(main);assertSide(p,intent.from,restored);stagingSession.value=restored}catch{await signOut(main)}throw e}
 })}catch(e){linkedNotice.value=e instanceof Error?e.message:'Cambio profilo non riuscito.'}
}
