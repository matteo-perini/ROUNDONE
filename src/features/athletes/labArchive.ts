/** Archivio di prova 2M/F: logiche pure. Gli ID storici non vengono aggregati. */
import type { Personal, ProgramWeek } from '../sheets/domain.ts'
import { activeLinks } from '../sheets/domain.ts'

export const LAB_ARCHIVE_PREFIX = 'lab2mf_'
export const LAB_ARCHIVE_ATHLETE_EMAIL = 'athlete2h@lionfit.invalid'

export type HistoricalArchive = {
  id: string
  title: string
  exercises: Personal['exercises']
  sourceTemplateId: string
  archivedBy: string
  archivedAt: string
}

export function isLabArchiveId(id: string): boolean {
  return /^lab2mf_[A-Za-z0-9]{12,60}$/.test(id)
}
export function assertLabArchiveTarget(email: string | undefined, id: string): void {
  if (email?.toLowerCase() !== LAB_ARCHIVE_ATHLETE_EMAIL) {
    throw new Error('Solo l’atleta fittizio 2H può usare il cestino 2M/F.')
  }
  if (!isLabArchiveId(id)) throw new Error('ID non creato dal laboratorio 2M/F: operazione bloccata.')
}
export function canTrashLabPersonal(personal: readonly Personal[], weeks: readonly ProgramWeek[], athleteId: string, id: string, email?: string): boolean {
  try { assertLabArchiveTarget(email,id) } catch { return false }
  return personal.some(p=>p.id===id && p.athleteId===athleteId && !p.deletedAt) && activeLinks(weeks,athleteId,id).length===0
}
export function isHistoryMatchingPersonal(history: HistoricalArchive, personal: Personal): boolean {
  return history.id===personal.id && history.sourceTemplateId===personal.id
     && history.title===personal.title && JSON.stringify(history.exercises)===JSON.stringify(personal.exercises)
}
export function archiveItemFromRaw(id: string, raw: Record<string, unknown>): HistoricalArchive {
  return {
    id,
    title: typeof raw.title==='string' ? raw.title : '(Titolo non disponibile)',
    sourceTemplateId: typeof raw.sourceTemplateId==='string' ? raw.sourceTemplateId : '',
    exercises: Array.isArray(raw.exercises) ? raw.exercises as Personal['exercises'] : [],
    archivedBy: typeof raw.archivedBy==='string' ? raw.archivedBy : '',
    archivedAt: typeof raw.archivedAt==='string' ? raw.archivedAt : (raw.archivedAt && typeof raw.archivedAt==='object' && 'toDate' in raw.archivedAt && typeof raw.archivedAt.toDate==='function') ? (raw.archivedAt.toDate() as Date).toISOString() : '',
  }
}
