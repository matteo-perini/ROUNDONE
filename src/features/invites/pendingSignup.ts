import {validInvitation,type SignupRole} from './registration.ts'
/** A recoverable intent contains no password, session credential or Firebase UID.
 * It is deliberately session-scoped: another browser must use the original invite.
 */
export type PendingSignup={role:SignupRole;name:string;email:string;gymId:string;token:string;gymName:string;createdAt:number}
export const PENDING_SIGNUP_KEY='lionfit-signup-resume-1'
export const PENDING_SIGNUP_TTL=48*60*60*1000
export function validatedPendingSignup(raw:unknown,now=Date.now()):PendingSignup|null{
 if(!raw||typeof raw!=='object')return null
 const d=raw as Partial<PendingSignup>
 if(d.role!=='athlete'&&d.role!=='coach_invited'&&d.role!=='admin')return null
 if(typeof d.name!=='string'||d.name.trim().length<2||d.name.length>90)return null
 if(typeof d.email!=='string'||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(d.email)||d.email.length>160)return null
 if(typeof d.gymName!=='string'||typeof d.gymId!=='string'||typeof d.token!=='string')return null
 if(typeof d.createdAt!=='number'||!Number.isFinite(d.createdAt)||d.createdAt>now+60000||now-d.createdAt>PENDING_SIGNUP_TTL)return null
 if(d.role==='admin'&&(!d.gymName.trim()||d.gymName.length>90))return null
 if(d.role!=='admin'){try{validInvitation(d.gymId,d.token)}catch{return null}}
 return {role:d.role,name:d.name.trim(),email:d.email.trim().toLowerCase(),gymId:d.gymId,token:d.token.toLowerCase(),gymName:d.gymName.trim(),createdAt:d.createdAt}
}
export function sameSignupAccount(intent:PendingSignup,email:string):boolean{
 return intent.email===email.trim().toLowerCase()
}
