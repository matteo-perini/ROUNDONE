import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const read=p=>readFileSync(resolve(process.cwd(),p),'utf8')

test('R21P: la shell Login resta montata durante la verifica Google',()=>{
 const app=read('src/App.vue')
 assert.match(app, /<template v-else-if="shownRole && route\.path!==\'\/accesso\'">/)
 assert.match(app, /<template v-else>.*?<header class="login-header/s)
})
test('R21P: controllo di identita e fallback non rimossi',()=>{
 const app=read('src/App.vue')
 assert.match(app,/onAuthStateChanged\(getStagingClients\(\)\.auth/)
 assert.match(app,/u\?\.uid!==old\.uid/)
 const session=read('src/integrations/firebase/stagingSession.ts')
 assert.match(session,/getDocFromServer\(doc\(db,'users',user\.uid\)\)/)
 assert.match(session,/getDocFromServer\(doc\(db,'gyms',gymId\)\)/)
 const router=read('src/router/index.ts')
 assert.match(router,/await readNavigationSession\(\)/)
})
test('R21P: il callback Google rimane responsabile della navigazione verificata',()=>{
 const google=read('src/components/GoogleExistingSigninButton.vue')
 const login=read('src/views/StagingAccess.vue')
 assert.match(google,/const s=await readStagingSession\(\)/)
 assert.match(google,/if\(!alive\)throw/)
 assert.match(google,/emit\('authenticated',s\.role\)/)
 assert.match(login,/@authenticated="googleLoginComplete"/)
 assert.match(login,/await router\.replace\(signedInDestination\(role\)\)/)
})
