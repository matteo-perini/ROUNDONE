/**
 * Proiezione VISIVA delle schede V1 Beta 0.28.1 (ROUNDONE/www/athlete.html):
 * lf281CanonValue, lf281TemplateSignature e lf281UniqueTemplates.
 *
 * Non è deduplicazione di documenti: non scrive su Firestore, non cancella ID,
 * copie storiche, assegnazioni né collegamenti; non cambia la fonte di verità.
 * Le azioni sul calendario devono continuare a usare il vero templateId di ogni slot.
 */
import type { GroupedSheet, Groups, Link, Personal } from './domain'

export type TemplateLike = {
  title?: unknown
  exercises?: readonly unknown[]
  _lf277Protected?: boolean
}

// Sono i nomi esatti della lista della V1. Il confronto è case-insensitive
// per le chiavi dei metadati; NON elimina proprietà tecniche sconosciute.
const EXERCISE_METADATA = new Set([
  'id', '_id', 'uuid', 'uid', 'clientid', 'localid', 'rowid',
  'createdat', 'updatedat', 'deletedat', 'archivedat', 'timestamp',
  'copiedfrom', 'sourceid', 'sourceexerciseid', 'sortindex',
  'lastmodified', 'modifiedat',
])

export function canonicalSheetValue(value: unknown): unknown {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').normalize('NFKC').toLocaleLowerCase('it')
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(canonicalSheetValue)
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      if (EXERCISE_METADATA.has(key.toLowerCase())) continue
      const v = canonicalSheetValue((value as Record<string, unknown>)[key])
      if (v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)) result[key] = v
    }
    return result
  }
  return String(value)
}

/** Firma esatta della V1: differenze minime tecniche (anche una sola rep) restano distinte. */
export function semanticSheetSignature(tpl: TemplateLike): string {
  const exercises = Array.isArray(tpl?.exercises) ? tpl.exercises : []
  return JSON.stringify({
    title: canonicalSheetValue(tpl?.title || ''),
    exercises: exercises.map(ex => {
      const normalized = canonicalSheetValue(ex)
      if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized
      const data = normalized as Record<string, unknown>
      if (!('sets' in data)) data.sets = '3'
      if (!('reps' in data)) data.reps = '10'
      if (!('supersetWithPrevious' in data)) data.supersetWithPrevious = 'false'
      if (data.name && data.exerciseId) delete data.exerciseId
      return Object.fromEntries(Object.keys(data).sort().map(key => [key, data[key]]))
    }),
  })
}

/** Una card per firma; preferisci copia protetta quando V1 la segnala. */
export function uniqueSemanticSheets<T extends TemplateLike>(sheets: readonly T[]): T[] {
  const bySignature = new Map<string, T>()
  for (const sheet of sheets) {
    const key = semanticSheetSignature(sheet)
    const prior = bySignature.get(key)
    if (!prior || (sheet._lf277Protected && !prior._lf277Protected)) bySignature.set(key, sheet)
  }
  return [...bySignature.values()]
}

/** Visualizzazione Archivio: tutte le copie rimangono consultabili tramite i loro ID. */
export function groupSemanticCopies<T extends TemplateLike & {id:string}>(copies: readonly T[]): {sheet:T;copies:T[]}[] {
  const bySignature = new Map<string, {sheet:T;copies:T[]}>()
  for (const sheet of copies) {
    const key = semanticSheetSignature(sheet)
    const prior = bySignature.get(key)
    if (prior) prior.copies.push(sheet)
    else bySignature.set(key, {sheet,copies:[sheet]})
  }
  return [...bySignature.values()]
}

export type VisualSheetGroup = {
  /** Rappresentante da mostrare: la vera scheda resta individuata dall'ID. */
  sheet: Personal
  /** Tutti i documenti che hanno la stessa firma, mai accorpati nel DB. */
  members: Personal[]
  sheetIds: string[]
  /** Tutti i riferimenti con l'ID ORIGINALE, per ogni settimana/giorno/slot. */
  links: Link[]
}
export type VisualSheetGroups = {
  programmed: VisualSheetGroup[]
  unprogrammed: VisualSheetGroup[]
  orphanLinks: Link[]
}

/**
 * Raggruppa le sole CARD dell'atleta. Se una scheda identica è programmata
 * con un altro ID, non mostrare una seconda copia tra quelle senza programma.
 * Il calendario, gli ID originali e i controlli anti-concorrenza restano invariati.
 */
export function visualSheetGroups(groups: Groups): VisualSheetGroups {
  const scheduled = new Map<string, VisualSheetGroup>()
  const independent = new Map<string, VisualSheetGroup>()
  const add = (map: Map<string, VisualSheetGroup>, entry: GroupedSheet): void => {
    const key = semanticSheetSignature(entry.sheet)
    const old = map.get(key)
    if (old) {
      old.members.push(entry.sheet)
      old.sheetIds.push(entry.sheet.id)
      old.links.push(...entry.links)
    } else {
      map.set(key, { sheet: entry.sheet, members: [entry.sheet], sheetIds: [entry.sheet.id], links: [...entry.links] })
    }
  }
  for (const entry of groups.programmed) add(scheduled, entry)
  for (const entry of groups.unprogrammed) {
    const key = semanticSheetSignature(entry.sheet)
    // La firma è già in programma con un ID diverso: unica card programmata.
    add(scheduled.has(key) ? scheduled : independent, entry)
  }
  return { programmed: [...scheduled.values()], unprogrammed: [...independent.values()], orphanLinks: groups.orphanLinks }
}
