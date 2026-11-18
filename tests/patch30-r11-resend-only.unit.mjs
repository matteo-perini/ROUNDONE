import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,cpSync,mkdirSync,writeFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const live=read('src/views/LiveCoachStaff.vue')
const client=read('src/integrations/firebase/inviteMail.ts')
const hub=read('src/components/InviteTeamHub.vue')
const studio=read('src/components/InviteEmailStudio.vue')
test('single Resend transport for both invitation kinds; no browser EmailJS fallback',()=>{
 assert.equal((live.match(/await sendCentralInviteEmail\(/g)||[]).length,2)
 assert.match(live,/kind:'atleta'|kind:'athlete'/)
 assert.match(live,/kind:'coach'/)
 assert.doesNotMatch(live+client+hub+studio,/emailjs|legacyEmailJs|serviceId|templateId|publicKey/i)
 assert.doesNotMatch(live+client,/fetch\(['"]https:\/\/api\.(?:emailjs|resend)\.com/)
 assert.doesNotMatch(client,/VITE_LIONFIT_INVITES_PROVIDER|centralizedInvitesEnabled/)
 assert.match(client,/getFunctions\(auth\.app,'europe-west1'\)/)
 assert.match(client,/httpsCallable/)
 assert.match(client,/lfSendInviteEmail/)
})
test('auth, gym, token, safe link and environment gates preserved',()=>{
 for(const re of [/if\(!mayWriteLive\(\)\)/,/auth\.currentUser\.uid!==input\.uid/,/\^\[a-f0-9\]\{48\}\$/, /u\.searchParams\.get\('gym'\)!==input\.gymId/,/u\.pathname!=='\/www\/index\.html'/,/if\(!out\.accepted\)/])assert.match(client,re)
 assert.match(live,/if\(!owner\.value\)/)
 assert.match(live,/allowedMailRecipient\(email\)/)
 assert.match(live,/reusableCoachInvite\(email,s\.gymId\)/)
 assert.match(live,/reusableUnsent\(email,s\.gymId\)/)
 assert.match(live,/sessionStorage\.setItem\(UNSENT_KEY/)
 assert.match(live,/sessionStorage\.setItem\(UNSENT_COACH_KEY/)
 assert.match(live,/inviteStats\.active/)
 assert.match(live,/shareInOneClick/)
 assert.match(live,/revoke\(x\)/)
})
test('public UI shows Resend only; customer service code not edited',()=>{
 assert.match(hub,/LionFit Mail · Resend/)
 assert.match(live,/Mittente e credenziali sono gestiti esclusivamente sul server/)
 assert.match(studio,/L’invio Resend è attivo/)
 assert.doesNotMatch(hub+studio+live,/Salva configurazione EmailJS|EmailJS continua|EmailJS mantiene/)
})
test('backend still blocks without explicit approval; R10 premium and gym branding preserved',()=>{
 const backend=read('invites-backend/functions/index.mjs')
 const core=read('invites-backend/functions/studioCore.mjs')
 assert.match(backend,/LIONFIT_INVITES_RESEND_ENABLED!=='ENABLED_AFTER_REVIEW'/)
 assert.match(backend,/canSendInvite\(/)
 assert.match(backend,/quotaPermits\(/)
 assert.match(backend,/Idempotency-Key/)
 assert.match(backend,/studioMedia\(appearanceDoc\.data\(\),studio\)/)
 assert.match(core,/lionfit-logo-default\.png/)
 assert.match(core,/lionfit-cover-default\.jpg/)
})
test('readiness checker reflects exclusive Resend, remains offline and reports 9/9',()=>{
 const s=read('scripts/check-invites-readiness.mjs')
 assert.match(s,/Solo Resend tramite Callable Firebase/)
 const out=execFileSync(process.execPath,['scripts/check-invites-readiness.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8'})
 assert.match(out,/9\/9 controlli locali superati/)
 assert.match(out,/Nessuna email inviata/)
})
test('legacy cleanup checks R11 and refuses changed legacy file',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'lf-r11-cleanup-'))
 try{
  for(const p of ['scripts/r11-remove-legacy-emailjs.mjs','src/views/LiveCoachStaff.vue','src/integrations/firebase/inviteMail.ts','src/integrations/email/legacyEmailJs.ts']){
   const to=join(tmp,p);mkdirSync(join(to,'..'),{recursive:true});
   if(p.endsWith('legacyEmailJs.ts')&&!existsSync(new URL('../'+p,import.meta.url)))continue
   writeFileSync(to,read(p))
  }
  const cli=join(tmp,'scripts/r11-remove-legacy-emailjs.mjs')
  const legacy=join(tmp,'src/integrations/email/legacyEmailJs.ts')
  if(existsSync(legacy)){
   assert.match(execFileSync(process.execPath,[cli,'--check'],{encoding:'utf8'}),/eliminabile/)
   const known=readFileSync(legacy)
   writeFileSync(legacy,known.toString()+'\n// user edit\n')
   assert.throws(()=>execFileSync(process.execPath,[cli,'--remove'],{stdio:'pipe'}))
   assert.equal(existsSync(legacy),true)
   writeFileSync(legacy,known)
   assert.match(execFileSync(process.execPath,[cli,'--remove'],{encoding:'utf8'}),/Eliminato solo/)
   assert.equal(existsSync(legacy),false)
  }
  assert.match(execFileSync(process.execPath,[cli,'--check'],{encoding:'utf8'}),/già assente/)
 }finally{rmSync(tmp,{recursive:true,force:true})}
})
test('TypeScript and Vue SFC syntax parses with available transpilers',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const p of ['src/views/LiveCoachStaff.vue','src/components/InviteTeamHub.vue','src/components/InviteEmailStudio.vue','src/integrations/firebase/inviteMail.ts']){
  const s=read(p),script=p.endsWith('.vue')?s.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]:s
  assert.ok(script,p)
  const out=ts.transpileModule(script,{fileName:p+'.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
  assert.deepEqual(out.diagnostics||[],[],p)
  if(p.endsWith('.vue'))for(const m of s.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(m[1],{from:p})
 }
 assert.doesNotThrow(()=>JSON.parse(read('src/features/i18n/en.json')))
})
