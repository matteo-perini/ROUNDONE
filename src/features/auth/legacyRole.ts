/** Resolves ROUNDONE admin records against the authoritative gym.ownerUid.
 * No write or silent migration: legacy profiles without coachRole stay readable.
 * A missing ownerUid is an administrative migration gate, never guessed from a name.
 */
export type GymSessionRole='atleta'|'titolare'|'collaboratore'
export type GymProfile={role?:unknown;coachRole?:unknown;membershipStatus?:unknown;gymId?:unknown}
export type GymRecord={ownerUid?:unknown}
export function resolveLegacyGymRole(uid:string,profile:GymProfile,gym:GymRecord):GymSessionRole{
 if(!uid||!profile||!gym)throw new Error('Identità palestra incompleta.')
 const owner=typeof gym.ownerUid==='string'&&gym.ownerUid.trim()?gym.ownerUid:''
 if(!owner)throw new Error('La palestra storica non ha ownerUid: serve una verifica amministrativa prima di accedere. Nessun account verrà modificato.')
 if(profile.role==='athlete'){
  if(owner===uid||profile.coachRole)throw new Error('Ruolo atleta non coerente con la palestra.')
  return 'atleta'
 }
 if(profile.role!=='admin')throw new Error('Ruolo account non riconosciuto.')
 if(profile.membershipStatus==='revoked')throw new Error('Collaborazione revocata dal titolare della palestra.')
 if(profile.membershipStatus!==undefined&&profile.membershipStatus!=='active')throw new Error('Stato della collaborazione non valido.')
 if(owner===uid){
  if(profile.coachRole==='collaborator')throw new Error('Ruolo titolare incoerente: verificare il profilo.')
  return 'titolare'
 }
 if(profile.coachRole==='owner')throw new Error('Titolare dichiarato non corrispondente all’ownerUid della palestra.')
 if(profile.coachRole!==undefined&&profile.coachRole!=='collaborator')throw new Error('Ruolo Coach non riconosciuto.')
 return 'collaboratore'
}
