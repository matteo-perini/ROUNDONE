/** Shared, read-only preview clock: one timer for every visible exercise. */
type Listener = (now: number) => void
const visible = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null
function pulse() {
  if (typeof document !== 'undefined' && document.hidden) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  for (const callback of [...visible]) callback(now)
}
function start() {
  if (timer === null && visible.size) timer = setInterval(pulse, 65)
}
export function followVisibleFrames(callback: Listener): () => void {
  visible.add(callback)
  start()
  return () => {
    visible.delete(callback)
    if (!visible.size && timer !== null) { clearInterval(timer); timer = null }
  }
}
export function visiblePreviewCount() { return visible.size }
