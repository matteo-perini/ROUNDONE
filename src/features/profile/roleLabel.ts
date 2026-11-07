/** Il titolo visibile non assegna privilegi: i permessi restano nel backend. */
export type ProfileRole = 'atleta' | 'titolare' | 'collaboratore' | 'coach-demo'
export function profileRoleLabel(role:ProfileRole):string {
  if(role==='titolare')return 'Amministratore'
  if(role==='collaboratore')return 'Coach collaboratore'
  if(role==='atleta')return 'Atleta'
  return 'Coach · demo'
}
export function isGymOwner(role:ProfileRole):boolean {return role==='titolare'}
export function displayCountry(value:string):string {
 const clean=String(value||'').trim().replace(/^IT(?=[\s·,/-]|$)[\s·,/-]*/i,'').trim()
 return /^italia$/i.test(clean)||!clean?'Italia':clean
}
