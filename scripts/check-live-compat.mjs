/** STEP 3S3: audit STATIC; no Firebase project connection, no deploy. */
import {readFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const text=p=>readFileSync(join(root,p),'utf8')
let passes=0,fails=0
function check(ok,msg){if(ok){passes++;console.log('[PASS] '+msg)}else{fails++;console.error('[FAIL] '+msg)}}
const rosterFiles=[
 'src/views/DevCoachDashboard.vue','src/views/LiveCoachAthletes.vue',
 'src/views/LiveCoachTemplates.vue','src/views/LiveCoachTrash.vue',
 'src/features/profile/coachMetrics.ts'
]
for(const path of rosterFiles){check(existsSync(join(root,path))&&text(path).includes('coachAclEnforced()'),`Compatibilita roster coach legacy: ${path}`)}
const access=text('src/views/StagingAccess.vue')
check(access.includes('if(!mayWriteLive())throw new Error('),'Registrazione Coach non puo creare account in build senza scritture')
check(/async function register\(\).*?!mayWriteLive\(\)/.test(access),'Registrazione Atleta/Owner bloccata in build senza scritture')
check(/async function recoverRegistration\(\)[\s\S]{0,120}!mayWriteLive\(\)/.test(access),'Ripresa registrazione bloccata in build senza scritture')
const client=text('src/integrations/firebase/stagingConfig.ts')
check(client.includes("VITE_LIONFIT_LIVE_ACK==='LIVE_FIREBASE_RULES_CONFIRMED'"),'LIVE richiede ACK esplicito')
check(client.includes("VITE_LIONFIT_LIVE_WRITES===LIVE_WRITE_ACK"),'Scritture richiedono flag separato')
check(text('src/views/LiveCoachStaff.vue').includes("return 'https://www.lionfit.it'"),'Link inviti LIVE al dominio pubblico')
const proposedFire='security/step3s2-prod-proposed-FIRESTORE-NON-PUBBLICARE.rules'
const proposedStorage='security/step3s2-prod-proposed-STORAGE-NON-PUBBLICARE.rules'
check(existsSync(join(root,proposedFire)),'Rules Firestore proposte presenti soltanto come riferimento')
check(existsSync(join(root,proposedStorage)),'Rules Storage proposte presenti soltanto come riferimento')
if(existsSync(join(root,proposedFire))) {
 const rules=text(proposedFire)
 check(rules.includes('membershipStatus')&&rules.includes('ownerUid'),'Firestore: revoche e proprietario legacy presenti')
 check(rules.includes('spark_booking_reservations')&&rules.includes('archive_templates'),'Firestore: prenotazioni e archivio ancora previsti')
}
check(text('public/CNAME').trim()==='www.lionfit.it','CNAME GitHub Pages invariato')
check(existsSync(join(root,'public/www/index.html'))&&existsSync(join(root,'public/404.html')),'URL legacy e fallback GitHub Pages preservati')
check(text('android/app/build.gradle').includes('applicationId "com.roundone.app"'),'Package Android originale preservato')
check(text('.gitignore').includes('.env.*'),'Configurazioni locali ignorate da Git')
check(!existsSync(join(root,'dist/.env.production.local')),'Nessun .env privato nella build')
console.log(`\nSTEP 3S3 compatibilita: ${passes} PASS, ${fails} FAIL. NESSUNA CONNESSIONE A PROD.`)
if(fails)process.exitCode=1
