'use strict'
/* LionFit PATCH 30 R16A — patch incrementale, nessuna funzione deployata. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,kit=path.join(root,'R16A_FILES'),target=path.join(root,'src','views','PlatformAdmin.vue');
const paths=['src/components/PlatformExecutiveOverview.vue','src/components/PlatformServicesStatus.vue','src/components/PlatformControlRoadmap.vue','tests/patch30-r16a-control-center.unit.mjs'];
const source=path.join(root,'R16A_PATCH_RULES.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function stop(message){console.error('\nR16A NON APPLICATA: '+message);process.exit(1)}
try{
 if(!fs.existsSync(target)||!fs.existsSync(path.join(root,'package.json'))||!fs.existsSync(path.join(root,'src','integrations','firestore','platform.ts')))stop('Apri questo script dalla RADICE del progetto LionFit-Modern-Git, non da un kit esterno.')
 if(!fs.existsSync(source))stop('Manca R16A_PATCH_RULES.json: estrai tutti i file dello ZIP nella radice.')
 const before=fs.readFileSync(target,'utf8');
 if(before.includes('PlatformExecutiveOverview')&&before.includes('lfcc-main-header')){const missing=paths.filter(p=>!fs.existsSync(path.join(root,p)));if(missing.length)stop('R16A sembra parzialmente installata; mancano: '+missing.join(', '));console.log('R16A già installata. Nessun file modificato.');process.exit(0)}
 const rules=JSON.parse(fs.readFileSync(source,'utf8'));
 let result=before;
 for(const rule of rules){const idx=result.indexOf(rule.before);if(idx<0||result.indexOf(rule.before,idx+1)>=0)stop(`Sorgente non corrispondente per «${rule.label}». STOP: non sovrascrivo file personalizzati. Mostrami il messaggio per preparare un fix mirato.`);result=result.slice(0,idx)+rule.after+result.slice(idx+rule.before.length)}
 if(result===before)stop('Nessuna modifica applicabile.')
 for(const p of paths){const input=path.join(kit,p),output=path.join(root,p);if(!fs.existsSync(input))stop('File mancante nello ZIP: '+p);if(fs.existsSync(output))stop('Il file di destinazione esiste già: '+p+'. Non lo sovrascrivo senza verificare la versione.')}
 const home=path.dirname(root),stamp=new Date().toISOString().replace(/[:.]/g,'-');const backup=path.join(home,'LionFit_R16A_BACKUP_'+stamp)
 if(fs.existsSync(backup))stop('Cartella backup già presente: '+backup)
 fs.mkdirSync(backup,{recursive:false})
 const originalPath=path.join(backup,'PlatformAdmin.vue');fs.writeFileSync(originalPath,before)
 const manifest={version:'R16A',root,originalSha:sha(before),patchedSha:sha(result),createdAt:new Date().toISOString(),addedFiles:{}}
 for(const p of paths)manifest.addedFiles[p]=sha(fs.readFileSync(path.join(kit,p)))
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2),'utf8')
 try{
  for(const p of paths){const output=path.join(root,p);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(kit,p),output)}
  fs.writeFileSync(target,result,'utf8')
  if(sha(fs.readFileSync(target))!==manifest.patchedSha)throw new Error('Verifica byte non riuscita')
 }catch(e){fs.writeFileSync(target,before,'utf8');for(const p of paths){const fp=path.join(root,p);if(fs.existsSync(fp)&&sha(fs.readFileSync(fp))===manifest.addedFiles[p])fs.unlinkSync(fp)}stop('Errore di scrittura, ripristino automatico effettuato: '+e.message)}
 console.log('\nR16A APPLICATA CON SUCCESSO — 3 componenti nuovi, 1 test e un aggiornamento mirato a PlatformAdmin.vue.')
 console.log('Backup esterno al repository: '+backup)
 console.log('PROSSIMI COMANDI (nella radice):')
 console.log('  node --test tests/patch30-r16a-control-center.unit.mjs')
 console.log('  npm.cmd run typecheck')
 console.log('Poi LIONFIT_PREPARA_WEB_E_DOCS.cmd SOLO se entrambi passano.')
}catch(e){stop(e?.message||String(e))}
