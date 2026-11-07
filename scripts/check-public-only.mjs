/** STEP 3T.5: prova offline che la build LIVE non distribuisca il progetto STAGING.
 * Nessun accesso a rete, Firebase PROD, GitHub o credenziali .env. */
import {readFileSync,existsSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const read=p=>readFileSync(join(root,p),'utf8')
const checks=[]
const ck=(ok,msg)=>checks.push({ok:Boolean(ok),msg})
const config=read('src/integrations/firebase/stagingConfig.ts')
const app=read('src/App.vue')
const packageJson=JSON.parse(read('package.json'))
ck(config.includes("LIVE_BUILD=import.meta.env.MODE==='production'"),'Ambiente LIVE legato a Vite MODE=production')
ck(config.includes("STAGING_BUILD=import.meta.env.MODE==='staging'"),'Ambiente STAGING legato a Vite MODE=staging')
ck(config.includes("if(projectId!==PRODUCTION_PROJECT)"),'La build LIVE accetta soltanto Firebase PROD')
ck(config.includes("if(env.VITE_LIONFIT_MODE!==(live?'live':'staging'))"),'Le variabili STAGING non possono attivare una build LIVE')
ck(app.includes("import.meta.env.MODE==='staging' ? defineAsyncComponent") && !app.includes('FIREBASE STAGING'),'Banner STAGING isolato in chunk non LIVE')
ck(existsSync(join(root,'src/components/StagingBanner.vue')),'Banner STAGING ancora disponibile per test futuri')
ck(packageJson.scripts['release:build'].includes('release:publiccheck'),'Controllo del bundle integrato al rilascio')
ck(packageJson.scripts['android:sync']==='npm run release:android:sync','Android continua a richiedere build LIVE autorizzata')
ck(read('public/CNAME').trim()==='www.lionfit.it','Dominio e GitHub Pages invariati')
if(process.argv.includes('--dist')){
 const dist=join(root,'dist'), assets=join(dist,'assets')
 ck(existsSync(join(dist,'index.html')) && existsSync(assets),'Build LIVE dist presente')
 if(existsSync(assets)){
  const files=readdirSync(assets).filter(f=>f.endsWith('.js'))
  ck(files.length>0,'Bundle JavaScript presente')
  let invalid=[]
  for(const f of files){
   const js=readFileSync(join(assets,f),'utf8')
   // Token tipici di una build STAGING che NON devono apparire in produzione.
   if(js.includes('lionfit-staging-test') || js.includes('FIREBASE STAGING · SOLO PALESTRA TEST'))invalid.push(f)
  }
  ck(invalid.length===0,'Bundle LIVE privo di progetto Firebase STAGING e del suo banner'+(invalid.length?` (file: ${invalid.join(', ')})`:''))
 }
}
for(const c of checks)console.log((c.ok?'PASS  ':'FAIL  ')+c.msg)
const failures=checks.filter(c=>!c.ok)
console.log(`\nSTEP3T5: ${checks.length-failures.length}/${checks.length} PASS, ${failures.length} FAIL. NESSUN DEPLOY.`)
if(failures.length)process.exitCode=1
