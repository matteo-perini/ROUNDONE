#!/usr/bin/env node
'use strict';
// LionFit R20: non-destructive archive for old patch kits / optional root tests.
// Designed to run on Node 18+ and Windows PowerShell 5.1 via .cmd launcher.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname);
const ROOT_NAME = path.basename(ROOT);
const ARCHIVE_BASE = path.join(path.dirname(ROOT), 'LionFit_ARCHIVIO_PULIZIA_2');
const TYPE = process.argv[2] || 'preview';
const IS_TEST = process.argv.includes('--tests');
const VERSION = 1;

function fail(message) { throw new Error(message); }
function relPosix(p) { return p.replace(/\\/g, '/'); }
function isBelow(base, file) {
  const rel = path.relative(base, file);
  return rel && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}
function assertProject() {
  for (const must of ['package.json', 'src', 'LIONFIT_PREPARA_WEB_E_DOCS.cmd']) {
    if (!fs.existsSync(path.join(ROOT, must))) {
      fail('Cartella sbagliata. Estrai il kit nella RADICE di LionFit-Modern-Git. Manca: ' + must);
    }
  }
  if (isBelow(ROOT, ARCHIVE_BASE)) fail('Backup interno al repository: operazione negata.');
}
function regularOrDirectory(abs) {
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) fail('Trovato collegamento simbolico/reparse: ' + abs + '. Operazione negata.');
  if (!st.isFile() && !st.isDirectory()) fail('Tipo file non consentito: ' + abs);
  return st;
}
function patchFilename(n) {
  return /^(?:APPLICA_R|RIPRISTINA_R|ROLLBACK_R)\d+[A-Z0-9_]*\.cmd$/i.test(n)
    || /^LionFit_R\d+[A-Z0-9_]*_(?:APPLICA|RIPRISTINA)\.cjs$/i.test(n)
    || /^R\d+[A-Z0-9_]*_(?:INSTALLA|ROLLBACK|CONTROLLO|CONFIGURA_[A-Z0-9_]+)\.cjs$/i.test(n)
    || /^R\d+[A-Z0-9_]*_(?:INSTALL|ROLLBACK)\.ps1$/i.test(n)
    || /^R\d+[A-Z0-9_]*_(?:MANIFEST|PATCH_RULES)\.json$/i.test(n)
    || /^(?:LEGGIMI(?:_PRIMA)?_R\d+[A-Z0-9_]*|R\d+[A-Z0-9_]*_LEGGIMI(?:_[A-Z0-9_]+)?|LionFit_R\d+[A-Z0-9_]*_LEGGIMI(?:_[A-Z0-9_]+)?)\.(?:txt|md)$/i.test(n)
    || /^LionFit_R17A_DIFF_UNICA_MODIFICA\.txt$/i.test(n)
    || /^(?:LEGGIMI|LEGGIMI_PRIMA)\.txt$/i.test(n)
    || /^(?:R15_ARCHIVIO|R19A_FOCUS_MOBILE)\.css$/i.test(n)
    || /^LionFit_PATCH_\d+_R\d+[A-Z0-9_]*.*\.zip$/i.test(n)
    || /^LEGGIMI-STEP\d+.*\.(?:md|txt)$/i.test(n);
}
function patchDirectory(n) {
  return /^R\d+[A-Z0-9_]*_(?:PAYLOAD|FILES)$/.test(n);
}
function testFilename(n) { return /^R15_ARCHIVIO_TEST\.mjs$/i.test(n) || /^TEST_STEP\d+.*\.cmd$/i.test(n); }
function testDirectory(n) { return /^(?:tests|R17B_EMULATOR_TEST|R18C_EMULATOR_GARE)$/i.test(n); }
// Conservative allowlist of active app folders; do not recurse into these for cleanup.
const ALWAYS_KEEP = new Set(['src','public','android','scripts','docs','.git',
  'calendar-backend','coach-backend','competitions-backend','functions-lionfit-support',
  'invites-backend','notifications-backend','work-backend','workout-backend',
  'billing-sandbox','security','config-esempi','test-control-emulator',
  'test-multisport-emulator','test-patch24-emulator','test-work-emulator','node_modules',
  'dist','package.json','package-lock.json','vite.config.ts','tsconfig.json','README.md',
  'index.html','firebase.json','capacitor.config.json','.gitignore',
  'LIONFIT_PREPARA_WEB_E_DOCS.cmd','PREPARA_LIONFIT_WEB.cmd',
  'LIONFIT_INSTALLA_STAMPA_ANDROID.cmd','INSTALLA_PLUGIN_UPDATE_ANDROID.cmd',
  'VERIFICA_PUSH_WINDOWS.cmd','R20_PULIZIA_STORICA_SAFE.cjs',
  'AVVIA_PULIZIA_2_LIONFIT.cmd','ISTRUZIONI_PULIZIA_2.txt']);

