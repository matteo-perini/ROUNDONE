/** STEP 3T.1 - local, read-only release checklist. Never contacts Firebase or GitHub. */
import {readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const path=(p)=>join(root,p)
const file=(p)=>existsSync(path(p))?readFileSync(path(p),'utf8'):''
const checks=[]
const c=(valid,label)=>checks.push({valid:Boolean(valid),label})
const re=(p,regex)=>regex.test(file(p))
console.log('\nLIONFIT STEP 3T.1 - AUDIT LOCALE DI PRE-PUBBLICAZIONE (NESSUN DEPLOY)\n')
c(file('public/CNAME').trim()==='www.lionfit.it','GitHub Pages usa www.lionfit.it')
c(re('public/manifest.webmanifest',/"start_url"\s*:\s*"\/"/),'PWA principale con avvio alla root')
c(re('public/manifest.webmanifest',/"scope"\s*:\s*"\/"/),'PWA principale con scope alla root')
for(const p of ['public/404.html','public/www/index.html','public/www/admin.html','public/www/athlete.html','public/www/prenotazioni.html','public/www/ios.html','public/download/index.html','public/icons/icon-192.png','public/icons/icon-512.png'])
 c(existsSync(path(p)),`Compatibilita vecchi utenti: ${p}`)
c(re('src/router/index.ts',/createWebHistory/),'Router storia web presente')
c(re('src/integrations/firebase/stagingConfig.ts',/LIVE_FIREBASE_RULES_CONFIRMED/),'Conferma LIVE obbligatoria nel client')
c(re('src/integrations/firebase/stagingConfig.ts',/ENABLED_AFTER_RULES_REVIEW/),'Scritture LIVE richiedono seconda conferma')
c(re('scripts/release-preflight.mjs',/require-writes/),'Build LIVE protetta dal gate --require-writes')
c(existsSync(path('security/step3s2-prod-proposed-FIRESTORE-NON-PUBBLICARE.rules')),'Rules PROD Firestore proposte come riferimento')
c(existsSync(path('security/step3s2-prod-proposed-STORAGE-NON-PUBBLICARE.rules')),'Rules PROD Storage proposte come riferimento')
c(re('.gitignore',/\.env\.\*/),'File env locali esclusi da Git')
c(re('capacitor.config.json',/"appId"\s*:\s*"com\.roundone\.app"/),'Android Capacitor package identico alla vecchia app')
c(re('android/app/build.gradle',/applicationId\s+"com\.roundone\.app"/),'Android Gradle package identico alla vecchia app')
const gradle=file('android/app/build.gradle')
const version=Number(/\bversionCode\s+(\d+)/.exec(gradle)?.[1]||0)
c(version>0,'Android versionCode numerico presente')
// config reading only; redact all values. Never log Web API keys or App IDs.
const envPath=path('.env.production.local')
let env=null
if(existsSync(envPath)){
 env={}
 for(const line of readFileSync(envPath,'utf8').split(/\r?\n/)){
  const m=/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
  if(m)env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'')
 }
 c(env.VITE_LIONFIT_MODE==='live','Env locale: ambiente live')
 c(env.VITE_FIREBASE_PROJECT_ID==='app-palestra-b0b9d','Env locale: progetto Firebase PROD previsto')
 c((env.VITE_FIREBASE_APP_ID||'').startsWith('1:') && (env.VITE_FIREBASE_APP_ID||'').includes(':web:'),'Env locale: Web App ID valorizzato (non stampato)')
 c((env.VITE_FIREBASE_API_KEY||'').startsWith('AIza'),'Env locale: API Key Web valorizzata (non stampata)')
}else c(false,'File .env.production.local presente esclusivamente su questo PC')
const failures=checks.filter(x=>!x.valid)
for(const {valid,label} of checks)console.log((valid?'PASS  ':'FAIL  ')+label)
console.log('\n== RISULTATO STEP 3T.1 ==')
console.log(`${checks.length-failures.length}/${checks.length} controlli locali PASS; ${failures.length} FAIL.`)
console.log(`Versione Android nel sorgente: versionCode ${version}; prima della distribuzione verificare il vecchio APK e incrementare il numero.`)
if(env){
 const liveOn=env.VITE_LIONFIT_LIVE_ACK==='LIVE_FIREBASE_RULES_CONFIRMED'
 const writesOn=env.VITE_LIONFIT_LIVE_WRITES==='ENABLED_AFTER_RULES_REVIEW'
 console.log(`LIVE: ${liveOn?'SBLOCCATA':'BLOCCATA'} | SCRITTURE: ${writesOn?'ABILITATE':'BLOCCATE'}.`)
 if(liveOn||writesOn)console.warn('ATTENZIONE: non distribuire prima del confronto Rules, backup verificato e autorizzazione finale.')
}
console.log('Nessuna connessione a Firebase, nessuna scrittura PROD, nessun Git push.')
console.log('\nGATE MANUALI DA CHIUDERE PRIMA DI PUBBLICARE:')
console.log('- Backup Firestore/Storage e piano rollback verificati')
console.log('- Regole PROD approvate: compatibili con vecchia app finche resta online')
console.log('- Verifica build Windows: npm.cmd run release:build SOLO AL CUTOVER')
console.log('- Firma APK esistente verificata e versionCode aumentato')
console.log('- Upload web in GitHub Pages e APK in GitHub Release coordinati')
process.exitCode=failures.length?1:0
