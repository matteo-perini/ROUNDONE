/** Blocco 2M/D: protezioni supplementari di interfaccia, SOLO sviluppo/emulator.
 * Non sostituiscono Firebase Auth e le Security Rules server.
 */
import { DAY_KEYS, type DayKey, type ProgramWeek, type Personal } from '../sheets/domain.ts'
import type { RosterAthlete } from './coachRoster.ts'

export type LabCoachIdentity = { uid: string; gymId: string; role: string }
export function assertEmulatorCoachWrite(
  session: LabCoachIdentity | null,
  athlete: RosterAthlete | null,
  enabled: boolean,
): asserts session is LabCoachIdentity {
  if (!enabled) throw new Error('Attiva esplicitamente le operazioni del laboratorio.')
  if (!session || (session.role !== 'collaboratore' && session.role !== 'titolare') || !session.uid) throw new Error('Sessione Coach non valida.')
  if (session.gymId !== 'gym_lab2c_a') throw new Error('Le scritture sono permesse soltanto nella palestra fittizia A.')
  if (!athlete || athlete.gymId !== session.gymId || !athlete.id || athlete.id.includes('/')) throw new Error('Atleta non autorizzato nel laboratorio.')
  if (!athlete.email.toLowerCase().endsWith('@lionfit.invalid')) throw new Error('Solo account fittizi .invalid; blocco precauzionale.')
}
export function activeWeekFor(weeks: readonly ProgramWeek[], selectedId: string): ProgramWeek | null {
  const active = weeks.filter(w => !w.deletedAt).slice().sort((a,b) => String(a.startDate||a.id).localeCompare(String(b.startDate||b.id)))
  return active.find(w => w.id === selectedId) ?? active[0] ?? null
}
export function selectedSlotId(week: ProgramWeek | null, dayIndex: number, slot: 1 | 2): string {
  if (!week || !Number.isInteger(dayIndex) || dayIndex<0 || dayIndex>=7 || !week.days[dayIndex]) return ''
  return String(slot===1 ? week.days[dayIndex].templateId : week.days[dayIndex].templateId2 || '')
}
export function activePersonalFor(personal: readonly Personal[]): Personal[] {
  return personal.filter(p => !p.deletedAt).slice().sort((a,b) => a.title.localeCompare(b.title,'it'))
}
export function validDayKey(dayIndex: number): DayKey {
  if (!Number.isInteger(dayIndex) || dayIndex<0 || dayIndex>=DAY_KEYS.length) throw new Error('Giorno non valido.')
  return DAY_KEYS[dayIndex]
}
