'use strict';
// Merge locale non distruttivo: nessuna richiesta Internet, nessun accesso a Firebase.
const fs = require('fs');
const path = require('path');
const www = __dirname;
const dataDir = path.join(www, 'exercise-library', 'data');
const mainPath = path.join(dataDir, 'exercises.json');
const itPath = path.join(dataDir, 'exercises-it.json');
const patchPath = path.join(www, 'nomi_e_sinonimi_v26_1.json');
const normalize = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function fail(message){ console.error('\nERRORE: '+message);process.exit(1);}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){fail('Impossibile leggere '+file+'\n'+e.message);}}
if(!fs.existsSync(mainPath)) fail('Manca '+mainPath+'. Copia questo script nella cartella www originale (accanto ad admin.html).');
if(!fs.existsSync(patchPath)) fail('Manca '+patchPath+'. Copia il file dei nomi accanto allo script.');
const raw = readJson(mainPath);
const catalog=Array.isArray(raw)?raw:(Array.isArray(raw.exercises)?raw.exercises:[]);
if(catalog.length < 500) fail('Il catalogo inglese contiene solo '+catalog.length+' record: formato inatteso, nessuna modifica.');
const patch=readJson(patchPath);
if(!patch.entries || Object.keys(patch.entries).length < 1000) fail('Il file delle traduzioni non contiene i 1324 ID previsti.');
const sourceById=new Map(catalog.map(ex=>[String(ex.id),ex]));
const matched=Object.entries(patch.entries).filter(([id,p])=>sourceById.has(id)&&normalize(sourceById.get(id).name)===normalize(p.name_en));
if(matched.length < 1000) fail('Gli ID o i nomi della libreria non corrispondono alla revisione: '+matched.length+' corrispondenze. Nessuna modifica.');
let overlay=fs.existsSync(itPath)?readJson(itPath):{schemaVersion:1,locale:'it',entries:{}};
if(!overlay || typeof overlay.entries!=='object' || Array.isArray(overlay.entries) || !overlay.entries) fail('exercises-it.json in formato inatteso.');
const original=JSON.stringify(overlay,null,2);
const summary={matched:matched.length,filled:0,corrected:0,aliases:0,untouched:0,untranslated:0};
for(const [id,p] of matched){
 const base=sourceById.get(id);
 const rec=overlay.entries[id] || {name_en:base.name,name_it:null,aliases_it:[],instructions_it:null,translationStatus:'pending'};
 if(rec.name_en && normalize(rec.name_en)!==normalize(base.name)) {summary.untouched++;continue;}
 const current=String(rec.name_it || '').trim();
 const proposed=String(p.name_it || '').trim();
 if(!current && proposed){
    rec.name_it=proposed;
    rec.translationStatus=p.draft?'draft_v26_1':'name_seed';
    summary.filled++;
 }else if(current && p.old_draft_name_it && normalize(current)===normalize(p.old_draft_name_it) && proposed && current!==proposed){
    // Only fix a specifically recognized bad previous draft; preserve user's manual edits.
    rec.name_it=proposed;
    rec.translationStatus='draft_v26_1';
    summary.corrected++;
 }else summary.untouched++;
 const aliases=new Set((Array.isArray(rec.aliases_it)?rec.aliases_it:[]).filter(a=>typeof a==='string'&&a.trim()));
 for(const a of p.aliases_it||[]){if(![...aliases].some(b=>normalize(a)===normalize(b))){aliases.add(a);summary.aliases++;}}
 rec.aliases_it=[...aliases];
 overlay.entries[id]=rec;
}
summary.untranslated=matched.filter(([id])=>!String((overlay.entries[id]||{}).name_it||'').trim()).length;
if(!overlay.exerciseCount) overlay.exerciseCount=catalog.length;
overlay.schemaVersion=overlay.schemaVersion||1;
overlay.locale='it';
const updated=JSON.stringify(overlay,null,2);
let backup='(non necessario)';
if(updated!==original){
 fs.mkdirSync(dataDir,{recursive:true});
 if(fs.existsSync(itPath)){
   const stamp=new Date().toISOString().replace(/[:.]/g,'-');
   backup=itPath+'.backup-'+stamp+'.json';
   fs.copyFileSync(itPath,backup,fs.constants.COPYFILE_EXCL);
 }
 const tmp=itPath+'.tmp-'+process.pid;
 fs.writeFileSync(tmp,updated+'\n','utf8');
 fs.renameSync(tmp,itPath);
}
console.log('\nLION FIT - Aggiornamento traduzioni COMPLETATO');
console.log('Record catalogo verificati: '+summary.matched);
console.log('Nomi italiani mancanti aggiunti: '+summary.filled);
console.log('Bozze note corrette: '+summary.corrected);
console.log('Sinonimi aggiunti: '+summary.aliases);
console.log('Nomi ancora senza traduzione: '+summary.untranslated);
console.log('Backup vecchio dizionario: '+backup);
console.log('Dizionario aggiornato: '+itPath);
console.log('Nota: i nomi nuovi sono bozze linguistiche da rivedere; ID, SVG e schede non sono modificati.');
