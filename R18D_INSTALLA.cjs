/** LionFit R18D — fail-closed single-file installer. No Firebase deployment. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=require('./R18D_MANIFEST.json');
const root=__dirname;
const file=path.join(root,...manifest.base_file.split('/'));
const payload=path.join(root,'R18D_PAYLOAD',...manifest.base_file.split('/'));
if(!fs.existsSync(path.join(root,'src'))||!fs.existsSync(path.join(root,'package.json')))throw Error('Apri la radice LionFit-Modern-Git.');
if(!fs.existsSync(file)||!fs.existsSync(payload))throw Error('File backend o payload assente.');
const old=fs.readFileSync(file),next=fs.readFileSync(payload);
if(sha(next)!==manifest.payload_sha256)throw Error('Payload non valido.');
if(sha(old)===manifest.payload_sha256){console.log('R18D GIA INSTALLATA. Nessuna modifica.');process.exit(0)}
if(sha(old)!==manifest.source_sha256)throw Error('Versione sorgente diversa dalla R18B verificata: installazione annullata SENZA modifiche.');
const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const back=path.resolve(root,'..','LionFit_R18D_BACKUP_'+stamp);
fs.mkdirSync(back,{recursive:false});
fs.writeFileSync(path.join(back,'index.mjs.R18B_ORIGINALE'),old);
fs.writeFileSync(path.join(back,'R18D_MANIFEST.json'),JSON.stringify(manifest,null,2));
const tmp=file+'.r18d.tmp';
try{fs.writeFileSync(tmp,next,{flag:'wx'});fs.renameSync(tmp,file)}catch(e){if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw e}
if(sha(fs.readFileSync(file))!==manifest.payload_sha256)throw Error('Hash inatteso dopo installazione; verifica il backup prima di procedere.');
console.log('R18D APPLICATA CON SUCCESSO. Solo backend gare aggiornato.');
console.log('Backup esterno al repository: '+back);
console.log('Nessun deploy, nessun dato Firebase modificato.');
