// LionFit R21O: safe, exact-anchor integration into latest working tree.
// No network, no Firebase writes, no .env reads/edits. Backups outside repo.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
const scriptRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const args=process.argv.slice(2)
const repoArg=args.includes('--repo')?args[args.indexOf('--repo')+1]:null
const repo=path.resolve(repoArg||process.cwd())
const files=[
 {rel:'src/views/StagingAccess.vue'},
 {rel:'src/views/Settings.vue'},
]
function read(rel){return fs.readFileSync(path.join(repo,rel),'utf8')}
const frontend=read('src/views/StagingAccess.vue')
const settings=read('src/views/Settings.vue')
if(!fs.existsSync(path.join(repo,'package.json'))||!fs.existsSync(path.join(repo,'src/integrations/firebase/stagingSession.ts'))){
 console.error('STOP: la cartella non è la radice LionFit-Modern-Git.');process.exit(2)
}
if(!fs.existsSync(path.join(repo,'src/components/GoogleExistingSigninButton.vue')) || !fs.existsSync(path.join(repo,'src/components/GoogleAccountLinkPanel.vue'))){
 console.error('STOP: estrai PRIMA lo ZIP R21O nella radice LionFit-Modern-Git.');process.exit(2)
}
function replaceOnce(text,find,replacement,label){
 if(!text.includes(find))throw Error('STOP: punto modificato nel progetto aggiornato: '+label+'; non sovrascrivere il file.')
 if(text.split(find).length!==2)throw Error('STOP: ancora ripetuta, rischio modifica doppia: '+label)
 return text.replace(find,replacement)
}
let nextFront=frontend,nextSettings=settings
try{
 if(!nextFront.includes('GoogleExistingSigninButton')){
  const loginButton=`<button type="submit" class="primary wide" :disabled="busy">{{busy?'ACCESSO IN CORSO…':'ACCEDI'}}</button>`
  nextFront=replaceOnce(nextFront,"import {getStagingClients} from '../integrations/firebase/stagingClient'", "import {getStagingClients} from '../integrations/firebase/stagingClient'\nimport GoogleExistingSigninButton from '../components/GoogleExistingSigninButton.vue'",'import login')
  nextFront=replaceOnce(nextFront,"async function login(){", "async function googleLoginComplete(role:'atleta'|'titolare'|'collaboratore'){\n try{await router.replace(signedInDestination(role))}\n catch{error.value='Accesso Google riuscito. Ricarica la pagina per entrare in LionFit.'}\n}\nasync function login(){",'handler login')
  nextFront=replaceOnce(nextFront,loginButton, loginButton+`\n    <GoogleExistingSigninButton :remember="remember" @authenticated="googleLoginComplete" @error="error=$event"/>`,'template login')
 }
 // R21N already provided the link UI and its helper; preserve it if present.
 if(!nextSettings.includes('googleLinkAvailable')&&!nextSettings.includes('GoogleAccountLinkPanel')){
  nextSettings=replaceOnce(nextSettings,"import {getStagingClients} from '../integrations/firebase/stagingClient'", "import {getStagingClients} from '../integrations/firebase/stagingClient'\nimport GoogleAccountLinkPanel from '../components/GoogleAccountLinkPanel.vue'",'import impostazioni')
  nextSettings=replaceOnce(nextSettings,`v-if="canResetPassword" class="lfsettings-flat-row"`, `v-if="canResetPassword || (isLiveMode() && !!stagingSession)" class="lfsettings-flat-row"`,'menu Sicurezza')
  nextSettings=replaceOnce(nextSettings,`   <p v-if="securityStatus" class="notice" role="status">`, `   <GoogleAccountLinkPanel/>\n   <p v-if="securityStatus" class="notice" role="status">`,'pannello Google')
 }
}catch(e){console.error(String(e.message||e));process.exit(2)}
const changes=[]
if(frontend!==nextFront)changes.push(['src/views/StagingAccess.vue',frontend,nextFront])
if(settings!==nextSettings)changes.push(['src/views/Settings.vue',settings,nextSettings])
if(!changes.length){console.log('R21O già integrata: nessuna modifica necessaria.');process.exit(0)}
const folder=path.join(os.homedir(),'Desktop','LionFit_BACKUP_GOOGLE_R21O_'+new Date().toISOString().replace(/[:.]/g,'-'))
fs.mkdirSync(folder,{recursive:true})
for(const [relative,previous] of changes){
 const out=path.join(folder,relative)
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,previous,'utf8')
}
try{
 for(const [relative,,after] of changes)fs.writeFileSync(path.join(repo,relative),after,'utf8')
}catch(e){
 for(const [relative,previous] of changes)fs.writeFileSync(path.join(repo,relative),previous,'utf8')
 throw e
}
console.log('OK R21O installata nei file: '+changes.map(x=>x[0]).join(', '))
console.log('BACKUP originale fuori dal repository: '+folder)
console.log('Nessun deploy, nessuna Firestore Rule e nessun flag sono stati modificati.')
