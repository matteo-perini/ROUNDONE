import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('motion instrumentation is dev only and no network calls',()=>{
 const file=read('src/features/performance/motionAudit.ts')
 assert.match(file,/import\.meta\.env\.DEV/)
 assert.doesNotMatch(file,/fetch\(|sendBeacon\(|XMLHttpRequest|httpsCallable/)
 assert.match(file,/long-animation-frame/)
 assert.match(file,/router\.beforeEach/)
 assert.match(file,/router\.afterEach/)
})
test('unread polling skips accounts outside pilot and stops on hidden tabs',()=>{
 const app=read('src/App.vue')
 assert.match(app,/!chatPilotAllowed\.value\|\|!isStagingMode/)
 assert.match(app,/watch\(\[\(\)=>accountKey\(stagingSession\.value\),chatPilotAllowed\]/)
 assert.match(app,/if\(document\.hidden\)return/)
 assert.match(app,/accountKey\(stagingSession\.value\)===key/)
})
test('chat poll throttled and refreshed on tab visibility',()=>{
 const chat=read('src/views/AthleteChatPreview.vue')
 assert.match(chat,/10000\)/)
 assert.match(chat,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/)
})
