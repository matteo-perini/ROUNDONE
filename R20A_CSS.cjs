#!/usr/bin/env node
'use strict';
// LionFit R20A: two-phase, checksum-guarded CSS cleanup, offline and without dependencies.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'R20A_MANIFEST.json'),'utf8'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=p=>fs.readFileSync(p);
const projectName=path.basename(root);
const parent=path.dirname(root);
const backupPrefix=projectName+'_R20A_CSS_BACKUP_';
const command=String(process.argv[2]||'preview').toLowerCase();

function exitFail(message){console.error('\n[R20A] BLOCCATO: '+message);process.exitCode=1;}
function originalMainOk(){
 const mainPath=path.join(root,'src','main.ts');
 return fs.existsSync(mainPath)&&sha(read(mainPath))===manifest.mainSha256;
}
function validateManifest(){
 if(!Array.isArray(manifest.files)||!manifest.files.length||!manifest.mainSha256)throw Error('Manifest incompleto');
 const seen=new Set();
 for(const r of manifest.files){
  if(!/^src\/styles[A-Za-z0-9_.-]*\.css$/.test(r.path)||r.path.includes('..'))throw Error('Percorso non consentito: '+r.path);
  if(seen.has(r.path))throw Error('Duplicato nel manifest: '+r.path);
  seen.add(r.path);
  const payload=path.join(root,'R20A_PAYLOAD',path.basename(r.path));
  if(!fs.existsSync(payload))throw Error('Payload mancante: '+r.path);
  if(sha(read(payload))!==r.cleanSha256)throw Error('Payload corrotto: '+r.path);
 }
}
function state(){
 const entries=[];
 for(const r of manifest.files){
  const local=path.join(root,r.path);
  const digest=fs.existsSync(local)?sha(read(local)):'FILE_ASSENTE';
  entries.push({...r,digest,status:digest===r.originalSha256?'ORIGINALE':digest===r.cleanSha256?'R20A_APPLICATA':'DIVERSO'});
 }
 return entries;
}
function preview(){
 console.log('\nLIONFIT R20A — PULIZIA CSS SICURA');
 console.log('Ordine import src/main.ts: '+(originalMainOk()?'CONFERMATO':'DIVERSO (nessuna modifica consentita)'));
 let original=0,done=0,bad=0;
 for(const r of state()){
  console.log('  '+r.path+' | '+r.status+' | -'+r.removedDeclarations+' ripetizioni');
  if(r.status==='ORIGINALE')original++;else if(r.status==='R20A_APPLICATA')done++;else bad++;
 }
 console.log(`\nFile originali: ${original} | Gia puliti: ${done} | Non riconosciuti: ${bad}`);
 console.log('Regole duplicate individuate: '+manifest.totalRemovedDeclarations);
 console.log('Nessun CSS rimosso interamente. Nessuna modifica a Firebase, Android, JS, SVG o animazioni.');
}
function backups(){
 return fs.readdirSync(parent,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith(backupPrefix)).map(e=>path.join(parent,e.name)).sort().reverse();
}
function apply(){
 if(!originalMainOk())return exitFail('src/main.ts differente dalla base analizzata: fermo per non alterare la priorita CSS.');
 const rows=state();
 if(rows.every(r=>r.status==='R20A_APPLICATA')){console.log('R20A gia applicata; nessuna modifica.');return;}
 if(rows.some(r=>r.status!=='ORIGINALE'))return exitFail('Uno o piu CSS sono gia cambiati, mancanti oppure solo parzialmente aggiornati. Nessun file modificato.');
 const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
 const backupDir=path.join(parent,backupPrefix+stamp+'_'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(backupDir,{recursive:false});
 const originals=path.join(backupDir,'originali');
 fs.mkdirSync(originals);
 try{
  for(const r of rows){
   const source=path.join(root,r.path);
   const bytes=read(source);
   if(sha(bytes)!==r.originalSha256)throw Error('Il CSS e cambiato nel frattempo: '+r.path);
   fs.copyFileSync(source,path.join(originals,path.basename(r.path)));
  }
  const meta={projectDir:root,createdAt:new Date().toISOString(),files:rows.map(({path,originalSha256,cleanSha256})=>({path,originalSha256,cleanSha256})),restored:false};
  fs.writeFileSync(path.join(backupDir,'backup.json'),JSON.stringify(meta,null,2),'utf8');
 }catch(err){return exitFail('Backup non completato: '+err.message);}
 const done=[];
 try{
  for(const r of rows){
   const dest=path.join(root,r.path),pay=path.join(root,'R20A_PAYLOAD',path.basename(r.path));
   const temp=dest+'.r20a-tmp';
   fs.copyFileSync(pay,temp);
   if(sha(read(temp))!==r.cleanSha256)throw Error('Verifica file temporaneo fallita: '+r.path);
   fs.renameSync(temp,dest);
   if(sha(read(dest))!==r.cleanSha256)throw Error('Verifica installazione fallita: '+r.path);
   done.push(r);
  }
  console.log('\nR20A APPLICATA: '+done.length+' CSS ripuliti.');
  console.log('Backup per ripristino (FUORI DAL PROGETTO): '+backupDir);
  console.log('Ora: npm.cmd run build. Test grafici PRIMA di Prepara Web e Docs / Push.');
 }catch(err){
  let recoveryErrors=[];
  for(const r of done){
   try{fs.copyFileSync(path.join(originals,path.basename(r.path)),path.join(root,r.path));}catch(e){recoveryErrors.push(r.path+': '+e.message);}
  }
  // Current failed file: if it got changed, restore it too.
  for(const r of rows){const dst=path.join(root,r.path);try{if(sha(read(dst))===r.cleanSha256)fs.copyFileSync(path.join(originals,path.basename(r.path)),dst);}catch(e){recoveryErrors.push(r.path+': '+e.message);}}
  exitFail('Scrittura interrotta, ripristino tentato. '+err.message+(recoveryErrors.length?' / ERRORI: '+recoveryErrors.join(', '):''));
 }
}
function rollback(){
 let candidates=[];
 for(const dir of backups()){
  try{
   const meta=JSON.parse(fs.readFileSync(path.join(dir,'backup.json'),'utf8'));
   if(meta.projectDir===root&&meta.restored===false&&Array.isArray(meta.files))candidates.push({dir,meta});
  }catch{}
 }
 if(!candidates.length)return exitFail('Nessun backup R20A attivo trovato accanto al progetto.');
 const {dir,meta}=candidates[0];
 const rows=state();
 if(rows.some(r=>r.status!=='R20A_APPLICATA'))return exitFail('I CSS hanno modifiche successive: non sovrascrivo il lavoro. Controlla manualmente il backup '+dir);
 for(const r of rows){
  const src=path.join(dir,'originali',path.basename(r.path));
  if(!fs.existsSync(src)||sha(read(src))!==r.originalSha256)return exitFail('Backup assente o alterato: '+r.path);
 }
 try{
  for(const r of rows)fs.copyFileSync(path.join(dir,'originali',path.basename(r.path)),path.join(root,r.path));
  meta.restored=true;meta.restoredAt=new Date().toISOString();
  fs.writeFileSync(path.join(dir,'backup.json'),JSON.stringify(meta,null,2),'utf8');
  console.log('Ripristinati '+rows.length+' CSS originali. Backup mantenuto in: '+dir);
 }catch(err){exitFail('Ripristino non completato: '+err.message);}
}
try{
 validateManifest();
 if(command==='preview'||command==='anteprima')preview();
 else if(command==='apply'||command==='applica')apply();
 else if(command==='rollback'||command==='ripristina')rollback();
 else exitFail('Uso: node R20A_CSS.cjs [anteprima|applica|ripristina]');
}catch(err){exitFail(err.message);}
