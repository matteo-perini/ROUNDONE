/** PATCH 30 R12 – independent per-gym Email Studio ACL, pure/testable. */
const UID=/^[A-Za-z0-9_-]{1,128}$/
const GYM=/^[A-Za-z0-9_-]{1,128}$/
export const studioConfigPath=gymId=>{if(!GYM.test(gymId))throw new Error('Invalid gym');return `gyms/${gymId}/invite_email_studio/config`}
export const studioEditorsPath=gymId=>{if(!GYM.test(gymId))throw new Error('Invalid gym');return `gyms/${gymId}/invite_email_studio/permissions`}
export function studioRole({uid,gymId,profile,gym}){
 if(!uid||!UID.test(uid)||!gymId||!GYM.test(gymId)||!profile||!gym||profile.gymId!==gymId||profile.role!=='admin'||(profile.membershipStatus&&profile.membershipStatus!=='active'))return null
 if(profile.coachRole==='owner'&&gym.ownerUid===uid)return 'owner'
 if(profile.coachRole==='collaborator'&&gym.ownerUid!==uid)return 'coach'
 return null
}
export function validatedEditors(input){
 if(!Array.isArray(input)||input.length>60||input.some(id=>typeof id!=='string'||!UID.test(id))||new Set(input).size!==input.length)throw new Error('Invalid editor list')
 return [...input].sort()
}
export function readEditors(input){try{return validatedEditors(input)}catch{return []}}

export const studioModelPath=(gymId,kind)=>{studioConfigPath(gymId);if(!['athlete','coach'].includes(kind))throw new Error('Invalid invitation kind');return `gyms/${gymId}/invite_email_studio/models_${kind}`}
