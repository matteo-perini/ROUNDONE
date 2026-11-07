/** Scelta del solo atleta fixture per la lettura DEV: mai da query string o input libero. */
import type { VerifiedDevSession } from '../../integrations/firebase/devSession'

export type LabReadTarget = { gymId: string; athleteId: string } | null

export function resolveLabReadTarget(
  session: Pick<VerifiedDevSession, 'gymId' | 'uid' | 'role'>,
  labAthleteUid: unknown,
  athleteProfile?: { gymId?: unknown; role?: unknown },
): LabReadTarget {
  if (!/^gym_lab2c_[ab]$/.test(session.gymId) || !session.uid) {
    throw new Error('Profilo laboratorio non valido.')
  }
  // Il fixture della palestra B non contiene atleti: nessuna lettura verso A.
  if (typeof labAthleteUid !== 'string' || !labAthleteUid.trim() || labAthleteUid.includes('/')) return null
  if (athleteProfile?.gymId !== session.gymId || athleteProfile?.role !== 'athlete') {
    throw new Error('Atleta del fixture non appartenente alla palestra verificata.')
  }
  if (session.role === 'atleta' && labAthleteUid !== session.uid) {
    throw new Error('Un atleta può consultare soltanto le proprie schede.')
  }
  if (!['titolare', 'collaboratore', 'atleta'].includes(session.role)) {
    throw new Error('Ruolo non ammesso nel laboratorio.')
  }
  return { gymId: session.gymId, athleteId: labAthleteUid }
}
