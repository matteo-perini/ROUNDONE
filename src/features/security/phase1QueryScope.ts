/** LionFit FASE 1L — query prenotazioni secondo ACL CONDIVISA della V1.
 * Non attribuisce permessi: l'autorità rimane Firestore Rules.
 * I millisecondi vengono convertiti in Timestamp nel chiamante.
 */
export type ReadRole='atleta'|'titolare'|'collaboratore'
export type QueryPredicate={field:'athleteId'|'coachId'|'startAt';operator:'=='|'>='|'<';value:string|number}
export function reservationQueryPredicates(role:ReadRole,uid:string,fromMs:number,toMs:number):QueryPredicate[]{
 if(!uid || typeof uid!=='string' || !Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || toMs<=fromMs)
  throw new Error('PARAMETRI_QUERY_NON_VALIDI')
 if(role==='atleta')return [{field:'athleteId',operator:'==',value:uid}]
 const time:QueryPredicate[]=[{field:'startAt',operator:'>=',value:fromMs},{field:'startAt',operator:'<',value:toMs}]
 // Compatibilita V1: tutte le prenotazioni della palestra visibili ai Coach attivi.
 // L'abilitazione effettiva dipende dalle Rules Firestore (membershipStatus e gymId).
 if(role==='collaboratore'||role==='titolare')return time
 throw new Error('RUOLO_QUERY_NON_AUTORIZZATO')
}
/** Il roster completo dei profili coach contiene dati riservati al titolare. */
export function canListPrivateCoachProfiles(role:ReadRole):boolean{return role==='titolare'}
