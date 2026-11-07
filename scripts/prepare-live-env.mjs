/** STEP 3S.3 - create a LOCAL PUBLIC Firebase Web SDK config, without enabling LIVE.
 * No network calls, deploy, Auth, Firestore or Storage interactions.
 * Never paste service-account JSON, private keys, credentials or Android signing keys.
 */
import {createInterface} from 'node:readline/promises'
import {stdin,stdout} from 'node:process'
import {openSync,writeSync,closeSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const project='app-palestra-b0b9d'
const root=fileURLToPath(new URL('..',import.meta.url))
const dest=join(root,'.env.production.local')
const validKey=x=>/^AIza[\w-]{25,}$/.test(x)
const validApp=x=>/^1:\d{5,}:web:[\w-]{5,}$/.test(x)
const format=(key,appId)=>[
 '# Generato localmente da LionFit STEP 3S3; non caricare questo file su GitHub.',
 '# La configurazione Web SDK e pubblica, ma le conferme LIVE si impostano solo dopo il rilascio sicuro delle Rules.',
 'VITE_LIONFIT_MODE=live',
 'VITE_LIONFIT_LIVE_ACK=ATTENDERE_PUBBLICAZIONE_E_VERIFICA_RULES',
 `VITE_LIONFIT_PRODUCTION_PROJECT_ID=${project}`,
 `VITE_FIREBASE_PROJECT_ID=${project}`,
 `VITE_FIREBASE_AUTH_DOMAIN=${project}.firebaseapp.com`,
 `VITE_FIREBASE_API_KEY=${key}`,
 `VITE_FIREBASE_APP_ID=${appId}`,
 '# NON ABILITARE PRIMA DEL COORDINAMENTO PROD:',
 '# VITE_LIONFIT_LIVE_ACK=LIVE_FIREBASE_RULES_CONFIRMED',
 '# VITE_LIONFIT_LIVE_WRITES=ENABLED_AFTER_RULES_REVIEW',
 ''
 ].join('\n')
if(process.argv.includes('--self-test')){
 assert.equal(validKey('AIza'+'A'.repeat(30)),true)
 assert.equal(validKey('INSERISCI_KEY'),false)
 assert.equal(validApp('1:123456789:web:abc123'),true)
 assert.equal(validApp('1:123456789:android:abc123'),false)
 assert.ok(!format('AIza'+'A'.repeat(30),'1:123456789:web:abc123').includes('\nVITE_LIONFIT_LIVE_ACK=LIVE_FIREBASE_RULES_CONFIRMED\n'))
 console.log('STEP 3S3: 5/5 test configurazione PASS; nessun file creato.');process.exit(0)
}
if(existsSync(dest)){
 console.error('STOP: .env.production.local esiste gia. Non lo sovrascrivo.');process.exit(1)
}
console.log('LionFit Modern - preparazione della configurazione PROD (NON attivazione).')
console.log('I valori richiesti sono quelli PUBBLICI della Web App in Firebase > Impostazioni progetto > Le tue app.')
console.log(`Progetto previsto: ${project}`)
const rl=createInterface({input:stdin,output:stdout})
try{
 const api=(await rl.question('Web API Key (inizia con AIza): ')).trim()
 const app=(await rl.question('Firebase Web App ID (1:...:web:...): ')).trim()
 if(!validKey(api)||!validApp(app))throw new Error('Formato API Key o Web App ID non valido. Nessun file scritto.')
 const confirm=(await rl.question('Confermi che entrambi provengono da app-palestra-b0b9d? (scrivi SI): ')).trim()
 if(confirm!=='SI')throw new Error('Conferma non ricevuta. Nessun file scritto.')
 const fd=openSync(dest,'wx',0o600)
 try{writeSync(fd,format(api,app))}finally{closeSync(fd)}
 console.log('Configurazione locale creata. Modalita LIVE ancora BLOCCATA: ACK non attivato, nessun deploy.')
 console.log('Non caricare .env.production.local sul repository e non condividere copie del file.')
}catch(e){console.error('STOP: '+e.message);process.exitCode=1}finally{rl.close()}
