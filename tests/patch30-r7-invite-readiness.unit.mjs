import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,statSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Resend server falls back to predefined model and images without touching Firestore rules',()=>{
 const index=read('invites-backend/functions/index.mjs')
 assert.match(index,/trustedStudio\(modelDoc\.data\(\)\?\.settings\)\|\|defaultInviteStudio\(claimed\.gymName\)/)
 assert.match(index,/studioMedia\(appearanceDoc\.data\(\),studio\)/)
 assert.match(index,/LIONFIT_INVITES_RESEND_ENABLED!=='ENABLED_AFTER_REVIEW'/)
 assert.match(index,/LIONFIT_INVITES_STUDIO_ENABLED!=='ENABLED_AFTER_REVIEW'/)
 assert.match(index,/db\.runTransaction/)
})
test('email default branding uses fixed local CID assets and never fetches untrusted image urls',()=>{
 const core=read('invites-backend/functions/studioCore.mjs')
 assert.match(core,/defaultInviteStudio\(gymName\)/)
 assert.match(core,/readFileSync\(new URL\('\.\/assets\/lionfit-logo-default\.png'/)
 assert.match(core,/readFileSync\(new URL\('\.\/assets\/lionfit-cover-default\.jpg'/)
 assert.match(core,/content_id:'lionfit-logo'/)
 assert.match(core,/content_id:'lionfit-cover'/)
 assert.doesNotMatch(core,/fetch\(/)
 for(const p of ['invites-backend/functions/assets/lionfit-logo-default.png','invites-backend/functions/assets/lionfit-cover-default.jpg']){
  assert.ok(statSync(new URL('../'+p,import.meta.url)).size>1000)
 }
})
test('read-only readiness checker passes without credentials or network',()=>{
 const output=execFileSync(process.execPath,['scripts/check-invites-readiness.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8'})
 assert.match(output,/9\/9 controlli locali superati/)
 assert.match(output,/Nessuna email inviata/)
 assert.match(output,/webhook/)
})
test('frontend uses only Resend callable with no API keys or EmailJS transport',()=>{
 const client=read('src/integrations/firebase/inviteMail.ts')
 const view=read('src/views/LiveCoachStaff.vue')
 assert.doesNotMatch(client,/VITE_LIONFIT_INVITES_PROVIDER/)
 assert.match(view,/sendCentralInviteEmail\(/)
 assert.doesNotMatch(client+view,/LIONFIT_INVITES_RESEND_API_KEY|api\.resend\.com|api\.emailjs\.com/)
})
