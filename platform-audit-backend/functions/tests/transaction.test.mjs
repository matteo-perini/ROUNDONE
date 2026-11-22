import test from 'node:test'
import assert from 'node:assert/strict'
import {applyExemptionTransaction} from '../transaction.mjs'
const actorUid='bngmYLSrq5fTXlvxm62aAzGSoWJ3'
function fake({gymExists=true,exists=true,before=false,fail=false}={}){
 const actions=[]
 const database={doc:path=>({path}),collection:path=>({doc:()=>({id:'audit123456789abcdef',path:path+'/audit123456789abcdef'})}),runTransaction:async fn=>fn({
  get:async ref=>{if(ref.path==='gyms/gym_test')return {exists:gymExists};return {exists,data:()=>({exempt:before})}},
  set:(...args)=>{if(fail)throw new Error('SIMULATED_FAILURE');actions.push({kind:'set',args})},
  create:(...args)=>{actions.push({kind:'create',args})}
 })}
 return {database,actions}
}
const run=({database},exempt)=>applyExemptionTransaction({database,gymId:'gym_test',exempt,actorUid,serverTimestamp:()=>({server:true})})
test('exemption change creates one state write and one immutable audit event in same transaction',async()=>{
 const f=fake();assert.deepEqual(await run(f,true),{changed:true,exempt:true,auditId:'audit123456789abcdef'})
 assert.deepEqual(f.actions.map(x=>x.kind),['set','create'])
 assert.equal(f.actions[0].args[0].path,'platform_billing/gym_test')
 assert.equal(f.actions[1].args[0].path,'platform_audit/audit123456789abcdef')
 assert.equal(f.actions[1].args[1].afterExempt,true)
 assert.equal(f.actions[1].args[1].beforeExempt,false)
})
test('identical preference returns unchanged, no audit noise',async()=>{
 const f=fake({before:true});assert.deepEqual(await run(f,true),{changed:false,exempt:true,auditId:null});assert.equal(f.actions.length,0)
})
test('unconfigured billing has a null before-state',async()=>{
 const f=fake({exists:false});await run(f,false);assert.equal(f.actions[1].args[1].beforeExempt,null)
})
test('missing gym denies changes before writes',async()=>{
 const f=fake({gymExists:false});await assert.rejects(run(f,true),/GYM_NOT_FOUND/);assert.equal(f.actions.length,0)
})
test('transactional write failure cannot leave standalone audit entry',async()=>{
 const f=fake({fail:true});await assert.rejects(run(f,true),/SIMULATED_FAILURE/);assert.equal(f.actions.length,0)
})
