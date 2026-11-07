/** Convalida dei parametri di invito ROUNDONE V1; nessun nuovo schema Firestore. */
export type SignupRole='athlete'|'admin'|'coach_invited'
export const INVITE_TOKEN=/^[a-f0-9]{48}$/i
export const GYM_ID=/^gym_[a-zA-Z0-9_-]+$/
export function inviteFromQuery(query:Record<string,unknown>){
 const one=(key:string)=>typeof query[key]==='string'?String(query[key]).trim():''
 const gymId=one('gym'),athleteToken=one('athleteInvite'),coachToken=one('coachInvite')
 const validGym=GYM_ID.test(gymId)
 if(validGym&&INVITE_TOKEN.test(coachToken))return {gymId,token:coachToken.toLowerCase(),role:'coach_invited' as SignupRole}
 if(validGym&&INVITE_TOKEN.test(athleteToken))return {gymId,token:athleteToken.toLowerCase(),role:'athlete' as SignupRole}
 return null
}
export function validSignupFields(name:string,email:string,password:string){
 if(name.trim().length<2||name.trim().length>90)throw new Error('Inserisci nome e cognome (massimo 90 caratteri).')
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160)throw new Error('Inserisci un indirizzo email valido.')
 if(password.length<6)throw new Error('Scegli una password di almeno sei caratteri.')
}
export function validInvitation(gymId:string,token:string){
 if(!GYM_ID.test(gymId)||!INVITE_TOKEN.test(token))throw new Error('Serve il link personale completo o un codice e ID palestra validi.')
}
