/**
 * Lion Fit Motion · PATCH 1/7.
 * Ingresso leggero e una sola volta per navigazione; nessuna animazione al
 * rientro da background o ad ogni aggiornamento realtime delle schede.
 * Nessuna interazione con Auth, Firestore o dati dell'app.
 */
import { nextTick } from 'vue'
import type { Router } from 'vue-router'

export const ROUNDONE_MOTION = Object.freeze({ titleMs: 250, panelMs: 310, staggerMs: 32, maxDelayMs: 144 })
export type MotionRole = 'title' | 'panel'
export const ROUNDONE_TITLE_FRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translate3d(0,6px,0)' },
  { opacity: 1, transform: 'translate3d(0,0,0)' },
]
export const ROUNDONE_PANEL_FRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translate3d(0,9px,0)' },
  { opacity: 1, transform: 'translate3d(0,0,0)' },
]
export function roundOneMotionOptions(role: MotionRole, index: number): KeyframeAnimationOptions {
  return {
    duration: role === 'title' ? ROUNDONE_MOTION.titleMs : ROUNDONE_MOTION.panelMs,
    delay: Math.min(Math.max(0,index) * ROUNDONE_MOTION.staggerMs, ROUNDONE_MOTION.maxDelayMs),
    easing: 'cubic-bezier(.22,.72,.28,1)', fill: 'none',
  }
}

/**
 * Hook run once from main.ts; route changes replace active animations. The
 * Seleziona soltanto i componenti visibili della pagina. Le card caricate
 * asincronamente possono entrare nei primi 750ms, ma NON si rianimano in
 * seguito ad aggiornamenti Firebase o al ritorno da background.
 */
export function installRoundOneMotion(router: Router): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  const active = new Set<Animation>()
  let frame = 0
  let lastCompose = 0
  let allowNewCardsUntil = 0
  const visible = (node: Element): node is HTMLElement => {
    if (!(node instanceof HTMLElement) || node.closest('[hidden],[aria-hidden="true"],.hidden')) return false
    const s = window.getComputedStyle(node)
    if (s.display === 'none' || s.visibility === 'hidden') return false
    const r = node.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.top < window.innerHeight + 110 && r.bottom > -90
  }
  const abort = () => {
    for (const a of active) { try { a.cancel() } catch { /* already ended */ } }
    active.clear()
  }
  const animate = (el: HTMLElement, role: MotionRole, index: number) => {
    if (reduce.matches || document.hidden || typeof el.animate !== 'function' || !visible(el)) return
    const animation = el.animate(role === 'title' ? ROUNDONE_TITLE_FRAMES : ROUNDONE_PANEL_FRAMES,
      roundOneMotionOptions(role, index))
    active.add(animation)
    animation.onfinish = () => {
      active.delete(animation)
      try { animation.cancel() } catch { /* animation completed */ }
    }
    animation.oncancel = () => active.delete(animation)
  }
  const rootElement = () => document.querySelector('main.main-layout,main.booking-main,main.login-main')
  const compose = () => {
    if (reduce.matches || document.hidden || !('animate' in Element.prototype)) return
    const root = rootElement()
    if (!root) return
    abort()
    const sections = Array.from(root.children).flatMap(node => {
      if (!(node instanceof HTMLElement)) return []
      // Most Modern screens wrap their sections in one div.stack.
      return node.matches('.stack') ? Array.from(node.children) : [node]
    }).filter(visible).slice(0, 14)
    sections.forEach((section, index) => {
      const role: MotionRole = section.matches('h1,h2,h3,.eyebrow,.green-hero') ? 'title' : 'panel'
      animate(section, role, index)
    })
    lastCompose = window.performance.now()
    allowNewCardsUntil = lastCompose + 750
  }
  const schedule = () => {
    if (document.hidden) return
    if (frame) window.cancelAnimationFrame(frame)
    void nextTick(() => {
      frame = window.requestAnimationFrame(() => {frame = 0; compose()})
    })
  }
  // Solo card entrate subito dopo il cambio pagina (caricamento asincrono).
  // Non animare snapshot Firebase successivi o cambiamenti nella stessa pagina.
  const observer = new MutationObserver(mutations => {
    const now = window.performance.now()
    if (reduce.matches || document.hidden || now > allowNewCardsUntil || now - lastCompose < 65) return
    const root = rootElement()
    if (!root) return
    const additions: HTMLElement[] = []
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement) || !root.contains(node)) continue
        if (node.matches('.action-card,.archive-card,.line-card,.coach-metric-card') && visible(node)) additions.push(node)
        for (const card of node.querySelectorAll('.action-card,.archive-card,.line-card,.coach-metric-card')) {
          if (visible(card)) additions.push(card)
          if (additions.length >= 5) break
        }
        if (additions.length >= 5) break
      }
      if (additions.length >= 5) break
    }
    additions.slice(0,5).forEach((item,i)=>animate(item,'panel',i))
  })
  observer.observe(document.getElementById('app') ?? document.body, {subtree:true,childList:true})
  reduce.addEventListener('change', () => { if (reduce.matches) { abort(); allowNewCardsUntil=0 } })
  // Quando WebView torna visibile, niente composizione di pagina né intro replay.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      abort(); allowNewCardsUntil=0
      if (frame) {window.cancelAnimationFrame(frame);frame=0}
    }
  })
  router.afterEach((to,from,failure) => {
    if (!failure && to.path !== from.path) schedule()
  })
  void router.isReady().then(schedule)
}
