/** Selezione di un modello dalla libreria Coach per l’atleta correntemente visualizzato.
 * Proiezione SOLO UI (nessuna mutazione Firestore): la transazione assignShared è l’autorità finale.
 * I nomi uguali NON identificano mai lo stesso modello: si usa SOLO l’ID originale.
 */
export type ModelAssignmentStatus = 'available' | 'already-assigned' | 'personal-in-trash' | 'model-in-trash'
export type AssignmentModel = {id:string; trashed:boolean}
export type AssignmentPersonal = {id:string; deletedAt?: unknown}

export function modelAssignmentStatus(model:AssignmentModel, personal:readonly AssignmentPersonal[]):ModelAssignmentStatus {
  if (model.trashed) return 'model-in-trash'
  const existing = personal.find(sheet => sheet.id === model.id)
  if (!existing) return 'available'
  if (existing.deletedAt) return 'personal-in-trash'
  return 'already-assigned'
}

export function mayStageModel(model:AssignmentModel, personal:readonly AssignmentPersonal[]):boolean {
  return modelAssignmentStatus(model,personal)==='available'
}

/** Ricontrolla prima della conferma; un listener può cambiare tra scelta e click. */
export function isSelectedModelAssignable(modelId:string,models:readonly AssignmentModel[],personal:readonly AssignmentPersonal[]):boolean {
  const model=models.find(m=>m.id===modelId)
  return !!model && mayStageModel(model,personal)
}
