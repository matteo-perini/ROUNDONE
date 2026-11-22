/** R21E: private, durable Check Zone upload queue. Originals stay local until server confirmation. Metadata and photo Blobs are separate stores.
 * Browser/PWA work continues while LionFit remains open; suspended apps resume on next launch.
 * No Service Worker background-upload guarantee and no unverified "saved" notices.
 */
import {shallowRef} from 'vue'
import {doc,getDocFromServer} from 'firebase/firestore'
import {onAuthStateChanged} from 'firebase/auth'
import {getStagingClients} from '../../integrations/firebase/stagingClient'
import {readStagingSession,type StagingSession} from '../../integrations/firebase/stagingSession'
import {recordCheck,uploadCheckPhoto,checkCollection,removeStagedPhotoStrict} from '../../integrations/firestore/progress'
import {compressCheckPhoto,MAX_CHECK_PHOTO_BYTES,supportedCheckPhoto} from './checkPhotoCompression'
import {validDate,type CheckPhoto} from './progressModel'

const DATABASE='lionfit-checkzone-pending-v1',STORE='jobs',FILES='files'
export type CheckSide=CheckPhoto['side']
type PendingFile={side:CheckSide;name:string}
type QueuedCheck={key:string;projectId:string;gymId:string;uid:string;id:string;date:string;notes:string;files:PendingFile[];uploaded:CheckPhoto[];state:'queued'|'sending'|'paused'|'error';error:string;attempts:number;createdAt:number}
export type CheckQueueSummary={key:string;id:string;state:QueuedCheck['state'];fileCount:number;uploadedCount:number;percent:number;error:string;createdAt:number}
export type CheckQueueScope={projectId:string;gymId:string;uid:string}
export const checkQueueRows=shallowRef<CheckQueueSummary[]>([])
export const lastCheckUploaded=shallowRef<{key:string;at:number}|null>(null)
export const checkQueueActivity=shallowRef<{key:string;phase:'preparing'|'uploading'|'verifying';index:number;total:number;percent:number}|null>(null)
let visibleScope:CheckQueueScope|null=null
let dbPromise:Promise<IDBDatabase>|null=null
function openQueue():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('Memoria locale non disponibile. Le foto non sono state acquisite: usa un browser normale e disattiva la navigazione privata.'))
 if(!dbPromise)dbPromise=new Promise<IDBDatabase>((resolve,reject)=>{
  const req=indexedDB.open(DATABASE,2)
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});if(!req.result.objectStoreNames.contains(FILES))req.result.createObjectStore(FILES,{keyPath:'key'})}
  req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();dbPromise=null};resolve(req.result)}
  req.onerror=()=>reject(req.error||new Error('Archivio foto locale non disponibile.'))
  req.onblocked=()=>reject(new Error('Archivio foto bloccato da un’altra scheda. Chiudi le altre schede e riprova.'))
 }).catch(e=>{dbPromise=null;throw e})
 return dbPromise!
}
async function readAll():Promise<QueuedCheck[]>{
 const db=await openQueue();return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll()
  req.onsuccess=()=>resolve(req.result as QueuedCheck[])
  req.onerror=()=>reject(req.error||new Error('Impossibile leggere le foto in attesa.'))
 })
}
/** Atomic initial acquisition: metadata and every original photo or nothing. */
async function acquireJob(job:QueuedCheck,files:readonly {side:CheckSide;file:File}[]):Promise<void>{
 const db=await openQueue();await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction([STORE,FILES],'readwrite')
  tx.objectStore(STORE).add(job)
  const store=tx.objectStore(FILES)
  for(const row of files)store.add({key:`${job.key}:${row.side}`,blob:row.file})
  tx.oncomplete=()=>{announce('updated',job.key);resolve()}
  tx.onabort=()=>reject(tx.error||new Error('Memoria piena: le foto non sono state acquisite.'))
  tx.onerror=()=>reject(tx.error||new Error('Impossibile salvare le foto sul dispositivo.'))
 })
}
async function readPhotoFile(job:QueuedCheck,item:PendingFile):Promise<File>{
 const db=await openQueue()
 const stored=await new Promise<{blob?:Blob}|undefined>((resolve,reject)=>{
  const tx=db.transaction(FILES,'readonly'),req=tx.objectStore(FILES).get(`${job.key}:${item.side}`)
  req.onsuccess=()=>resolve(req.result)
  req.onerror=()=>reject(req.error||new Error('Foto locale non leggibile.'))
 })
 if(!stored?.blob||stored.blob.size===0)throw new Error('Foto locale mancante o danneggiata. Non risulta inviata: contatta assistenza.')
 // File metadata can be lost by some Safari IndexedDB versions; restore its name from metadata.
 return new File([stored.blob],item.name,{type:stored.blob.type})
}
async function writeJob(job:QueuedCheck):Promise<void>{
 const db=await openQueue();await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(job)
  tx.oncomplete=()=>{announce('updated',job.key);resolve()}
  tx.onabort=()=>reject(tx.error||new Error('Memoria piena. Le foto non sono state memorizzate.'))
  tx.onerror=()=>reject(tx.error||new Error('Impossibile conservare le foto sul dispositivo.'))
 })
}
async function deleteJob(key:string):Promise<void>{
 const db=await openQueue();await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction([STORE,FILES],'readwrite');tx.objectStore(STORE).delete(key);for(const side of ['front','back','right','left'])tx.objectStore(FILES).delete(`${key}:${side}`)
  tx.oncomplete=()=>{announce('updated',key);resolve()}
  tx.onerror=()=>reject(tx.error||new Error('Pulizia locale non riuscita.'))
  tx.onabort=()=>reject(tx.error||new Error('Pulizia locale non riuscita.'))
 })
}
const safeId=(s:string)=>/^[\w-]{3,128}$/.test(s)
export function samePhotoScope(a:CheckQueueScope,b:CheckQueueScope){return a.uid===b.uid&&a.gymId===b.gymId&&a.projectId===b.projectId}
export function queueKey(scope:CheckQueueScope,id:string){return `${scope.projectId}:${scope.gymId}:${scope.uid}:${id}`}
export function isCompleteCheck(photos:readonly CheckPhoto[],expected:readonly {side:CheckSide}[]){
 return photos.length===expected.length&&new Set(photos.map(x=>x.side)).size===photos.length&&expected.every(x=>photos.some(y=>y.side===x.side))
}
function expectedPhotoPath(job:QueuedCheck,side:CheckSide){return `progress_photos/${job.gymId}/${job.uid}/${job.id}/${side}.jpg`}
function matchesRemoteCheck(job:QueuedCheck,data:Record<string,unknown>){
 const rows=data.photos
 return data.athleteId===job.uid&&data.createdBy===job.uid&&data.performedOn===job.date&&data.notes===job.notes&&
  Array.isArray(rows)&&isCompleteCheck(rows as CheckPhoto[],job.files)&&
  rows.every((photo:CheckPhoto)=>job.files.some(x=>x.side===photo.side&&photo.storagePath===expectedPhotoPath(job,photo.side)))
}
const CHANNEL='lionfit-checkzone-upload-status'
function announce(type:'updated'|'complete',key:string){
 if(typeof BroadcastChannel==='undefined')return
 try{const channel=new BroadcastChannel(CHANNEL);channel.postMessage({type,key});channel.close()}catch{/* optional cross-tab notice */}
}
function listForScope(jobs:QueuedCheck[],scope:CheckQueueScope):CheckQueueSummary[]{
 return jobs.filter(j=>samePhotoScope(j,scope)).sort((a,b)=>b.createdAt-a.createdAt).map(j=>({
  key:j.key,id:j.id,state:j.state,fileCount:j.files.length,uploadedCount:j.uploaded.length,
  percent:Math.round(j.uploaded.length/Math.max(1,j.files.length)*100),error:j.error,createdAt:j.createdAt
 }))
}
export async function showCheckQueueFor(scope:CheckQueueScope|null){
 visibleScope=scope
 if(!scope){checkQueueRows.value=[];return}
 try{const rows=await readAll();if(visibleScope&&samePhotoScope(visibleScope,scope))checkQueueRows.value=listForScope(rows,scope)}
 catch{checkQueueRows.value=[]} // enqueue still fails closed if IndexedDB is unavailable
}
async function refresh(){if(visibleScope)await showCheckQueueFor(visibleScope)}
export async function pendingChecksFor(scope:CheckQueueScope):Promise<number>{
 return (await readAll()).filter(x=>samePhotoScope(x,scope)).length
}
export async function enqueueCheckPhotos(scope:CheckQueueScope,input:{id:string;date:string;notes:string;files:readonly {side:CheckSide;file:File}[]}):Promise<string>{
 if(!safeId(scope.uid)||!safeId(scope.gymId)||!safeId(input.id)||!safeId(scope.projectId))throw new Error('Sessione non valida: le foto non sono state acquisite.')
 if(!validDate(input.date)||input.date>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw new Error('Data del check non valida.')
 if(input.notes.length>500||input.files.length<1||input.files.length>4||new Set(input.files.map(x=>x.side)).size!==input.files.length)throw new Error('Seleziona da una a quattro foto diverse.')
 if(input.files.some(x=>!['front','back','left','right'].includes(x.side)||!supportedCheckPhoto(x.file)))throw new Error('Formato o dimensione non compatibili. Puoi usare JPG/JFIF, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP e TIFF decodificabile, fino a 40 MB per foto.')
 const {auth,db}=getStagingClients();if(auth.currentUser?.uid!==scope.uid||db.app.options.projectId!==scope.projectId)throw new Error('Sessione cambiata: riprova.')
 // The durable write must complete before caller displays "foto acquisite".
 const job:QueuedCheck={key:queueKey(scope,input.id),projectId:scope.projectId,gymId:scope.gymId,uid:scope.uid,id:input.id,date:input.date,notes:input.notes,files:input.files.map(x=>({side:x.side,name:x.file.name})),uploaded:[],state:'queued',error:'',attempts:0,createdAt:Date.now()}
 await acquireJob(job,input.files)
 // Request quota protection when the browser supports it; never claim it is guaranteed.
 void navigator.storage?.persist?.().catch(()=>{})
 await refresh()
 requestCheckQueuePump()
 return job.id
}
let installed=false,running=false,pumpRequested=false,activeTask:AbortController|null=null,lastUid=''
let activeKey='' 
function userMatches(job:QueuedCheck){const {auth,db}=getStagingClients();return auth.currentUser?.uid===job.uid&&db.app.options.projectId===job.projectId}
function safeError(error:unknown){
 const raw=error instanceof Error?error.message:String(error)
 if(/Check già presente|dati diversi/i.test(raw))return 'Questo Check Zone esiste già con dati diversi. Contatta l’assistenza prima di riprovare.'
 if(/heic|heif/i.test(raw))return 'Foto HEIC/HEIF non leggibile. Riprova con Internet attivo; se continua, scarta il check e inserisci una foto JPG.'
 if(/decodific|non supportat|formato|JPEG|compression|dimensioni/i.test(raw))return 'Formato foto non decodificabile su questo dispositivo. Puoi scartare questo check e crearne uno nuovo con immagini JPG.'
 if(/storage\/unauthorized|permission-denied|autorizzat/i.test(raw))return 'Accesso alle foto negato. Verifica account e permessi della palestra.'
 if(/storage\/quota-exceeded|quota/i.test(raw))return 'Spazio di archiviazione esaurito. Riprova più tardi.'
 if(/storage\/canceled|abort|annullat|sessione/i.test(raw))return 'Invio interrotto. Le foto restano sul dispositivo.'
 return 'Invio non riuscito. Le foto restano sul dispositivo: premi Riprova quando hai connessione.'
}
async function persistProgress(job:QueuedCheck){await writeJob(job);await refresh()}
async function commitOnce(job:QueuedCheck){
 const db=getStagingClients().db,target=doc(checkCollection(db,job.gymId,job.uid),job.id)
 const previous=await getDocFromServer(target)
 if(previous.exists()){
  if(!matchesRemoteCheck(job,previous.data()))throw new Error('Check già presente con dati diversi; non sarà sovrascritto.')
  return
 }
 if(!userMatches(job))throw new Error('Sessione cambiata.')
 await recordCheck(db,job.gymId,job.uid,job.date,job.notes,job.uploaded,job.uid,job.id)
 const verified=await getDocFromServer(target)
 if(!verified.exists()||!matchesRemoteCheck(job,verified.data()))throw new Error('Conferma di archiviazione non riuscita; le foto restano in attesa.')
}
async function workOn(job:QueuedCheck){
 const abort=new AbortController();activeTask=abort;activeKey=job.key
 try{
  if(!userMatches(job))return
  job={...job,state:'sending',error:''};await persistProgress(job)
  for(const [i,item] of job.files.entries()){
   if(job.uploaded.some(p=>p.side===item.side))continue
   checkQueueActivity.value={key:job.key,phase:'preparing',index:i+1,total:job.files.length,percent:Math.round(job.uploaded.length/job.files.length*100)}
   if(!navigator.onLine)throw new Error('Connessione assente')
   if(!userMatches(job)||abort.signal.aborted)throw new Error('Sessione cambiata')
   // Safari IndexedDB may return Blob instead of File after a reload.
   const original=await readPhotoFile(job,item)
   const jpg=await compressCheckPhoto(original)
   if(jpg.size<=0||jpg.size>=MAX_CHECK_PHOTO_BYTES)throw new Error('Compressione foto non riuscita.')
   if(!userMatches(job)||abort.signal.aborted)throw new Error('Sessione cambiata')
   const uploaded=await uploadCheckPhoto(job.gymId,job.uid,job.id,item.side,jpg,percent=>{
    checkQueueActivity.value={key:job.key,phase:'uploading',index:i+1,total:job.files.length,percent:Math.round((job.uploaded.length+percent/100)/job.files.length*100)}
   },abort.signal)
   job={...job,uploaded:[...job.uploaded,uploaded]}
   await persistProgress(job)
  }
  if(!isCompleteCheck(job.uploaded,job.files))throw new Error('Non sono presenti tutte le foto richieste.')
  if(!userMatches(job)||abort.signal.aborted)throw new Error('Sessione cambiata')
  checkQueueActivity.value={key:job.key,phase:'verifying',index:job.files.length,total:job.files.length,percent:100}
  await commitOnce(job)
  // Committed to Firebase: delete the local originals. If cleanup fails, retry is idempotent.
  await deleteJob(job.key)
  lastCheckUploaded.value={key:job.key,at:Date.now()}
  announce('complete',job.key)
  await refresh()
 }catch(e){
  const isOffline=!navigator.onLine,interrupted=abort.signal.aborted
  const next:QueuedCheck={...job,state:isOffline||interrupted?'paused':'error',error:safeError(e),attempts:job.attempts+1}
  try{await persistProgress(next)}catch{await refresh()}
 }finally{if(activeTask===abort){activeTask=null;activeKey='';checkQueueActivity.value=null}}
}
async function drain(){
 if(running){pumpRequested=true;return}
 if(!navigator.onLine)return
 running=true
 try{
  const locks=navigator.locks
  if(locks)await locks.request('lionfit-checkzone-upload-v1',async()=>{await drainExclusive()})
  else await drainExclusive()
 }catch{/* Remote storage/auth readiness is retried on the next event. */}
 finally{running=false;if(pumpRequested){pumpRequested=false;queueMicrotask(()=>{void drain()})}}
}
async function drainExclusive(){
 try{
  const {auth,db}=getStagingClients();await auth.authStateReady()
  const user=auth.currentUser
  if(!user)return
  const session=await readStagingSession()
  if(session.role!=='atleta'||session.uid!==user.uid)return
  const scope={projectId:db.app.options.projectId||'',gymId:session.gymId,uid:session.uid}
  await showCheckQueueFor(scope)
  const items=(await readAll()).filter(j=>samePhotoScope(j,scope)&&j.state!=='error')
  for(const item of items){
   if(!navigator.onLine||!userMatches(item))break
   // Persisted "sending" from a terminated process is safe to resume.
   await workOn(item)
  }
 }catch{/* Auth/network not ready; retained jobs are picked up on next retry. */}
}
export async function discardQueuedCheck(scope:CheckQueueScope,key:string):Promise<void>{
 const {auth}=getStagingClients()
 if(auth.currentUser?.uid!==scope.uid)throw new Error('Accedi con l’account originale.')
 const job=(await readAll()).find(j=>j.key===key&&samePhotoScope(j,scope))
 if(!job)throw new Error('Check non presente nella coda.')
 if(job.state!=='error')throw new Error('Puoi scartare soltanto un invio non riuscito.')
 if(activeKey===key)throw new Error('Un caricamento è ancora in corso.')
 if(!navigator.onLine)throw new Error('Riconnettiti per verificare che non ci siano già foto archiviate prima di scartare.')
 // A write may have succeeded remotely even when its acknowledgement failed locally.
 const target=doc(checkCollection(getStagingClients().db,job.gymId,job.uid),job.id)
 const live=await getDocFromServer(target)
 if(live.exists()){
  const d=live.data()
  if(!matchesRemoteCheck(job,d))throw new Error('Check presente su Firebase con dati inattesi: non viene eliminato.')
  await deleteJob(key)
  lastCheckUploaded.value={key,at:Date.now()}
  announce('complete',key)
  await refresh()
  return
 }
 // Only uncommitted Storage objects may be cleaned up.
 for(const photo of job.uploaded)await removeStagedPhotoStrict(photo.storagePath)
 await deleteJob(key)
 await refresh()
}
export function requestCheckQueuePump(){void drain()}
export async function retryCheckQueue(scope:CheckQueueScope){
 const {auth}=getStagingClients();if(auth.currentUser?.uid!==scope.uid)throw new Error('Accedi con l’account originale.')
 const items=(await readAll()).filter(j=>samePhotoScope(j,scope)&&j.state==='error')
 for(const j of items)await writeJob({...j,state:'queued',error:''})
 await refresh();requestCheckQueuePump()
}
export function startCheckPhotoQueue(){
 if(installed)return;installed=true
 try{
  const {auth}=getStagingClients()
  onAuthStateChanged(auth,u=>{
   if(lastUid!==u?.uid){activeTask?.abort();lastUid=u?.uid||'';void showCheckQueueFor(null)}
   if(u){void drain()}
  })
  if(typeof BroadcastChannel!=='undefined'){
   try{const receiver=new BroadcastChannel(CHANNEL);receiver.onmessage=e=>{
    if(e.data?.type==='complete'&&typeof e.data.key==='string')lastCheckUploaded.value={key:e.data.key,at:Date.now()}
    void refresh()
   }}catch{/* optional cross-tab updates */}
  }
  window.addEventListener('online',requestCheckQueuePump)
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestCheckQueuePump()})
  // No persistent timer: browser pages cannot promise a background upload after termination.
  requestCheckQueuePump()
 }catch{installed=false}
}
