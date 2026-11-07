/**
 * Contratto MINIMO dei profili V1, usato solo dal laboratorio locale.
 * Non assegnare ruoli sulla base di una scelta nel browser: i documenti sono
 * letti dal server, mentre i permessi effettivi dipendono dalle Security Rules.
 */
export type VerifiedLabRole = 'titolare' | 'collaboratore' | 'atleta'

export type LabProfile = {
  role?: unknown
  coachRole?: unknown
  gymId?: unknown
  email?: unknown
}

export type LabGym = { ownerUid?: unknown }

export function resolveLabRole(uid: string, email: string | null, profile: LabProfile, gym: LabGym): VerifiedLabRole {
  if (!uid || typeof profile.gymId !== 'string' || !/^gym_lab2c_[ab]$/.test(profile.gymId)) {
    throw new Error('Profilo assente oppure palestra diversa dai fixture del laboratorio 2C.')
  }
  if (typeof profile.email !== 'string' || profile.email.toLowerCase() !== (email ?? '').toLowerCase()) {
    throw new Error('Email del profilo diversa dall’utente autenticato.')
  }
  if (profile.role === 'admin' && profile.coachRole === 'owner' && gym.ownerUid === uid) return 'titolare'
  if (profile.role === 'admin' && profile.coachRole === 'collaborator' && typeof gym.ownerUid === 'string' && gym.ownerUid !== uid) return 'collaboratore'
  if (profile.role === 'athlete' && profile.coachRole === undefined && gym.ownerUid !== uid) return 'atleta'
  throw new Error('Ruolo non coerente con profilo e palestra. Accesso non convalidato.')
}

export const LAB_GYM_A = 'gym_lab2c_a'
export const LAB_GYM_B = 'gym_lab2c_b'
export const LAB_TEMPLATE_ID = 'lab2c_template'
export const LAB_PERSONAL_ID = 'lab2c_personal'
/** Credenziali fittizie e riutilizzabili SOLO nell'Auth Emulator, mai in produzione. */
export const LAB_TEST_PASSWORD = 'Solo_Emulatore_LionFit_2C_2026!'
export const LAB_PERSONAS = [
  { id: 'owner', label: 'Titolare palestra A', email: 'owner2c@lionfit.invalid', gymId: LAB_GYM_A, expectedRole: 'titolare' },
  { id: 'coach', label: 'Coach collaboratore A', email: 'coach2c@lionfit.invalid', gymId: LAB_GYM_A, expectedRole: 'collaboratore' },
  { id: 'athlete', label: 'Atleta A', email: 'athlete2c@lionfit.invalid', gymId: LAB_GYM_A, expectedRole: 'atleta' },
  { id: 'outsider', label: 'Titolare palestra B', email: 'outsider2c@lionfit.invalid', gymId: LAB_GYM_B, expectedRole: 'titolare' },
] as const
