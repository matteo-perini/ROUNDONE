import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir,copyFile,access,rename} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {homedir} from 'node:os'
import {pathToFileURL} from 'node:url'

const BEFORE_SHA='3ab27bc9bf16a16f75d0e03f46e0e209f567a8e6842dac82fff6c66d9ca29db5'
const AFTER_SHA='ea9564170b1f07c9535744c3a2a22d845d90750e86c9bc664cbc7b90cb91678b'
const before='<template v-else-if="shownRole">'
const after='<template v-else-if="shownRole && route.path!==\'/accesso\'">'
const sha=b=>createHash('sha256').update(b).digest('hex')
const here=process.cwd()
const target=resolve(here,'src','App.vue')
const required=['package.json','src/router/index.ts','src/components/GoogleExistingSigninButton.vue']
async function main(){
 for(const p of required){try{await access(resolve(here,p))}catch{throw new Error(`STOP: esegui questo script dalla cartella principale LionFit (manca ${p}).`)}}
 const original=await readFile(target)
 const originalSha=sha(original)
 if(originalSha===AFTER_SHA){console.log('OK: R21P gia applicata. Nessun file modificato.');return}
 if(originalSha!==BEFORE_SHA)throw new Error(`STOP: src/App.vue non corrisponde allo ZIP esaminato. SHA256 corrente: ${originalSha}. Nessuna modifica eseguita.`)
 const originalText=original.toString('utf8')
 if(originalText.split(before).length!==2)throw new Error('STOP: marcatore univoco non trovato.')
 const modified=Buffer.from(originalText.replace(before,after),'utf8')
 if(sha(modified)!==AFTER_SHA)throw new Error('STOP: il risultato non corrisponde alla correzione verificata.')
 const folder=resolve(homedir(),'Desktop','LionFit_R21P_BACKUP')
 await mkdir(folder,{recursive:true})
 const name='App.vue.PRIMA_R21P.'+new Date().toISOString().replace(/[:.]/g,'-')
 const backup=join(folder,name)
 await copyFile(target,backup)
 const tmp=target+'.r21p-tmp'
 try{
  await writeFile(tmp,modified)
  await rename(tmp,target)
 }catch(e){throw new Error('STOP: scrittura interrotta. Backup originale: '+backup+'. Causa: '+(e instanceof Error?e.message:String(e)))}
 console.log('OK R21P applicata a src/App.vue (unica modifica: shell non cambia finche route=/accesso).')
 console.log('BACKUP originale fuori dal repository: '+backup)
 console.log('Nessun deploy Firebase, nessun cambio Rules/IAM, nessuna modifica ai dati utenti.')
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
