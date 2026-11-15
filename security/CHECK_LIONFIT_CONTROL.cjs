// Read-only check. No role changes, no service account keys required.
const {createRequire}=require('node:module');const path=require('node:path');
if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Disattivare le variabili emulator prima della verifica del progetto reale.');
const fromBackend=createRequire(path.resolve(__dirname,'../calendar-backend/functions/package.json'));
const {initializeApp,applicationDefault}=fromBackend('firebase-admin/app');
const {getAuth}=fromBackend('firebase-admin/auth');const {getFirestore}=fromBackend('firebase-admin/firestore');
const uid='bngmYLSrq5fTXlvxm62aAzGSoWJ3',email='lionfit.control@gmail.com',projectId='app-palestra-b0b9d';
(async()=>{const app=initializeApp({credential:applicationDefault(),projectId});const u=await getAuth(app).getUser(uid);if(u.email!==email||!u.emailVerified||u.disabled)throw Error('UID/email non corrispondenti, email non verificata o utente disattivato.');const p=await getFirestore(app).collection('users').doc(uid).get();if(p.exists)throw Error('Account Control non separato: profilo palestra presente. Non procedere.');console.log('OK: account dedicato verificato, nessun profilo palestra. Claim Super Admin: '+(u.customClaims?.lionfitSuperAdmin===true?'presente':'assente'));console.log('Verifica in sola lettura, nessuna modifica.');})().catch(e=>{console.error(e.message);process.exitCode=1});
