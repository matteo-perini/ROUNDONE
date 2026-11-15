import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,serverTimestamp,writeBatch} from 'firebase/firestore'
const UID='bngmYLSrq5fTXlvxm62aAzGSoWJ3',EMAIL='lionfit.control@gmail.com'
const host=process.env.FIRESTORE_EMULATOR_HOST
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host||''))throw Error('Solo emulatore locale: eseguire npm test. Nessuna produzione.')
const env=await initializeTestEnvironment({projectId:'demo-lionfit-control19b',firestore:{rules:readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')}})
const token={email:EMAIL,email_verified:true,lionfitSuperAdmin:true}
const get=(d,...path)=>getDoc(doc(d,...path))
const db=(id,claims={})=>env.authenticatedContext(id,claims).firestore()
try{
 await env.clearFirestore()
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore(); const data={
 'gyms/gym_a':{name:'A',ownerUid:'coachA'},'gyms/gym_b':{name:'B',ownerUid:'coachB'},
 'users/coachA':{name:'Coach',email:'coach@example.com',gymId:'gym_a',role:'admin',coachRole:'owner'},
 'users/athleteA':{name:'Atleta',email:'athlete@example.com',gymId:'gym_a',role:'athlete'},
 'gyms/gym_a/progress/athleteA/sessions/session1':{athleteId:'athleteA'},
 'gyms/gym_a/athlete_programs/athleteA':{private:true},
 'gyms/gym_a/identity/appearance':{logo:'',cover:''},
 'support_tickets/ticket1':{requesterId:'athleteA',gymId:'gym_a',status:'open'},
 'billing_sandbox_private/gym_a':{secret:'demo'},'lf_calendar_links/test':{secret:'demo'},'lf_push_devices/test':{secret:'demo'}
 };await Promise.all(Object.entries(data).map(([path,v])=>setDoc(doc(d,path),v)))})
 await test('verified dedicated Control can list gyms, manage tickets and exemptions',async()=>{
  const d=db(UID,token);assert.equal((await assertSucceeds(getDocs(collection(d,'gyms')))).size,2)
  await assertSucceeds(get(d,'support_tickets','ticket1'))
  await assertSucceeds(updateDoc(doc(d,'support_tickets','ticket1'),{status:'working',updatedAt:serverTimestamp()}))
  await assertSucceeds(setDoc(doc(d,'support_tickets','ticket1','replies','reply1'),{author:'platform',message:'Risposta di test',createdAt:serverTimestamp()}))
  await assertSucceeds(setDoc(doc(d,'platform_billing','gym_a'),{exempt:true,updatedAt:serverTimestamp()}))
 })
 await test('wrong UID, missing claim, wrong email or unverified email are denied',async()=>{
  for(const [id,claims] of [['wrong',token],[UID,{...token,lionfitSuperAdmin:false}],[UID,{...token,email_verified:false}],[UID,{...token,email:'other@example.com'}],['coachA',{email_verified:true}],['athleteA',{email_verified:true}]]){const d=db(id,claims);await assertFails(getDocs(collection(d,'gyms')));await assertFails(setDoc(doc(d,'platform_billing','gym_b'),{exempt:true,updatedAt:serverTimestamp()}))}
 })
 await test('Control cannot read athlete data, private backend or create a gym profile',async()=>{
  const d=db(UID,token)
  for(const path of ['users/athleteA','gyms/gym_a/progress/athleteA/sessions/session1','gyms/gym_a/athlete_programs/athleteA','gyms/gym_a/identity/appearance','billing_sandbox_private/gym_a','lf_calendar_links/test','lf_push_devices/test'])await assertFails(getDoc(doc(d,path)))
  const b=writeBatch(d);b.set(doc(d,'gyms','gym_'+UID),{name:'Forbidden',ownerUid:UID,createdAt:serverTimestamp()});b.set(doc(d,'users',UID),{name:'Forbidden',email:EMAIL,role:'admin',coachRole:'owner',gymId:'gym_'+UID,gymName:'Forbidden'});await assertFails(b.commit())
 })
 await test('ordinary gym users retain existing tenant access and signup',async()=>{
  const a=db('athleteA',{email:'athlete@example.com',email_verified:true});await assertSucceeds(get(a,'gyms','gym_a'));await assertFails(get(a,'gyms','gym_b'));await assertSucceeds(get(a,'gyms','gym_a','progress','athleteA','sessions','session1'))
  const c=db('coachA',{email:'coach@example.com',email_verified:true});await assertSucceeds(get(c,'users','athleteA'));await assertFails(get(c,'gyms','gym_b'))
  const n=db('newowner',{email:'new@example.com',email_verified:true}),b=writeBatch(n);b.set(doc(n,'gyms','gym_newowner'),{name:'New',ownerUid:'newowner',createdAt:serverTimestamp()});b.set(doc(n,'users','newowner'),{name:'New',email:'new@example.com',role:'admin',coachRole:'owner',gymId:'gym_newowner',gymName:'New'});await assertSucceeds(b.commit())
 })
}finally{await env.cleanup()}
