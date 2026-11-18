'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname, manifest=require('./R18B_MANIFEST.json');
const targets=manifest.targets;
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const safeFile=rel=>path.join(root,...rel.split('/'));
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
const bail=(msg)=>{console.error('\nR18B NON APPLICATA: '+msg);process.exitCode=1};
function validateRoot(){if(!fs.existsSync(safeFile('src'))||!fs.existsSync(safeFile('package.json')))throw Error('Questa non sembra la radice LionFit. Estrai lo ZIP in LionFit-Modern-Git.')}
function apply(){
 validateRoot();const checks=targets.map(rel=>{const dst=safeFile(rel),src=safeFile('R18B_PAYLOAD/'+rel);if(!fs.existsSync(dst)||!fs.existsSync(src))throw Error('File mancante: '+rel);if(digest(src)!==manifest.patched[rel])throw Error('Payload alterato: '+rel);return {rel,dst,got:digest(dst)}});
 if(checks.every(c=>c.got===manifest.patched[c.rel])){console.log('R18B era gia installata. Nessun file riscritto.');return}
 for(const c of checks){if(c.got!==manifest.base[c.rel])throw Error('Sorgente diversa dalla R18A: '+c.rel+' (nessuna sovrascrittura).')}
 const backup=path.join(path.dirname(root),'LionFit_R18B_BACKUP_'+stamp());fs.mkdirSync(backup,{recursive:true});
 for(const c of checks){const p=path.join(backup,...c.rel.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(c.dst,p)}
 fs.writeFileSync(path.join(backup,'R18B_BACKUP.json'),JSON.stringify({root,base:manifest.base,patched:manifest.patched,targets},null,2));
 const applied=[];
 try{for(const c of checks){const tmp=c.dst+'.r18b-tmp';fs.copyFileSync(safeFile('R18B_PAYLOAD/'+c.rel),tmp);fs.renameSync(tmp,c.dst);applied.push(c)}
   for(const c of checks)if(digest(c.dst)!==manifest.patched[c.rel])throw Error('Verifica hash fallita: '+c.rel);
 }catch(e){for(const c of applied.reverse()){const before=path.join(backup,...c.rel.split('/'));fs.copyFileSync(before,c.dst)}throw e}
 console.log('R18B APPLICATA CON SUCCESSO.');console.log('BACKUP: '+backup);console.log('Nessun deploy e nessuna modifica ai file .env.');
}
function rollback(){
 validateRoot();const dir=path.dirname(root);const entries=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name.startsWith('LionFit_R18B_BACKUP_')).map(x=>x.name).sort().reverse();
 let backup=null,record=null;
 for(const name of entries){const f=path.join(dir,name,'R18B_BACKUP.json');if(!fs.existsSync(f))continue;try{const r=JSON.parse(fs.readFileSync(f,'utf8'));if(path.resolve(r.root)===path.resolve(root)){backup=path.join(dir,name);record=r;break}}catch{}}
 if(!record)throw Error('Backup R18B non trovato fuori dalla cartella LionFit.');
 for(const rel of record.targets){const dst=safeFile(rel),src=path.join(backup,...rel.split('/'));if(!fs.existsSync(src)||digest(src)!==record.base[rel])throw Error('Backup danneggiato: '+rel);if(!fs.existsSync(dst)||digest(dst)!==record.patched[rel])throw Error('File modificato dopo R18B, rollback fermato: '+rel)}
 for(const rel of record.targets)fs.copyFileSync(path.join(backup,...rel.split('/')),safeFile(rel));
 console.log('R18B RIPRISTINATA dalla copia pre-patch. Backup conservato in: '+backup);console.log('Le configurazioni .env sono indipendenti da questo rollback.');
}
try{if(process.argv[2]==='rollback')rollback();else if(!process.argv[2]||process.argv[2]==='install')apply();else throw Error('Comando non valido')}catch(e){bail(e.message)}
