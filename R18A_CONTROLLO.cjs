#!/usr/bin/env node
'use strict';
// R18A SAFE: checks and exports a *whitelisted* set of project source files.
// No deployment, no app-source edits, no secrets, no app network access.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const WANTED = [
  'competitions-backend/firebase.json',
  'competitions-backend/functions/package.json',
  'competitions-backend/functions/index.mjs',
  'competitions-backend/functions/inviteModel.mjs',
  'competitions-backend/functions/inviteModel.test.mjs',
  'src/integrations/firebase/competitionInvites.ts',
  'src/components/AgendaCompetitions.vue',
  'src/views/LiveBookingWorkspace.vue',
  'src/integrations/firestore/competitions.ts',
  'src/features/bookings/competitionModel.ts',
];
const REQUIRED = [
  'competitions-backend/firebase.json',
  'competitions-backend/functions/package.json',
  'competitions-backend/functions/index.mjs',
  'competitions-backend/functions/inviteModel.mjs',
  'src/integrations/firebase/competitionInvites.ts',
  'src/components/AgendaCompetitions.vue',
];
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function stamp(d) {return d.getFullYear().toString()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');}
function run(command, args, options={}){
  let v=cp.spawnSync(command,args,{cwd:options.cwd,encoding:'utf8',timeout:150000,windowsHide:true});
  return {ok:v.status===0 && !v.error, exit:v.status, output:(v.stdout||'')+'\n'+(v.stderr||''), error:v.error?.message||''};
}
function rootIsProject(root){return fs.existsSync(path.join(root,'src')) && fs.existsSync(path.join(root,'package.json'));}
function readFlag(base, file, key){
  const p=path.join(base,file);if(!fs.existsSync(p))return 'file assente';
  const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
  const matches=lines.filter(x=>/^\s*(?:export\s+)?VITE_LIONFIT_COMPETITION_INVITES_ENABLED\s*=/.test(x) && !/^\s*#/.test(x));
  if(matches.length===0)return 'flag non impostato';
  const val=matches.at(-1).split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
  return val === 'true' ? 'true' : val === 'false' ? 'false' : 'valore non standard';
}
function audit(root, opts={}){
  root=path.resolve(root);
  if(!rootIsProject(root))throw new Error('La cartella indicata non sembra la radice LionFit (src e package.json richiesti): '+root);
  const date=opts.date||new Date();
  const out=path.join(path.dirname(root),'LionFit_R18A_CONTROLLO_'+stamp(date));
  if(fs.existsSync(out))throw new Error('Esiste gia il percorso risultato: '+out);
  const source=path.join(out,'SORGENTI_VERIFICA_R18A');
  fs.mkdirSync(source,{recursive:true});
  const items=[];
  for(const rel of WANTED){
    const p=path.join(root,...rel.split('/'));
    if(!fs.existsSync(p) || !fs.statSync(p).isFile()){items.push({path:rel,present:false});continue;}
    const contents=fs.readFileSync(p);
    fs.mkdirSync(path.dirname(path.join(source,rel)),{recursive:true});
    fs.writeFileSync(path.join(source,rel),contents);
    items.push({path:rel,present:true,sha256:hash(contents),bytes:contents.length});
  }
  const checks=[];
  const idx=path.join(root,'competitions-backend','functions','index.mjs');
  const test=path.join(root,'competitions-backend','functions','inviteModel.test.mjs');
  const pkg=path.join(root,'competitions-backend','firebase.json');
  const envFile=path.join(root,'competitions-backend','functions','.env.app-palestra-b0b9d');
  let codebase='non trovato',sourcePath='non trovato',exports=[];
  if(fs.existsSync(pkg)){
    try{
      const d=JSON.parse(fs.readFileSync(pkg,'utf8'));
      const f=Array.isArray(d.functions)?d.functions:[d.functions];
      codebase=f.map(x=>x?.codebase||'(default)').join(', ');
      sourcePath=f.map(x=>x?.source||'(default)').join(', ');
    }catch(e){codebase='JSON non valido: '+e.message;}
  }
  if(fs.existsSync(idx)){
    const contents=fs.readFileSync(idx,'utf8');
    exports=[...contents.matchAll(/\bexport\s+(?:const|function|async function)\s+([a-zA-Z_$][\w$]*)/g)].map(x=>x[1]);
    const r=run(process.execPath,['--check',idx],{cwd:path.dirname(idx)});
    checks.push({name:'Sintassi index.mjs',state:r.ok?'OK':'ERRORE',detail:r.ok?'node --check superato':r.output.slice(-1000)});
  }
  if(fs.existsSync(test)){
    const r=run(process.execPath,['--test',test],{cwd:path.dirname(test)});
    checks.push({name:'Test R8B inviteModel',state:r.ok?'OK':'ERRORE',detail:r.ok?'node --test superato':r.output.slice(-1800)});
  }else checks.push({name:'Test R8B inviteModel',state:'MANCANTE',detail:'Non trovato inviteModel.test.mjs'});
  const found=new Set(items.filter(x=>x.present).map(x=>x.path));
  const missing=REQUIRED.filter(x=>!found.has(x));
  const report={
    titolo:'LIONFIT PATCH 30 R18A | VERIFICA SAFE INVITI GARE',
    progetto:'LionFit (riferimento locale)',
    nota:'NESSUN DEPLOY. Nessuna modifica ai sorgenti del progetto. Report senza valori di segreti.',
    backendCodebase:codebase,backendSource:sourcePath,
    functionsExported:exports,
    productionBackendEnvPresent:fs.existsSync(envFile),
    frontendFlags:{
      '.env.production.local':readFlag(root,'.env.production.local'),
      '.env.local':readFlag(root,'.env.local'),
      '.env.staging.local':readFlag(root,'.env.staging.local'),
      '.env':readFlag(root,'.env'),
    },
    requiredMissing:missing,
    files:items,
    checks,
    NEXT:'Condividere lo ZIP di sorgenti SOLO dopo aver verificato che i file di codice non contengano credenziali hardcoded. NON attivare flag o deploy in autonomia.'
  };
  fs.writeFileSync(path.join(out,'R18A_RAPPORTO.json'),JSON.stringify(report,null,2)+'\n');
  const txt=[
    'LIONFIT PATCH 30 R18A — RAPPORTO DIAGNOSTICO',
    'Nessuna modifica al progetto, nessun deploy.',
    '',
    'Codebase: '+codebase,
    'Source Firebase: '+sourcePath,
    'Exports: '+(exports.join(', ')||'(nessuno rilevato)'),
    'File .env backend dedicato: '+(fs.existsSync(envFile)?'PRESENTE (non copiato)':'ASSENTE'),
    '',
    'Flag frontend: '+JSON.stringify(report.frontendFlags),
    '',
    'MANCANTI OBBLIGATORI: '+(missing.join(', ')||'nessuno'),
    ...checks.map(x=>x.name+': '+x.state+(x.state==='ERRORE'?' — '+x.detail:'')),
    '',
    'ATTENZIONE: il rapporto NON certifica le Rules, il backend, le push o il deploy.',
    'Controlla personalmente i sorgenti prima di condividere il loro ZIP.',
  ].join('\r\n');
  fs.writeFileSync(path.join(out,'R18A_RAPPORTO.txt'),txt+'\r\n');
  let archive='';
  if(process.platform==='win32' && !opts.noZip){
    archive=path.join(out,'LionFit_R18A_SORGENTI_PER_PATCH.zip');
    const safe=(s)=>"'"+s.replace(/'/g,"''")+"'";
    const ps=`Compress-Archive -Path ${safe(path.join(source,'*'))} -DestinationPath ${safe(archive)} -Force`;
    const r=run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',ps],{cwd:out});
    if(!r.ok){archive='non creato ('+r.output.slice(-280)+')';}
  }
  const summary={out,archive,requiredMissing:missing,checks,codebase,exports};
  return summary;
}
if(require.main===module){
  const root=process.argv[2]||process.cwd();
  try{
    const r=audit(root);
    console.log('\n========================================================');
    console.log(' LIONFIT — R18A INVITI GARE / CONTROLLO SOLO LETTURA');
    console.log('========================================================');
    console.log('Report: '+r.out);
    console.log('Archivio: '+(r.archive||'vedi SORGENTI_VERIFICA_R18A'));
    console.log('Codebase: '+r.codebase);
    console.log('Functions esportate: '+(r.exports.join(', ')||'(nessuna)'));
    console.log('File mancanti: '+(r.requiredMissing.join(', ')||'nessuno'));
    for(const c of r.checks)console.log(c.name+': '+c.state);
    console.log('Nessun deploy. Nessun file originale modificato.');
    const passed=r.requiredMissing.length===0&&r.checks.every(c=>c.state==='OK')&&r.codebase==='competitions'&&r.exports.length>=2;
    console.log(passed?'PRECHECK SUPERATO (NON SIGNIFICA BACKEND COLLAUDATO)':'PRECHECK CON SEGNALAZIONI: verifica prima di attivare');
    process.exitCode=passed?0:2;
  }catch(e){console.error('ERRORE R18A:',e.message);process.exitCode=1;}
}
module.exports={audit,readFlag,WANTED,REQUIRED};
