#!/usr/bin/env node
/** R11: remove just the obsolete public EmailJS client helper after safe migration.
 * No Firebase writes, no network, no source rewrites. Refuses modified files.
 */
import {readFileSync,existsSync,unlinkSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const legacy=resolve(root,'src/integrations/email/legacyEmailJs.ts')
const view=resolve(root,'src/views/LiveCoachStaff.vue')
const client=resolve(root,'src/integrations/firebase/inviteMail.ts')
const expected='a792bb6d19bc70b80a097f2fcc93fc1527fe22d743d9e804aec4981bd5da2284'
const mode=process.argv[2]
if(!['--check','--remove'].includes(mode)){
 console.error('Uso: node scripts/r11-remove-legacy-emailjs.mjs --check|--remove')
 process.exit(2)
}
for(const path of [view,client]){
 if(!existsSync(path)){console.error('Manca un file di R11; non elimino nulla.');process.exit(2)}
 const s=readFileSync(path,'utf8')
 if(!s.includes('sendCentralInviteEmail')||/legacyEmailJs|api\.emailjs\.com|centralizedInvitesEnabled|VITE_LIONFIT_INVITES_PROVIDER/i.test(s)){
  console.error('R11 non ancora installata correttamente; non elimino nulla.');process.exit(2)
 }
}
if(!existsSync(legacy)){console.log('EmailJS legacy già assente: OK.');process.exit(0)}
const buf=readFileSync(legacy)
const sha=createHash('sha256').update(buf).digest('hex')
if(sha!==expected){console.error('Il file legacy è diverso dalla versione nota. Non elimino nulla; verifica manualmente.');process.exit(2)}
if(mode==='--check'){console.log('R11 verificata: helper EmailJS legacy riconosciuto, eliminabile.');process.exit(0)}
unlinkSync(legacy)
console.log('Eliminato solo src/integrations/email/legacyEmailJs.ts. Nessun altro file modificato.')
