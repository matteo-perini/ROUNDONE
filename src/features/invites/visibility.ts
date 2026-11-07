/** A claimed/revoked/expired token is hidden, NEVER deleted. */
export function visibleInvite(input:{status:string;expiresAt?:{toMillis():number}},now=Date.now()):boolean{
 return input.status==='pending' && (!input.expiresAt || input.expiresAt.toMillis()>now)
}
export function emailValid(email:string):boolean{return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
