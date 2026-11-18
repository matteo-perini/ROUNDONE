'use strict';
// Explicit opt-in, no deploy. Two-stage config prevents accidental enabling in all gyms.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=__dirname,phase=process.argv[2],gym=process.argv[3];
const project='app-palestra-b0b9d';
function fail(s){throw Error(s)}
const uuid=/^[A-Za-z0-9_-]{1,128}$/;
function backupName(){return 'LionFit_R18B_ENV_BACKUP_'+new Date().toISOString().replace(/[:.]/g,'-')}
function gitTracked(rel){try{return cp.spawnSync('git',['ls-files','--error-unmatch','--',rel],{cwd:root,stdio:'ignore'}).status===0}catch{return false}}
function addLocalExclude(rel){let git=path.join(root,'.git');if(fs.existsSync(git)&&fs.statSync(git).isFile()){const match=fs.readFileSync(git,'utf8').match(/^gitdir: (.+)$/m);if(match)git=path.resolve(root,match[1])}if(!fs.existsSync(git)||!fs.statSync(git).isDirectory())return;const p=path.join(git,'info','exclude');fs.mkdirSync(path.dirname(p),{recursive:true});const cur=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';if(!cur.split(/\r?\n/).includes('/'+rel))fs.appendFileSync(p,(cur.endsWith('\n')?'':'\n')+'/'+rel+'\n')}
function writeEnv(rel,values){const dest=path.join(root,...rel.split('/'));if(gitTracked(rel))fail('Il file '+rel+' risulta tracciato da Git. Fermato per evitare il commit di configurazione locale.')
 let text=fs.existsSync(dest)?fs.readFileSync(dest,'utf8'):'';
 const backup=path.join(path.dirname(root),backupName());fs.mkdirSync(backup,{recursive:true});
 if(fs.existsSync(dest)){const saved=path.join(backup,...rel.split('/'));fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(dest,saved)}
 for(const [key,value] of Object.entries(values)){const re=new RegExp('^'+key+'=.*(?:\\r?\\n|$)','gm');text=text.replace(re,'');text+=(text.endsWith('\n')||text===''?'':'\n')+key+'='+value+'\n'}
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);
 addLocalExclude(rel);console.log('Configurato: '+rel);console.log('Backup precedente (se presente): '+backup);console.log('ATTENZIONE: nessun deploy e nessuna build eseguiti.');
}
try{
 if(!['backend','frontend'].includes(phase)||!uuid.test(gym||'')||!gym.startsWith('gym_')||gym.length<9||/^gym_(ID|test|demo|example|foo)(?:_|$)/i.test(gym))fail('Uso: node R18B_CONFIGURA_PILOTA.cjs backend gym_ID oppure frontend gym_ID (sostituisci gym_ID con ID reale).');
 if(phase==='backend')writeEnv('competitions-backend/functions/.env.'+project,{LF_COMPETITION_INVITES_ENABLED:'true',LF_COMPETITION_PROJECT_ID:project,LF_COMPETITION_PILOT_GYM_ID:gym});
 else writeEnv('.env.production.local',{VITE_LIONFIT_COMPETITION_INVITES_ENABLED:'true',VITE_LIONFIT_COMPETITION_PILOT_GYM_ID:gym});
}catch(e){console.error('CONFIGURAZIONE BLOCCATA: '+e.message);process.exitCode=1}
