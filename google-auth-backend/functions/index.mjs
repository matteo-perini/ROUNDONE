import {onCall,HttpsError} from 'firebase-functions/v2/https'
import {error as logError} from 'firebase-functions/logger'
import {defineString} from 'firebase-functions/params'
import {initializeApp,getApps} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore} from 'firebase-admin/firestore'
import {OAuth2Client} from 'google-auth-library'
import {normalizeVerifiedGoogle,existingLinkedUser} from './model.mjs'
if(!getApps().length)initializeApp()
const clientId=defineString('GOOGLE_LOGIN_WEB_CLIENT_ID')
const google=new OAuth2Client()

// R21O diagnostic: only stage and fixed-shape error flags are recorded.
// Never log the Google credential, Firebase custom token, email, UID, or raw exception.
function logSanitizedFailure(stage,e){
 const rawCode=e && (e.code ?? e.errorInfo?.code)
 const code=(typeof rawCode==='string'||typeof rawCode==='number')
  ? String(rawCode).replace(/[^a-zA-Z0-9_./-]/g,'').slice(0,64) : 'unknown'
 const detail=String(e?.message||'')
 logError('R21O GOOGLE SERVER FAILURE',{
  stage,
  code,
  iamSignBlob:/iam\.serviceAccounts\.signBlob|signBlob|signJwt/i.test(detail),
  serviceAccountDiscovery:/failed to determine service account/i.test(detail),
  permissionDenied:/permission.denied|permission.*denied|insufficient.permission/i.test(detail)
 })
}

// Important: no user creation. Google account MUST be linked to an existing UID.
// Only one audited, validated custom token is returned; tokens never appear in logs.
export const lfGoogleSignInExisting=onCall({
 region:'europe-west1',memory:'256MiB',timeoutSeconds:30,minInstances:0,maxInstances:2,
 cors:['https://lionfit.it','https://www.lionfit.it']
},async request=>{
 const idToken=request.data?.googleIdToken
 if(typeof idToken!=='string'||idToken.length<100||idToken.length>9000)
  throw new HttpsError('invalid-argument','Credenziale Google non valida.')
 const audience=clientId.value()
 if(!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(audience))
  throw new HttpsError('failed-precondition','Google Login non configurato sul server.')
 let payload
 try{
  const ticket=await google.verifyIdToken({idToken,audience})
  payload=ticket.getPayload()
 }catch{throw new HttpsError('unauthenticated','Verifica Google non riuscita.')}
 const identity=normalizeVerifiedGoogle(payload)
 if(!identity)throw new HttpsError('permission-denied','Account Google non verificato.')
 // Same error for missing and non-linked users: no account enumeration.
 let record,profile,gymExists=false
 let stage='lookup-auth-user'
 try{
  record=await getAuth().getUserByEmail(identity.email)
  stage='read-user-profile'
  const snapshot=await getFirestore().doc('users/'+record.uid).get()
  if(snapshot.exists){
   profile=snapshot.data()
   if(profile && typeof profile.gymId==='string' && /^gym_[A-Za-z0-9_-]{3,116}$/.test(profile.gymId)){
    stage='read-gym'
    gymExists=(await getFirestore().doc('gyms/'+profile.gymId).get()).exists
   }
  }
 }catch(e){
  if(e?.code==='auth/user-not-found')throw new HttpsError('permission-denied','Questo Google non è collegato a un account LionFit. Accedi con la password e collegalo dalle Impostazioni.')
  logSanitizedFailure(stage,e)
  throw new HttpsError('internal','Accesso temporaneamente non disponibile.')
 }
 if(!existingLinkedUser(record,identity,profile,gymExists))
  throw new HttpsError('permission-denied','Questo Google non è collegato a un account LionFit attivo. Accedi con la password e collegalo dalle Impostazioni.')
 try{return {customToken:await getAuth().createCustomToken(record.uid)}}
 catch(e){
  logSanitizedFailure('create-custom-token',e)
  throw new HttpsError('internal','Impossibile completare l’accesso. Riprovare.')
 }
})
