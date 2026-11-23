// R21O: only the two Google-related .env files. No cloud changes or secret outputs.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const args=process.argv.slice(2)
const action=args[0],value=args[1]
const repo=process.cwd()
if(!['--prepare','--enable','--disable'].includes(action)){
 console.error('Uso: node tools/configura-r21o.mjs --prepare CLIENT_ID | --enable CLIENT_ID | --disable');process.exit(2)
}
if(!fs.existsSync(path.join(repo,'src/views/StagingAccess.vue'))||!fs.existsSync(path.join(repo,'google-auth-backend/firebase.json'))){
 console.error('STOP: apri PowerShell nella cartella principale LionFit-Modern-Git con R21O estratta.');process.exit(2)
}
const frontendFile=path.join(repo,'.env.production.local')
if(!fs.existsSync(frontendFile)){
 console.error('STOP: file .env.production.local mancante. Non creo un nuovo ambiente di produzione incompleto.');process.exit(2)
}
const format=/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/
if(action!=='--disable'&&!format.test(value||'')){
 console.error('STOP: devi passare il Client ID OAuth WEB completo, terminante in .apps.googleusercontent.com');process.exit(2)
}
const backFile=path.join(repo,'google-auth-backend','functions','.env')
const original=fs.readFileSync(frontendFile,'utf8')
const old=original.split(/\r?\n/).filter(line=>!/^(\s*VITE_LIONFIT_GOOGLE_(?:LINK|LOGIN|WEB_CLIENT_ID)\s*=)/.test(line)).join('\n').trimEnd()
const newLines= action==='--enable'?[
 'VITE_LIONFIT_GOOGLE_LINK=ENABLED_AFTER_PROVIDER_REVIEW',
 'VITE_LIONFIT_GOOGLE_LOGIN=ENABLED_AFTER_BACKEND',
 `VITE_LIONFIT_GOOGLE_WEB_CLIENT_ID=${value}`
]:action==='--prepare'?[
 'VITE_LIONFIT_GOOGLE_LINK=DISABLED',
 'VITE_LIONFIT_GOOGLE_LOGIN=DISABLED',
 `VITE_LIONFIT_GOOGLE_WEB_CLIENT_ID=${value}`
]:[
 'VITE_LIONFIT_GOOGLE_LINK=DISABLED',
 'VITE_LIONFIT_GOOGLE_LOGIN=DISABLED'
]
const backupDir=path.join(os.homedir(),'Desktop','LionFit_GOOGLE_R21O_ENV_BACKUP')
fs.mkdirSync(backupDir,{recursive:true})
const backup=path.join(backupDir,'env.production.local-'+new Date().toISOString().replace(/[:.]/g,'-')+'.txt')
fs.writeFileSync(backup,original,'utf8')
fs.writeFileSync(frontendFile,old+'\n'+newLines.join('\n')+'\n','utf8')
if(action==='--prepare'){
 fs.writeFileSync(backFile,`GOOGLE_LOGIN_WEB_CLIENT_ID=${value}\n`,'utf8')
}
console.log('OK modalità:',action)
console.log('Backup .env originale (NON caricare su GitHub):',backup)
console.log('Modificati solo i flag Google; altri flag LionFit e Audit invariati.')
if(action==='--prepare')console.log('Backend OAuth Client ID impostato in google-auth-backend/functions/.env (file ignorato da Git).')
if(action==='--disable')console.log('Il pulsante Google sarà invisibile dalla prossima pubblicazione web. I collegamenti Firebase già effettuati non sono stati rimossi.')
