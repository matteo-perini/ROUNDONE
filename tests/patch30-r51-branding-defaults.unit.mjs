import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const branding=read('src/features/branding/defaultBranding.ts')
const studio=read('src/components/InviteEmailStudio.vue')
const welcome=read('src/views/WelcomeInstall.vue')
const emailCore=read('src/features/invites/emailStudio.ts')
test('default LionFit branding assets exist for gyms without personalization',()=>{
 assert.equal(existsSync(new URL('../public/lionfit-defaults/lionfit-logo-default.svg',import.meta.url)),true)
 assert.equal(existsSync(new URL('../public/lionfit-defaults/lionfit-gym-default.png',import.meta.url)),true)
 assert.match(branding,/LIONFIT_DEFAULT_LOGO='\/lionfit-defaults\/lionfit-logo-default\.svg'/)
 assert.match(branding,/LIONFIT_DEFAULT_COVER='\/lionfit-defaults\/lionfit-gym-default\.png'/)
 assert.match(branding,/LIONFIT_DEFAULT_SENDER='LionFit Team'/)
})
test('email studio keeps preview complete via automatic LionFit fallbacks',()=>{
 assert.match(studio,/resolveBrandLogo/)
 assert.match(studio,/resolveBrandCover/)
 assert.match(studio,/:src=\"resolvedLogo\"/)
 assert.match(studio,/:src=\"resolvedCover\"/)
 assert.match(studio,/LionFit usa automaticamente il logo standard/)
 assert.doesNotMatch(studio,/!logo\"/)
 assert.doesNotMatch(studio,/!cover\"/)
})
test('welcome experience always shows resolved branding even with missing gym assets',()=>{
 assert.match(welcome,/effectiveLogo=computed/)
 assert.match(welcome,/effectiveCover=computed/)
 assert.match(welcome,/cover\.value=safeImage\(snap\.data\(\)\?\.cover,420000\)/)
 assert.match(welcome,/:src=\"effectiveLogo\"/)
 assert.match(welcome,/:src=\"effectiveCover\"/)
 assert.match(welcome,/Branding standard LionFit attivo/)
})
test('sender defaults prefer gym name, then LionFit Team',()=>{
 assert.match(emailCore,/resolveSenderName\('',gymName\)/)
 assert.match(emailCore,/resolveSenderName\(v\.senderName,gymName\)/)
})
test('new and changed TS and Vue files parse in local tooling',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const p of ['src/features/branding/defaultBranding.ts','src/features/invites/emailStudio.ts']){
  const raw=read(p)
  const r=ts.transpileModule(raw,{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(r.diagnostics||[],[],`TS syntax ${p}`)
 }
 for(const p of ['src/components/InviteEmailStudio.vue','src/views/WelcomeInstall.vue']){
  const raw=read(p),script=raw.match(/<script setup lang=\"ts\">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script,`missing script ${p}`)
  const r=ts.transpileModule(script,{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(r.diagnostics||[],[],`TS syntax ${p}`)
  for(const block of raw.matchAll(/<style(?: scoped)?>(([\s\S]*?))<\/style>/g))postcss.parse(block[1],{from:p})
 }
})
