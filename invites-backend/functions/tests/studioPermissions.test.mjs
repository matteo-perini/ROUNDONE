import test from 'node:test'
import assert from 'node:assert/strict'
import {studioRole,validatedEditors,readEditors,studioConfigPath,studioEditorsPath,studioModelPath} from '../studioPermissions.mjs'
const gymId='gym_a',uid='owner_a',gym={ownerUid:uid}
const owner={role:'admin',gymId,coachRole:'owner',membershipStatus:'active'}
const coach={role:'admin',gymId,coachRole:'collaborator',membershipStatus:'active'}
test('owner of each gym can manage only that gym Email Studio',()=>{
 assert.equal(studioRole({uid,gymId,profile:owner,gym}),'owner')
 assert.equal(studioRole({uid,gymId:'gym_b',profile:owner,gym:{ownerUid:uid}}),null)
 assert.equal(studioRole({uid:'other_owner',gymId,profile:owner,gym}),null)
 assert.equal(studioRole({uid,gymId,profile:{...owner,membershipStatus:'revoked'},gym}),null)
 assert.equal(studioRole({uid,gymId,profile:{...owner,role:'atleta'},gym}),null)
})
test('collaborators cannot claim owner role, revoked and foreign coaches denied',()=>{
 assert.equal(studioRole({uid:'coach_a',gymId,profile:coach,gym}),'coach')
 assert.equal(studioRole({uid,gymId,profile:coach,gym}),null)
 assert.equal(studioRole({uid:'coach_b',gymId,profile:{...coach,gymId:'gym_b'},gym}),null)
 assert.equal(studioRole({uid:'coach_b',gymId,profile:{...coach,membershipStatus:'revoked'},gym}),null)
 assert.equal(studioRole({uid:'coach_b',gymId,profile:{...coach,coachRole:'owner'},gym}),null)
})
test('only validated unique bounded coach grants are stored or used',()=>{
 assert.deepEqual(validatedEditors(['coach_b','coach_a']),['coach_a','coach_b'])
 assert.deepEqual(readEditors(['coach_b','coach_a']),['coach_a','coach_b'])
 for(const invalid of [['coach_a','coach_a'],['/foreign'],[44],Array(61).fill('a'),null,'coach_a']){
  assert.throws(()=>validatedEditors(invalid))
  assert.deepEqual(readEditors(invalid),[])
 }
})
test('paths are anchored to gym and cannot be forged',()=>{
 assert.equal(studioConfigPath('gym_a'),'gyms/gym_a/invite_email_studio/config')
 assert.equal(studioEditorsPath('gym_b'),'gyms/gym_b/invite_email_studio/permissions')
 assert.equal(studioModelPath('gym_b','coach'),'gyms/gym_b/invite_email_studio/models_coach')
 assert.equal(studioModelPath('gym_b','athlete'),'gyms/gym_b/invite_email_studio/models_athlete')
 assert.throws(()=>studioModelPath('gym_b','admin'))
 for(const bad of ['../users','', 'a/b'])assert.throws(()=>studioEditorsPath(bad))
})
