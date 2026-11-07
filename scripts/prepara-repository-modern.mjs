/** STEP 3T.6 - Prepara una COPIA Git su branch modern-source, senza push e senza toccare main.
 * NODE 20+, Git installato. Lanciare da PREPARA_REPOSITORY_STEP3T6.cmd.
 */
import { existsSync, mkdirSync, readdirSync, cpSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const target=resolve(dirname(root),'LionFit-Modern-Git')
const expected='https://github.com/matteo-perini/ROUNDONE.git'
// Override esclusivamente per test locale del pacchetto, non per l'utente finale.
const remote=process.env.LIONFIT_REPO_TEST_REMOTE || expected
const branch='modern-source'
const args=process.argv.slice(2)
const applying=args.includes('--prepare')
const cwdOf=cmd=>cmd||root
function git(params,{cwd=root,print=false}={}){
  const p=spawnSync('git',params,{cwd,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'1'}})
  if(p.error||p.status!==0){
    console.error(`[ERRORE] git ${params.join(' ')} (code ${p.status??'N/A'})`)
    console.error((p.stderr||p.error?.message||p.stdout||'').slice(-1600))
    process.exit(1)
  }
  if(print) console.log((p.stdout||'').slice(-6000))
  return (p.stdout||'').trim()
}
function check(ok,detail){ console.log((ok?'[PASS] ':'[STOP] ')+detail); if(!ok)process.exit(1) }
const shell=spawnSync('git',['--version'],{encoding:'utf8'})
check(shell.status===0,'Git installato')
check(existsSync(join(root,'package.json')) && existsSync(join(root,'src','main.ts')),'Cartella sorgente LionFit Modern verificata')
check(existsSync(join(root,'android','app','build.gradle')),'Sorgenti Android presenti')
check(existsSync(join(root,'public','CNAME')) && readFileSync(join(root,'public','CNAME'),'utf8').trim()==='www.lionfit.it','CNAME pubblico presente')
const ignores=readFileSync(join(root,'.gitignore'),'utf8')
for(const token of ['node_modules/','dist/','.env.*','*.keystore','android/app/build/'])check(ignores.includes(token),`.gitignore protegge ${token}`)
check(!/^android\/$/m.test(ignores),'Android NON escluso: build.gradle verrà tracciato')
const names=['src','public','android','scripts','security','config-esempi','functions-lionfit-support']
const files=['.gitignore','README.md','index.html','package.json','package-lock.json','capacitor.config.json','tsconfig.json','vite.config.ts','VERIFICA_FIRMA_APK_STEP3T3.cmd']
for(const nm of ['src','public','android'])check(existsSync(join(root,nm)),`Sorgenti ${nm}/ presenti`)
console.log(`
Repo originale: ${expected}
Branch da creare: ${branch}
Cartella COPIA: ${target}
Nessun deploy automatico, main intatta.
`)
if(!applying){ console.log('CONTROLLO PASS. Per preparare la copia usa PREPARA_REPOSITORY_STEP3T6.cmd');process.exit(0) }
check(!existsSync(target),'La cartella LionFit-Modern-Git NON esiste (nessun file sovrascritto)')
// Si clona la repository reale: preserva tutti i commit e releases remote. Non usa git init orphan.
git(['-c','core.longpaths=true','clone','--branch','main','--single-branch',remote,target],{cwd:dirname(root)})
check(git(['branch','--show-current'],{cwd:target})==='main','Clonazione sul ramo main')
git(['config','core.longpaths','true'],{cwd:target})
git(['switch','-c',branch],{cwd:target})
// Lavoriamo soltanto nella COPIA appena creata. git rm non tocca remoto/main.
git(['rm','-r','--ignore-unmatch','--','.'],{cwd:target})
const skip=parts=>parts.some(p=>['.git','node_modules','dist','.gradle','.idea','.cxx','build','coverage','.vite','.firebase'].includes(p))
let copies=0,excluded=0
function allowed(from){
 const rel=relative(root,from).split('\\').join('/')
 if(!rel) return true
 const parts=rel.split('/')
 const name=parts.at(-1)
 if(skip(parts) || name.startsWith('.env') || /\.(?:keystore|jks|p12|pfx|pem|key|apk|aab|aar|zip|log|tmp)$/i.test(name) || /service.?account|serviceAccountKey/i.test(name) || /^RISULTATO|^TEST_STEP|^LEGGIMI-STEP/i.test(name)){excluded++;return false}
 copies++;return true
}
for(const nm of [...names,...files]){
 const src=join(root,nm)
 if(!existsSync(src))continue
 const dst=join(target,nm)
 cpSync(src,dst,{recursive:true,preserveTimestamps:true,filter:allowed,errorOnExist:false,force:true})
}
check(existsSync(join(target,'src','main.ts')) && existsSync(join(target,'android','app','build.gradle')),'Nuova copia contiene app e Android')
check(!existsSync(join(target,'.env.production.local')) && !existsSync(join(target,'.env.staging.local')),'Nessun .env locale copiato')
git(['add','-A'],{cwd:target})
const tracked=git(['ls-files'],{cwd:target}).split(/\r?\n/)
check(!tracked.some(x=>/^\.env|(?:^|\/)node_modules\/|(?:^|\/)dist\/|\.(?:keystore|jks|apk|aab)$/.test(x)),'Git: nessun env, dipendenza, APK o firma nello staging')
check(tracked.includes('android/app/build.gradle'),'Git: android/app/build.gradle incluso')
const headMain=git(['rev-parse','main'],{cwd:target})
const headBranch=git(['rev-parse',branch],{cwd:target})
check(headMain===headBranch,'Nuovo ramo parte dalla cronologia main (non crea storia separata)')
const status=git(['status','--short'],{cwd:target}).split(/\r?\n/)
console.log(`
PREPARAZIONE COMPLETATA: ${target}`)
console.log(`File in Git (dopo stage): ${tracked.length}; righe status: ${status.length}; esclusioni applicate: ${excluded}.`)
console.log(`Ramo: ${branch}, main invariata. NESSUN COMMIT / NESSUN PUSH / NESSUNA PUBBLICAZIONE.`)
console.log(`
PROSSIMI COMANDI nel nuovo progetto:
cd /d "${target}"
git status --short
git commit -m "LionFit Modern - sorgenti V1 consolidati"
git push -u origin ${branch}`)
console.log('Se git commit chiede nome/email, configurali con i tuoi dati GitHub; NON usare git push --force.')
