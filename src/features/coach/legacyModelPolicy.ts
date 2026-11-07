/** Existing ROUNDONE templates may lack createdBy/revision and never use lfm_.
 * Caller MUST verify Firebase Coach session/gym; server Rules remain the authority. */
export function canManageCoachModel(id:string,role:string|undefined):boolean{
 return ['titolare','collaboratore'].includes(role||'') && !!id && id.length<=128 && !id.includes('/') && !id.includes('..')
}
