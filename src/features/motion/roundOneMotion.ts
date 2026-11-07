/**
 * ROUNDONE Beta 0.27.4 · animation parity for Vue 3 pages.
 * Original choreographic values: 970ms title, 1250ms panels, 145ms stagger,
 * original keyframe offsets, easing and transform coordinates.
 * No Firestore, storage, auth or application data interactions.
 * Old static preview uses its own original, unmodified JS file.
 */
import { nextTick } from 'vue'
import type { Router } from 'vue-router'

export const ROUNDONE_MOTION = Object.freeze({ titleMs: 970, panelMs: 1250, staggerMs: 145, maxDelayMs: 1450 })
export type MotionRole = 'title' | 'panel'
export const ROUNDONE_TITLE_FRAMES: Keyframe[] = [
  { offset: 0, opacity: 0, transform: 'translate3d(0,-37px,0) scale(.94)' },
  { offset: .55, opacity: 1, transform: 'translate3d(0,3px,0) scale(1.006)' },
  { offset: .77, opacity: 1, transform: 'translate3d(0,-1px,0) scale(.999)' },
  { offset: 1, opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
]
export const ROUNDONE_PANEL_FRAMES: Keyframe[] = [
  { offset: 0, opacity: 0, transform: 'translate3d(0,105px,0) scale(.84)' },
  { offset: .27, opacity: .92, transform: 'translate3d(0,35px,0) scale(.94)' },
  { offset: .55, opacity: 1, transform: 'translate3d(0,-8px,0) scale(1.014)' },
  { offset: .77, opacity: 1, transform: 'translate3d(0,3px,0) scale(.997)' },
  { offset: 1, opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
]
export function roundOneMotionOptions(role: MotionRole, index: number): KeyframeAnimationOptions {
  return {
    duration: role === 'title' ? ROUNDONE_MOTION.titleMs : ROUNDONE_MOTION.panelMs,
    delay: Math.min(Math.max(0,index) * ROUNDONE_MOTION.staggerMs, ROUNDONE_MOTION.maxDelayMs),
    easing: 'linear', fill: 'both',
  }
}

/**
 * Hook run once from main.ts; route changes replace active animations. The
 * original script selects #section-X, while Vue has RouterView descendants.
 * We retain original timing/frames, selecting the visible Vue page content.
 */
export function installRoundOneMotion(router: Router): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  const active = new Set<Animation>()
  let frame = 0
  let lastCompose = 0
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
  }
  const schedule = () => {
    if (frame) window.cancelAnimationFrame(frame)
    void nextTick(() => {
      frame = window.requestAnimationFrame(() => {frame = 0; compose()})
    })
  }
  // Like ROUNDONE's original observer: animate newly added cards, not all content
  // every time the realtime Firebase snapshot updates.
  const observer = new MutationObserver(mutations => {
    if (reduce.matches || window.performance.now() - lastCompose < 550) return
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
  reduce.addEventListener('change', () => { if (reduce.matches) abort() })
  router.afterEach(schedule)
  void router.isReady().then(schedule)
}
