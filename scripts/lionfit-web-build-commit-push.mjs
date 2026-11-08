/**
 * LionFit Modern — aggiornamento web via doppio clic.
 * Compila il sito LIVE, prepara docs/, controlla lo staging Git,
 * e soltanto dopo conferma esplicita esegue commit + push su origin/main.
 * Non pubblica Firebase Rules, non genera APK, non legge/stampa segreti.
 * Node 20+, npm e Git per Windows. Nessuna dipendenza esterna per questo file.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = 'matteo-perini/roundone'
const SAFE_PATHS = [
  'src', 'public', 'scripts', 'docs', 'android',
  'index.html', 'package.json', 'package-lock.json',
  'vite.config.ts', 'tsconfig.json', 'capacitor.config.json',
  '.gitignore', 'README.md', 'PREPARA_LIONFIT_WEB.cmd',
  'LIONFIT_WEB_BUILD_COMMIT_PUSH.cmd'
]
const SENSITIVE = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)node_modules\//i,
  /(^|\/)dist\//i,
  /(^|\/)\.git\//i,
  /(^|\/)(?:security|\.firebase)\//i,
  /(?:^|\/)(?:firebase-test|serviceAccountKey|[^/]*service[-_]?account[^/]*)\.json$/i,
  /\.(?:keystore|jks|p12|pfx|pem|key|apk|aab|aar|zip|log)$/i,
  /(?:^|\/)android\/(?:\.gradle|build|app\/build|local\.properties)(?:\/|$)/i,
  /(?:^|\/)docs\/(?:src|security|android|node_modules|\.git)(?:\/|$)/i,
]

function isSensitive(name) { return SENSITIVE.some(re => re.test(name.replaceAll('\\','/'))) }
function allowedPath(name) {
  const normalized=name.replaceAll('\\','/')
  return SAFE_PATHS.some(p=>normalized === p || (['src','public','scripts','docs','android'].includes(p) && normalized.startsWith(p+'/')))
}
function die(message) { throw new Error(message) }
function step(message){console.log('\n'+'='.repeat(66)+'\n'+message+'\n'+'='.repeat(66))}
function run(cmd,args,opts={}) {
  const result=spawnSync(cmd,args,{
    cwd:ROOT, encoding:'utf8', stdio:opts.capture?['ignore','pipe','pipe']:'inherit',
    windowsHide:false, maxBuffer:20*1024*1024,
  })
  if(result.error || result.status!==0){
    if(opts.capture && result.stderr)console.error(result.stderr.trim().slice(-1800))
    die(`Comando non riuscito (${result.status??'N/A'}): ${cmd} ${args.map(a=>String(a).replace(/(AIza|ghp_)[^\s]*/g,'[RISERVATO]')).join(' ')}`)
  }
  return opts.capture?(result.stdout||'').trim():''
}
function git(args, opts){return run('git',args,opts)}
function gitText(args){return git(args,{capture:true})}
function gitPaths(args){
  // -z evita errori con percorsi contenenti spazi, virgolette e lettere accentate.
  const data=gitText([...args,'-z'])
  return data.split('\0').filter(Boolean)
}
function sanitizeRemote(remote){
  if(remote.startsWith('git@github.com:'))return remote.slice('git@github.com:'.length).replace(/\.git$/i,'').toLowerCase()
  try{
    const u=new URL(remote)
    if(u.hostname.toLowerCase()!=='github.com'||!['https:','ssh:'].includes(u.protocol))return ''
    return u.pathname.replace(/^\//,'').replace(/\.git$/i,'').toLowerCase()
  }catch{return ''}
}
function ensureKnownRepository(){
  for(const file of ['package.json','.gitignore','public/CNAME','scripts/prepara-pubblicazione-docs.mjs','scripts/release-preflight.mjs']){
    if(!existsSync(join(ROOT,file)))die(`Manca il file del progetto: ${file}`)
  }
  const branch=gitText(['branch','--show-current'])
  if(branch!=='main')die(`Ramo attivo: ${branch||'(nessuno)'}. Richiesto: main.`)
  const top=resolve(gitText(['rev-parse','--show-toplevel']))
  if(top.toLowerCase()!==ROOT.toLowerCase())die('Apri il file dalla cartella principale del repository LionFit-Modern-Git.')
  const remote=gitText(['remote','get-url','origin'])
  if(sanitizeRemote(remote)!==TARGET)die('Il remote origin non punta al repository LionFit previsto (Matteo-Perini/ROUNDONE).')
  const domain=readFileSync(join(ROOT,'public','CNAME'),'utf8').trim()
  if(domain!=='www.lionfit.it')die(`Dominio CNAME inatteso: ${domain}`)
  const ignored=readFileSync(join(ROOT,'.gitignore'),'utf8')
  for(const x of ['.env.*','node_modules/','dist/','*.keystore','*.apk'])
    if(!ignored.includes(x))die(`Protezione mancante in .gitignore: ${x}`)
  const tracked=gitPaths(['ls-files','--full-name'])
  const sensitiveTracked=tracked.filter(isSensitive)
  if(sensitiveTracked.length)die('Rilevati file RISERVATI gia tracciati da Git. Operazione annullata: '+sensitiveTracked.slice(0,12).join(', '))
  const staged=gitPaths(['diff','--cached','--name-only'])
  if(staged.length)die('Ci sono gia modifiche nello staging di Git. Effettua prima Commit/Unstage in GitHub Desktop; non le mescolo al rilascio automatico.')
  const author=gitText(['var','GIT_AUTHOR_IDENT'])
  if(!author)die('Imposta nome ed email Git in GitHub Desktop prima di procedere.')
  if(!existsSync(join(ROOT,'.env.production.local')))
    die('Manca la configurazione locale .env.production.local. Nessun file segreto viene creato o caricato.')
}
function ensureRemoteCurrent(){
  step('[1/5] Verifica remote origin/main')
  git(['fetch','--no-tags','origin','main'])
  const remoteHead=gitText(['rev-parse','refs/remotes/origin/main'])
  const localHead=gitText(['rev-parse','HEAD'])
  const r=spawnSync('git',['merge-base','--is-ancestor',remoteHead,localHead],{cwd:ROOT,stdio:'ignore'})
  if(r.status!==0)die('Il ramo main locale non include tutti gli aggiornamenti remoti. Apri GitHub Desktop, esegui Fetch/Pull e risolvi eventuali conflitti.')
  if(remoteHead!==localHead){
    const pending=gitPaths(['diff','--name-only','refs/remotes/origin/main..HEAD'])
    const blocked=pending.filter(n=>isSensitive(n)||!allowedPath(n))
    if(blocked.length)die('Ci sono commit locali non pubblicati con file fuori dall’elenco sicuro: '+blocked.slice(0,12).join(', '))
    console.log('Nota: esistono commit locali precedenti non ancora pubblicati; saranno inclusi nel push.')
  }
}
function ensureNpm(){
  if(process.platform!=='win32')die('Questo file e progettato per il PC Windows del progetto LionFit.')
  // Windows: npm.cmd e cmd.exe; Node lancia i comandi senza interpolare input non fidati.
  if(!existsSync(join(ROOT,'node_modules','vite','bin','vite.js'))){
    console.log('Dipendenze assenti. Eseguo npm ci (usa package-lock.json)...')
    run('cmd.exe',['/d','/s','/c','npm ci'])
  }
}
function releaseBuild(){
  step('[2/5] Compilazione web LIVE + TypeScript + controlli Firebase')
  ensureNpm()
  run('cmd.exe',['/d','/s','/c','npm run release:build'])
  step('[3/5] Preparazione docs per GitHub Pages')
  run(process.execPath,['scripts/prepara-pubblicazione-docs.mjs'])
  if(!existsSync(join(ROOT,'docs','CNAME')) || readFileSync(join(ROOT,'docs','CNAME'),'utf8').trim()!=='www.lionfit.it')
    die('docs/CNAME non corrisponde al dominio approvato.')
}
function stageSafeChanges(){
  step('[4/5] Preparazione controllata di Git')
  git(['add','-A','--',...SAFE_PATHS])
  const staged=gitPaths(['diff','--cached','--name-only'])
  const blocked=staged.filter(n=>!allowedPath(n)||isSensitive(n))
  if(blocked.length){
    // Non cancella modifiche dal disco: rimuove soltanto lo staging che abbiamo creato.
    git(['reset','--quiet','--',...SAFE_PATHS])
    die('Bloccato: file non ammessi allo staging: '+blocked.join(', '))
  }
  if(staged.length){
    console.log(`\nFile preparati per il commit (${staged.length}):`)
    git(['diff','--cached','--stat'])
    console.log('I file .env, APK, chiavi e security/ NON sono inclusi.')
  }else console.log('Nessuna modifica nuova da registrare. Se hai commit locali in attesa, sara proposto solo il push.')
  const others=gitText(['status','--short','--untracked-files=normal'])
  const skipped=others.split(/\r?\n/).filter(x=>x.length>3 && !staged.some(f=>x.slice(3)===f))
  if(skipped.length){
    console.log('\nAltri file o modifiche NON inclusi nel commit automatico:')
    for(const line of skipped.slice(0,20))console.log('  '+line)
    if(skipped.length>20)console.log(`  ... e altri ${skipped.length-20}`)
  }
  return staged
}
async function confirmPublish(){
  console.log('\nATTENZIONE: git push origin main pubblica il nuovo sito GitHub Pages.')
  console.log('Le Firebase Security Rules NON vengono pubblicate e il flag Coach Assignment NON viene attivato.')
  console.log('Se desideri verificare il risultato sul tuo APK prima di pubblicare il web, rispondi N.')
  const rl=createInterface({input:stdin,output:stdout})
  try{
    const answer=(await rl.question('Confermi COMMIT + PUSH del sito? Digita S e INVIO [S/N]: ')).trim().toUpperCase()
    return answer==='S'
  } finally{rl.close()}
}
async function main(){
  if(process.argv.includes('--help')){
    console.log('Uso: doppio clic su LIONFIT_WEB_BUILD_COMMIT_PUSH.cmd nella cartella principale del progetto.')
    console.log('Build LIVE + docs; dopo conferma S: commit su main, push origin/main. Non gestisce APK o Firebase Rules.')
    return
  }
  if(process.argv.includes('--self-test')){
    const cases=[
      ['https://github.com/Matteo-Perini/ROUNDONE.git',true],
      ['git@github.com:Matteo-Perini/ROUNDONE.git',true],
      ['https://github.com/another/repo.git',false],
      ['http://github.com/Matteo-Perini/ROUNDONE.git',false],
    ]
    for(const [u,expected] of cases)if((sanitizeRemote(u)===TARGET)!==expected)die('Self-test remote non riuscito')
    for(const name of ['.env.production.local','src/foo.key','docs/.env','security/firestore.rules','android/app/build/app-debug.apk','docs/favicon.png']){
      const expected = name==='docs/favicon.png' ? false : true
      if(isSensitive(name)!==expected)die('Self-test protezione fallito: '+name)
    }
    if(!allowedPath('src/App.vue') || allowedPath('security/firestore.rules'))die('Self-test staging non riuscito')
    console.log('Self-test PASS: verifica remoto, file riservati e selezione staging. Non eseguito build, commit o push.')
    return
  }
  step('LIONFIT MODERN — UN CLIC: BUILD WEB + COMMIT + PUSH ORIGIN')
  ensureKnownRepository()
  ensureRemoteCurrent()
  releaseBuild()
  const staged=stageSafeChanges()
  const remoteHead=gitText(['rev-parse','refs/remotes/origin/main'])
  const localHead=gitText(['rev-parse','HEAD'])
  if(!staged.length && remoteHead===localHead){
    console.log('\nNESSUNA MODIFICA: il repository e gia aggiornato. Nessun commit o push necessario.')
    return
  }
  if(!await confirmPublish()){
    if(staged.length)git(['reset','--quiet','--',...SAFE_PATHS])
    console.log('Operazione annullata. Build pronta in docs/, sorgenti invariati, nessun commit/push.')
    return
  }
  step('[5/5] Commit e Push origin/main')
  if(staged.length){
    const date=new Date().toLocaleString('sv-SE',{timeZone:'Europe/Rome',hour12:false}).replace(' ',' ')
    git(['commit','-m',`LionFit Modern - aggiornamento web ${date}`])
  }
  // Nessun --force, nessun cambio remoto, nessun deploy Firebase.
  git(['push','origin','main'])
  console.log('\nSUCCESSO: commit e push completati. GitHub Pages pubblichera main/docs secondo le impostazioni esistenti.')
  console.log('Per l’APK: build Android separata, versionCode incrementato e firma verificata.')
}
main().catch(e=>{console.error('\nSTOP: '+e.message+'\nNessun push eseguito in questo tentativo, salvo eventuali operazioni Git terminate prima di un errore.');process.exitCode=1})
