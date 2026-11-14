import type { ProgramDay, ProgramWeek, ProtectedCopy, ArchiveExclusion, ApprovedAlternative } from './features/sheets/domain'
export type Role = 'atleta' | 'coach'
export type Exercise = { id: string; name: string; sets: number|string; reps: string; rest: string; kg?: number; catalogId?:string; executionMode?:'normale'|'superset'; exerciseId?:string; load?:string; notes?:string; supersetWithPrevious?:boolean; supersetRest?:string; alternatives?:ApprovedAlternative[] }
export type Sheet = { id: string; title: string; category: string; exercises: Exercise[]; athleteId?: string; sourceId?: string; deletedAt?:string; deletedBy?:string }
export type Athlete = { id: string; name: string; email: string }
export type Day = ProgramDay
export type Week = ProgramWeek
export type Booking = { id: string; athlete: string; coach: string; service: string; day: string; hour: string; status: 'confirmed'|'cancelled' }
export type LabData = { athletes: Athlete[]; weeks: Week[]; templates: Sheet[]; assignments: Sheet[]; protectedArchives:ProtectedCopy[]; archiveExclusions:ArchiveExclusion[]; bookings: Booking[]; history: string[] }
export const newId = (): string => crypto.randomUUID()
