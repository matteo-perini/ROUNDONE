/** Fail-closed matching of verified Google token and pre-existing linked Firebase user. */
export function normalizeVerifiedGoogle(payload){
  if(!payload || payload.email_verified!==true || typeof payload.email!=='string' || typeof payload.sub!=='string')return null
  const email=payload.email.trim().toLowerCase()
  if(email.length<5 || email.length>254 || !email.includes('@') || payload.sub.length<8)return null
  return {email,googleSub:payload.sub}
}
export function existingLinkedUser(record, identity, profile, gymExists){
  if(!record || !identity || record.disabled || record.emailVerified!==true || !record.uid || !profile || !gymExists)return false
  if(String(record.email||'').trim().toLowerCase()!==identity.email)return false
  if(typeof profile.email==='string'&&profile.email.trim().toLowerCase()!==identity.email)return false
  if(profile.membershipStatus !== undefined && profile.membershipStatus !== 'active')return false
  if(!['admin','athlete'].includes(profile.role) || typeof profile.gymId!=='string' || !/^gym_[A-Za-z0-9_-]{3,116}$/.test(profile.gymId))return false
  return Array.isArray(record.providerData) && record.providerData.some(p=>p?.providerId==='google.com'&&p.uid===identity.googleSub)
}
