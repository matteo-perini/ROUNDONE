// PATCH 24: test supplementare dei casi validi al limite, solo emulatore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Solo emulatore locale');
const projectId = 'demo-lionfit-patch24';
const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8') } });
const gymId = 'gym_limit', athleteId = 'ath_limit', sessionId = 'workout_limit';
const path = (db, col, id) => doc(db, 'gyms', gymId, 'progress', athleteId, col, id);
const sets = n => Array.from({ length: n }, (_, i) => ({ kg: 10, reps: 2, position: i + 1 }));
const exercise = (name, n) => ({ key: name, name, plannedSets: '30', plannedReps: '2', skipped: false, sets: sets(n) });
const next = { kg: 11, reps: 3 };
const missing = (position) => sets(30).filter(row => row.position !== position);
const withRows = (name, rows) => ({ ...exercise(name, 0), sets: rows });
const correction = (exerciseIndex, setIndex, previous) => ({ sessionId, exerciseIndex, setIndex, history: [], latest: { previous, next, author: athleteId, at: serverTimestamp() } });
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', athleteId), { gymId, role: 'athlete', membershipStatus: 'active' });
    await setDoc(doc(db, 'gyms', gymId), { name: 'Test', ownerUid: 'coach_limit' });
    await setDoc(path(db, 'sessions', sessionId), { schemaVersion: 1, athleteId, createdBy: athleteId, sheetId: 'sheet_limit', sheetTitle: 'Test', performedOn: '2026-11-15', createdAt: Timestamp.fromMillis(0), exercises: [exercise('Missing last', 29), exercise('Full', 30), withRows('Missing first', missing(1)), withRows('Missing middle', missing(15)), withRows('Unordered', [...sets(30)].reverse()), withRows('Legacy 29', sets(29).map(({ kg, reps }) => ({ kg, reps }))) ] });
  });
  const db = env.authenticatedContext(athleteId, { email: 'test@example.com', email_verified: true }).firestore();
  await test('valid last missing series after 29 explicit original series', async () => {
    const ref = path(db, 'session_corrections', `${sessionId}_0_59`);
    await assertSucceeds(setDoc(ref, correction(0, 59, { kg: null, reps: null })));
    assert.deepEqual((await getDoc(ref)).data().latest.next, next);
  });
  await test('valid correction of 30th original series', async () => {
    const ref = path(db, 'session_corrections', `${sessionId}_1_29`);
    await assertSucceeds(setDoc(ref, correction(1, 29, { kg: 10, reps: 2 })));
    assert.deepEqual((await getDoc(ref)).data().latest.next, next);
  });
  await test('missing first and middle ordinal among 29 originals; 29 legacy rows', async () => {
    for (const [ei, si] of [[2, 30], [3, 44], [5, 59]]) {
      const ref = path(db, 'session_corrections', `${sessionId}_${ei}_${si}`);
      await assertSucceeds(setDoc(ref, correction(ei, si, { kg: null, reps: null })));
      assert.deepEqual((await getDoc(ref)).data().latest.next, next);
    }
  });
  await test('reject occupied ordinal at first, middle and last array entries, even unordered', async () => {
    for (const [ei, si] of [[1, 30], [1, 44], [1, 59], [4, 30], [4, 45], [4, 59], [2, 59]]) {
      const ref = path(db, 'session_corrections', `${sessionId}_${ei}_${si}`);
      await assertFails(setDoc(ref, correction(ei, si, { kg: null, reps: null })));
      assert.equal((await getDoc(ref)).exists(), false);
    }
  });
} finally { await env.cleanup(); }
