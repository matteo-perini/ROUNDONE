/** Fase 2M/G: proiezione esclusivamente visiva dell'archivio immutabile.
 * Gli ID storici non vengono mai accorpati, nascosti lato Firestore o eliminati.
 */
import type { Personal } from '../sheets/domain.ts'
import type { HistoricalArchive } from './labArchive.ts'

export type ArchiveState = 'active' | 'trashed' | 'historical'
export type ArchiveView = 'active' | 'trashed' | 'historical' | 'all'
export type ArchiveCounts = { active: number; trashed: number; historical: number; all: number }

export function archiveState(item: Pick<HistoricalArchive,'id'>, personal: readonly Pick<Personal,'id' | 'deletedAt'>[]): ArchiveState {
  const matching = personal.find(p => p.id === item.id)
  if (!matching) return 'historical'
  return matching.deletedAt ? 'trashed' : 'active'
}
export function archiveCounts(items: readonly HistoricalArchive[], personal: readonly Pick<Personal,'id' | 'deletedAt'>[]): ArchiveCounts {
  const count: ArchiveCounts = {active:0,trashed:0,historical:0,all:items.length}
  for (const item of items) count[archiveState(item,personal)]++
  return count
}
export function visibleArchives<T extends HistoricalArchive>(items: readonly T[], personal: readonly Pick<Personal,'id' | 'deletedAt'>[], view: ArchiveView, text=''): T[] {
  const query = text.trim().toLocaleLowerCase('it')
  return items.filter(item => {
    if (view!=='all' && archiveState(item,personal)!==view) return false
    if (!query) return true
    return [item.id,item.title,item.sourceTemplateId,...item.exercises.map(e=>e.name)]
      .some(value=>String(value||'').toLocaleLowerCase('it').includes(query))
  })
}
