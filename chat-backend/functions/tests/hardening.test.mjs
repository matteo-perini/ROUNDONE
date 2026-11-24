import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const backend=readFileSync(new URL('../index.mjs',import.meta.url),'utf8')
const policy=readFileSync(new URL('../rolloutPolicy.mjs',import.meta.url),'utf8')
const emulatorRules=readFileSync(new URL('../../emulator/firestore.rules',import.meta.url),'utf8')
function section(from,to){return backend.split(from)[1]?.split(to)[0]||''}
test('solo emulatore esplicito può usare un progetto demo',()=>{
 assert.match(backend,/process\.env\.FUNCTIONS_EMULATOR==='true'\s*&&\s*pid==='demo-lionfit-chat'/)
 assert.match(backend,/readChatRollout\(process.env,pid\)/)
 assert.match(policy,/LF_CHAT_ENABLED/)
 assert.match(policy,/LF_CHAT_PRODUCTION_ACK/)
})
test('apertura chat riverifica assegnazione e stato account nella transazione',()=>{
 const s=section('export const lfChatOpen=','export const lfChatList=')
 assert.match(s,/db\.runTransaction/)
 assert.match(s,/tx\.get\(user\(ctx\.a\.uid\)\)/)
 assert.match(s,/tx\.get\(user\(peerUid\)\)/)
 assert.match(s,/tx\.get\(db\.doc\(`gyms\/\$\{ctx\.a\.gymId\}`\)\)/)
 assert.match(s,/validActor\(/)
 assert.match(s,/pairFor\(/)
 assert.match(s,/threadIdFor\(pairNow\)!==id/)
})
test('lettura chat non azzera non letti se sono arrivati nuovi messaggi',()=>{
 const s=section('export const lfChatMarkRead=','NOT_A_REAL_SYMBOL')
 assert.match(s,/tx\.get\(user\(ctx\.a\.uid\)\)/)
 assert.match(s,/threadValid\(/)
 assert.match(s,/lastMessageAt\|\|0\)>seenAt\)return/)
})
test('snapshot Rules dell’utente: nessun accesso diretto client alle collezioni chat',()=>{
 assert.match(emulatorRules,/service cloud\.firestore/)
 assert.doesNotMatch(emulatorRules,/lf_private_chat_threads|lf_private_chat_inbox/)
 assert.doesNotMatch(emulatorRules,/match\s+\/\{document=\*\*\}/)
})
