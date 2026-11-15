// Real Firebase SDK, local Authentication emulator ONLY. Never use production credentials.
import test from 'node:test';import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword,updateCurrentUser,signOut} from 'firebase/auth';
const host=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId='demo-lionfit-linked';
if(!host||!/^127\.0\.0\.1:\d+$/.test(host))throw new Error('Avvia esclusivamente Firebase Auth Emulator in locale.');
test('SDK copies authenticated identities across named apps, switches twice, and clears backup sessions without deleting accounts',async()=>{
 const apps=[];const make=name=>{const app=initializeApp({apiKey:'fake-api-key',projectId,authDomain:projectId+'.firebaseapp.com'},name);apps.push(app);const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+host,{disableWarnings:true});return auth};
 const main=make('main'),coach=make('coach'),athlete=make('athlete');const suffix=Date.now();const pass='Test-only-1234!';
 try{const co=(await createUserWithEmailAndPassword(main,`coach${suffix}@example.invalid`,pass)).user;const at=(await createUserWithEmailAndPassword(athlete,`athlete${suffix}@example.invalid`,pass)).user;assert.notEqual(co.uid,at.uid);await updateCurrentUser(coach,main.currentUser);assert.equal(coach.currentUser.uid,co.uid);assert.equal(main.currentUser.uid,co.uid);await athlete.currentUser.getIdToken(true);await updateCurrentUser(main,athlete.currentUser);assert.equal(main.currentUser.uid,at.uid);assert.equal(coach.currentUser.uid,co.uid);await main.currentUser.getIdToken(true);await updateCurrentUser(athlete,main.currentUser);await updateCurrentUser(main,coach.currentUser);assert.equal(main.currentUser.uid,co.uid);await Promise.all([signOut(coach),signOut(athlete)]);assert.equal(coach.currentUser,null);assert.equal(athlete.currentUser,null);assert.equal(main.currentUser.uid,co.uid);await signOut(main);assert.equal(main.currentUser,null);assert.equal((await signInWithEmailAndPassword(main,co.email,pass)).user.uid,co.uid)}finally{await Promise.allSettled(apps.map(deleteApp))}
});
