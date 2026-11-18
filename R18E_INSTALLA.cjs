/** R18E LionFit: SHA-guarded three-file patch with backup outside repository. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,m=require('./R18E_MANIFEST.json');
const file=rel=>path.join(root,...rel.split('/'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hash=rel=>fs.existsSync(file(rel))?sha(fs.readFileSync(file(rel))):null;
const copy=(a,b)=>{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)};
const fail=msg=>{throw new Error(msg)};
function checkRoot(){if(!fs.existsSync(file('package.json'))||!fs.existsSync(file('src/components/AgendaCompetitions.vue')))fail('Estrai e avvia nella radice LionFit-Modern-Git.')}
function install(){
 checkRoot();
 const state=m.targets.map(rel=>({rel,got:hash(rel),payload:hash('R18E_PAYLOAD/'+rel)}));
 for(const s of state)if(s.payload!==m.patched[s.rel])fail('Payload alterato: '+s.rel);
 if(state.every(s=>s.got===m.patched[s.rel])){console.log('R18E GIA INSTALLATA: nessun file modificato.');return}
 for(const s of state)if(s.got!==m.base[s.rel])fail('Sorgente diversa da R18D/R18B: '+s.rel+'. Nulla modificato.');
 const backup=path.resolve(root,'..','LionFit_R18E_BACKUP_'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(backup,{recursive:false});
 for(const s of state)copy(file(s.rel),path.join(backup,...s.rel.split('/')));
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({root,version:m.version,base:m.base,patched:m.patched,targets:m.targets},null,2));
 const changed=[];
 try{
  for(const s of state){const temp=file(s.rel)+'.r18e-temp';if(fs.existsSync(temp))fail('File temporaneo esistente: '+s.rel);copy(file('R18E_PAYLOAD/'+s.rel),temp);fs.renameSync(temp,file(s.rel));changed.push(s)}
  for(const s of state)if(hash(s.rel)!==m.patched[s.rel])fail('Verifica SHA fallita: '+s.rel)
 }catch(err){for(const s of changed.reverse())copy(path.join(backup,...s.rel.split('/')),file(s.rel));throw err}
 console.log('R18E INSTALLATA (3 file sorgente).');
 console.log('Backup esterno: '+backup);
 console.log('PROSSIMO PASSO: node R18E_CONFIGURA_TUTTE.cjs all');
 console.log('Nessun Firebase deploy e nessun build eseguiti.');
}
function rollback(){
 checkRoot();
 const entries=fs.readdirSync(path.dirname(root),{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name.startsWith('LionFit_R18E_BACKUP_')).map(x=>x.name).sort().reverse();
 let bk=null,rec=null;
 for(const name of entries){const dir=path.join(path.dirname(root),name),f=path.join(dir,'manifest.json');if(!fs.existsSync(f))continue;try{const r=JSON.parse(fs.readFileSync(f,'utf8'));if(path.resolve(r.root)===path.resolve(root)){bk=dir;rec=r;break}}catch{}}
 if(!rec)fail('Backup R18E non trovato.');
 for(const rel of rec.targets){const old=path.join(bk,...rel.split('/'));if(!fs.existsSync(old)||sha(fs.readFileSync(old))!==rec.base[rel]||hash(rel)!==rec.patched[rel])fail('Rollback bloccato: file modificato dopo R18E o backup non valido: '+rel)}
 for(const rel of rec.targets)copy(path.join(bk,...rel.split('/')),file(rel));
 console.log('Sorgenti R18D/R18B ripristinate. Configurazione .env NON ripristinata.');
 console.log('Usa node R18E_CONFIGURA_TUTTE.cjs pilot, poi ridistribuisci il backend e ricompila il frontend.');
}
try{if(process.argv[2]==='rollback')rollback();else if(!process.argv[2]||process.argv[2]==='install')install();else fail('Comando atteso: install o rollback')}catch(e){console.error('R18E BLOCCATA: '+e.message);process.exitCode=1}