function runtimeTexts() {
  const out = [];
  const roots = ['src','scripts'];
  const max = 1_500_000;
  function visit(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
      if (item.isSymbolicLink()) continue;
      const abs = path.join(dir,item.name);
      if (item.isDirectory()) { visit(abs); continue; }
      if (!/\.(?:vue|ts|tsx|js|jsx|mjs|cjs|css|html|json)$/i.test(item.name)) continue;
      const st = fs.statSync(abs); if (st.size > max) continue;
      out.push([relPosix(path.relative(ROOT,abs)),fs.readFileSync(abs,'utf8')]);
    }
  }
  for (const dir of roots) if (fs.existsSync(path.join(ROOT,dir))) visit(path.join(ROOT,dir));
  for (const name of ['package.json','vite.config.ts','index.html','LIONFIT_PREPARA_WEB_E_DOCS.cmd','PREPARA_LIONFIT_WEB.cmd']) {
    const p=path.join(ROOT,name); if(fs.existsSync(p))out.push([name,fs.readFileSync(p,'utf8')]);
  }
  return out;
}
function collect(group) {
  const candidates=[];
  for (const name of fs.readdirSync(ROOT).sort()) {
    if (ALWAYS_KEEP.has(name) || name.startsWith('.')) continue;
    const abs=path.join(ROOT,name), st=regularOrDirectory(abs);
    const wanted=group==='patches' ? (st.isFile()?patchFilename(name):patchDirectory(name)) :
      (st.isFile()?testFilename(name):testDirectory(name));
    if(wanted)candidates.push({name,abs,kind:st.isFile()?'file':'dir'});
  }
  if (group==='patches') {
    const refs=runtimeTexts();
    const dangerous=[];
    for(const item of [...candidates]) {
      // If anything the live app or its build scripts references a historical kit, skip it.
      const matches=refs.filter(([p,t])=>t.includes(item.name));
      if(matches.length) { candidates.splice(candidates.indexOf(item),1);dangerous.push([item.name,matches.map(x=>x[0]).slice(0,3)]); }
    }
    return {candidates, dangerous};
  }
  return {candidates, dangerous:[]};
}
function walkFiles(item) {
  const files=[];
  function walk(abs) {
    const st=regularOrDirectory(abs);
    if (st.isFile()) { files.push(abs); return; }
    for (const n of fs.readdirSync(abs).sort()) walk(path.join(abs,n));
  }
  walk(item.abs);
  return files;
}
function shaFile(f) {return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function byteFormat(n) {return n < 1024 ? n+' B' : n < 1024*1024 ? (n/1024).toFixed(1)+' KiB' : (n/1024/1024).toFixed(2)+' MiB';}
function gitInfo(candidates) {
  const info={available:false, tracked:0, dirty:[]};
  if(!fs.existsSync(path.join(ROOT,'.git')))return info;
  try {
    const args=candidates.map(x=>x.name);
    const ls=cp.execFileSync('git',['ls-files','-z','--',...args],{cwd:ROOT,maxBuffer:20*1024*1024});
    info.available=true;
    info.tracked=ls.toString('utf8').split('\0').filter(Boolean).length;
    const stat=cp.execFileSync('git',['status','--porcelain','-z','--untracked-files=no','--',...args],{cwd:ROOT,maxBuffer:20*1024*1024});
    info.dirty=stat.toString('utf8').split('\0').filter(Boolean);
  } catch(e) { console.log('[NOTA] Git non disponibile o informazioni Git non leggibili.'); }
  return info;
}
function makeInventory(candidates) {
  return candidates.map(item => {
    const rows=walkFiles(item).map(f=>{
      const st=fs.statSync(f);
      return {rel:relPosix(path.relative(ROOT,f)), bytes:st.size, sha256:shaFile(f)};
    });
    return {rel:item.name,kind:item.kind,files:rows, bytes:rows.reduce((a,b)=>a+b.bytes,0)};
  });
}
function preview(group) {
  const {candidates,dangerous}=collect(group);
  const inventory=makeInventory(candidates);
  console.log('\n=== LIONFIT PULIZIA 2 / '+(group==='patches'?'PATCH STORICHE':'TEST OPZIONALI')+' ===');
  console.log('Progetto: '+ROOT);
  console.log('Destinazione archivio (FUORI dal progetto): '+ARCHIVE_BASE);
  for (const item of inventory) console.log('  '+item.rel+(item.kind==='dir'?' /':'')+'  ['+byteFormat(item.bytes)+']');
  const total=inventory.reduce((a,b)=>a+b.bytes,0);
  console.log('\nTrovati: '+inventory.length+' elementi; '+inventory.reduce((a,b)=>a+b.files.length,0)+' file; '+byteFormat(total));
  if(dangerous.length) {
    console.log('\nFile protetti automaticamente per riferimenti nel codice attivo:');
    for(const [n,refs] of dangerous)console.log('  '+n+' (citato in '+refs.join(', ')+')');
  }
  const git=gitInfo(candidates);
  if(git.available)console.log('Git: '+git.tracked+' file tracciati in questo gruppo.'+(git.dirty.length?' ATTENZIONE: modifiche Git ancora non salvate.':''));
  else console.log('Git: controllo automatico non disponibile: controlla GitHub Desktop dopo la pulizia.');
  if (git.dirty.length)console.log('Files modificati o staged (blocca archiviazione): '+git.dirty.length);
  console.log('\nNessuna modifica effettuata.');
  return {candidates,inventory,git};
}
function ask(question) {
  return new Promise(resolve=>{
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    rl.question(question,answer=>{rl.close();resolve(answer.trim());});
  });
}
function saveManifest(dir, manifest) {
  const tmp=path.join(dir,'manifest.tmp');
  fs.writeFileSync(tmp,JSON.stringify(manifest,null,2),'utf8');
  fs.renameSync(tmp,path.join(dir,'manifest.json'));
}
function archiveDirStamp() {
  const d=new Date();
  const stamp=d.toISOString().replace(/[:.]/g,'-');
  return path.join(ARCHIVE_BASE,ROOT_NAME+'__'+stamp+'__'+(IS_TEST?'test':'patch'));
}
async function archive(group) {
  const {candidates,inventory,git}=preview(group);
  if(!candidates.length) {console.log('Niente da archiviare.');return;}
  if(git.dirty.length)fail('Alcuni file destinati alla pulizia hanno modifiche Git non salvate. Fai prima commit/backup e riprova.');
  console.log('\nATTENZIONE: i file archiviati verranno segnati come ELIMINATI in GitHub Desktop se sono tracciati.');
  console.log('Non fare Push origin alla cieca: verifica le modifiche del commit.');
  if(group==='tests')console.log('I test principali del frontend non saranno eseguibili fino al ripristino. I backend NON vengono toccati.');
  console.log('Per annullare si puo usare il menu Ripristina. Nessun file verra eliminato definitivamente.');
  const confirm=await ask('Per continuare digita ARCHIVIA (qualsiasi altra risposta annulla): ');
  if(confirm!=='ARCHIVIA') {console.log('Operazione annullata.');return;}
  const destination=archiveDirStamp();
  if(fs.existsSync(destination))fail('Archivio gia esistente: '+destination);
  fs.mkdirSync(path.join(destination,'contenuto'),{recursive:true});
  const manifest={version:VERSION,projectRoot:ROOT,createdAt:new Date().toISOString(),group,
    items:inventory.map(x=>({...x,moved:false})),status:'in_progress'};
  saveManifest(destination,manifest);
  let n=0;
  try {
    for(let i=0;i<manifest.items.length;i++) {
      const item=manifest.items[i];
      const from=path.join(ROOT,item.rel),to=path.join(destination,'contenuto',item.rel);
      if(!isBelow(ROOT,from)||!isBelow(path.join(destination,'contenuto'),to))fail('Percorso non sicuro: '+item.rel);
      if(!fs.existsSync(from))fail('File sparito durante la procedura: '+item.rel);
      if(fs.existsSync(to))fail('Collisione backup: '+item.rel);
      for(const f of item.files) {
        const current=path.join(ROOT,...f.rel.split('/'));
        if(!fs.existsSync(current)||shaFile(current)!==f.sha256)fail('File modificato durante la procedura: '+f.rel);
      }
      fs.renameSync(from,to);
      item.moved=true;
      saveManifest(destination,manifest);
      n++;
      console.log('ARCHIVIATO: '+item.rel);
    }
    manifest.status='complete';saveManifest(destination,manifest);
    console.log('\nOK. '+n+' elementi archiviati in: '+destination);
    console.log('Per ripristinare usa AVVIA_PULIZIA_2_LIONFIT.cmd > 5.');
  }catch(e) {
    console.error('Operazione interrotta: '+e.message);
    console.error('Il manifesto rimane nel backup. Usa Ripristina per recuperare gli elementi gia spostati.');
    throw e;
  }
}
function listBackupDirs() {
  if(!fs.existsSync(ARCHIVE_BASE))return [];
  return fs.readdirSync(ARCHIVE_BASE)
    .map(n=>path.join(ARCHIVE_BASE,n))
    .filter(p=>fs.statSync(p).isDirectory()&&fs.existsSync(path.join(p,'manifest.json')))
    .sort().reverse();
}
function latestRestorable() {
  for(const dir of listBackupDirs()) {
    let m;
    try{m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));}catch{continue;}
    if(m.projectRoot===ROOT && m.version===VERSION && m.items.some(x=>x.moved))return {dir,m};
  }
  return null;
}
async function restore() {
  const cur=latestRestorable();
  if(!cur) {console.log('Nessun archivio da ripristinare per questo progetto.');return;}
  const {dir,m}=cur;
  console.log('Backup: '+dir+'\nGruppo: '+m.group+'\nElementi: '+m.items.filter(x=>x.moved).length);
  for(const item of m.items.filter(x=>x.moved)) {
    const from=path.join(dir,'contenuto',item.rel),to=path.join(ROOT,item.rel);
    if(!fs.existsSync(from))fail('Backup incompleto: manca '+item.rel);
    if(fs.existsSync(to))fail('Ripristino bloccato: esiste gia '+to+' (non sovrascrivo mai).');
    for(const f of item.files) {
      const b=path.join(dir,'contenuto',...f.rel.split('/'));
      if(!fs.existsSync(b)||shaFile(b)!==f.sha256)fail('Backup modificato o corrotto: '+f.rel);
    }
  }
  const answer=await ask('Per ripristinare questi file digita RIPRISTINA: ');
  if(answer!=='RIPRISTINA') {console.log('Operazione annullata.');return;}
  for(const item of m.items.filter(x=>x.moved)) {
    fs.renameSync(path.join(dir,'contenuto',item.rel),path.join(ROOT,item.rel));
    item.moved=false;
    saveManifest(dir,m);
    console.log('RIPRISTINATO: '+item.rel);
  }
  m.status='restored';m.restoredAt=new Date().toISOString();saveManifest(dir,m);
  console.log('Ripristino completo. Nessun file esistente sovrascritto.');
}
(async()=>{
  assertProject();
  switch(TYPE) {
    case 'preview':preview(IS_TEST?'tests':'patches');break;
    case 'archive':await archive(IS_TEST?'tests':'patches');break;
    case 'restore':await restore();break;
    default:fail('Uso: node R20_PULIZIA_STORICA_SAFE.cjs preview|archive [--tests] oppure restore');
  }
})().catch(err=>{console.error('\nERRORE: '+err.message);process.exitCode=1;});
