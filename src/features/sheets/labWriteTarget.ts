/** FASE 2F: bersaglio FISSO, esclusivamente fixture sintetico, per il laboratorio DEV.
 * Non usarlo per modifiche generiche né per produzione. */
import type { VerifiedDevSession } from '../../integrations/firebase/devSession'
import { resolveLabReadTarget } from './labReadTarget.ts'

export const LAB_2F_WEEK_ID = 'lab2e_week_2'
export const LAB_2F_SHEET_ID = 'lab2e_sheet_singola'
export const LAB_2F_DAY = 'mercoledì' as const
export const LAB_2F_SLOT = 2 as const

export type LabWriteTarget = { gymId: 'gym_lab2c_a'; athleteId: string; weekId: typeof LAB_2F_WEEK_ID; sheetId: typeof LAB_2F_SHEET_ID }

export function resolveLabWriteTarget(
  session: Pick<VerifiedDevSession, 'uid' | 'gymId' | 'role'>,
  fixtureAthleteUid: unknown,
  athleteProfile?: { gymId?: unknown; role?: unknown },
): LabWriteTarget {
  if (session.gymId !== 'gym_lab2c_a' || !['titolare', 'collaboratore'].includes(session.role)) {
    throw new Error('Scrittura 2F consentita soltanto a titolare e collaboratore della palestra A.')
  }
  const target = resolveLabReadTarget(session, fixtureAthleteUid, athleteProfile)
  if (!target || target.gymId !== 'gym_lab2c_a') throw new Error('Atleta fixture A non verificato.')
  return { gymId: 'gym_lab2c_a', athleteId: target.athleteId, weekId: LAB_2F_WEEK_ID, sheetId: LAB_2F_SHEET_ID }
}

export function assertLabWriteFixture(week: { deletedAt?: unknown; programTitle?: unknown; weekIndex?: unknown; days?: Record<string, Record<string, unknown>> } | undefined,
  sheet: { deletedAt?: unknown; title?: unknown; exercises?: unknown } | undefined): '' | typeof LAB_2F_SHEET_ID {
  if (!week || week.deletedAt || week.programTitle !== 'Programma test 2E' || week.weekIndex !== 2) {
    throw new Error('Settimana di prova 2E assente o modificata. Nessuna scrittura effettuata.')
  }
  if (!sheet || sheet.deletedAt || sheet.title !== 'Scheda 2E senza programma' || !Array.isArray(sheet.exercises) || !sheet.exercises.length) {
    throw new Error('Scheda sintetica 2E assente o modificata. Nessuna scrittura effettuata.')
  }
  const current = week.days?.[LAB_2F_DAY]?.templateId2
  if (current !== '' && current !== LAB_2F_SHEET_ID) {
    throw new Error('Slot 2 di mercoledì occupato da un’altra scheda: non toccare il dato.')
  }
  return current
}
