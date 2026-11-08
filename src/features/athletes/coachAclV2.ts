/** Historical ACL V2 helpers. PATCH 2/7: per-athlete isolation is retired.
 * Coach ownership is organizational ONLY: all active coaches of one gym share access.
 * DO NOT deploy the old ACL 7.4 candidate Rules that limit collaborators by coachUids.
 * These frontend switches do not grant permissions; Firestore Rules remain authoritative.
 */
export const coachAclV2Enabled=()=>false
export const coachAclEnforced=()=>false
export type CoachMini={id:string;role:string;gymId:string;membershipStatus?:string}
export function assignedCoaches(primary:string,shared:readonly string[],roster:readonly CoachMini[],gymId:string):string[]{
 const allowed=new Set(roster.filter(c=>c.gymId===gymId&&c.role==='admin'&&c.membershipStatus!=='revoked').map(c=>c.id))
 if(!allowed.has(primary))throw new Error('Coach principale non appartenente alla palestra o revocato.')
 const chosen=[primary,...shared].filter(x=>allowed.has(x))
 const result=[...new Set(chosen)]
 if(result.length>12)throw new Error('Massimo 12 coach per atleta.')
 return result
}
