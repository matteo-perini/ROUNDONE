import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const backend=read('invites-backend/functions/index.mjs')
const ui=read('src/components/InviteEmailStudio.vue')
const live=read('src/views/LiveCoachStaff.vue')
const hub=read('src/components/InviteTeamHub.vue')
const client=read('src/integrations/firebase/inviteStudio.ts')
test('each gym has distinct model and coach permission document; backend denies foreign or revoked',()=>{
 for(const name of ['lfReadInviteStudio','lfSaveInviteStudio','lfSetInviteStudioEditors'])assert.match(backend,new RegExp('export const '+name+'='))
 assert.match(backend,/studioConfigPath\(gymId\)/)
 assert.match(backend,/studioModelPath\(gymId,kind\)/)
 assert.match(backend,/studioEditorsPath\(gymId\)/)
 assert.match(read('invites-backend/functions/studioPermissions.mjs'),/profile\.gymId!==gymId/)
 assert.match(backend,/p\.gymId!==gymId/)
 assert.match(backend,/p\.membershipStatus&&p\.membershipStatus!=='active'/)
 assert.match(backend,/role!=='owner'&&!editorUids\.includes\(uid\)/)
 assert.match(backend,/action==='grant'&&role!=='owner'/)
 assert.match(backend,/req\.auth\.token\.email_verified!==true/)
})
test('coach receives only its gym document and explicit owner-granted permission',()=>{
 assert.match(ui,/editorUids\.value=props\.owner\?remote\.editorUids\|\|\[\]:\[\]/)
 assert.match(ui,/canEdit\.value=remote\.canEdit===true/)
 assert.match(ui,/v-if="cloud && canEdit"/)
 assert.match(ui,/v-if="cloud && owner"/)
 assert.match(ui,/Salva permessi Coach/)
 assert.match(client,/lfSetInviteStudioEditors/)
 assert.match(client,/lfReadInviteStudio',\{gymId,kind\}/)
 assert.match(client,/lfSaveInviteStudio',\{gymId,settings,kind\}/)
 assert.match(client,/if\(!mayWriteLive\(\)\)/)
 assert.match(client,/auth\.currentUser\.uid!==uid/)
})
test('all gym owners have Email Studio, no global or hardcoded gym id in authorization',()=>{
 assert.match(hub,/<details class="staff-details lf-invite-detail lf-email-studio-detail">/)
 assert.match(live,/<template #studio><InviteEmailStudio/)
 assert.match(live,/:coaches="coaches"/)
 assert.doesNotMatch(backend,/if\(gymId==='|if\(gymId==="/)
})
test('Resend transport and server-side branding unaffected',()=>{
 assert.match(backend,/fetch\('https:\/\/api\.resend\.com\/emails'/)
 assert.match(backend,/studioMedia\(appearanceDoc\.data\(\),studio\)/)
 assert.match(backend,/trustedStudio\(kindModelDoc\.data\(\)\?\.settings\)\|\|trustedStudio\(modelDoc\.data\(\)\?\.settings\)/)
 assert.doesNotMatch(ui+client,/api\.resend\.com|RESEND_API_KEY/)
 assert.match(backend,/LIONFIT_INVITES_STUDIO_ENABLED!=='ENABLED_AFTER_REVIEW'/)
})
test('SFC scripts and CSS remain parseable',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const file of ['src/views/LiveCoachStaff.vue','src/components/InviteTeamHub.vue','src/components/InviteEmailStudio.vue']){
  const source=read(file),script=source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script)
  const out=ts.transpileModule(script,{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
  assert.deepEqual(out.diagnostics||[],[],file)
  for(const part of source.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(part[1],{from:file})
 }
})
