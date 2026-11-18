/** Pure R8B competition invite rules, independent of Firebase runtime. */
export const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)
export const validEventId=value=>typeof value==='string'&&/^[A-Za-z0-9]{20}$/.test(value)
/** The pilot never spills into another gym when flags or client cache disagree. */
export const pilotAllowed=(gym,pilot)=>validId(gym)&&validId(pilot)&&gym===pilot
export const validRecipients=value=>Array.isArray(value)&&value.length>=1&&value.length<=35&&new Set(value).size===value.length&&value.every(validId)
export function isInvitationPending(entry){return entry?.status==='pending'&&validId(entry.athleteId)&&validId(entry.updatedBy)&&entry.updatedBy!==entry.athleteId}
export function entryInviteLabel(entry){
 if(isInvitationPending(entry))return 'Invitato · in attesa di risposta'
 if(entry?.status==='approved'&&entry?.updatedBy===entry?.athleteId)return 'Partecipa'
 if(entry?.status==='rejected'&&entry?.updatedBy===entry?.athleteId)return 'Non partecipa'
 return null
}
export const activeMember=(p,gym,role)=>p?.gymId===gym&&p?.role===role&&(!('membershipStatus' in p)||p.membershipStatus==='active')
export function canInviteEvent(e,now){return e?.status==='published'&&typeof e.startAt?.toMillis==='function'&&e.startAt.toMillis()>now}

/** Explicit scope all never bypasses the per-gym role/membership check. */
export const scopeAllowed=(gym,scope,pilot)=>validId(gym)&&(scope==='all'||(scope==='pilot'&&pilotAllowed(gym,pilot)))
