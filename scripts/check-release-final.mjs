/** LionFit STEP 3T.4: local, offline and credential-free final source checks. */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(fileURLToPath(new URL('..', import.meta.url)))
const read=p=>readFileSync(join(root,p),'utf8')
const tests=[]
const check=(ok,label)=>tests.push({ok:Boolean(ok),label})
const app=read('src/App.vue'),coach=read('src/views/Coach.vue')
const router=read('src/router/index.ts'),config=read('src/integrations/firebase/stagingConfig.ts')
const packageJson=JSON.parse(read('package.json'))
check(app.includes('import.meta.env.DEV') && app.includes('const shownRole') && /demoRouteRole\.value\?\?lab\.role/.test(app),'Menu e ruoli demo limitati alla modalita DEV')
check(app.includes(': null)'), 'Senza conferma LIVE, shell Coach/Atleta non accessibile in PROD')
check(coach.includes('v-else-if="demoAllowed"') && coach.includes('import.meta.env.DEV'),'Fallback dimostrativo Coach soltanto in DEV')
check(router.includes('...(import.meta.env.DEV ?') && router.includes('/dev/'),'Rotte diagnostiche soltanto in DEV')
check(config.includes('LIVE_FIREBASE_RULES_CONFIRMED') && config.includes('ENABLED_AFTER_RULES_REVIEW'),'Doppio gate LIVE + scritture presente')
check(config.includes("'app-palestra-b0b9d'"),'Firebase PROD atteso invariato')
check(packageJson.scripts['android:sync']==='npm run release:android:sync','Comando Android generico fail-closed su LIVE')
check(packageJson.scripts['release:android:sync'].includes('release:build'),'Sincronizzazione Android richiede release:build')
check(existsSync(join(root,'security/step3s2-prod-proposed-FIRESTORE-NON-PUBBLICARE.rules')),'Rules PROD proposte conservate solo come riferimento')
check(existsSync(join(root,'security/step3s2-prod-proposed-STORAGE-NON-PUBBLICARE.rules')),'Storage Rules proposte conservate solo come riferimento')
check(read('public/CNAME').trim()==='www.lionfit.it','Dominio pubblico invariato')
for (const p of ['public/404.html','public/www/index.html','public/www/admin.html','public/www/athlete.html','public/www/prenotazioni.html','public/www/ios.html','public/download/index.html','public/v1-preview/exercise-library/LICENSE','android/app/build.gradle','capacitor.config.json'])
 check(existsSync(join(root,p)),`Compatibilita e asset necessari: ${p}`)
check(/versionCode\s+8\b/.test(read('android/app/build.gradle')),'versionCode 8 conservato: incremento a 9 soltanto alla build finale')
check(/applicationId\s+"com\.roundone\.app"/.test(read('android/app/build.gradle')),'Package Android originale conservato')
const errors=tests.filter(t=>!t.ok)
for(const t of tests) console.log((t.ok?'PASS  ':'FAIL  ')+t.label)
console.log(`\nSTEP3T4: ${tests.length-errors.length}/${tests.length} PASS, ${errors.length} FAIL. NESSUNA CONNESSIONE A FIREBASE.`)
if(errors.length)process.exitCode=1
