'use strict'
/* Ripristino con controllo di integrità: non rimpiazza modifiche successive. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');const root=__dirname;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function stop(message){console.error('ROLLBACK BLOCCATO: '+message);process.exit(1)}
try{
 const base=path.dirname(root);const dirs=fs.readdirSync(base).filter(x=>x.startsWith('LionFit_R16A_BACKUP_')&&fs.existsSync(path.join(base,x,'manifest.json'))).sort().reverse();
 let manifest,folder;
 for(const d of dirs){const data=JSON.parse(fs.readFileSync(path.join(base,d,'manifest.json'),'utf8'));if(data.root===root&&data.version==='R16A'){manifest=data;folder=path.join(base,d);break}}
 if(!manifest)stop('Backup R16A per questo progetto non trovato. Non elimino niente.')
 const f=path.join(root,'src/views/PlatformAdmin.vue');if(!fs.existsSync(f)||sha(fs.readFileSync(f))!==manifest.patchedSha)stop('PlatformAdmin.vue è stato modificato dopo R16A. Ripristino automatico non sicuro.')
 for(const [name,hash] of Object.entries(manifest.addedFiles)){const p=path.join(root,name);if(!fs.existsSync(p)||sha(fs.readFileSync(p))!==hash)stop('File aggiunto mancante o modificato: '+name)}
 const original=fs.readFileSync(path.join(folder,'PlatformAdmin.vue'));if(sha(original)!==manifest.originalSha)stop('Backup non integro.')
 fs.writeFileSync(f,original);for(const name of Object.keys(manifest.addedFiles))fs.unlinkSync(path.join(root,name));console.log('R16A RIPRISTINATA. Esegui typecheck e rigenera la web app se era già pubblicata.')
}catch(e){stop(e?.message||String(e))}
