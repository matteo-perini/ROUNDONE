'use strict';
// Lion Fit — cleanup conservativo. Non modifica ID, SVG, nome inglese o istruzioni.
const fs=require('fs'),path=require('path');
const root=__dirname,dir=path.join(root,'www','exercise-library','data');
const enPath=path.join(dir,'exercises.json'),itPath=path.join(dir,'exercises-it.json');
const patchPath=path.join(root,'revisioni_sinonimi.json');
function fail(message){console.error('ERRORE: '+message+'\nNessun salvataggio eseguito.');process.exit(1)}
let original,originalEntries,en,it,patch;
try{original=fs.readFileSync(itPath,'utf8');originalEntries=JSON.parse(original).entries;en=JSON.parse(fs.readFileSync(enPath,'utf8'));it=JSON.parse(original);patch=JSON.parse(fs.readFileSync(patchPath,'utf8'));}catch(e){fail(e.message)}
if(!Array.isArray(en)||en.length!==1324||!it.entries||Object.keys(it.entries).length!==1324||!Array.isArray(patch.changes))fail('Formato o numero di esercizi inatteso');
const enMap=new Map(en.map(e=>[String(e.id),e.name]));
if(enMap.size!==1324||en.some(e=>!it.entries[e.id]||it.entries[e.id].name_en!==e.name))fail('ID o nomi inglesi non allineati: lascia invariati i tuoi JSON');
let fixed=0,addedAliases=0,skipped=0,unchanged=0;const report=[];const seen=new Set();
const normalize=s=>String(s).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
for(const change of patch.changes){
 const {id,name_en}=change;
 if(seen.has(id))fail('ID duplicato nel patch: '+id);seen.add(id);
 const item=it.entries[id];
 if(!item||enMap.get(id)!==name_en)fail('ID/nome non corrisponde: '+id);
 const old=item.name_it||'';
 // Non sovrascrivere nomi confermati o corretti manualmente dall'utente.
 if(change.name_it&&old!==change.name_it){
   if(item.translationStatus==='generated_unreviewed'){
     item.name_it=change.name_it;item.translationStatus='reviewed_cleanup_draft';fixed++;
   }else{skipped++;report.push(`${id};${name_en};${old.replace(/;/g,',')};${change.name_it.replace(/;/g,',')};NON_SOVRASCRITTO`)}
 }else unchanged++;
 const aliases=Array.isArray(item.aliases_it)?item.aliases_it:[];
 const existing=new Set([name_en,item.name_it,...aliases].filter(Boolean).map(normalize));
 for(const a of change.aliases_it||[]){
   const val=a.trim(),key=normalize(val);
   if(!key||existing.has(key))continue;
   aliases.push(val);existing.add(key);addedAliases++;
 }
 item.aliases_it=aliases;
}
const backup=itPath+'.backup-pulizia-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
const temp=itPath+'.temp-pulizia';
try{
 fs.copyFileSync(itPath,backup);
 fs.writeFileSync(temp,JSON.stringify(it,null,2),'utf8');
 // Controllo finale prima di sostituire.
 const saved=JSON.parse(fs.readFileSync(temp,'utf8'));
 for(const e of en){
  const prev=originalEntries[e.id],next=saved.entries[e.id];
  if(next.name_en!==prev.name_en||JSON.stringify(next.instructions_it)!==JSON.stringify(prev.instructions_it))throw Error('Verifica istruzioni/nome inglese non riuscita: '+e.id);
 }
 fs.renameSync(temp,itPath);
}catch(e){try{fs.unlinkSync(temp)}catch{}fail(e.message)}
fs.writeFileSync(path.join(root,'REPORT_PULIZIA_LIONFIT.csv'),'id;nome_inglese;nome_attuale;proposta;esito\n'+report.join('\n'),'utf8');
console.log('\n=== LION FIT: PULIZIA NOMI E SINONIMI COMPLETATA ===');
console.log('ID controllati:',en.length);
console.log('Nomi automatici corretti (bozze da verificare):',fixed);
console.log('Nuovi sinonimi aggiunti:',addedAliases);
console.log('Nomi conservati per prudenza:',skipped);
console.log('Backup:',backup);
console.log('Istruzioni italiane, nomi inglesi, ID e animazioni invariati.');
console.log('Per aggiornare Android: npx cap sync');
