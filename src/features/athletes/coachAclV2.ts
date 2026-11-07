/** Second phase ACL: enable ONLY after Emulator + real gym ownership backfill.
 * Client flags are NOT authorization; proposed Firestore Rules are mandatory.
 */
export const coachAclV2Enabled=()=>import.meta.env.PROD && import.meta.env.VITE_LIONFIT_COACH_ACL_V2==='ENABLED_AFTER_EMULATOR'
export const coachAclEnforced=()=>coachAclV2Enabled() && import.meta.env.VITE_LIONFIT_COACH_ACL_ENFORCED==='YES_VERIFIED'
export type CoachMini={id:string;role:string;gymId:string;membershipStatus?:string}
export function assignedCoaches(primary:string,shared:readonly string[],roster:readonly CoachMini[],gymId:string):string[]{
 const allowed=new Set(roster.filter(c=>c.gymId===gymId&&c.role==='admin'&&c.membershipStatus!=='revoked').map(c=>c.id))
 if(!allowed.has(primary))throw new Error('Coach principale non appartenente alla palestra o revocato.')
 const chosen=[primary,...shared].filter(x=>allowed.has(x))
 const result=[...new Set(chosen)]
 if(result.length>12)throw new Error('Massimo 12 coach per atleta.')
 return result
}
