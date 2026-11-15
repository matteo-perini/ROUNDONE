// Local, interactive email verification only. No Admin SDK or Firestore writes.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { emitKeypressEvents } from 'node:readline';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
const email = 'lionfit.control@gmail.com';
const project = 'app-palestra-b0b9d';
function secretPrompt() {
  const input = process.stdin;
  if (!input.isTTY || !input.setRawMode) throw new Error('Avvia questo script da CMD, senza reindirizzare l’input.');
  process.stdout.write('Password Firebase di LionFit Control (digitazione nascosta): ');
  return new Promise((resolve, reject) => {
    let value = '';
    emitKeypressEvents(input);
    input.setRawMode(true); input.resume();
    function finish(error) {
      input.removeListener('keypress', onKey); input.setRawMode(false); input.pause(); process.stdout.write('\n');
      if (error) { value = ''; reject(error); } else { const result = value; value = ''; resolve(result); }
    }
    function onKey(str, key = {}) {
      if (key.ctrl && key.name === 'c') return finish(new Error('Operazione annullata.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { value = Array.from(value).slice(0, -1).join(''); return; }
      if (!key.ctrl && !key.meta && typeof str === 'string' && !/[\u0000-\u001f\u007f]/u.test(str)) value += str;
    }
    input.on('keypress', onKey);
  });
}
let app, auth;
try {
  const env = parseEnv(readFileSync('.env.production.local','utf8'));
  if (env.VITE_FIREBASE_PROJECT_ID !== project || !env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_APP_ID || ![`${project}.firebaseapp.com`, `${project}.web.app`].includes(env.VITE_FIREBASE_AUTH_DOMAIN)) throw new Error('Configurazione produzione non coerente. Nessuna operazione eseguita.');
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Disattiva la configurazione dell’emulatore prima di continuare.');
  app = initializeApp({projectId:project,apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,appId:env.VITE_FIREBASE_APP_ID},'lionfit-control-email-verification');
  auth = initializeAuth(app,{persistence:inMemoryPersistence}); auth.languageCode = 'it';
  console.log('Progetto: '+project+' | Account: '+email);
  let password = await secretPrompt();
  if (!password) throw new Error('Password mancante.');
  let user;
  try { user = (await signInWithEmailAndPassword(auth,email,password)).user; } finally { password = ''; }
  if (user.email?.toLowerCase() !== email) throw new Error('Account inatteso. Nessun invio effettuato.');
  if (user.emailVerified) { console.log('OK: email gia verificata.'); console.log('UID: '+user.uid); }
  else { await sendEmailVerification(user); console.log('OK: email di verifica inviata. Apri il link in Gmail; poi riesegui il comando.'); }
} catch (error) { console.error('Verifica non completata:', error?.code || error?.message || 'errore sconosciuto'); process.exitCode=1; }
finally { if(auth) await signOut(auth).catch(()=>{}); if(app) await deleteApp(app).catch(()=>{}); }
