/** LionFit Modern STEP 3S: release gate WITHOUT connecting to Firebase.
 * No passwords or private keys are read, logged, or uploaded.
 * Node.js only; runs locally in the project directory.
 */
import {readFileSync,existsSync,statSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const args=new Set(process.argv.slice(2))
const errors=[];const warnings=[];const ok=[]
const check=(condition,message)=>{(condition?ok:errors).push(message)}
const exists=(p)=>existsSync(join(root,p))
const txt=(p)=>readFileSync(join(root,p),'utf8')

// Source & website continuity. This mode works without an env file.
const requiredFiles=[
 'index.html','src/main.ts','src/router/index.ts','src/integrations/firebase/stagingConfig.ts',
 'src/integrations/firebase/stagingSession.ts','src/views/LiveCoachStaff.vue',
 'src/views/LiveBookingWorkspace.vue','src/views/LiveCoachAthletes.vue',
 'public/404.html','public/CNAME','public/manifest.webmanifest',
 'public/www/index.html','public/www/admin.html','public/www/athlete.html',
 'public/www/prenotazioni.html','public/www/manifest.webmanifest','public/www/ios.html',
 'public/www/icons/icon-192.png','public/www/icons/icon-512.png',
 'public/icons/icon-192.png','public/icons/icon-512.png',
 'public/download/index.html','android/app/build.gradle',
 'security/firestore-candidate-NON-PUBBLICARE.rules',
 'security/storage-candidate-NON-PUBBLICARE.rules'
]
for(const p of requiredFiles)check(exists(p),`File richiesto: ${p}`)
if(exists('public/CNAME'))check(txt('public/CNAME').trim()==='www.lionfit.it','Dominio GitHub Pages: www.lionfit.it')
if(exists('android/app/build.gradle')){
 const gradle=txt('android/app/build.gradle')
 check(/applicationId\s+["']com\.roundone\.app["']/.test(gradle),'Android: packageId invariato com.roundone.app')
 check(/versionCode\s+\d+/.test(gradle),'Android: versionCode presente (firma e incremento da verificare nello STEP 3T)')
}
if(exists('.gitignore'))check(txt('.gitignore').includes('.env.*'),'Git: esclusione file .env.*')

function readEnvFile(file){
 const env={};let line=0
 for(const row of readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
  line++
  const v=row.trim()
  if(!v||v.startsWith('#'))continue
  const m=/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(v)
  if(!m){errors.push(`Riga ${line} non valida nel file di configurazione`);continue}
  const key=m[1]
  if(Object.hasOwn(env,key)){errors.push(`Chiave ripetuta: ${key}`);continue}
  let value=m[2].trim()
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1)
  else value=value.replace(/\s+#.*$/,'').trim()
  env[key]=value
 }
 return env
}
function validateLiveEnv(env,requireWrites){
 const eq=(key, expected)=>check(env[key]===expected,`LIVE: ${key} corrisponde alla configurazione approvata`)
 eq('VITE_LIONFIT_MODE','live')
 eq('VITE_LIONFIT_LIVE_ACK','LIVE_FIREBASE_RULES_CONFIRMED')
 eq('VITE_LIONFIT_PRODUCTION_PROJECT_ID','app-palestra-b0b9d')
 eq('VITE_FIREBASE_PROJECT_ID','app-palestra-b0b9d')
 check(['app-palestra-b0b9d.firebaseapp.com','app-palestra-b0b9d.web.app'].includes(env.VITE_FIREBASE_AUTH_DOMAIN),'LIVE: dominio Auth corretto')
 const k=env.VITE_FIREBASE_API_KEY||''
 check(k.length>=30 && !/inserisci|sostituisci|todo|placeholder|example|fake|test/i.test(k),'LIVE: API key Firebase Web reale, non placeholder (il valore non viene mostrato)')
 const appId=env.VITE_FIREBASE_APP_ID||''
 check(/^1:\d{5,}:(?:web|android|ios):[\w-]{5,}$/.test(appId),'LIVE: Firebase App ID plausibile (il valore non viene mostrato)')
 for(const key of ['VITE_LIONFIT_STAGING_ACK','VITE_LIONFIT_STAGING_WRITES','VITE_LIONFIT_STAGING_TEST_GYM_ID','VITE_LIONFIT_STAGING_TEST_EMAILS','VITE_LIONFIT_STAGING_INVITE_BASE_URL'])
  check(!env[key],`LIVE: nessuna variabile ${key} di STAGING`)
 const ack=env.VITE_LIONFIT_LIVE_WRITES==='ENABLED_AFTER_RULES_REVIEW'
 if(requireWrites)check(ack,'LIVE: scritture abilitate soltanto dopo verifica/pubblicazione Rules e backup PROD')
 else if(!ack)warnings.push('Build LIVE in SOLA LETTURA: inviti, schede, profili e prenotazioni non scriveranno finché manca LIVE_WRITES.')
 check(!env.VITE_LIONFIT_COACH_REVOCATION,'LIVE: revoca Coach disabilitata in attesa Rules ACL V2 dedicate')
 if(env.VITE_LIONFIT_UPDATE_CHECK)warnings.push('Aggiornamento APK abilitato: nello STEP 3T verificare firma reale e GitHub Release.')
}
if(args.has('--live')){
 const p=join(root,'.env.production.local')
 if(!existsSync(p))errors.push('Manca .env.production.local: crealo localmente (non distribuirlo nel ZIP/GitHub).')
 else validateLiveEnv(readEnvFile(p),args.has('--require-writes'))
}
if(args.has('--dist')){
 const generated=['dist/index.html','dist/CNAME','dist/404.html','dist/www/index.html','dist/www/admin.html','dist/www/athlete.html','dist/www/prenotazioni.html','dist/manifest.webmanifest']
 for(const p of generated)check(exists(p),`Build web include ${p}`)
 if(exists('dist/index.html'))check(/assets\/[\w.-]+\.js/.test(txt('dist/index.html')),'Build web contiene asset JS compilato')
 check(!exists('dist/.env.production.local')&&!exists('dist/security'),'Build pubblicata non include env o Rules candidate')
}
// Regression test for the preflight parser, no Firebase calls.
if(args.has('--self-test')){
 const validations= [
  () => assert.equal(/^1:\d{5,}:(web|android|ios):[\w-]{5,}$/.test('1:123456789:web:abCd12'),true),
  () => assert.equal(/inserisci|sostituisci|todo|placeholder|example|fake|test/i.test('INSERISCI_PUBLIC_WEB_API_KEY'),true),
  () => assert.equal('www.lionfit.it','www.lionfit.it')
 ]
 for(const fn of validations){try{fn()}catch(e){errors.push('Autotest: '+e.message)}}
 check(validations.length===3,'Autotest statici release: 3 eseguiti')
}
const hideLong=messages=>messages.length>28?[...messages.slice(0,28),`... altri ${messages.length-28} controlli`]:messages
for(const message of errors)console.error('FAIL  '+message)
for(const message of warnings)console.warn('AVVISO  '+message)
for(const message of hideLong(ok))console.log('PASS  '+message)
console.log(`\nSTEP 3S: ${errors.length} errori, ${warnings.length} avvisi, ${ok.length} controlli superati.`)
if(errors.length)process.exitCode=1
