import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {isControlIdentity,isVerifiedControl,CONTROL_UID} from '../src/features/platform/controlAccess.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const claim={lionfitSuperAdmin:true,email_verified:true}
test('only exact UID plus verified boolean claim is accepted',()=>{
 assert.equal(isVerifiedControl(CONTROL_UID,claim),true)
 for(const uid of [null,undefined,'unrelated-uid',CONTROL_UID.toLowerCase()])assert.equal(isVerifiedControl(uid,claim),false)
 for(const c of [{},{lionfitSuperAdmin:true},{lionfitSuperAdmin:'true',email_verified:true},{lionfitSuperAdmin:true,email_verified:false},{role:'admin',email_verified:true}])assert.equal(isVerifiedControl(CONTROL_UID,c),false)
 assert.equal(isControlIdentity(CONTROL_UID),true)
})
test('published rules are preserved except three exact targeted changes',()=>{
 const candidate=read('security/LIONFIT-FIRESTORE-PATCH19B-CANDIDATA.rules'),original=read('security/LIONFIT-FIRESTORE-PRE-PATCH19B-BACKUP.rules')
 const replacement=`function lfControlUid() { return signed() && uid() == '${CONTROL_UID}'; }\n    function lfPlatformAdmin() { return lfControlUid() && verified() && request.auth.token.email == 'lionfit.control@gmail.com' && request.auth.token.get('lionfitSuperAdmin',false) == true; }`
 assert.ok(candidate.includes(replacement));assert.equal(candidate.replace(replacement,"function lfPlatformAdmin() { return verified() && request.auth.token.get('lionfitSuperAdmin',false) == true; }").replace('if !lfControlUid() && isSelf(userId)','if isSelf(userId)').replace("if signed() && !lfControlUid() && gymId == 'gym_' + uid()","if signed() && gymId == 'gym_' + uid()"),original)
})
test('login and routing check Control before the tenant profile lookup; no tenant role is fabricated',()=>{
 const session=read('src/integrations/firebase/stagingSession.ts'),router=read('src/router/index.ts'),login=read('src/views/StagingAccess.vue'),auth=read('src/integrations/firebase/platformAccess.ts'),page=read('src/views/PlatformAdmin.vue')
 assert.ok(router.indexOf('if(await isCurrentControlAccount())')<router.indexOf('await readNavigationSession()'))
 assert.ok(session.indexOf('if(await isCurrentControlAccount())')<session.indexOf("doc(db,'users',user.uid)"))
 assert.match(session,/await setPersistence\(auth,browserSessionPersistence\)/)
 assert.match(login,/s.role==='platform'\?'\/lionfit-control'/)
 assert.match(auth,/isVerifiedControl\(u.uid,t.claims\)/)
 assert.match(page,/onIdTokenChanged/);assert.match(page,/await signOut\(/)
})
