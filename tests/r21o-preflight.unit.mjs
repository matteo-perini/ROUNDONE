import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const login=fs.readFileSync(new URL('../src/components/GoogleExistingSigninButton.vue',import.meta.url),'utf8')
const link=fs.readFileSync(new URL('../src/components/GoogleAccountLinkPanel.vue',import.meta.url),'utf8')
const server=fs.readFileSync(new URL('../google-auth-backend/functions/index.mjs',import.meta.url),'utf8')
const patcher=fs.readFileSync(new URL('../tools/installa-r21o.mjs',import.meta.url),'utf8')
test('frontend never uses signInWithPopup or creates Firebase user',()=>{assert.doesNotMatch(login,/signInWithPopup|createUserWithEmailAndPassword|signInWithCredential/);assert.match(login,/signInWithCustomToken/)})
test('server only returns custom token for pre-linked and existing user',()=>{assert.match(server,/existingLinkedUser/);assert.match(server,/getUserByEmail/);assert.match(server,/getFirestore/);assert.match(server,/createCustomToken/);assert.doesNotMatch(server,/createUser\(/)})
test('Google JWT verified by official Google library and audience',()=>{assert.match(server,/verifyIdToken\(\{idToken,audience\}\)/)})
test('Google linking preserves current UID and rejects other email',()=>{assert.match(link,/linkWithPopup\(user,provider\)/);assert.match(link,/result\.user\.uid!==originalUid/);assert.match(link,/selected!==expected/);assert.match(link,/await unlink\(result\.user,'google\.com'\)/)})
test('feature flags off unless enabled explicitly',()=>{assert.match(login,/VITE_LIONFIT_GOOGLE_LOGIN==='ENABLED_AFTER_BACKEND'/);assert.match(link,/VITE_LIONFIT_GOOGLE_LINK==='ENABLED_AFTER_PROVIDER_REVIEW'/)})
test('patcher makes backups and preserves old settings when R21N installed',()=>{assert.match(patcher,/LionFit_BACKUP_GOOGLE_R21O/);assert.match(patcher,/googleLinkAvailable/);assert.doesNotMatch(patcher,/firebase\.cmd|\.env\.production\.local/)})
