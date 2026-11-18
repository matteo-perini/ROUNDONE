import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// TEST ISOLATO: solo Firebase Emulator (127.0.0.1:8089) e project demo.
const projectId = 'demo-lionfit-r17b';
const port = 8089;
const gymA = 'gym_r17b_demo_a';
const gymB = 'gym_r17b_demo_b';
const coachA = 'coach_r17b_a';
const athleteA = 'athlete_r17b_a';
const athleteB = 'athlete_r17b_b';
const coachB = 'coach_r17b_b';
const revoked = 'coach_r17b_revoked';
const controlMatch = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8')
  .match(/function lfControlUid\(\)\s*\{\s*return signed\(\)\s*&&\s*uid\(\)\s*==\s*'([^']+)'/);
assert.ok(controlMatch, 'Impossibile identificare il Control Center nelle regole');
const controlId = controlMatch[1];

const path = (gymId, athleteId, resultId) =>
  `gyms/${gymId}/progress/${athleteId}/multisport_results/${resultId}`;
const gymDocs = [
  {uid:coachA, role:'admin', gymId:gymA, membershipStatus:'active'},
  {uid:athleteA, role:'athlete', gymId:gymA, membershipStatus:'active'},
  {uid:athleteB, role:'athlete', gymId:gymA, membershipStatus:'active'},
  {uid:coachB, role:'admin', gymId:gymB, membershipStatus:'active'},
  {uid:revoked, role:'admin', gymId:gymA, membershipStatus:'revoked'},
  {uid:controlId, role:'admin', gymId:gymA, membershipStatus:'active'}
];
const rid = (c) => c.repeat(20);
const result = (athleteId, createdBy) => ({
  sport: 'custom', testName: 'Test forza', disciplineName: 'Pesi',
  kind: 'Test', style: '', performedOn: '2026-11-18', notes: 'Test R17B',
  customUnit: 'kg', direction: 'higher', archived: false,
  distanceM: null, poolM: null, durationSec: null, rounds: null,
  roundSec: null, restSec: null, hits: null, reps: null, loadKg: null,
  elevationM: null, watts: null, rpe: null, customValue: 90,
  athleteId, createdBy, updatedBy: createdBy,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
});
assert.equal(Object.keys(result(athleteA, coachA)).length, 28);

let env;
let db;
const ctx = (uid) => env.authenticatedContext(uid, {
  email: `${uid}@test.lionfit.invalid`, email_verified: false
}).firestore();

before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089' &&
      process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8089') {
    throw new Error('Avviare con firebase emulators:exec e porta 8089; BLOCCATO per sicurezza.');
  }
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1', port,
      rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8')
    }
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (admin) => {
    db = admin.firestore();
    await setDoc(doc(db, 'gyms', gymA), {name:'Palestra A', ownerUid:coachA});
    await setDoc(doc(db, 'gyms', gymB), {name:'Palestra B', ownerUid:coachB});
    for (const p of gymDocs) await setDoc(doc(db, 'users', p.uid), p);
    await setDoc(doc(db, path(gymA, athleteA, rid('c'))), result(athleteA, coachA));
    await setDoc(doc(db, path(gymA, athleteA, rid('a'))), result(athleteA, athleteA));
  });
});

after(async () => { await env?.cleanup(); });

test('01 · Atleta non verificato legge risultato del Coach (stessa palestra)', async () => {
  const snap = await assertSucceeds(getDoc(doc(ctx(athleteA), path(gymA, athleteA, rid('c')))));
  assert.ok(snap.exists());
});
test('02 · Coach non verificato legge risultato dell’Atleta (stessa palestra)', async () => {
  const snap = await assertSucceeds(getDoc(doc(ctx(coachA), path(gymA, athleteA, rid('a')))));
  assert.ok(snap.exists());
});
test('03 · Coach non verificato può creare Altri progressi per proprio atleta', async () => {
  await assertSucceeds(setDoc(doc(ctx(coachA), path(gymA, athleteA, rid('d'))), result(athleteA, coachA)));
});
test('04 · Atleta non verificato può creare Altri progressi personali', async () => {
  await assertSucceeds(setDoc(doc(ctx(athleteA), path(gymA, athleteA, rid('e'))), result(athleteA, athleteA)));
});
test('05 · Atleta non può modificare un risultato creato dal Coach', async () => {
  await assertFails(updateDoc(doc(ctx(athleteA), path(gymA, athleteA, rid('c'))),
    {notes:'Tentativo non autorizzato', updatedBy:athleteA, updatedAt:serverTimestamp()}));
});
test('06 · Coach non può modificare un risultato creato dall’Atleta', async () => {
  await assertFails(updateDoc(doc(ctx(coachA), path(gymA, athleteA, rid('a'))),
    {notes:'Tentativo non autorizzato', updatedBy:coachA, updatedAt:serverTimestamp()}));
});
test('07 · Un altro atleta della stessa palestra non può leggere risultati altrui', async () => {
  await assertFails(getDoc(doc(ctx(athleteB), path(gymA, athleteA, rid('a')))));
});
test('08 · Coach di un’altra palestra non può leggere risultati di palestra A', async () => {
  await assertFails(getDoc(doc(ctx(coachB), path(gymA, athleteA, rid('a')))));
});
test('09 · Account Coach revocato non può accedere', async () => {
  await assertFails(getDoc(doc(ctx(revoked), path(gymA, athleteA, rid('a')))));
});
test('10 · Control Center non può accedere ai risultati sportivi', async () => {
  await assertFails(getDoc(doc(ctx(controlId), path(gymA, athleteA, rid('a')))));
});
test('11 · Utente non autenticato non può leggere i risultati', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path(gymA, athleteA, rid('a')))));
});
const validSession = (createdBy) => ({
  schemaVersion: 1, athleteId: athleteA, sheetId: 'scheda_test',
  sheetTitle: 'Scheda demo', performedOn: '2026-11-18',
  createdBy, createdAt: serverTimestamp(),
  exercises: [{ name:'Squat', sets: [] }]
});

test('12 · Coach non può creare una sessione normale (anche se dati validi)', async () => {
  const coachDb = ctx(coachA);
  await assertFails(setDoc(doc(coachDb, `gyms/${gymA}/progress/${athleteA}/sessions/${rid('s')}`),
    validSession(coachA)));
});
test('13 · Atleta crea sessione normale e Coach può leggerla', async () => {
  const p = `gyms/${gymA}/progress/${athleteA}/sessions/${rid('n')}`;
  await assertSucceeds(setDoc(doc(ctx(athleteA), p), validSession(athleteA)));
  const snap = await assertSucceeds(getDoc(doc(ctx(coachA), p)));
  assert.ok(snap.exists());
});
