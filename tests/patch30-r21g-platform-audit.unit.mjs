import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const api=read('src/integrations/firestore/platform.ts')
const client=read('src/integrations/firebase/platformAudit.ts')
const shell=read('src/views/PlatformAdmin.vue')
const ui=read('src/components/PlatformAuditLog.vue')
const backend=read('platform-audit-backend/functions/index.mjs')
const tx=read('platform-audit-backend/functions/transaction.mjs')
const rules=read('security/R21G_RULES_SOLO_TEST_EMULATORE_NON_PUBBLICARE.rules')

test('audit stays off until explicit backend + rules acknowledgement',()=>{
 assert.match(client,/VITE_LIONFIT_PLATFORM_AUDIT==='ENABLED_AFTER_RULES_DEPLOY'/)
 assert.match(api,/if\(platformAuditEnabled\(\)\)\{await auditedCommercialPreference\(gym,exempt\);return\}/)
 assert.match(api,/LEGACY: remove only after the backend\+Rules audit rollout/)
})
test('new callable checks owner identity, claim, verified email and input validity',()=>{
 const model=read('platform-audit-backend/functions/model.mjs')
 assert.match(model,/auth\?\.uid!==CONTROL_UID/)
 assert.match(model,/claims\?\.email_verified!==true/)
 assert.match(model,/claims\?\.lionfitSuperAdmin!==true/)
 assert.match(model,/claims\?\.email!==CONTROL_EMAIL/)
 assert.match(backend,/requireActor\(request\.auth\)/)
 assert.match(backend,/validatePreference\(request\.data\)/)
})
test('commercial preference state and audit event share an atomic transaction',()=>{
 assert.match(tx,/database\.runTransaction\(async tx/)
 assert.match(tx,/tx\.set\(billing/)
 assert.match(tx,/tx\.create\(audit/)
 assert.match(tx,/if\(before===exempt\)return/)
 assert.doesNotMatch(tx,/get\('users|athlete_programs|progress|sessions'/)
})
test('audit UI uses server-protected callable and paginated results only',()=>{
 assert.match(client,/httpsCallable/)
 assert.match(client,/verifyPlatformAccess\(\)/)
 assert.match(client,/lfPlatformListCommercialAudit/)
 assert.match(ui,/:key="e.id"/)
 assert.match(ui,/mostra|Mostra eventi precedenti/)
 assert.match(shell,/tab==='security'&&platformAuditEnabled\(\)/)
 assert.match(ui,/non sono ancora inclusi/)
})
test('test-only rules prohibit all direct commercial writes and direct audit reads',()=>{
 assert.match(rules,/match \/platform_billing\/\{gymId\} \{\s+allow get: if lfPlatformAdmin\(\);\s+allow list: if false;\s+allow create, update, delete: if false;/)
 assert.match(rules,/match \/platform_audit\/\{entryId\} \{\s+allow read, write: if false;/)
 assert.doesNotMatch(rules,/match \/platform_audit\/\{entryId\} \{\s+allow read: if true/)
})
