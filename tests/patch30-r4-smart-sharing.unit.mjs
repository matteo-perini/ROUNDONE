import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {shareToken,shareWhatsappUrl} from '../src/features/invites/shareLinks.ts'
const require=createRequire(import.meta.url)
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
const live=read('src/views/LiveCoachStaff.vue'),hub=read('src/components/InviteTeamHub.vue'),panel=read('src/components/InviteSharePanel.vue'),demo=read('src/views/CoachStaff.vue')
const origin='https://www.lionfit.it',gym='gym_test123',token='a1'+'ab'.repeat(23)
function link(kind='atleta',tok=token){return `${origin}/www/index.html?gym=${gym}&${kind==='coach'?'coachInvite':'athleteInvite'}=${tok}`}

test('validates only same-origin, gym-specific single-use token URLs',()=>{
 assert.equal(shareToken(link(),'atleta',gym,origin),token)
 assert.equal(shareToken(link('coach'),'coach',gym,origin),token)
 for(const value of [link().replace(origin,'https://phishing.test'),link()+'&coachInvite='+token,link().replace(gym,'gym_other123'),link().replace(token,'123'),link().replace('/www/index.html','/login'),link().replace('https://','http://')])assert.equal(shareToken(value,'atleta',gym,origin),null)
 assert.equal(shareToken(link('coach'),'atleta',gym,origin),null)
 assert.equal(shareToken(link(),'atleta','gym_other123',origin),null)
})
test('WhatsApp share requires valid source and properly encodes the target, never sends automatically',()=>{
 const url=shareWhatsappUrl(link(),'atleta','Palestra Lion\nIniezione',gym,origin)
 assert.equal(new URL(url).origin,'https://wa.me')
 const msg=new URL(url).searchParams.get('text')
 assert.ok(msg.includes(link()))
 assert.ok(msg.includes('Palestra Lion Iniezione'))
 assert.ok(!msg.includes('Iniezione\n'))
 assert.equal(shareWhatsappUrl('javascript:alert(1)','atleta','Foo',gym,origin),'')
 const coachMsg=new URL(shareWhatsappUrl(link('coach'),'coach','LionFit',gym,origin)).searchParams.get('text')
 assert.match(coachMsg,/stessa email|email al quale|indirizzo email/)
})
test('manual athlete tokens are separate from old email tokens; no change to existing email flows',()=>{
 assert.match(live,/kind==='manual'\?'a1':'e1'/)
 assert.match(live,/makeInvite\('atleta','email'\)/)
 assert.match(live,/makeInvite\('coach','coach'\)/)
 assert.match(live,/reusableUnsent\(email,s\.gymId\)/)
 assert.match(live,/reusableCoachInvite\(email,s\.gymId\)/)
 assert.match(live,/https:\/\/api\.emailjs\.com\/api\/v1\.0\/email\/send/)
 assert.match(live,/centralizedInvitesEnabled\(\)/)
})
test('collaborator link remains tied to email, owner-only; athlete permitted for coaches',()=>{
 assert.match(live,/kind==='coach'&&!owner\.value/)
 assert.match(live,/if\(kind==='coach'&&!emailValid\(email\)\)/)
 assert.match(live,/if\(kind==='coach'&&\(!owner\.value\|\|data\.email!==email\)\)/)
 assert.match(live,/kind==='coach'\?\{email\}:\{\}/)
 assert.match(live,/@click="shareInOneClick\('atleta','copy'\)"/)
 assert.match(live,/@click="shareInOneClick\('coach','whatsapp'\)"/)
 assert.match(live,/fromPending\.createdBy!==s\.uid/)
})
test('sharing reads current Firestore pending state before copying and preserves revoke',()=>{
 assert.match(live,/await assertSharePending\(kind,link,s\.gymId,s\.uid,email\)/)
 assert.match(live,/getDocFromServer\(doc\(db,'gyms',gymId,kind==='coach'\?'coach_invites':'athlete_invites',id\)\)/)
 assert.match(live,/data\.status!=='pending'/)
 assert.match(live,/data\.expiresAt\?\.toMillis\?\.\(\)<=Date\.now\(\)/)
 assert.match(live,/preparedShareCache\?\.link\.includes\(x\.id\)/)
 assert.match(live,/@click="revoke\(x\)"/)
})
test('manual share sends no network email and does not expose token in status, logs or localStorage',()=>{
 const fn=live.slice(live.indexOf('async function prepareShare('),live.indexOf('async function shareInOneClick('))
 assert.doesNotMatch(fn,/fetch\(|sendCentralInviteEmail\(|sessionStorage\.(?:setItem|getItem)|localStorage\.(?:setItem|getItem)|console\.(?:log|error)/)
 assert.match(fn,/makeInvite\(kind,kind==='coach'\?'coach':'manual'\)/)
 assert.match(fn,/const prev=preparedShareCache/)
 assert.doesNotMatch(live,/<template #share><InviteSharePanel/)
 assert.match(hub,/<slot name="share"\/>/)
 assert.match(panel,/target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/)
 assert.match(live,/@click="shareInOneClick\('atleta','whatsapp'\)"/)
 assert.doesNotMatch(demo,/https:\/\/wa\.me|window\.open\(|fetch\(/)
})
test('one-click UI preserves mobile styles and no intermediate share panel',()=>{
 assert.match(live,/@media\(max-width:430px\)/)
 assert.doesNotMatch(live,/<InviteSharePanel/)
 assert.match(hub,/lf-email-studio-detail/)
 assert.match(live,/InviteEmailStudio/)
 assert.match(live,/@click="shareInOneClick\(x\.type,'copy',x\)"/)
 assert.match(live,/@click="shareInOneClick\(x\.type,'whatsapp',x\)"/)
 assert.match(demo,/Modalità demo|Modalit. demo/)
})
test('TypeScript and PostCSS parse all modified UI files',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const file of ['src/views/LiveCoachStaff.vue','src/views/CoachStaff.vue','src/components/InviteTeamHub.vue','src/components/InviteSharePanel.vue']){
  const raw=read(file),source=raw.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  if(source){const out=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});assert.deepEqual(out.diagnostics||[],[])}
  for(const s of raw.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(s[1],{from:file})
 }
 const source=read('src/features/invites/shareLinks.ts')
 assert.deepEqual(ts.transpileModule(source,{fileName:'shareLinks.ts',reportDiagnostics:true}).diagnostics||[],[])
})
let sfc
try{sfc=require('@vue/compiler-sfc')}catch{}
test('compile actual Vue SFCs if compiler is available',{skip:!sfc},()=>{
 for(const file of ['src/views/LiveCoachStaff.vue','src/views/CoachStaff.vue','src/components/InviteTeamHub.vue','src/components/InviteSharePanel.vue']){
  const {descriptor,errors}=sfc.parse(read(file),{filename:file});assert.deepEqual(errors,[])
  const script=sfc.compileScript(descriptor,{id:file})
  const compiled=sfc.compileTemplate({source:descriptor.template.content,filename:file,id:file,compilerOptions:{bindingMetadata:script.bindings}})
  assert.deepEqual(compiled.errors,[])
  for(const style of descriptor.styles)assert.deepEqual(sfc.compileStyle({source:style.content,filename:file,id:file,scoped:style.scoped}).errors,[])
 }
})
