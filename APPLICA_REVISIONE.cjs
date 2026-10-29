'use strict';
// Lion Fit - Aggiornamento incrementale dei soli nomi IT, senza riscrivere istruzioni o SVG.
const fs=require('fs'),path=require('path');
const root=__dirname,dir=path.join(root,'www','exercise-library','data');
const enFile=path.join(dir,'exercises.json'),itFile=path.join(dir,'exercises-it.json');
const patchFile=path.join(root,'patch_nomi.json');
function stop(m){console.error('\nBLOCCATO: '+m+'\nNessuna traduzione applicata.');process.exit(1)}
let en,it,p;
try{en=JSON.parse(fs.readFileSync(enFile,'utf8'));it=JSON.parse(fs.readFileSync(itFile,'utf8'));p=JSON.parse(fs.readFileSync(patchFile,'utf8'));}catch(e){stop('File richiesto assente/non valido: '+e.message)}
if(!Array.isArray(en)||en.length!==1324||!it.entries||Object.keys(it.entries).length!==1324||!Array.isArray(p.changes))stop('Il catalogo non corrisponde a 1324 esercizi');
const enNames=new Map(en.map(x=>[x.id,x.name]));
if(enNames.size!==1324||en.some(x=>!it.entries[x.id]||it.entries[x.id].name_en!==x.name))stop('Disallineamento degli ID o dei nomi inglesi');
const seen=new Set(),issues=[];let added=0,corrected=0,already=0;
for(const c of p.changes){
 if(seen.has(c.id)){issues.push('ID duplicato '+c.id);continue}seen.add(c.id);
 if(enNames.get(c.id)!==c.name_en||!c.name_it){issues.push('ID/nome non corrispondente: '+c.id);continue}
 const old=it.entries[c.id],current=old.name_it||'';
 if(current===c.name_it){already++;continue}
 if(c.kind==='add'&&current===''){
   old.name_it=c.name_it;old.translationStatus='manual_draft_review';added++;
 }else if(c.kind==='correct_draft'&&current===c.expected_old_name_it&&old.translationStatus==='generated_unreviewed'){
   old.name_it=c.name_it;old.translationStatus='manual_draft_review';corrected++;
 }else issues.push('Conflitto '+c.id+': nome attuale diverso dal CSV o stato diverso (non sovrascritto)');
}
if(issues.length){const f=path.join(root,'CONFLITTI_REVISIONE.txt');fs.writeFileSync(f,issues.join('\n'),'utf8');stop(issues.length+' conflitti: vedi CONFLITTI_REVISIONE.txt. Il JSON originale e rimasto invariato.');}
const backup=itFile+'.backup-review-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
try{
 fs.copyFileSync(itFile,backup);
 const tmp=itFile+'.temp-review';
 fs.writeFileSync(tmp,JSON.stringify(it,null,2),'utf8');fs.renameSync(tmp,itFile);
}catch(e){stop('Impossibile scrivere: '+e.message)}
const remaining=en.filter(x=>!it.entries[x.id].name_it).length;
console.log('\n=== LION FIT - REVISIONE NOMI COMPLETATA ===');
console.log('Esercizi controllati:',en.length);
console.log('Nuovi nomi IT (bozze):',added);
console.log('Correzioni a bozze precedenti:',corrected);
console.log('Gia applicati:',already);
console.log('Ancora senza nome IT:',remaining);
console.log('Backup:',backup);
console.log('Istruzioni, ID, animazioni SVG e nomi EN preservati.');
console.log('NON usare il pacchetto per sovrascrivere exercises-it.json con un file vuoto.');
console.log('Dopo il controllo dei nomi, esegui: npx cap sync');
