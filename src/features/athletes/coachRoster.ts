/** Fase 2M/B: proiezione di sola lettura per il laboratorio Coach.
 * La fonte sono i profili /users ricevuti tramite query Firestore per palestra.
 * Questo filtro NON sostituisce le Rules; nessun dato e' scritto o trasferito.
 */
export type RosterProfile = { id: string; data: Record<string, unknown> }
export type RosterAthlete = { id: string; name: string; email: string; gymId: string; primaryCoachUid?:string; invitedByUid?:string; coachUids?:readonly string[] }

export function labCoachRoster(profiles: readonly RosterProfile[], gymId: string): RosterAthlete[] {
  if (!/^gym_lab2c_[ab]$/.test(gymId)) throw new Error('Palestra laboratorio non valida.')
  return profiles.flatMap(({ id, data }) => {
    if (!id || id.includes('/') || data.gymId !== gymId || data.role !== 'athlete') return []
    const name = [data.name, data.surname].filter(v => typeof v === 'string' && v.trim()).join(' ').trim()
    return [{ id, gymId, name: name || `Atleta ${id.slice(0, 6)}`, email: typeof data.email === 'string' ? data.email : '' }]
  }).sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

/** Il coach non puo' usare un UID digitato nella URL o non piu' presente nel suo elenco. */
export function maySelectLabAthlete(athletes: readonly RosterAthlete[], gymId: string, id: string): boolean {
  return !!id && athletes.some(a => a.id === id && a.gymId === gymId)
}
