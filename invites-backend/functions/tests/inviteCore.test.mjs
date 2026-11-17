import test from 'node:test'
import assert from 'node:assert/strict'
import {validateRequest,normalizeEmail,safeName,htmlEscape,makeInviteUrl,makeInviteEmail,idempotencyKey,canSendInvite,quotaPermits} from '../inviteCore.mjs'
const token='a'.repeat(48),gymId='gym_abc',uid='owner_123',now=Date.now()
const i={gymId,kind:'coach',token,recipient:'USER@EXAMPLE.COM'}
test('normalized request: only known fields and safe token',()=>{
 assert.deepEqual(validateRequest(i),{...i,recipient:'user@example.com'})
 assert.throws(()=>validateRequest({...i,extra:'evil'}))
 assert.throws(()=>validateRequest({...i,token:'invalid'}))
 assert.throws(()=>validateRequest({...i,gymId:'gym_a/b'}))
 assert.throws(()=>validateRequest({...i,kind:'admin'}))
})
test('email validation strips whitespace and rejects injected headers',()=>{
 assert.equal(normalizeEmail('  HELLO@Example.COM '),'hello@example.com')
 for(const s of ['h@x.com\r\nBcc:evil@x.com','fake','<x@y.com>','x@y'])assert.throws(()=>normalizeEmail(s))
})
test('only secure admin-controlled base',()=>{
 assert.match(makeInviteUrl('https://www.lionfit.it',gymId,'coach',token),/coachInvite=a{48}/)
 assert.match(makeInviteUrl('https://www.lionfit.it',gymId,'athlete',token),/athleteInvite=a{48}/)
 for(const b of ['http://evil.com','https://evil.com/path','https://user:pass@evil.com','https://evil.com:444',''])assert.throws(()=>makeInviteUrl(b,gymId,'athlete',token))
})
test('gym name is escaped in HTML/from and text preserves all three old links',()=>{
 const m=makeInviteEmail({gymName:'<script>alert(1)</script>\r\nBcc: attacker',kind:'athlete',inviteUrl:makeInviteUrl('https://www.lionfit.it',gymId,'athlete',token)})
 assert.ok(!m.html.includes('<script>'))
 assert.ok(!m.name.includes('<'))
 assert.match(m.html,/Scarica per Android/)
 assert.match(m.html,/Guida iPhone/)
 assert.match(m.html,/Registrati/)
 assert.match(htmlEscape('<&"'),/&lt;&amp;&quot;/)
})
test('idempotency is stable for same token and unique across gyms/kinds',()=>{
 const x=idempotencyKey(i)
 assert.equal(x,idempotencyKey({...i,recipient:'another@example.com'}))
 assert.notEqual(x,idempotencyKey({...i,gymId:'gym_xyz'}))
 assert.notEqual(x,idempotencyKey({...i,kind:'athlete'}))
})
test('must be verified active admin and original invitation creator',()=>{
 const profile={role:'admin',coachRole:'owner',gymId,membershipStatus:'active'}
 const gym={gymId,ownerUid:uid}
 const invite={gymId,status:'pending',createdBy:uid,expiresAt:now+100000,email:'user@example.com'}
 const base={uid,profile,gym,invite,kind:'coach',recipient:'user@example.com',now,emailVerified:true}
 assert.equal(canSendInvite(base),true)
 for(const change of [{emailVerified:false},{uid:'foreign'},{profile:{...profile,gymId:'other'}},{profile:{...profile,role:'athlete'}},{profile:{...profile,membershipStatus:'revoked'}},{invite:{...invite,status:'claimed'}},{invite:{...invite,expiresAt:now-1}},{recipient:'attacker@ex.com'}]){
  assert.equal(canSendInvite({...base,...change}),false,JSON.stringify(change))
 }
})
test('active collaborator may invite athletes but never coaches',()=>{
 const profile={role:'admin',coachRole:'collaborator',gymId,membershipStatus:'active'}
 const gym={gymId,ownerUid:'another-owner'},invite={gymId,status:'pending',createdBy:uid,expiresAt:now+2000}
 const base={uid,profile,gym,invite,recipient:'u@x.com',now,emailVerified:true}
 assert.equal(canSendInvite({...base,kind:'athlete'}),true)
 assert.equal(canSendInvite({...base,kind:'coach'}),false)
})
test('quota applies to tenant and creator',()=>{
 assert.equal(quotaPermits(0,0),true)
 assert.equal(quotaPermits(49,14),true)
 assert.equal(quotaPermits(50,0),false)
 assert.equal(quotaPermits(0,15),false)
 assert.equal(quotaPermits(-1,0),false)
})
