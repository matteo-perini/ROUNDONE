import {initializeApp,getApps} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {onCall,HttpsError} from 'firebase-functions/v2/https'
import {assertPlatformActor,validatePreference,validateCursor,serializeAudit,PAGE_SIZE} from './model.mjs'
import {applyExemptionTransaction} from './transaction.mjs'
if(!getApps().length)initializeApp()
const database=getFirestore()
const options={region:'europe-west1',memory:'256Mi',timeoutSeconds:30,maxInstances:3,invoker:'public'}
function requireActor(auth){try{return assertPlatformActor(auth)}catch{throw new HttpsError('permission-denied','Solo l’account Super Admin verificato può utilizzare questa funzione.')}}
function invalidArgument(callback){try{return callback()}catch{throw new HttpsError('invalid-argument','Parametri non validi.')}}

// Performs the state change and writes a minimal, immutable audit document in the SAME transaction.
export const lfPlatformSetCommercialPreference=onCall(options,async request=>{
 const actorUid=requireActor(request.auth)
 const {gymId,exempt}=invalidArgument(()=>validatePreference(request.data))
 try{return await applyExemptionTransaction({database,gymId,exempt,actorUid,serverTimestamp:()=>FieldValue.serverTimestamp()})}
 catch(e){if(e?.message==='GYM_NOT_FOUND')throw new HttpsError('not-found','Palestra non trovata.');throw e}
})

// The audit store is never client-readable: the callable returns only this restricted dataset.
export const lfPlatformListCommercialAudit=onCall(options,async request=>{
 requireActor(request.auth)
 const cursor=invalidArgument(()=>validateCursor(request.data))
 let query=database.collection('platform_audit').orderBy('createdAt','desc').limit(PAGE_SIZE)
 if(cursor){
  const old=await database.doc(`platform_audit/${cursor}`).get()
  if(!old.exists)throw new HttpsError('failed-precondition','Paginazione scaduta: aggiorna il registro.')
  query=query.startAfter(old)
 }
 const result=await query.get()
 const rows=result.docs.map(serializeAudit).filter(Boolean)
 return {rows,cursor:result.size===PAGE_SIZE?result.docs.at(-1)?.id??null:null,more:result.size===PAGE_SIZE}
})
