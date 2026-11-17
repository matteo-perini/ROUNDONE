import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')
const ui=read('src/components/InviteEmailStudio.vue'),hub=read('src/components/InviteTeamHub.vue'),live=read('src/views/LiveCoachStaff.vue'),backend=read('invites-backend/functions/index.mjs'),client=read('src/integrations/firebase/inviteStudio.ts')
test('only owner sees the studio card; no new navigation links',()=>{
 assert.match(hub,/<details v-if="owner" class="staff-details lf-invite-detail lf-email-studio-detail">/)
 assert.match(hub,/<slot name="studio"/)
 assert.match(live,/<template v-if="owner" #studio>/)
 assert.match(live,/:gym-id="stagingSession.gymId"/)
 assert.match(ui,/Salva bozza locale/)
 assert.match(ui,/Salva per la palestra/)
})
test('never exposes recipient, token or sender email in editor payload',()=>{
 assert.doesNotMatch(client+ui,/LIONFIT_INVITES_RESEND_API_KEY|api\.resend\.com|VITE_RESEND_KEY/)
 assert.match(client,/\('lfSaveInviteStudio',\{gymId,settings\},uid\)/)
 assert.match(client,/VITE_LIONFIT_INVITES_STUDIO_PROVIDER==='cloud'/)
 assert.match(ui,/L'email effettiva|Nell'email effettiva/)
})
test('no Firebase Rules, navbar, Resend production activation, or legacy email send rewritten',()=>{
 assert.match(backend,/LIONFIT_INVITES_RESEND_ENABLED!=='ENABLED_AFTER_REVIEW'/)
 assert.match(live,/https:\/\/api\.emailjs\.com\/api\/v1\.0\/email\/send/g)
 assert.match(live,/reusableCoachInvite\(email,s\.gymId\)/)
 assert.match(live,/reusableUnsent\(email,s\.gymId\)/)
 assert.match(backend,/LIONFIT_INVITES_STUDIO_ENABLED!=='ENABLED_AFTER_REVIEW'/)
 assert.match(backend,/profile\.coachRole!=='owner'\|\|gym\.ownerUid!==uid/)
 assert.match(backend,/db\.doc\(`gyms\/\$\{gymId\}\/invite_email_studio\/config`\)/)
 assert.match(backend,/studioMedia\(appearanceDoc\.data\(\),studio\)/)
})
test('type script and stylesheet parsers validate modified SFCs',()=>{
 const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')
 const postcss=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/postcss')
 for(const file of ['src/components/InviteEmailStudio.vue','src/components/InviteTeamHub.vue','src/views/LiveCoachStaff.vue','src/views/CoachStaff.vue']){
  const src=read(file)
  const script=src.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  if(script){const out=ts.transpileModule(script,{fileName:file+'.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});assert.deepEqual(out.diagnostics||[],[])}
  for(const m of src.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(m[1],{from:file})
 }
})
test('mail settings model validates theme, palette and scoped local draft key',()=>{
 const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')
 const js=ts.transpileModule(read('src/features/invites/emailStudio.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
 assert.ok(js.includes('encodeURIComponent(gymId)'))
 assert.ok(js.includes("theme: 'dark'"))
 assert.match(js,/showLogo: true/)
 assert.match(js,/showCover: true/) // R5.1 enabled the default LionFit cover
 assert.match(js,/accent:/)
})
