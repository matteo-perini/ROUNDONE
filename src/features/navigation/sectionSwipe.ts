/** R22B.4 — gesture navigation restricted to top-level mobile destinations.
 * The rendered navbar supplies the authoritative order: no roles or Firebase permissions change.
 */
export function sectionSwipeDestination(path: string, dx: number, dy: number, durationMs: number, destinations: readonly string[]): string | null {
  if (![dx,dy,durationMs].every(Number.isFinite) || durationMs < 60 || durationMs > 900) return null
  if (Math.abs(dx) < 110 || Math.abs(dx) < Math.abs(dy) * 2) return null
  const index = destinations.indexOf(path)
  if (index < 0) return null
  const next = index + (dx > 0 ? -1 : 1)
  return next >= 0 && next < destinations.length ? destinations[next] : null
}

/** Names are used only for switches between the existing top-level sections. */
export function sectionTransition(from: string, to: string, destinations: readonly string[]): string {
  const a = destinations.indexOf(from), b = destinations.indexOf(to)
  return a < 0 || b < 0 || a === b ? '' : b > a ? 'lf-section-next' : 'lf-section-prev'
}
