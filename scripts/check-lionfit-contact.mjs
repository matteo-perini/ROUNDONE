/** Read-only check: publicly displayed contacts must match the SPA contact. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../',import.meta.url))
const read=p=>readFileSync(resolve(root,p),'utf8')
const source=read('src/features/platform/contact.ts')
const email=source.match(/export const LIONFIT_CONTACT_EMAIL = '([^']+)'/)?.[1]
assert.match(email??'',/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
const pages=['legal/note-legali.html','legal/policy.html','presentazione.html','v1-preview/note-legali.html','v1-preview/policy.html','www/note-legali.html','www/policy.html']
const folders=['public']
if(process.argv.includes('--published'))folders.push('dist','docs')
if(process.argv.includes('--android'))folders.push('android/app/src/main/assets/public')
let count=0
for(const folder of folders){
 for(const page of pages){
  const file=folder+'/'+page,html=read(file)
  const links=[...html.matchAll(/href=["']mailto:([^"']+)["'][^>]*>([^<]+)<\/a>/gi)]
  assert.ok(links.length,`${file}: manca il contatto email`)
  for(const [,href,label] of links){assert.equal(href,email,`${file}: indirizzo del link`);assert.equal(label.trim(),email,`${file}: indirizzo visibile`)}
  console.log(`PASS ${file}`);count++
 }
}
for(const file of ['src/views/Settings.vue','src/views/StagingAccess.vue','src/components/SupportTickets.vue']){
 const vue=read(file);assert.match(vue,/import \{LIONFIT_CONTACT_EMAIL,LIONFIT_CONTACT_MAILTO\} from '\.\.\/features\/platform\/contact'/);assert.match(vue,/:href="LIONFIT_CONTACT_MAILTO">\{\{LIONFIT_CONTACT_EMAIL\}\}/);console.log(`PASS ${file}`);count++
}
assert.match(read('src/views/PlatformAdmin.vue'),/<SupportTickets v-if="tab==='tickets'" platform\/>/)
assert.match(read('src/components/SupportTickets.vue'),/email automatiche non sono ancora attive/)
assert.match(read('src/integrations/firebase/platformAccess.ts'),/isPlatformClaim\(t.claims\)/)
console.log(`PASS ${count} componenti/pagine + verifica ticket/permessi. Contatto: ${email}`)
