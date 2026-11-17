import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const live=read('src/views/LiveCoachStaff.vue'),hub=read('src/components/InviteTeamHub.vue')
const reg=read('src/views/StagingAccess.vue'),router=read('src/router/index.ts'),settings=read('src/views/Settings.vue'),welcome=read('src/views/WelcomeInstall.vue')
test('welcome launches exclusively after successful signup; existing login destinations unchanged',()=>{
 const done=reg.slice(reg.indexOf('async function afterSignup()'),reg.indexOf('async function completeCoach()'))
 const login=reg.slice(reg.indexOf('async function login()'),reg.indexOf('async function reset()'))
 assert.match(done,/await readStagingSession\(\)/)
 assert.match(done,/router\.replace\('\/installazione'\)/)
 assert.doesNotMatch(login,/installazione/)
 assert.match(login,/signedInDestination\(s\.role\)/)
 assert.match(reg,/await afterSignup\(\)/)
 assert.match(reg,/if\(result==='verify-email'\)/)
 assert.doesNotMatch(reg,/localStorage.*welcome|setDoc.*welcome|updateDoc.*welcome/)
})
test('welcome route is guarded by verified Firebase session for coach and athlete',()=>{
 assert.match(router,/path:'\/installazione',component:WelcomeInstall/)
 assert.match(router,/liveAthletes=\[.*'\/installazione'/)
 assert.match(router,/liveCoaches=\[.*'\/installazione'/)
 assert.match(router,/const s=await readNavigationSession\(\)/)
 assert.match(router,/catch\{stagingSession\.value=null;return '\/accesso'\}/)
 assert.match(router,/to\.path==='\/installazione'\|\|athletes\.includes/)
})
test('welcome loads safe gym branding from server, not query or invite token',()=>{
 assert.match(welcome,/readStagingDetails\(\)/)
 assert.match(welcome,/getDocFromServer\(doc\(db,'gyms',session\.gymId,'identity','appearance'\)\)/)
 assert.match(welcome,/safeImage\(snap\.data\(\)\?\.logo,120000\)/)
 assert.doesNotMatch(welcome,/athleteInvite|coachInvite|request\.query|localStorage\.setItem|writeBatch|setDoc|runTransaction/)
})
test('platform-specific guides and optional installation use existing official destinations',()=>{
 assert.match(welcome,/github\.com\/matteo-perini\/ROUNDONE\/releases\/latest\/download\/LionFit\.apk/)
 assert.match(welcome,/www\.lionfit\.it/)
 assert.match(welcome,/Aggiungi alla schermata Home/)
 assert.match(welcome,/Safari/)
 assert.match(welcome,/beforeinstallprompt/)
 assert.match(welcome,/display-mode: standalone/)
 assert.match(welcome,/Vai alla mia Dashboard/)
 assert.match(settings,/to="\/installazione"/)
 assert.match(settings,/Installa LionFit/)
})
test('one-click sharing has no intermediate panel and keeps email flow separately',()=>{
 assert.doesNotMatch(live,/<InviteSharePanel/)
 assert.doesNotMatch(live,/>Genera link da condividere</)
 assert.match(live,/@click="shareInOneClick\('atleta','copy'\)"/)
 assert.match(live,/@click="shareInOneClick\('atleta','whatsapp'\)"/)
 assert.match(live,/@click="shareInOneClick\('coach','copy'\)"/)
 assert.match(live,/@click="shareInOneClick\('coach','whatsapp'\)"/)
 assert.match(live,/@click="shareInOneClick\(x\.type,'copy',x\)"/)
 assert.match(live,/@click="shareInOneClick\(x\.type,'whatsapp',x\)"/)
 assert.match(live,/await assertSharePending\(kind,link,s\.gymId,s\.uid,email\)/)
 assert.match(live,/await copyInviteToClipboard\(ready\.link\)/)
 assert.match(live,/window\.open\('about:blank','_blank'\)/)
 assert.match(live,/window\.location\.assign\(url\)/)
 assert.match(live,/sendCoachMail/)
 assert.match(live,/sendAthleteMail/)
 assert.match(hub,/@media\(min-width:901px\)\{\.lf-invite-back\{display:none\}\}/)
})
test('new and changed Vue/TS and CSS code parses in local tooling',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const p of ['src/views/WelcomeInstall.vue','src/views/LiveCoachStaff.vue','src/views/CoachStaff.vue','src/views/StagingAccess.vue','src/views/Settings.vue','src/components/InviteTeamHub.vue']){
  const raw=read(p),script=raw.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script,`missing script ${p}`)
  const r=ts.transpileModule(script,{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(r.diagnostics||[],[],`TS syntax ${p}`)
  for(const block of raw.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(block[1],{from:p})
 }
 const routeParse=ts.transpileModule(router,{fileName:'index.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
 assert.deepEqual(routeParse.diagnostics||[],[])
})
let sfc
try{sfc=require('@vue/compiler-sfc')}catch{}
test('compile actual new welcome Vue SFC when Vue compiler is installed',{skip:!sfc},()=>{
 const file='src/views/WelcomeInstall.vue',source=read(file)
 const {descriptor,errors}=sfc.parse(source,{filename:file});assert.deepEqual(errors,[])
 const script=sfc.compileScript(descriptor,{id:file})
 const out=sfc.compileTemplate({source:descriptor.template.content,filename:file,id:file,compilerOptions:{bindingMetadata:script.bindings}})
 assert.deepEqual(out.errors,[])
 for(const style of descriptor.styles)assert.deepEqual(sfc.compileStyle({source:style.content,filename:file,id:file,scoped:style.scoped}).errors,[])
})
