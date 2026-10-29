/* Lion Fit - Importazione una tantum testi italiani (MIT, senza asset grafici terzi).
 * Eseguire dalla cartella ROUNDONE: node tools/prepara-italiano.cjs
 * Nessuna API key, nessun servizio in fase di utilizzo dell'app.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const root = path.resolve(__dirname,'..');
const mainPath = path.join(root,'www','exercise-library','data','exercises.json');
const itPath = path.join(root,'www','exercise-library','data','exercises-it.json');
const sourceUrl = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json';
const MAX_BYTES = 35 * 1024 * 1024;
function download(url, depth=0){
  return new Promise((resolve,reject)=>{
    if(depth>4)return reject(new Error('Troppi reindirizzamenti di rete'));
    const u = new URL(url);
    if (u.protocol!=='https:' || !['raw.githubusercontent.com','github.com'].includes(u.hostname))
      return reject(new Error('Sorgente non consentita: '+u.hostname));
    const request = https.get(u,{headers:{'User-Agent':'LionFit-i18n-offline-import/1.0','Accept':'application/json'}},res=>{
      if([301,302,307,308].includes(res.statusCode) && res.headers.location){res.resume();return resolve(download(new URL(res.headers.location,u).href,depth+1));}
      if(res.statusCode!==200){res.resume();return reject(new Error('Scaricamento fallito: HTTP '+res.statusCode));}
      let bytes=0;const chunks=[];
      res.on('data',c=>{bytes+=c.length;if(bytes>MAX_BYTES){request.destroy(new Error('Dimensione sorgente inattesa'));return;}chunks.push(c);});
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error',reject);
    });
    request.setTimeout(120000,()=>request.destroy(new Error('Connessione scaduta')));
    request.on('error',reject);
  });
}
const norm = s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const safeSteps = value => Array.isArray(value) ? value.filter(x=>typeof x==='string' && x.trim()).map(s=>s.trim()) : [];
(async()=>{
  if(!fs.existsSync(mainPath) || !fs.existsSync(itPath)) throw new Error('File mancanti: estrai il pacchetto nella cartella principale ROUNDONE (non dentro www).');
  const base = JSON.parse(fs.readFileSync(mainPath,'utf8'));
  const overlay = JSON.parse(fs.readFileSync(itPath,'utf8'));
  if(!Array.isArray(base)||base.length!==1324) throw new Error('Il catalogo locale non contiene i 1324 esercizi attesi. Importazione annullata.');
  if(!overlay.entries||Object.keys(overlay.entries).length!==1324) throw new Error('Il file locale exercises-it.json non contiene i 1324 ID. Importazione annullata.');
  console.log('Scaricamento una tantum delle istruzioni italiane (solo testi, circa 17 MB di fonte)...');
  const localIndex=process.argv.indexOf('--source-file');
  const text=(localIndex>=0 && process.argv[localIndex+1])
    ? fs.readFileSync(path.resolve(process.argv[localIndex+1]),'utf8')
    : await download(sourceUrl);
  const remote = JSON.parse(text);
  if(!Array.isArray(remote)) throw new Error('Formato sorgente multilingua inatteso.');
  const lookup=new Map(remote.map(e=>[String(e.id),e]));
  let matched=0, translated=0;const mismatches=[];
  for(const e of base){
    const k=String(e.id), src=lookup.get(k), target=overlay.entries[k];
    if(!src||!target || norm(src.name)!==norm(e.name)){
      mismatches.push(`${k} · ${e.name}`);continue;
    }
    matched++;
    const sourceItalianName = src.name_it || (src.names && src.names.it);
    if (!target.name_it && typeof sourceItalianName === 'string' && sourceItalianName.trim()) {
      target.name_it = sourceItalianName.trim();
      target.translationStatus = 'source_name';
    }
    const steps=safeSteps(src.instruction_steps && src.instruction_steps.it);
    // Compatibile con versioni del catalogo che espongono solo il testo completo.
    const fallback = src.instructions && src.instructions.it;
    const itSteps=steps.length ? steps : (typeof fallback==='string' && fallback.trim() ? [fallback.trim()] : safeSteps(fallback));
    if(itSteps.length){target.instructions_it=itSteps;translated++;}
  }
  console.log(`Controlli ID + nome: ${matched}/1324; istruzioni italiane: ${translated}/1324`);
  if(mismatches.length) console.log('Esempi non corrispondenti (saranno lasciati in inglese):\n  '+mismatches.slice(0,12).join('\n  '));
  if(matched<1200 || translated<1200) throw new Error('Meno di 1200 corrispondenze valide: sorgente incompatibile. Non ho sovrascritto il file.');
  overlay.schemaVersion='1.2.0';
  overlay.sourceTranslations='https://github.com/hasaneyldrm/exercises-dataset';
  overlay.translationLicense='MIT - copyright 2026 Hasan Emir Yıldırım; conservare il testo di licenza nel progetto';
  overlay.instructionsTranslatedCount=translated;
  overlay.description='Traduzioni italiane offline importate dal catalogo multilingua, verificate per ID + nome inglese. I nomi italiani generati automaticamente restano da revisionare.';
  const output=JSON.stringify(overlay,null,0);
  const temp=itPath+'.tmp';fs.writeFileSync(temp,output,'utf8');fs.renameSync(temp,itPath);
  console.log(`OK! Creato: ${itPath}\nOra puoi eseguire npx cap sync e compilare l’APK. Durante l’uso le istruzioni sono offline.`);
})().catch(e=>{console.error('\nERRORE:',e.message);process.exitCode=1;});
