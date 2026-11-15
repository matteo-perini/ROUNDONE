import {initializeApp} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {onCall,HttpsError} from 'firebase-functions/v2/https'
import {verifyRequest,deleteOwnedWorkout,WorkoutError} from './model.mjs'
initializeApp()
const db=getFirestore()
export const lfDeleteWorkout=onCall({region:'europe-west1',maxInstances:3,timeoutSeconds:60,invoker:'public'},async req=>{
 try{
  const args=verifyRequest(req.auth,req.data,process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)
  return await deleteOwnedWorkout(db,args,()=>FieldValue.serverTimestamp())
 }catch(err){
  if(err instanceof WorkoutError)throw new HttpsError(err.code,err.message)
  console.error('lfDeleteWorkout failed',err?.code||'unknown')
  throw new HttpsError('internal','Eliminazione non confermata. Riprova.')
 }
})
