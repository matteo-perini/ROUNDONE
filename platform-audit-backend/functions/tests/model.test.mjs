import test from 'node:test'
import assert from 'node:assert/strict'
import {CONTROL_UID,CONTROL_EMAIL,EVENT_KIND,assertPlatformActor,validatePreference,validateCursor,readExemption,auditPayload,serializeAudit} from '../model.mjs'
const token={email:CONTROL_EMAIL,email_verified:true,lionfitSuperAdmin:true}
test('exact verified owner identity required',()=>{
 assert.equal(assertPlatformActor({uid:CONTROL_UID,token}),CONTROL_UID)
 for(const x of [{uid:'other',token},{uid:CONTROL_UID,token:{...token,email:'else@example.com'}},{uid:CONTROL_UID,token:{...token,email_verified:false}},{uid:CONTROL_UID,token:{...token,lionfitSuperAdmin:false}},null,{}])assert.throws(()=>assertPlatformActor(x),/FORBIDDEN/)
})
test('commercial payload strictly validated',()=>{
 assert.deepEqual(validatePreference({gymId:'gym_17933212',exempt:true}),{gymId:'gym_17933212',exempt:true})
 for(const p of [{gymId:'gym_abc',exempt:'true'},{gymId:'other',exempt:true},{gymId:'gym_abc',exempt:true,uid:'spoof'},{gymId:'gym_abc'},null,[]])assert.throws(()=>validatePreference(p),/INVALID_ARGUMENT/)
})
test('audit cursor prevents arbitrary document paths and large offsets',()=>{
 assert.equal(validateCursor({}),null)
 assert.equal(validateCursor({cursor:'Abcdef1234567890'}),'Abcdef1234567890')
 for(const bad of [{cursor:'../users/athleteA'},{cursor:'A'},{cursor:'x'.repeat(90)},{cursor:99},{cursor:'validvalidvalid123',scope:'gyms'}])assert.throws(()=>validateCursor(bad),/INVALID_ARGUMENT/)
})
test('no photos or personal athlete fields in audit payload',()=>{
 const result=auditPayload('gym_abc',false,true,CONTROL_UID)
 assert.deepEqual(result,{kind:EVENT_KIND,targetType:'gym',gymId:'gym_abc',beforeExempt:false,afterExempt:true,actorUid:CONTROL_UID,schemaVersion:1})
 assert.deepEqual(readExemption({exempt:false}),false)
 assert.equal(readExemption({exempt:'false'}),null)
 assert.equal(readExemption(undefined),null)
})
test('audit serialization only releases known fields',()=>{
 const row=serializeAudit({id:'event_1',data:()=>({kind:EVENT_KIND,gymId:'gym_abc',beforeExempt:null,afterExempt:true,actorUid:CONTROL_UID,createdAt:{toMillis:()=>123},secret:'NO'})})
 assert.deepEqual(row,{id:'event_1',kind:EVENT_KIND,gymId:'gym_abc',beforeExempt:null,afterExempt:true,actorUid:CONTROL_UID,atMillis:123})
 assert.equal(serializeAudit({id:'e',data:()=>({kind:'unexpected'})}),null)
})
