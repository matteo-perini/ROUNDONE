/** Conversione LOSSLESS per gli 8 campi di ogni esercizio V1 (ROUNDONE/www/admin.html).
 * Niente Firebase qui. L'editor usa anche campi presentazionali che NON devono finire
 * nelle copie originali dell'archivio storico salvo se già erano nei dati sorgente.
 * Le stringhe di carico e ripetizioni sono intenzionali (75%, AMRAP, 2'). */
import type { Exercise } from '../../model'
import {validateAlternatives} from './approvedAlternatives.ts'

export type V1ExerciseRow = {
 name: string
 exerciseId: string
 sets: string
 reps: string
 load: string
 notes: string
 supersetWithPrevious: boolean
 supersetRest: string
 [key: string]: unknown
}
const text = (value: unknown): string => value == null ? '' : String(value)
const asObject = (item: unknown): Record<string, unknown> => {
 if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Riga esercizio V1 non valida.')
 return item as Record<string, unknown>
}

/** Per visualizzare/modificare una scheda V1 senza perdere i suoi campi. */
export function v1ToEditor(raw: readonly unknown[]): Exercise[] {
 if (!Array.isArray(raw)) throw new Error('Gli esercizi devono essere un elenco.')
 return raw.map((item, index) => {
  const row = asObject(item)
  return {
   ...row,
   id: typeof row.id === 'string' && row.id ? row.id : `v1-esercizio-${index + 1}`,
   name: text(row.name),
   sets: text(row.sets),
   reps: text(row.reps),
   rest: text(row.rest ?? row.notes),
   _lfHadRest: Object.prototype.hasOwnProperty.call(row,'rest'),
   notes: text(row.notes),
   load: text(row.load),
   exerciseId: text(row.exerciseId),
   catalogId: text(row.exerciseId),
   supersetWithPrevious: row.supersetWithPrevious === true,
   supersetRest: text(row.supersetRest),
   executionMode: row.supersetWithPrevious === true ? 'superset' : 'normale',
  } as Exercise
 })
}

/** Crea esattamente la struttura prevista dalla V1, senza numerizzare i campi testuali.
 * Eventuali campi aggiuntivi originali sono conservati; chiavi solo-UI sono escluse. */
export function editorToV1(exercises: readonly Exercise[]): V1ExerciseRow[] {
 if (!Array.isArray(exercises)) throw new Error('Gli esercizi devono essere un elenco.')
 const saved = exercises.map((exercise) => {
  const { id: _id, rest, catalogId, kg, executionMode, _lfHadRest, ...original } = exercise as Exercise & {_lfHadRest?:boolean}
  const approved=validateAlternatives(exercise.alternatives)
  const connect = typeof exercise.supersetWithPrevious === 'boolean'
    ? exercise.supersetWithPrevious : executionMode === 'superset'
  return {
   ...original,
   ...(exercise.alternatives!==undefined?{alternatives:approved}:{}),
   name: text(exercise.name).trim(),
   exerciseId: text(exercise.exerciseId || catalogId),
   sets: text(exercise.sets),
   reps: text(exercise.reps),
   load: text(exercise.load ?? (typeof kg === 'number' ? `${kg} kg` : '')),
   notes: text(_lfHadRest ? exercise.notes : rest ?? exercise.notes),
   ...(_lfHadRest ? {rest:text(rest)}:{}),
   supersetWithPrevious: connect,
   supersetRest: connect ? text(exercise.supersetRest) : '',
  }
 })
 assertV1Exercises(saved)
 return saved
}

/** Stesse regole di lf276ReadExerciseRows: seconda riga di ciascuna coppia marcata. */
export function assertV1Exercises(exercises: readonly V1ExerciseRow[]): void {
 if (exercises.length < 1 || exercises.length > 250) throw new Error('La scheda deve avere da 1 a 250 esercizi.')
 for (let index = 0; index < exercises.length; index++) {
  if (!exercises[index].name) throw new Error(`Nome mancante nell'esercizio ${index + 1}.`)
  if (exercises[index].supersetWithPrevious && (index === 0 || exercises[index - 1].supersetWithPrevious))
   throw new Error('Superset non valido: deve collegare due esercizi consecutivi, senza sovrapposizioni.')
 }
}
