import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const r=n=>readFileSync(resolve(root,'R17B_PAYLOAD',n),'utf8');
const old=r('MultiSportProgress.Originale.vue');
const now=r('MultiSportProgress.vue');
const ruleOld=r('R17B_FIRESTORE_RULES_BACKUP_ORIGINALI.rules');
const ruleNow=r('R17B_FIRESTORE_RULES_DA_TESTARE_NON_PUBBLICARE.rules');
const sha=s=>createHash('sha256').update(s).digest('hex');
test('file Vue originale e aggiornato esattamente identificati',()=>{
 assert.equal(sha(old),'83d94099cc7c6adbc0d76bfff88d3d872198355c9d7db90768bb305499daf04b');assert.equal(sha(now),'341eaa1dbc3b0ad6d86855d68bcf0ba19d57012daa257624f37ccc9c0748506d');
});
test('la verifica email non blocca ne e richiesta in Altri progressi',()=>{
 for(const banned of ['emailVerified','verificationNeeded','sendEmailVerification','getIdToken','requestVerification','reload(user)','Ho verificato l’email','Invia email di verifica']) assert.ok(!now.includes(banned),banned);
 assert.ok(now.includes("import {onAuthStateChanged} from 'firebase/auth'"));
});
test('il listener realtime e il controllo di sessione sono invariati',()=>{
 for(const f of ['watchMulti(','isConfirmedMulti(','confirmedMultiRows(','matchesMultiActor(','onAuthStateChanged(','cancelBinding()','const valid=()=>active&&token===generation','snapshot.pending','!snapshot.fromCache']) {
  assert.ok(now.includes(f),f);assert.ok(old.includes(f),f);
 }
 assert.equal(now.match(/watchMulti\(/g)?.length,1);
});
test('salvataggio, archivio e sicurezza autore preservati',()=>{
 for(const f of ['saveMulti(','archiveMulti(','r.createdBy===actor','mayWriteLive()','!pending.value','!busy.value','connection.value']) {assert.ok(now.includes(f),f);}
 assert.equal(now.match(/saveMulti\(/g)?.length,1);assert.equal(now.match(/archiveMulti\(/g)?.length,1);
});
test('grafici, storico, filtri e layout non eliminati',()=>{
 for(const f of ['tab===\'history\'','v-lf-motion-tabs','v-for="r in visible"','metricValue(','plotting','showArchived','Nuovo risultato','Carica altri risultati']){
  assert.ok(now.includes(f),f);
 }
 assert.equal((now.match(/<template>/g)||[]).length,(old.match(/<template>/g)||[]).length);
});
test('regole Firestore: esattamente una sostituzione mirata',()=>{
 const anchor='function allowedPerson() {\n            return verified() && !lfControlUid()';
 const replacement='function allowedPerson() {\n            return signed() && !lfControlUid()';
 assert.equal(ruleOld.split(anchor).length,2);assert.equal(ruleNow,ruleOld.replace(anchor,replacement));
});
test('le limitazioni su palestra e autore restano nelle regole',()=>{
 const start=ruleNow.indexOf('match /multisport_results/{resultId} {');
 const end=ruleNow.indexOf('match /sessions/{sessionId} {',start);
 const block=ruleNow.slice(start,end);
 for(const f of ['!lfControlUid()','coach(gymId)','uid() == athleteId && inGym(gymId)','activeTarget()','request.resource.data.createdBy == uid()','resource.data.createdBy == uid()','allow delete: if false;'])assert.ok(block.includes(f),f);
});
test('progressi normali: regole inalterate',()=>{
 const b='match /sessions/{sessionId} {';
 assert.equal(ruleNow.slice(ruleNow.indexOf(b)),ruleOld.slice(ruleOld.indexOf(b)));
 assert.ok(ruleNow.includes('uid() == athleteId'));
});
