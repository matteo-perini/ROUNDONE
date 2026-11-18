import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const shell=read('src/views/PlatformAdmin.vue')
const overview=read('src/components/PlatformExecutiveOverview.vue')
const services=read('src/components/PlatformServicesStatus.vue')
const roadmap=read('src/components/PlatformControlRoadmap.vue')
test('access remains gated by original Super Admin verification and platform guard',()=>{
 assert.match(shell,/verifyPlatformAccess\(\)/)
 assert.match(shell,/verifyPlatformAccess\(false\)/)
 assert.match(shell,/v-if="allowed"/)
 assert.match(shell,/onIdTokenChanged/)
 assert.match(shell,/clearControl\(\)/)
 const platform=read('src/integrations/firestore/platform.ts')
 assert.match(platform,/export async function platformGuard/)
 assert.match(platform,/verifyPlatformAccess\(\)/)
})
test('8 navigation areas exist; no additional public routes or role changes',()=>{
 for(const name of ['Panoramica','Palestre & CRM','Abbonamenti','Assistenza','Stato servizi','Utilizzo app','Sicurezza','Configurazione'])assert.ok(shell.includes(name),name)
 assert.match(shell,/PlatformExecutiveOverview/)
 assert.match(shell,/PlatformServicesStatus/)
 assert.match(shell,/PlatformControlRoadmap/)
 assert.doesNotMatch(shell,/\b(?:setDoc|addDoc|deleteDoc|updateDoc)\s*\(/)
})
test('existing commercial editing and support workflow are preserved',()=>{
 for(const key of ['listPlatformGyms','listGymCommercialModes','platformCounts','setBillingExemption','getGymCommercialMode','SupportTickets','toggleSupportPush','BillingSandbox','billingSandboxEnabled','Carica altre palestre','Rileggi preferenza'])assert.ok(shell.includes(key),key)
 assert.match(shell,/!mayWriteLive\(\)/)
 assert.match(shell,/window\.confirm/)
 assert.match(shell,/openSupport/)
})
test('real totals never count partial commercial lists as global Stripe payments',()=>{
 assert.match(overview, /props\.counts\?\.gyms/)
 assert.match(overview, /props\.counts\?\.tickets/)
 assert.match(overview, /props\.loaded/)
 assert.match(overview, /Fonte: Firestore/)
 assert.match(overview, /Incassi reali: —/)
 assert.match(overview, /non un pagamento Stripe verificato/)
 assert.doesNotMatch(overview,/\bMRR\s*[:=]\s*\{\{/)
})
test('service status checks explicitly distinguish verified, failed and unmonitored',()=>{
 for(const key of ['verified','failed','unknown','Verifica riuscita','Lettura fallita','Non monitorato'])assert.ok(services.includes(key),key)
 assert.match(services,/props\.firestoreError\?'failed'/)
 assert.match(services,/props\.firestoreVerifiedAt\?'verified'/)
 assert.match(services,/getCountFromServer/)
 assert.match(services,/non prova uptime di Firebase Auth/)
 assert.match(services,/Cloud Functions e scheduler/)
 assert.match(services,/Email Resend \/ inviti/)
 assert.match(services,/Costi e budget cloud/)
})
test('all four future modules communicate their unavailable state explicitly',()=>{
 for(const key of ['subscriptions','usage','security','config','Non collegato','da integrare','non sono abilitati'])assert.ok(roadmap.includes(key),key)
 assert.doesNotMatch(roadmap,/(?:setDoc|addDoc|deleteDoc|updateDoc|httpsCallable)\s*\(/)
})
test('last successful server reads are timestamped and failures remain visible',()=>{
 assert.match(shell,/lastPlatformVerifiedAt\.value=Date\.now\(\)/)
 assert.match(shell,/lastPlatformError\.value='La lettura Firestore dei conteggi è fallita\.'/)
 assert.match(shell,/lastAccessVerifiedAt\.value=Date\.now\(\)/)
 assert.match(shell,/lastPlatformVerifiedAt\.value=null;lastAccessVerifiedAt\.value=null/)
})
test('Vue SFC script TypeScript and CSS parse without syntax diagnostics when local compilers exist',()=>{
 let ts,postcss
 try{const require=createRequire(import.meta.url);ts=require('typescript');postcss=require('postcss')}catch{ /* additional full typecheck is required separately */ }
 for(const [name,content] of [['PlatformAdmin',shell],['PlatformExecutiveOverview',overview],['PlatformServicesStatus',services],['PlatformControlRoadmap',roadmap]]){
  const src=content.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(src,`${name} missing script setup`)
  assert.ok(content.includes('<template>')&&content.includes('</template>'),`${name} missing template`)
  if(ts){const out=ts.transpileModule(src,{fileName:name+'.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});assert.deepEqual((out.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')),[])}
  if(postcss)for(const m of content.matchAll(/<style scoped>([\s\S]*?)<\/style>/g))assert.ok(postcss.parse(m[1]))
 }
})
