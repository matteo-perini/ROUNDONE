/**
 * Firebase SDK Web pubblico. La build di rilascio (Vite MODE=production)
 * contiene soltanto il ramo LIVE. STAGING rimane nei sorgenti e funziona
 * SOLO con `vite build --mode staging` per i test futuri.
 *
 * Le Firestore/Storage Rules, non questo controllo, sono l'autorita' sui permessi.
 */
export type PublicStagingConfig = {apiKey:string;authDomain:string;projectId:string;appId:string}
export type StagingEnv = Record<string,string|boolean|undefined>
const PRODUCTION_PROJECT='app-palestra-b0b9d'
// Questi due flag sono sostituiti da Vite con costanti durante la build.
// Nel bundle LIVE il ramo STAGING diventa codice morto eliminabile.
const LIVE_BUILD=import.meta.env.MODE==='production'
const STAGING_BUILD=import.meta.env.MODE==='staging'
const LIVE_WRITE_ACK='ENABLED_AFTER_RULES_REVIEW'
/** Modalita' HMR locale: autentica utenti PROD ma mantiene NODE_ENV development.
 * L'esplicita conferma esiste solo in un processo locale avviato da dev-live.mjs;
 * non cambia le Rules di Firebase, non limita scritture ai profili di prova.
 */
export const isLocalProdDev=()=>import.meta.env.DEV && LIVE_BUILD &&
 import.meta.env.VITE_LIONFIT_LOCAL_PROD_DEV==='LOCAL_PROD_PREVIEW_CONFIRMED'

export function parseStagingConfig(env:StagingEnv):PublicStagingConfig|null {
 if(!(env.PROD===true || isLocalProdDev()) || (!LIVE_BUILD && !STAGING_BUILD))return null
 // Una build "production" con .env STAGING non puo' avviarsi e viceversa.
 const live=LIVE_BUILD
 if(env.VITE_LIONFIT_MODE!==(live?'live':'staging'))throw new Error('Ambiente Firebase non coerente con la build.')
 if(live){
  if(env.VITE_LIONFIT_LIVE_ACK!=='LIVE_FIREBASE_RULES_CONFIRMED')throw new Error('Conferma LIVE mancante.')
 }else{
  if(env.VITE_LIONFIT_STAGING_ACK!=='STAGING_ONLY')throw new Error('Conferma STAGING mancante.')
 }
 const apiKey=String(env.VITE_FIREBASE_API_KEY||'').trim()
 const authDomain=String(env.VITE_FIREBASE_AUTH_DOMAIN||'').trim()
 const projectId=String(env.VITE_FIREBASE_PROJECT_ID||'').trim()
 const appId=String(env.VITE_FIREBASE_APP_ID||'').trim()
 if(!apiKey||!authDomain||!projectId||!appId)throw new Error('Configurazione Firebase client incompleta.')
 if(/inserisci|sostituisci|todo|^x+$|^test$/i.test(apiKey) || /inserisci|sostituisci|todo/i.test(appId))throw new Error('La configurazione contiene valori dimostrativi.')
 if(!/^[a-z][a-z0-9-]{3,60}$/.test(projectId) || projectId.startsWith('demo-') || projectId.includes('lab2c') || /fake|example|placeholder/i.test(apiKey))
  throw new Error('Firebase projectId/API key non validi per questo ambiente.')
 if(authDomain!==`${projectId}.firebaseapp.com` && authDomain!==`${projectId}.web.app`)
  throw new Error('Dominio Firebase non coerente con il progetto Firebase.')
 if(String(env.VITE_LIONFIT_PRODUCTION_PROJECT_ID||'').trim()!==PRODUCTION_PROJECT)
  throw new Error('Progetto Firebase PROD atteso non configurato.')
 if(live){
  if(projectId!==PRODUCTION_PROJECT)throw new Error('La build LIVE non puo collegarsi ad altri progetti Firebase.')
 }else{
  // Ramo escluso dal JavaScript distribuito (MODE=production).
  if(projectId!=='lionfit-staging-test')throw new Error('Progetto STAGING errato.')
  if(env.VITE_LIONFIT_STAGING_WRITES==='ENABLED_AFTER_STAGING_RULES_REVIEW'){
   const gym=String(env.VITE_LIONFIT_STAGING_TEST_GYM_ID||'').trim()
   if(!/^gym_[a-zA-Z0-9_-]{3,116}$/.test(gym) || gym.startsWith('demo-'))throw new Error('Palestra fittizia STAGING mancante.')
  }
 }
 return {apiKey,authDomain,projectId,appId}
}

// Nomi storici mantenuti per compatibilita' con i componenti gia testati.
// In produzione isStagingMode significa "sessione operativa Firebase LIVE".
export const isStagingMode=()=> (import.meta.env.PROD || isLocalProdDev()) && (
 LIVE_BUILD
  ? (import.meta.env.VITE_LIONFIT_MODE==='live' && import.meta.env.VITE_LIONFIT_LIVE_ACK==='LIVE_FIREBASE_RULES_CONFIRMED')
  : (STAGING_BUILD && import.meta.env.VITE_LIONFIT_MODE==='staging' && import.meta.env.VITE_LIONFIT_STAGING_ACK==='STAGING_ONLY')
)
export const isLiveMode=()=>LIVE_BUILD && isStagingMode()
export const isTestMode=()=>STAGING_BUILD && isStagingMode()
export const isOperationalMode=()=>isStagingMode()
export const mayWriteLive=()=>
 (isLiveMode() && import.meta.env.VITE_LIONFIT_LIVE_WRITES===LIVE_WRITE_ACK) ||
 (isTestMode() && import.meta.env.VITE_LIONFIT_STAGING_WRITES==='ENABLED_AFTER_STAGING_RULES_REVIEW' &&
  !!import.meta.env.VITE_LIONFIT_STAGING_TEST_GYM_ID && import.meta.env.VITE_LIONFIT_STAGING_TEST_GYM_ID.length>=3)
export const stagingTestGym=()=>isTestMode()?String(import.meta.env.VITE_LIONFIT_STAGING_TEST_GYM_ID||'').trim():''
