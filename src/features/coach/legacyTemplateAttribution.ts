/** One-time organizational attribution of V1 archive models without createdBy.
 * This is NOT proof of historical authorship and is NEVER a Firestore ACL.
 */
export type LegacyModelMarker={id:string;createdBy?:unknown}
export type LegacyCoachCandidate={id:string;name:string;active:boolean}

export function unassignedLegacyModels<T extends LegacyModelMarker>(models:readonly T[]):T[]{
 return models.filter(model=>!hasRecordedCreator(model.createdBy))
}
export function hasRecordedCreator(value:unknown):boolean{
 return typeof value==='string' && value.trim().length>0
}
export function availableLegacyCoaches<T extends LegacyCoachCandidate>(coaches:readonly T[]):T[]{
 return coaches.filter(c=>c.active && !!c.id && !c.id.includes('/') && !!c.name.trim())
}
export function checkLegacyAttribution(model:LegacyModelMarker,coachUid:string,coaches:readonly LegacyCoachCandidate[]):void{
 if(!model.id||model.id.includes('/')||model.id.includes('..'))throw new Error('ID scheda non valido.')
 if(hasRecordedCreator(model.createdBy))throw new Error('Questa scheda ha già un Coach attribuito: aggiorna l’elenco.')
 if(!availableLegacyCoaches(coaches).some(c=>c.id===coachUid))throw new Error('Seleziona un Coach attivo della palestra.')
}
