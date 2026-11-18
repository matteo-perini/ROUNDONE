'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const src=path.join(__dirname,'src','components','AthleteHomeContent.vue');
const rec=path.join(os.homedir(),'Desktop','LionFit_R14D_Backup','r14d-receipt.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(m){console.error('RIPRISTINO BLOCCATO: '+m);process.exit(1)}
if(!fs.existsSync(rec))fail('Backup/Ricevuta non trovati sul Desktop.');
const r=JSON.parse(fs.readFileSync(rec,'utf8'));
if(path.resolve(r.source)!==path.resolve(src))fail('Backup di un progetto differente: nessuna modifica.');
if(!fs.existsSync(src)||!fs.existsSync(r.backup))fail('File originale o backup non trovato.');
if(sha(fs.readFileSync(src))!==r.afterSha)fail('Il file e cambiato dopo R14D: ripristino manuale necessario per non perdere nuovi aggiornamenti.');
const before=fs.readFileSync(r.backup);
if(sha(before)!==r.beforeSha)fail('Integrita backup non valida.');
fs.writeFileSync(src,before);
console.log('Ripristino R14C originale eseguito.');
