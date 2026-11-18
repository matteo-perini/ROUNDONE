/** R18E: explicit two-sided (backend + production frontend) opt-in/out. NO deploy, NO build. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=__dirname,m=require('./R18E_MANIFEST.json'),mode=process.argv[2];
const at=rel=>path.join(root,...rel.split('/'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fail=msg=>{throw new Error(msg)};
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const id=v=>/^[A-Za-z0-9_-]{1,128}$/.test(v||'');
function readKey(s,key){const matches=s.split(/\r?\n/).filter(l=>new RegExp('^'+escapeRegExp(key)+'=').test(l));if(matches.length>1)fail('Chiave duplicata: '+key);return matches.length?matches[0].slice(key.length+1).trim():undefined}
function setKey(s,key,val){const re=new RegExp('^'+escapeRegExp(key)+'=.*(?:\\r?\\n|$)','gm');const x=s.replace(re,'');return x+(x.endsWith('\n')||x===''?'':'\n')+key+'='+val+'\n'}
function checkGit(rel){
 const p=cp.spawnSync('git',['ls-files','--error-unmatch','--',rel],{cwd:root,encoding:'utf8'});
 if(p.error)fail('Git non disponibile: evita di modificare .env finché non è disponibile.');
 if(p.status===0)fail('File '+rel+' tracciato da Git: evitare commit dei .env.');
 if(p.status!==1)fail('Controllo Git non riuscito su '+rel);
}
function gitExclude(rel){
 let dot=at('.git');if(!fs.existsSync(dot))return;
 if(fs.statSync(dot).isFile()){const mat=fs.readFileSync(dot,'utf8').match(/^gitdir: (.+)$/m);if(!mat)return;dot=path.resolve(root,mat[1])}
 if(!fs.existsSync(dot)||!fs.statSync(dot).isDirectory())return;
 const f=path.join(dot,'info','exclude');fs.mkdirSync(path.dirname(f),{recursive:true});
 const x=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';if(!x.split(/\r?\n/).includes('/'+rel))fs.appendFileSync(f,(x.endsWith('\n')||x===''?'':'\n')+'/'+rel+'\n')
}
function run(){
 if(!['all','pilot'].includes(mode))fail('Uso: node R18E_CONFIGURA_TUTTE.cjs all (oppure pilot per tornare alla palestra test)');
 if(!fs.existsSync(at('package.json'))||!fs.existsSync(at('src/components/AgendaCompetitions.vue')))fail('Avvia dalla radice LionFit-Modern-Git.');
 for(const rel of m.targets)if(!fs.existsSync(at(rel))||hash(at(rel))!==m.patched[rel])fail('Prima installa R18E: sorgente non verificata '+rel);
 const be=m.env_backend,fe=m.env_frontend,rels=[be,fe];
 for(const rel of rels){if(!fs.existsSync(at(rel)))fail('Configurazione pilota mancante: '+rel);checkGit(rel)}
 const old=rels.map(rel=>fs.readFileSync(at(rel),'utf8'));
 const beText=old[0],feText=old[1];
 const project=readKey(beText,'LF_COMPETITION_PROJECT_ID'),beFlag=readKey(beText,'LF_COMPETITION_INVITES_ENABLED');
 const feFlag=readKey(feText,'VITE_LIONFIT_COMPETITION_INVITES_ENABLED');
 const pilotBackend=readKey(beText,'LF_COMPETITION_PILOT_GYM_ID');
 const pilotFront=readKey(feText,'VITE_LIONFIT_COMPETITION_PILOT_GYM_ID');
 if(project!==m.project||beFlag!=='true'||feFlag!=='true'||!id(pilotBackend)||pilotBackend!==pilotFront||!pilotBackend.startsWith('gym_'))fail('Config R18B pilota non coerente: controllo bloccato.');
 for(const [txt,key] of [[beText,'LF_COMPETITION_SCOPE'],[feText,'VITE_LIONFIT_COMPETITION_SCOPE']]){const v=readKey(txt,key);if(v!==undefined&&!['all','pilot'].includes(v))fail('Scope sconosciuto: '+key)}
 const newTexts=[setKey(beText,'LF_COMPETITION_SCOPE',mode),setKey(feText,'VITE_LIONFIT_COMPETITION_SCOPE',mode)];
 if(newTexts.every((s,i)=>s===old[i])){console.log('Configurazione '+mode+' gia presente.');return}
 const backup=path.resolve(root,'..','LionFit_R18E_ENV_BACKUP_'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(backup,{recursive:false});
 for(let i=0;i<rels.length;i++){const p=path.join(backup,...rels[i].split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,old[i]);}
 fs.writeFileSync(path.join(backup,'info.json'),JSON.stringify({root,mode,targets:rels},null,2));
 const changed=[];
 try{for(let i=0;i<rels.length;i++){fs.writeFileSync(at(rels[i]),newTexts[i]);changed.push(i)}for(let i=0;i<rels.length;i++)if(fs.readFileSync(at(rels[i]),'utf8')!==newTexts[i])fail('Scrittura .env non riuscita')}
 catch(e){for(const i of changed)fs.writeFileSync(at(rels[i]),old[i]);throw e}
 for(const rel of rels)gitExclude(rel);
 console.log('Scope impostato su: '+mode+' (frontend + backend).');
 console.log('Backup riservato esterno al repo: '+backup);
 console.log('Attenzione: nessun deploy, nessun build eseguiti.');
 console.log('NON includere i file .env nel commit.');
}
try{run()}catch(e){console.error('R18E CONFIG BLOCCATA: '+e.message);process.exitCode=1}
