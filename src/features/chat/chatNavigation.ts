/** Pure mobile gesture policy; positive delta means finger moves right. */
export type ChatSwipeRoute = '/home' | '/messaggi'
export function chatSwipeDestination(path: string, deltaX: number, deltaY: number, durationMs: number): ChatSwipeRoute | null {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(durationMs)) return null
  if (durationMs < 50 || durationMs > 850 || Math.abs(deltaX) < 95 || Math.abs(deltaX) < Math.abs(deltaY) * 1.8) return null
  if (path === '/home' && deltaX > 0) return '/messaggi'
  if (path === '/messaggi' && deltaX < 0) return '/home'
  return null
}
