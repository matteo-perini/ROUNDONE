/** Proiezione delle associazioni organizzative Coach–Atleta; NON è un controllo ACL.
 * Tutti i Coach attivi condividono la gestione degli Atleti della stessa palestra.
 * Un profilo storico senza primaryCoachUid resta visibile in «Tutti».
 */
export type CoachMembership={primaryCoachUid?:string;invitedByUid?:string;coachUids?:readonly string[]}
export type CoachRosterFilter='miei'|'condivisi'|'tutti'
export function coachMembership(profile:Record<string,unknown>):CoachMembership{
 const primary=typeof profile.primaryCoachUid==='string'&&profile.primaryCoachUid.trim()?profile.primaryCoachUid.trim():undefined
 const invitedByUid=typeof profile.invitedByUid==='string'&&profile.invitedByUid.trim()?profile.invitedByUid.trim():undefined
 const raw=Array.isArray(profile.coachUids)?profile.coachUids:[]
 const list=[...new Set(raw.filter((x):x is string=>typeof x==='string'&&!!x.trim()).map(x=>x.trim()))]
 return {...(primary?{primaryCoachUid:primary}:{}),...(invitedByUid?{invitedByUid}:{}),...(list.length?{coachUids:list}:{})}
}
export function belongsToCoach(profile:CoachMembership,uid:string,mode:CoachRosterFilter):boolean{
 if(mode==='tutti')return true
 if(!uid)return false
 if(mode==='miei')return profile.primaryCoachUid===uid
 return profile.primaryCoachUid!==uid && !!profile.coachUids?.includes(uid)
}
export function hasCoachAssignment(profile:CoachMembership):boolean{
 return !!profile.primaryCoachUid
}
