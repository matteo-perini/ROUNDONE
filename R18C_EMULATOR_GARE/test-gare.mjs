import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,serverTimestamp,Timestamp} from 'firebase/firestore';
const projectId='demo-lionfit-r18c', port=8097;
const ga='gym_r18c_a',gb='gym_r18c_b';
const coach='coach_r18c_a', otherCoach='coach_r18c_b',a='athlete_r18c_a',b='athlete_r18c_b',other='athlete_r18c_c',revoked='coach_r18c_revoked';
const eid='E'.repeat(20);let env;
const competition=(gym)=>`gyms/${gym}/competitions/${eid}`;
const entry=(gym,athlete)=>`gyms/${gym}/competition_entries/${eid}_${athlete}`;
const auth=(uid)=>env.authenticatedContext(uid,{email:`${uid}@test.invalid`,email_verified:false}).firestore();
const event=()=>({title:'Gara demo',category:'combattimento',discipline:'MMA',location:'Palestra',notes:'',startAt:Timestamp.fromMillis(Date.now()+86400000),status:'published',createdBy:coach,createdAt:Timestamp.now(),updatedBy:coach,updatedAt:Timestamp.now()});
const invitation=(athlete)=>({eventId:eid,athleteId:athlete,status:'pending',result:'',createdAt:Timestamp.now(),updatedAt:Timestamp.now(),updatedBy:coach});
before(async()=>{
 const host=process.env.FIRESTORE_EMULATOR_HOST;
 if(!['127.0.0.1:8097','localhost:8097'].includes(host))throw Error('Per sicurezza avviare solo con emulators:exec su 8097');
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port,rules:readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,'gyms',ga),{name:'A',ownerUid:coach});
  await setDoc(doc(db,'gyms',gb),{name:'B',ownerUid:otherCoach});
  for(const p of [{id:coach,role:'admin',gymId:ga},{id:otherCoach,role:'admin',gymId:gb},{id:a,role:'athlete',gymId:ga},{id:b,role:'athlete',gymId:ga},{id:other,role:'athlete',gymId:gb},{id:revoked,role:'admin',gymId:ga,membershipStatus:'revoked'}]){
   await setDoc(doc(db,'users',p.id),{role:p.role,gymId:p.gymId,membershipStatus:p.membershipStatus||'active'});
  }
  await setDoc(doc(db,`gyms/${ga}/agenda_config/competitions`),{enabled:true,updatedAt:Timestamp.now(),updatedBy:coach});
  await setDoc(doc(db,`gyms/${gb}/agenda_config/competitions`),{enabled:true,updatedAt:Timestamp.now(),updatedBy:otherCoach});
  await setDoc(doc(db,competition(ga)),event());
  await setDoc(doc(db,entry(ga,a)),invitation(a));
 });
});
after(async()=>await env?.cleanup());
test('01 atleta invitato legge proprio invito',async()=>{const s=await assertSucceeds(getDoc(doc(auth(a),entry(ga,a))));assert.ok(s.exists());});
test('02 atleta non invitato non legge invito altrui',async()=>await assertFails(getDoc(doc(auth(b),entry(ga,a)))));
test('03 coach stessa palestra legge invito',async()=>await assertSucceeds(getDoc(doc(auth(coach),entry(ga,a)))));
test('04 coach di altra palestra non legge invito',async()=>await assertFails(getDoc(doc(auth(otherCoach),entry(ga,a)))));
test('05 account revocato non legge invito',async()=>await assertFails(getDoc(doc(auth(revoked),entry(ga,a)))));
test('06 anonimato non legge invito',async()=>await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),entry(ga,a)))));
test('07 atleta non puo approvare direttamente invito (deve passare da callable)',async()=>await assertFails(updateDoc(doc(auth(a),entry(ga,a)),{status:'approved',updatedAt:serverTimestamp(),updatedBy:a})));
test('08 atleta non invitato puo chiedere volontariamente partecipazione',async()=>await assertSucceeds(setDoc(doc(auth(b),entry(ga,b)),{eventId:eid,athleteId:b,status:'pending',result:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:b})));
test('09 atleta di altra palestra non puo chiedere partecipazione in palestra A',async()=>await assertFails(setDoc(doc(auth(other),entry(ga,other)),{eventId:eid,athleteId:other,status:'pending',result:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:other})));
test('10 atleta della stessa palestra puo leggere gara pubblicata',async()=>await assertSucceeds(getDoc(doc(auth(b),competition(ga)))));
test('11 atleta di altra palestra non legge gara',async()=>await assertFails(getDoc(doc(auth(other),competition(ga)))));
test('12 atleta non puo creare nuove gare',async()=>await assertFails(setDoc(doc(auth(b),`gyms/${ga}/competitions/${'F'.repeat(20)}`),{...event(),createdBy:b,updatedBy:b,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})));
