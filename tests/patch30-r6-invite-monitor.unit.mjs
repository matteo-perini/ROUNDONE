import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {EXPIRING_SOON_MS,isCurrentInvite,pendingMonitor,visiblePendingMonitor,expiryLabel} from '../src/features/invites/monitor.ts'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const live=read('src/views/LiveCoachStaff.vue'),hub=read('src/components/InviteTeamHub.vue')
const now=Date.UTC(2026,10,17,12,0,0)
const invite=(id,type,status,email,remaining,createdBy='coach-1')=>({id,type,status,email,createdBy,expiresAt:{toMillis:()=>now+remaining}})
const rows=[
 invite('at1','atleta','pending','anna@example.org',3*86400000),
 invite('co1','coach','pending','luca@example.org',22*3600000),
 invite('at2','atleta','pending',undefined,EXPIRING_SOON_MS),
 invite('at3','atleta','pending','marco@example.org',-1),
 invite('co2','coach','claimed','mara@example.org',4*86400000),
 invite('co3','coach','revoked','lina@example.org',4*86400000),
]
test('summary derives scoped pending and soon-to-expire numbers without delivery claims',()=>{
 assert.deepEqual(pendingMonitor(rows,now),{active:3,expiring:2,athletes:2,collaborators:1})
 assert.equal(isCurrentInvite(rows[3],now),false)
 assert.equal(isCurrentInvite({id:'no-exp',type:'atleta',status:'pending'},now),true) // legacy: preserved visible pending behavior
 assert.equal(isCurrentInvite(rows[4],now),false)
})
test('filters by invitation role and email, not by secret token ID',()=>{
 assert.deepEqual(visiblePendingMonitor(rows,'all','',now).map(x=>x.id),['co1','at2','at1'])
 assert.deepEqual(visiblePendingMonitor(rows,'atleta','anna',now).map(x=>x.id),['at1'])
 assert.deepEqual(visiblePendingMonitor(rows,'coach','lUcA@EXAMPLE',now).map(x=>x.id),['co1'])
 assert.deepEqual(visiblePendingMonitor(rows,'all','at1',now),[])
})
test('expiration labels are appropriate and do not display token values',()=>{
 assert.equal(expiryLabel(rows[1],now),'Scade entro 22 ore')
 assert.equal(expiryLabel(rows[0],now),'Scade tra 3 giorni')
 assert.equal(expiryLabel(rows[3],now),'Scaduto')
 assert.equal(expiryLabel({id:'old',type:'atleta',status:'pending'},now),'Scadenza non disponibile')
})
test('UI lists only scoped invitations and owners retain gym-wide view',()=>{
 assert.match(live,/scopedInvites=computed\(\(\)=>owner\.value\?invited\.value:invited\.value\.filter\(x=>x\.createdBy===stagingSession\.value\?\.uid\)\)/)
 assert.match(live,/pendingMonitor\(scopedInvites\.value,inviteNow\.value\)/)
 assert.match(live,/visiblePendingMonitor\(scopedInvites\.value,inviteFilter\.value,inviteSearch\.value,inviteNow\.value\)/)
 assert.match(live,/!owner\.value&&x\.createdBy!==stagingSession\.value\.uid/)
 assert.match(live,/where\('status','==','pending'\)/)
 assert.match(live,/collection\(db,'gyms',s\.gymId,kind==='atleta'/)
})
test('no new navbar, backend or auth changes; retains pending actions',()=>{
 assert.match(live,/@click="shareInOneClick\(x\.type,'copy',x\)"/)
 assert.match(live,/@click="shareInOneClick\(x\.type,'whatsapp',x\)"/)
 assert.match(live,/@click="revoke\(x\)"/)
 assert.match(live,/<template v-if="owner" #coach>/)
 assert.match(live,/sendCentralInviteEmail/)
 assert.match(live,/api\.emailjs\.com/)
 assert.match(live,/:pending-count="inviteStats\.active"/)
 assert.match(live,/:expiring-count="inviteStats\.expiring"/)
 assert.match(hub,/lf-invite-summary-counts/)
})
test('timer is removed on unmount and no extra Firestore query is introduced for summary',()=>{
 assert.match(live,/inviteClock=setInterval\(/)
 assert.match(live,/clearInterval\(inviteClock\)/)
 const summary=live.slice(live.indexOf('const scopedInvites='),live.indexOf("const MAIL_CONF_KEY="))
 assert.doesNotMatch(summary,/getDocs|onSnapshot|fetch\(|runTransaction/)
})
test('TypeScript and CSS parse in available tooling',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const p of ['src/features/invites/monitor.ts','src/views/LiveCoachStaff.vue','src/components/InviteTeamHub.vue']){
  const raw=read(p),isVue=p.endsWith('.vue'),script=isVue?raw.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]:raw
  assert.ok(script,p)
  const t=ts.transpileModule(script,{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(t.diagnostics||[],[],`TS syntax: ${p}`)
  if(isVue)for(const match of raw.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(match[1],{from:p})
 }
})
let sfc;try{sfc=require('@vue/compiler-sfc')}catch{}
test('compile modified Vue SFCs when compiler is available',{skip:!sfc},()=>{
 for(const p of ['src/views/LiveCoachStaff.vue','src/components/InviteTeamHub.vue']){
  const {descriptor,errors}=sfc.parse(read(p),{filename:p});assert.deepEqual(errors,[])
  const script=sfc.compileScript(descriptor,{id:p})
  assert.deepEqual(sfc.compileTemplate({source:descriptor.template.content,filename:p,id:p,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
 }
})
