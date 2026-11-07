/** Operazioni settimanali consentite soltanto a settimane di prova create da 2M/E.
 * Non e' un sostituto delle Security Rules e non autorizza client V1 legacy.
 */
import { advanceV1Monday, initialV1WeekDocument, type V1WeekDocument } from '../sheets/v1WeekCodec.ts'

export function assertLabWeekId(id: string): void {
  if (!/^lab2me_[A-Za-z0-9]{8,}$/.test(id)) throw new Error('Questa operazione è consentita soltanto sulle settimane create nel laboratorio 2M/E.')
}
export function labWeekPayload(title: string, monday: string): V1WeekDocument {
  const cleaned = title.trim()
  if (!cleaned || cleaned.length > 55) throw new Error('Inserisci un nome da 1 a 55 caratteri per la settimana di prova.')
  return initialV1WeekDocument(`LAB 2M/E · ${cleaned}`, 1, 1, monday)
}
export function nextMondayAfter(weeks: readonly {startDate?:string}[], fallback='2026-11-09'): string {
  const ordered = weeks.map(w=>String(w.startDate||'')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  const base = ordered.at(-1) || fallback
  return advanceV1Monday(base, 1)
}
