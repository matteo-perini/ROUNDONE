import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readChatRollout,allowedGym,allowedPair,PROD_PROJECT} from '../rolloutPolicy.mjs'
const coach='coach_test_123',athlete='athlete_test_456',gym='gym_coach_test_123',otherGym='gym_other_987'
const pilot={LF_CHAT_ENABLED:'true',LF_CHAT_PRODUCTION_ACK:'REVIEWED_PRIVATE_CHAT_PILOT',LF_CHAT_PILOT_GYM_ID:gym,LF_CHAT_PILOT_COACH_UID:coach,LF_CHAT_PILOT_ATHLETE_UID:athlete}
test('default pilot keeps old production restrictions',()=>{
 const r=readChatRollout(pilot,PROD_PROJECT); assert.equal(r.mode,'pilot');assert.equal(allowedGym(gym,r),true);assert.equal(allowedGym(otherGym,r),false)
 assert.equal(allowedPair({gymId:gym,coachUid:coach,athleteUid:athlete},r,pilot),true)
 assert.equal(allowedPair({gymId:gym,coachUid:'other_coach_789',athleteUid:athlete},r,pilot),false)
})
test('disabled, misconfigured or unknown modes fail closed',()=>{
 for(const patch of [{LF_CHAT_ENABLED:'false'},{LF_CHAT_ROLLOUT_MODE:'all'},{LF_CHAT_ROLLOUT_MODE:'allowlist'},{LF_CHAT_ROLLOUT_MODE:'unknown'}])
  assert.equal(readChatRollout({...pilot,...patch},PROD_PROJECT),null)
})
test('allowlist requires explicit acknowledgement and valid unique gym IDs',()=>{
 const env={...pilot,LF_CHAT_ROLLOUT_MODE:'allowlist',LF_CHAT_ALLOWED_GYM_IDS:[gym,otherGym].join(',')}
 assert.equal(readChatRollout(env,PROD_PROJECT),null)
 const enabled={...env,LF_CHAT_GENERAL_RELEASE_ACK:'REVIEWED_PRIVATE_CHAT_GENERAL_ROLLOUT'}
 const roll=readChatRollout(enabled,PROD_PROJECT)
 assert.equal(allowedGym(gym,roll),true);assert.equal(allowedGym(otherGym,roll),true);assert.equal(allowedGym('gym_unlisted_1',roll),false)
 assert.equal(allowedPair({gymId:otherGym,coachUid:'coach_else_123',athleteUid:'at_else_123'},roll,enabled),true)
 for(const ids of ['',gym+','+gym,'bad/gym',Array(21).fill('gym_valid_123').map((x,i)=>x+i).join(',')])
  assert.equal(readChatRollout({...enabled,LF_CHAT_ALLOWED_GYM_IDS:ids},PROD_PROJECT),null)
})
test('all rollout requires TWO deliberate acknowledgements in production',()=>{
 const env={...pilot,LF_CHAT_ROLLOUT_MODE:'all',LF_CHAT_GENERAL_RELEASE_ACK:'REVIEWED_PRIVATE_CHAT_GENERAL_ROLLOUT'}
 assert.equal(readChatRollout(env,PROD_PROJECT),null)
 const r=readChatRollout({...env,LF_CHAT_ALL_GYMS_ACK:'ENABLE_LIVE_FIELD_ROLLOUT_WITH_ROLLBACK'},PROD_PROJECT)
 assert.equal(r.mode,'all');assert.equal(allowedGym(otherGym,r),true)
})
test('project-specific policy never treats missing ids as a valid gym',()=>{
 const env={...pilot,LF_CHAT_ROLLOUT_MODE:'allowlist',LF_CHAT_GENERAL_RELEASE_ACK:'REVIEWED_PRIVATE_CHAT_GENERAL_ROLLOUT',LF_CHAT_ALLOWED_GYM_IDS:gym}
 const roll=readChatRollout(env,PROD_PROJECT)
 for(const x of ['',null,undefined,'../bad','bad id'])assert.equal(allowedGym(x,roll),false)
})
