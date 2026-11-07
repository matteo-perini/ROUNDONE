/** STEP 3T.3 - Verifica offline, non abilita LIVE e non effettua deploy. */
import {readFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const file=p=>readFileSync(join(root,p),'utf8')
const exists=p=>existsSync(join(root,p))
const checks=[]
const ck=(ok,label)=>checks.push({ok:!!ok,label})
const mode=exists('src/integrations/firebase/stagingConfig.ts')?file('src/integrations/firebase/stagingConfig.ts'):''
const router=exists('src/router/index.ts')?file('src/router/index.ts'):''
const dashboard=exists('src/views/Coach.vue')?file('src/views/Coach.vue'):''
const liveDashboard=exists('src/views/DevCoachDashboard.vue')?file('src/views/DevCoachDashboard.vue'):''
const firebaseClient=exists('src/integrations/firebase/stagingClient.ts')?file('src/integrations/firebase/stagingClient.ts'):''
const pwa=exists('public/manifest.webmanifest')?file('public/manifest.webmanifest'):''
const cap=exists('capacitor.config.json')?file('capacitor.config.json'):''
const gradle=exists('android/app/build.gradle')?file('android/app/build.gradle'):''
console.log('\nSTEP 3T.3 — CHECK LIST LIVE + WEB + ANDROID (OFFLINE, NESSUN DEPLOY)\n')
// Nuova precisazione: isStagingMode e' un nome legacy, ma vale per LIVE autorizzato.
ck(mode.includes("VITE_LIONFIT_MODE==='live'")&&mode.includes('LIVE_FIREBASE_RULES_CONFIRMED'),'LIVE autorizzata dalla funzione storica isStagingMode')
ck(mode.includes("VITE_LIONFIT_MODE==='staging'")&&mode.includes('STAGING_ONLY'),'STAGING protetto separatamente')
ck(mode.includes('isOperationalMode=()=>isStagingMode()'),'Le viste Firebase LIVE utilizzano modalita operativa')
ck(mode.includes('ENABLED_AFTER_RULES_REVIEW')&&mode.includes('mayWriteLive'),'Le scritture LIVE hanno un gate separato')
ck(router.includes('readStagingSession()')&&router.includes('isOperationalMode()'),'Router production usa la sessione Firebase verificata e la modalita operativa')
ck(router.includes("if(!isStagingMode())return to.path==='/accesso'?true:'/accesso'"),'Accesso negato quando la modalita LIVE/STAGING non e autorizzata')
ck(dashboard.includes('LiveCoachDashboard')&&dashboard.includes('DevCoachDashboard.vue'),'Dashboard Coach LIVE collegata al componente Firebase')
ck(dashboard.includes('emulator && LiveCoachDashboard'),'La dashboard Coach LIVE preferisce il componente autenticato')
ck(liveDashboard.includes('getStagingClients()')&&liveDashboard.includes('readStagingSession()'),'Dati dashboard Coach letti da Auth/Firestore')
ck(firebaseClient.includes('parseStagingConfig(')&&!firebaseClient.includes('connectFirestoreEmulator'),'SDK LIVE/STAGING usa config Firebase, non emulator di test')
ck(!router.includes('window.location.href=\'/dev'),'Router normale non rimanda alla demo')
ck(exists('public/404.html')&&exists('public/CNAME')&&file('public/CNAME').trim()==='www.lionfit.it','GitHub Pages: dominio e fallback presenti')
ck(exists('public/www/index.html')&&exists('public/www/admin.html')&&exists('public/www/athlete.html'),'Compatibilita URL storici web presente')
ck(exists('public/www/prenotazioni.html')&&exists('public/www/ios.html'),'Compatibilita prenotazioni/iPhone presente')
ck(exists('public/download/index.html'),'Pagina download APK preservata')
ck(exists('public/icons/icon-192.png')&&exists('public/icons/icon-512.png'),'Icone principali PWA preservate')
ck(pwa.includes('"start_url": "/"')&&pwa.includes('"scope": "/"'),'PWA: start/scope alla root')
ck(cap.includes('"appId": "com.roundone.app"'),'Capacitor appId originale mantenuto')
ck(/applicationId\s+"com\.roundone\.app"/.test(gradle),'Android Gradle applicationId originale mantenuto')
const code=Number(/\bversionCode\s+(\d+)/.exec(gradle)?.[1]||0)
ck(code>=8,'Android versionCode sorgente >= 8; incremento finale ancora da verificare')
ck(exists('scripts/verify-apk-signatures.ps1')&&exists('VERIFICA_FIRMA_APK_STEP3T3.cmd'),'Utility per confronto firma vecchia/nuova APK presente')
ck(exists('security/step3s2-prod-proposed-FIRESTORE-NON-PUBBLICARE.rules')&&exists('security/step3s2-prod-proposed-STORAGE-NON-PUBBLICARE.rules'),'Rules proposte presenti e tenute fuori dal deploy')
ck(exists('.gitignore')&&file('.gitignore').includes('.env.*'),'File .env locali esclusi da Git')
ck(exists('scripts/release-preflight.mjs')&&file('scripts/release-preflight.mjs').includes('--require-writes'),'Build LIVE finale richiede gate di scrittura')
ck(exists('scripts/release-3t-readiness.mjs'),'Audit pre-rilascio 3T.1 disponibile')
const failures=checks.filter(c=>!c.ok)
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'}  ${c.label}`)
console.log(`\nSTEP 3T.3: ${checks.length-failures.length}/${checks.length} PASS, ${failures.length} FAIL.`)
console.log(`VersionCode nel sorgente: ${code}; il nuovo APK dovra superare il valore dell'APK effettivamente distribuito.`)
console.log('STATO: APK distribuito/firma = DA VERIFICARE; GitHub Pages = NON PUBBLICATO; Firebase PROD = NON MODIFICATO.')
if(failures.length)process.exitCode=1
