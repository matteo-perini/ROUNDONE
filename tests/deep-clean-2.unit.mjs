import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,copyFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import ts from 'typescript'
import {belongsToCoach,coachMembership} from '../src/features/athletes/coachMembership.ts'
import {resolveLegacyGymRole} from '../src/features/auth/legacyRole.ts'
const root=fileURLToPath(new URL('..',import.meta.url))
const read=p=>readFileSync(join(root,p),'utf8')
// Execute the actual roster projection, resolving its one runtime TS dependency.
const m={exports:{}}
const compiled=ts.transpileModule(read('src/features/athletes/liveCoachRoster.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',compiled)(id=>{assert.equal(id,'./coachMembership');return {coachMembership}},m,m.exports)
const {labCoachRoster,maySelectLabAthlete}=m.exports
const athlete=(id,gymId,extra={})=>({id,data:{gymId,role:'athlete',name:id,...extra}})
test('roster includes legacy and other coach in same gym, rejects outside profiles and invalid IDs',()=>{
 const docs=[athlete('own','gym1',{primaryCoachUid:'coachA'}),athlete('other','gym1',{primaryCoachUid:'coachB'}),athlete('legacy','gym1'),athlete('outside','gym2'),athlete('bad/id','gym1'),athlete('admin','gym1',{role:'admin'})]
 const roster=labCoachRoster(docs,'gym1'); assert.deepEqual(roster.map(a=>a.id).sort(),['legacy','other','own'])
 assert.deepEqual(roster.filter(a=>belongsToCoach(a,'coachA','miei')).map(a=>a.id),['own']);assert.equal(roster.filter(a=>belongsToCoach(a,'coachA','tutti')).length,3)
 for(const id of ['legacy','other','own'])assert.equal(maySelectLabAthlete(roster,'gym1',id),true)
 assert.equal(maySelectLabAthlete(roster,'gym2','own'),false);assert.equal(maySelectLabAthlete(roster,'gym1','outside'),false)
 for(const id of ['','demo-x','bad/id'])assert.throws(()=>labCoachRoster(docs,id))
})
test('legacy owner and active coach role resolution rejects revoked and conflicting roles',()=>{
 const gym={ownerUid:'owner'}
 assert.equal(resolveLegacyGymRole('owner',{role:'admin'},gym),'titolare')
 assert.equal(resolveLegacyGymRole('coach',{role:'admin'},gym),'collaboratore')
 assert.equal(resolveLegacyGymRole('coach',{role:'admin',coachRole:'collaborator',membershipStatus:'active'},gym),'collaboratore')
 for(const p of [{role:'admin',membershipStatus:'revoked'},{role:'admin',coachRole:'owner'},{role:'admin',membershipStatus:'pending'}])assert.throws(()=>resolveLegacyGymRole('coach',p,gym))
 assert.throws(()=>resolveLegacyGymRole('owner',{role:'admin'},{}))
})
test('static compat check rejects removed gym scope in every one of five screens/models',()=>{
 const sandbox=mkdtempSync(join(tmpdir(),'lionfit-compat-'))
 const files=['scripts/check-live-compat.mjs','src/views/DevCoachDashboard.vue','src/views/LiveCoachAthletes.vue','src/views/LiveCoachTemplates.vue','src/views/LiveCoachTrash.vue','src/features/profile/coachMetrics.ts','src/views/DevProfileWorkspace.vue','src/features/athletes/liveCoachRoster.ts','src/features/athletes/coachMembership.ts','src/integrations/firebase/stagingSession.ts','src/features/auth/legacyRole.ts','src/views/StagingAccess.vue','src/integrations/firebase/stagingConfig.ts','src/views/LiveCoachStaff.vue','security/step3s2-prod-proposed-FIRESTORE-NON-PUBBLICARE.rules','security/step3s2-prod-proposed-STORAGE-NON-PUBBLICARE.rules','public/CNAME','public/www/index.html','public/404.html','android/app/build.gradle','.gitignore']
 try{
  for(const file of files){mkdirSync(dirname(join(sandbox,file)),{recursive:true});copyFileSync(join(root,file),join(sandbox,file))}
  const check=()=>spawnSync(process.execPath,[join(sandbox,files[0])],{encoding:'utf8'})
  assert.equal(check().status,0)
  for(const file of files.slice(1,6)){
   const original=read(file),changed=original.replace(/where\('gymId','==',(s\.gymId|verified\.gymId|gymId)\),where\('role','==','athlete'\)/g,"where('role','==','athlete')")
   assert.notEqual(changed,original);writeFileSync(join(sandbox,file),changed)
   const out=check();assert.equal(out.status,1,file);assert.match(out.stderr,/\[FAIL\]/)
   writeFileSync(join(sandbox,file),original)
  }
  assert.equal(check().status,0)
 }finally{rmSync(sandbox,{recursive:true,force:true})}
})
