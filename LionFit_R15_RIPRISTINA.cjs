/** R15 rollback by SHA, refuses to override later edits. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=__dirname,backupDir=path.join(os.homedir(),'Desktop','LionFit_R15_BACKUP'),receipt=path.join(backupDir,'r15-receipt.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(x){console.error('ROLLBACK R15 BLOCCATO: '+x);process.exit(1)}
if(!fs.existsSync(receipt))fail('Receipt mancante: '+receipt);
const r=JSON.parse(fs.readFileSync(receipt,'utf8'));
if(r.root!==root||r.version!=='R15')fail('Backup R15 non appartiene a questa cartella.');
for(const item of r.files){const f=path.join(root,item.file);if(!fs.existsSync(f)||hash(fs.readFileSync(f))!==item.afterHash)fail('Il file '+item.file+' e cambiato dopo la R15. Non sovrascrivo; usa il backup manuale.');if(item.backup&&(!fs.existsSync(item.backup)||hash(fs.readFileSync(item.backup))!==item.beforeHash))fail('Backup danneggiato per '+item.file)}
for(const item of r.files){const f=path.join(root,item.file);if(item.backup)fs.writeFileSync(f,fs.readFileSync(item.backup));else fs.unlinkSync(f)}
fs.renameSync(receipt,receipt+'.ripristinato');
console.log('Rollback R15 terminato. File preesistenti ripristinati byte per byte.');
console.log('Rigenera web/docs e fai commit/push se avevi gia pubblicato la R15.');
