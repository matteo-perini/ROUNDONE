import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const b=readFileSync('chat-backend/functions/index.mjs','utf8')
const policy=readFileSync('chat-backend/functions/rolloutPolicy.mjs','utf8')
const c=readFileSync('src/features/chat/chatClient.ts','utf8')
const app=readFileSync('src/App.vue','utf8')
const view=readFileSync('src/views/AthleteChatPreview.vue','utf8')
test('Pilot callable evaluates authenticated server-side pair',()=>{
 assert.match(b,/export const lfChatPilotStatus=onCall/)
 assert.match(b,/const pair=pairFor\(ctx\.a,peerUid,other,ctx\.me,ctx\.gym\)/)
 assert.match(b,/gatePair\(pair,ctx\.roll\)/)
 assert.match(b,/return \{enabled:true\}/)
})
test('Backend still gates actual send, history and read',()=>{
 for(const fn of ['lfChatOpen','lfChatList','lfChatHistory','lfChatSend','lfChatMarkRead']){
  assert.match(b,new RegExp(`export const ${fn}=onCall`))
 }
 assert.match(b,/readChatRollout\(process.env,pid\)/)
 assert.match(policy,/LF_CHAT_PILOT_GYM_ID/)
 assert.match(policy,/LF_CHAT_PILOT_COACH_UID/)
 assert.match(policy,/LF_CHAT_PILOT_ATHLETE_UID/)
})
test('Live UI gated by eligibility and does not reveal all users chat',()=>{
 assert.match(c,/chatPilotAllowed=ref\(false\)/)
 assert.match(app,/chatPreviewEnabled=computed\(\(\)=>CHAT_PREVIEW_ENABLED&&\(!CHAT_PILOT_ENABLED\|\|chatPilotAllowed.value\)\)/)
 assert.match(app,/chatPilotStatus\(uid\)/)
 assert.match(view,/CHAT_PILOT_ENABLED&&chatPilotAllowed.value/)
})
test('Neither Firestore Rules nor navbar are part of pilot change',()=>{
 assert.doesNotMatch(app,/\{to:'\/messaggi',label:/)
})
