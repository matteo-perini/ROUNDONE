/** R22B.6A - conservative rollout policy. Default remains the existing pilot.
 * This module contains no Firebase I/O and is testable without credentials.
 */
import {safeGym,safeId} from './model.mjs'
export const PROD_PROJECT='app-palestra-b0b9d'
export function readChatRollout(env,pid){
 const mode=env.LF_CHAT_ROLLOUT_MODE||'pilot'
 if(!['pilot','allowlist','all'].includes(mode))return null
 if(env.LF_CHAT_ENABLED!=='true')return null
 if(mode==='pilot'){
  if(!safeGym(env.LF_CHAT_PILOT_GYM_ID))return null
  if(pid===PROD_PROJECT&&(
    env.LF_CHAT_PRODUCTION_ACK!=='REVIEWED_PRIVATE_CHAT_PILOT'||
    !safeId(env.LF_CHAT_PILOT_COACH_UID)||!safeId(env.LF_CHAT_PILOT_ATHLETE_UID)
  ))return null
  return {pid,mode,pilotGym:env.LF_CHAT_PILOT_GYM_ID,allowlist:[]}
 }
 // Additional explicit acknowledgements: an old pilot .env cannot open other gyms.
 if(pid===PROD_PROJECT&&env.LF_CHAT_GENERAL_RELEASE_ACK!=='REVIEWED_PRIVATE_CHAT_GENERAL_ROLLOUT')return null
 if(mode==='allowlist'){
  const ids=String(env.LF_CHAT_ALLOWED_GYM_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)
  if(ids.length<1||ids.length>20||new Set(ids).size!==ids.length||!ids.every(safeGym))return null
  return {pid,mode,pilotGym:'',allowlist:ids}
 }
 // Full rollout additionally requires a separate acknowledgement for a supervised LIVE field release.
 // This flag is not proof that security or load testing has happened.
 if(pid===PROD_PROJECT&&env.LF_CHAT_ALL_GYMS_ACK!=='ENABLE_LIVE_FIELD_ROLLOUT_WITH_ROLLBACK')return null
 return {pid,mode,pilotGym:'',allowlist:[]}
}
export function allowedGym(gymId,roll){
 if(!safeGym(gymId)||!roll)return false
 return roll.mode==='all'||roll.mode==='pilot'&&gymId===roll.pilotGym||roll.mode==='allowlist'&&roll.allowlist.includes(gymId)
}
export function allowedPair(pair,roll,env){
 if(!pair||!allowedGym(pair.gymId,roll))return false
 return roll.mode!=='pilot'||roll.pid!==PROD_PROJECT||(
  pair.coachUid===env.LF_CHAT_PILOT_COACH_UID&&pair.athleteUid===env.LF_CHAT_PILOT_ATHLETE_UID
 )
}
