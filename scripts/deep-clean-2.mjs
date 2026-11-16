/** LionFit Deep Clean 2.0 — explicit allowlist; default read-only. No Firebase/Git/network. */
import {existsSync,lstatSync,readFileSync,readdirSync,realpathSync,mkdtempSync,mkdirSync,renameSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,dirname,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=realpathSync(fileURLToPath(new URL('..',import.meta.url)))
const manifest=[
  {
    "path": "src/components/WorkGpsPilot.vue",
    "sha256": "5e13f929fd02549bf961409a15c295ebdd541d364403181f0912a4303fe5cd22",
    "group": "src"
  },
  {
    "path": "src/features/athletes/coachAclV2.ts",
    "sha256": "b3f5d52a9f5ee041691b1e25f3b9fa3d93a169d96bec81d261b2d94ad9e77cb7",
    "group": "src"
  },
  {
    "path": "src/features/coach/weekTableImport.ts",
    "sha256": "917d9eb4a3cf619ae51d5742d1bc40fd2c7b052c4977ad3c00a3405be637161f",
    "group": "src"
  },
  {
    "path": "src/styles-post7-refinements.css",
    "sha256": "5b22ef88d64d60ab11a02b07098d04c854d427021c5c1c45a86078418a22444d",
    "group": "src"
  },
  {
    "path": "src/views/DevTeamWorkspace.vue",
    "sha256": "1ab72bdf275dd1ccaca97584e40c158796f895862114039faec37c4d4c10e2ef",
    "group": "src"
  },
  {
    "path": "src/views/StagingGate.vue",
    "sha256": "2dc4858da0ab92f5e2a8e95788406f13e468b26b8fd53a7694ef17b2c0288df5",
    "group": "src"
  },
  {
    "path": "src/views/Team.vue",
    "sha256": "7e05c108ff01d47ca8981e690bd8645c3281c4b20bab6b4abe2561f3f94a71be",
    "group": "src"
  },
  {
    "path": "-files -ci --exclude-standard",
    "sha256": "a64a1d666e265b348b2e74610f50be3017e41a491a10d46a770aefd41624df23",
    "group": "note"
  },
  {
    "path": "ANALISI-INFRASTRUTTURA-PATCH28.txt",
    "sha256": "f8507e7c848c996b016579244e0a7a30bddf1de4f6f601c1910157ed455a3bf5",
    "group": "note"
  },
  {
    "path": "LEGGIMI-PATCH28.txt",
    "sha256": "586a718b1ba409ac749053dcaf7aa4a24bae1b729fb8ce98f5f42d36b8f36578",
    "group": "note"
  }
]
const paths=new Set(manifest.map(x=>x.path))
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const rel=p=>relative(root,p).split('\\').join('/')
const skipDirs=new Set(['.git','node_modules','dist','docs','.gradle','.idea','.cxx','.firebase','.vite','coverage','build'])
const scanExt=/\.(?:vue|[cm]?[jt]sx?|css|scss|sass|less|html?|json|cmd|bat|ps1|sh|ya?ml|rules|gradle|xml|properties)$/i
const own=new Set(['scripts/deep-clean-2.mjs','tests/deep-clean-2.unit.mjs'])
const patterns=[/WorkGpsPilot/i,/coachAclV2|coachAclEnforced|assignedCoaches\b|\bCoachMini\b/i,/weekTableImport|parseWeekTable|applyWeekTableDraft|\bImportedDay\b/i,/styles-post7-refinements/i,/DevTeamWorkspace/i,/StagingGate/i,/(?:(?:\.\.?[\\/]|views[\\/])Team(?:\.vue|['"`])|\bTeam\.vue\b|<Team(?:\s|\/?>))/i]
function safeFile(p){
 let current=root
 for(const part of p.split('/')){current=join(current,part);if(!existsSync(current))return false;if(lstatSync(current).isSymbolicLink())throw Error('Link non consentito: '+p)}
 if(!lstatSync(current).isFile())throw Error('Non e un file normale: '+p)
 return true
}
function scan(dir){
 const hits=[]
 function walk(d){for(const entry of readdirSync(d,{withFileTypes:true})){
  const p=join(d,entry.name),r=rel(p)
  if(skipDirs.has(entry.name)||r==='android/app/src/main/assets/public'||r==='android/capacitor-cordova-android-plugins'||entry.name.startsWith('.env'))continue
  if(entry.isSymbolicLink()){hits.push('Link da verificare: '+r);continue}
  if(entry.isDirectory()){walk(p);continue}
  if(!entry.isFile()||paths.has(r)||own.has(r)||!scanExt.test(entry.name)||entry.name==='package-lock.json'||/service.?account|private.?key/i.test(entry.name))continue
  const s=readFileSync(p,'utf8')
  if(patterns.some(re=>re.test(s))||/import\.meta\.glob|require\.context/.test(s)||/ANALISI-INFRASTRUTTURA-PATCH28\.txt|LEGGIMI-PATCH28\.txt|-files -ci --exclude-standard/.test(s))hits.push(r)
 }}
 walk(dir);return hits
}
function main(){
 const args=process.argv.slice(2)
 if(args.length>1||(args.length===1&&!['--apply','--preview'].includes(args[0])))throw Error('Uso: node scripts/deep-clean-2.mjs [--preview|--apply]')
 const apply=args[0]==='--apply'
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
 if(pkg.name!=='lionfit-v1-vue-laboratorio-completo'||!existsSync(join(root,'src/main.ts'))||!existsSync(join(root,'android/app/build.gradle')))throw Error('Radice LionFit non riconosciuta.')
 console.log('LIONFIT DEEP CLEAN 2.0 | '+(apply?'ARCHIVIAZIONE':'ANTEPRIMA (nessuna modifica)'))
 console.log('Progetto: '+root)
 const plan=[],changes=[]
 const sourceEntries=manifest.filter(x=>x.group==='src')
 const sourcePresent=sourceEntries.filter(x=>safeFile(x.path)).length
 if(sourcePresent!==0&&sourcePresent!==sourceEntries.length)changes.push('Gruppo sorgenti incompleto: nessuna rimozione automatica.')
 for(const item of manifest){
  if(!safeFile(item.path)){console.log('ASSENTE  '+item.path);continue}
  if(hash(join(root,item.path))!==item.sha256){changes.push('Contenuto diverso: '+item.path);continue}
  plan.push(item); console.log('ARCHIVIA '+item.path)
 }
 if(plan.length){const hits=scan(root);if(hits.length)changes.push('Possibili nuovi riferimenti: '+hits.join(', '))}
 if(changes.length){for(const x of changes)console.error('STOP '+x);throw Error('Nessun file spostato. Invia il risultato per verifica.')}
 if(!plan.length){console.log('Nessun file da archiviare.');return}
 if(!apply){console.log(`${plan.length} file candidati. Per spostare: node scripts/deep-clean-2.mjs --apply`);return}
 // Sibling directory on the same volume. Never touch the original project backup or overwrite a destination.
 const backup=mkdtempSync(join(dirname(root),'LionFit-DeepClean2-BACKUP-'))
 const moved=[]
 try{
  writeFileSync(join(backup,'manifest.json'),JSON.stringify({root,files:plan},null,2),{flag:'wx'})
  for(const item of plan){
   const source=join(root,item.path),dest=join(backup,'files',item.path)
   if(!safeFile(item.path)||hash(source)!==item.sha256||existsSync(dest))throw Error('File cambiato durante la procedura: '+item.path)
   mkdirSync(dirname(dest),{recursive:true});renameSync(source,dest);moved.push(item)
  }
 }catch(error){
  for(const item of moved.reverse()){
   const source=join(root,item.path),dest=join(backup,'files',item.path)
   if(!existsSync(source))renameSync(dest,source)
   else console.error('RIPRISTINO MANUALE NECESSARIO: '+dest)
  }
  console.error('Backup (anche in caso di errore): '+backup);throw error
 }
 console.log('ARCHIVIATI '+moved.length+' FILE. Nessuna cancellazione definitiva.')
 console.log('BACKUP: '+backup)
 console.log('Ripristino: copiare i file dalla sottocartella files nel progetto, senza sovrascrivere modifiche successive.')
}
try{main()}catch(e){console.error('ERRORE: '+e.message);process.exitCode=1}
