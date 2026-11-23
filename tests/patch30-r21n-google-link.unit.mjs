import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
const google=readFileSync(new URL('../src/integrations/firebase/googleAccountLink.ts', import.meta.url),'utf8')
const settings=readFileSync(new URL('../src/views/Settings.vue',import.meta.url),'utf8')
const staging=readFileSync(new URL('../src/integrations/firebase/stagingSession.ts',import.meta.url),'utf8')
test('flag Google spento di default e distinto dall’audit',()=>{
 assert.match(google,/VITE_LIONFIT_GOOGLE_LINK==='ENABLED_AFTER_PROVIDER_REVIEW'/)
 assert.doesNotMatch(google,/VITE_LIONFIT_PLATFORM_AUDIT/)
})
test('collegamento usa linkWithPopup, mai creazione/swap utente',()=>{
 assert.match(google,/linkWithPopup\(user,provider\)/)
 assert.doesNotMatch(google,/\bsignInWithPopup\s*\(/)
 assert.doesNotMatch(google,/\bcreateUserWithEmailAndPassword\s*\(/)
 assert.doesNotMatch(google,/\bsignInWithCredential\s*\(/)
})
test('verifica sessione e UID prima e dopo link',()=>{
 assert.match(google,/user\.uid!==session\.uid/)
 assert.match(google,/result\.user\.uid!==expectedUid/)
 assert.match(google,/auth\.currentUser\?\.uid!==expectedUid/)
})
test('non collega credenziali ad un account diverso per email',()=>{
 assert.match(google,/googleEmail\.trim\(\)\.toLowerCase\(\)!==expectedEmail/)
 assert.match(google,/await unlink\(result\.user,GOOGLE_PROVIDER\)/)
})
test('richiede verifiche email e login recente, nessuna password nei file',()=>{
 assert.match(google,/user\.emailVerified/)
 assert.match(google,/RECENT_LOGIN_MS=10\*60\*1000/)
 assert.match(google,/sendEmailVerification\(user\)/)
 assert.doesNotMatch(google,/setDoc\(|updateDoc\(|addDoc\(|deleteDoc\(/)
})
test('Sicurezza mostra associazione solo se LIVE, senza nuovi menu',()=>{
 assert.match(settings,/googleLinkAvailable=computed\(\(\)=>googleLinkEnabled\(\)/)
 assert.match(settings,/canResetPassword\|\|googleLinkAvailable/)
 assert.match(settings,/Collega il mio account Google/)
 assert.match(settings,/Account Google/)
})
test('popup partito prima di un await async preflight',()=>{
 const f=google.split('export async function linkGoogleToExistingAccount()')[1].split('export function googleLinkErrorMessage')[0]
 assert.ok(f.indexOf('linkWithPopup(user,provider)')>0)
 assert.doesNotMatch(f.slice(0,f.indexOf('linkWithPopup(user,provider)')), /(?:^|\n)\s*(?:const|let|await)\s+[^\n]*await\s+[A-Za-z]/m)
})
test('non altera login/password e profili originali',()=>{
 assert.match(staging,/signInWithEmailAndPassword/)
 assert.doesNotMatch(google,/profilePath\(|\.collection\(|team_public|platform_billing/)
})
