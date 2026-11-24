import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
const read=p=>readFileSync(p,'utf8')
const preview=read('src/features/chat/chatPreview.ts')
const app=read('src/App.vue')
const router=read('src/router/index.ts')
const backend=read('chat-backend/functions/index.mjs')
const policy=read('chat-backend/functions/rolloutPolicy.mjs')
const source=preview.replaceAll('import.meta.env','env').replace('export const CHAT_PREVIEW_ENABLED','const CHAT_PREVIEW_ENABLED')+'\nCHAT_PREVIEW_ENABLED'
const enabled=env=>runInNewContext(source,{env})
test('LIVE pilot flag enables route/UI eligibility only for reviewed build',()=>{
 assert.equal(enabled({DEV:false,MODE:'production',VITE_LIONFIT_CHAT_BETA:'LIVE_PILOT_REVIEWED'}),true)
})
test('ordinary LIVE build without flag stays hidden',()=>{
 assert.equal(enabled({DEV:false,MODE:'production'}),false)
 assert.equal(enabled({DEV:false,MODE:'production',VITE_LIONFIT_CHAT_BETA:'ON'}),false)
})
test('staging opt-in and existing local DEV preview are preserved',()=>{
 assert.equal(enabled({DEV:false,MODE:'staging',VITE_LIONFIT_CHAT_PREVIEW:'ON'}),true)
 assert.equal(enabled({DEV:false,MODE:'staging'}),false)
 assert.equal(enabled({DEV:true,MODE:'production'}),true)
})
test('LIVE pilot UI remains additionally gated by server eligibility',()=>{
 assert.match(app,/chatPreviewEnabled=computed\(\(\)=>CHAT_PREVIEW_ENABLED&&\(!CHAT_PILOT_ENABLED\|\|chatPilotAllowed.value\)\)/)
 assert.match(app,/chatPilotStatus\(uid\)/)
 assert.match(router,/if\(!CHAT_PREVIEW_ENABLED && \['\/messaggi','\/coach\/messaggi'\]\.includes\(to\.path\)\)/)
})
test('backend still limits pilot to a specific gym and pair',()=>{
 assert.match(backend,/readChatRollout\(process.env,pid\)/)
 assert.match(policy,/LF_CHAT_PILOT_GYM_ID/)
 assert.match(policy,/pair.coachUid===env.LF_CHAT_PILOT_COACH_UID/)
 assert.match(policy,/pair.athleteUid===env.LF_CHAT_PILOT_ATHLETE_UID/)
 assert.match(policy,/LF_CHAT_ENABLED/)
})
