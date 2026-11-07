/** Pure routing rules; Android hardware Back is never allowed to exit on a single press. */
export const EXIT_DOUBLE_BACK_MS = 2300
export const INTERNAL_ROUTES = new Set([
  '/home','/piano','/archivio','/team','/profilo','/impostazioni','/prenotazioni',
  '/coach','/coach/atleti','/coach/programmi','/coach/archivio','/coach/libreria',
  '/coach/cestino','/coach/staff','/coach/profilo','/coach/prenotazioni',
  '/dev/accesso','/staging',
])
export function internalBackPath(value: unknown, current: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  const path = value.split(/[?#]/,1)[0].replace(/\/$/,'') || '/'
  // Returning to registration on hardware Back is unexpected; exit needs explicit intent.
  if (!INTERNAL_ROUTES.has(path) || path === '/dev/accesso' || path === '/staging' || path === current) return null
  return value
}
export function homeForRoute(path: string, query: Record<string, unknown>, role: 'coach'|'athlete'|'none'): string {
  const demo = query.source === 'emulator' ? '?source=emulator' : ''
  if (path.startsWith('/dev/')) return '/dev/accesso'
  if (role === 'coach' || path.startsWith('/coach')) return '/coach' + demo
  if (role === 'athlete' || INTERNAL_ROUTES.has(path)) return '/home' + demo
  return '/accesso'
}
export function shouldCloseOnSecondBack(last: number, now: number): boolean {
  return last > 0 && now >= last && now - last <= EXIT_DOUBLE_BACK_MS
}
