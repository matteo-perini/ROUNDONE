import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(p)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
test('chat beta requires explicit opt-in, ordinary live remains preview-disabled',()=>{
 const flags=read('src/features/chat/chatClient.ts'),preview=read('src/features/chat/chatPreview.ts')
 assert.match(flags,/VITE_LIONFIT_CHAT_BETA==='LIVE_PILOT_REVIEWED'/)
 assert.match(flags,/VITE_LIONFIT_CHAT_BETA==='STAGING_REVIEWED'/)
 assert.match(preview,/VITE_LIONFIT_CHAT_BETA === 'LIVE_PILOT_REVIEWED'/)
})
test('private messages are accessed only through callables, not unrestricted direct firestore writes',()=>{
 const client=read('src/features/chat/chatClient.ts')
 assert.match(client,/httpsCallable/)
 assert.doesNotMatch(client,/\b(addDoc|setDoc|updateDoc|deleteDoc|onSnapshot)\s*\(/)
 const server=read('chat-backend/functions/index.mjs')
 const policy=read('chat-backend/functions/rolloutPolicy.mjs')
 assert.match(server,/readChatRollout\(process.env,pid\)/)
 assert.match(policy,/LF_CHAT_PRODUCTION_ACK/)
 assert.match(policy,/LF_CHAT_PILOT_COACH_UID/)
 assert.match(policy,/LF_CHAT_PILOT_ATHLETE_UID/)
 assert.match(server,/threadValid\(/)
 assert.match(server,/tx\.create\(m/)
 assert.match(server,/FieldValue\.increment\(1\)/)
})
test('app preserves chat swipe and screen, does not expand athlete dock',()=>{
 const app=read('src/App.vue'),view=read('src/views/AthleteChatPreview.vue')
 assert.match(app,/chatSwipeDestination/)
 assert.match(app,/chatUnreadCount/)
 assert.match(view,/lf-chat-mobile-back/)
 assert.match(view,/chatHistory/)
 assert.match(view,/chatMarkRead/)
})
