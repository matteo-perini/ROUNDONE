/** E.3: bind warm leases to the verified Firebase identity, never to route params. */
import {effectScope,watch} from 'vue'
import {onAuthStateChanged} from 'firebase/auth'
import {stagingSession,type StagingSession} from '../../integrations/firebase/stagingSession'
import {getStagingClients} from '../../integrations/firebase/stagingClient'
import {accountKey} from '../platform/platformModel'
import {createWarmSessionStream,type StreamStart,type StreamSubscriber} from './warmSessionStream'
export function currentVerifiedScope(s:StagingSession){
 try{
  const {auth,db}=getStagingClients()
  if(auth.currentUser?.uid!==s.uid||accountKey(stagingSession.value)!==accountKey(s))return ''
  return JSON.stringify([db.app.options.projectId, s.uid,s.gymId,s.role])
 }catch{return ''}
}
export function createVerifiedSessionStream<T>(graceMs=15000){
 const stream=createWarmSessionStream<T>(graceMs)
 // Only install observers when a live source is acquired, not at module import.
 function acquire(s:StagingSession,start:StreamStart<T>,subscriber:StreamSubscriber<T>){
  const key=currentVerifiedScope(s)
  return stream.acquire(key,()=>!!key&&currentVerifiedScope(s)===key,publish=>{
   const {auth}=getStagingClients()
   // Detached: must survive the component's unmount for the bounded warm lease.
   const scope=effectScope(true)
   scope.run(()=>watch(()=>accountKey(stagingSession.value),()=>{if(currentVerifiedScope(s)!==key)stream.invalidate()},{flush:'sync'}))
   let unauth:(()=>void)|undefined
   try{unauth=onAuthStateChanged(auth,()=>{if(currentVerifiedScope(s)!==key)stream.invalidate()});const stop=start(publish);return()=>{scope.stop();unauth?.();stop()}}
   catch(e){scope.stop();unauth?.();throw e}
  },subscriber,typeof navigator==='undefined'||navigator.onLine!==false)
 }
 return {acquire,invalidate:stream.invalidate}
}
