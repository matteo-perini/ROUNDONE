/** SDK client Auth/Firestore: nessuna connessione emulator e nessuna chiave privata. */
import {getApps,initializeApp} from 'firebase/app'
import {getAuth,type Auth} from 'firebase/auth'
import {getFirestore,type Firestore} from 'firebase/firestore'
import {parseStagingConfig} from './stagingConfig'
let cached:{auth:Auth;db:Firestore}|null=null
export function getStagingClients(){
 if(cached)return cached
 const conf=parseStagingConfig(import.meta.env as unknown as Record<string,string|boolean|undefined>)
 if(!conf)throw new Error('Accesso Firebase non configurato: verifica la configurazione dell’ambiente.')
 const app=getApps().find(x=>x.name==='lionfit-verified-staging')??initializeApp({...conf,messagingSenderId:conf.appId.split(':')[1]},'lionfit-verified-staging')
 cached={auth:getAuth(app),db:getFirestore(app)}
 return cached
}
