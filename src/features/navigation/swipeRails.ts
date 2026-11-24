/** E.5.1 — a fitting rail is not a native horizontal scrollport. Measure only
 * known rails, on actual layout changes; never scan all elements per touch. */
import type {Directive} from 'vue'
export const knownSwipeRails='.lf-r13-week-scroll,.athlete-sheet-carousel,.lf-p360-picker-filters,.booking-period,.week-pills'
export function railFits(scrollWidth:number,clientWidth:number){return clientWidth>0&&scrollWidth<=clientWidth+2}
const cleanup=new WeakMap<HTMLElement,()=>void>()
export const vLfSwipeRails:Directive<HTMLElement>={mounted(stage){
 let frame=0,stopped=false
 const observed=new Set<Element>()
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null
 function update(){frame=0;if(stopped)return
  const mobile=window.innerWidth<(stage.classList.contains('coach-container')?901:800)
  const rails=Array.from(stage.querySelectorAll<HTMLElement>(knownSwipeRails)).filter(el=>!el.closest('.lf-motion-leaving'))
  const next=new Set<Element>([stage])
  for(const rail of rails){next.add(rail);for(const child of Array.from(rail.children))next.add(child)
   const vertical=rail.scrollHeight>rail.clientHeight+2&&['auto','scroll','overlay'].includes(getComputedStyle(rail).overflowY)
   rail.toggleAttribute('data-lf-rail-fits',mobile&&!vertical&&railFits(rail.scrollWidth,rail.clientWidth))
  }
  for(const el of observed)if(!next.has(el)){resize?.unobserve(el);observed.delete(el)}
  for(const el of next)if(!observed.has(el)){resize?.observe(el);observed.add(el)}
 }
 function schedule(){if(!stopped&&!frame)frame=requestAnimationFrame(update)}
 // Cue insertion/removal happens directly under the stage; text mutations may
 // target Text nodes. Neither should trigger a fresh rail geometry scan.
 const insideCue=(node:Node)=>!!(node instanceof Element?node:node.parentElement)?.closest('.lf-motion-cue')
 const mutation=new MutationObserver(records=>{if(records.some(r=>{
  if(insideCue(r.target))return false
  if(r.type==='childList'){const changed=[...Array.from(r.addedNodes),...Array.from(r.removedNodes)];if(changed.length&&changed.every(insideCue))return false}
  return true
 }))schedule()})
 mutation.observe(stage,{childList:true,subtree:true,characterData:true})
 window.addEventListener('resize',schedule,{passive:true});update()
 cleanup.set(stage,()=>{stopped=true;mutation.disconnect();resize?.disconnect();if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);for(const rail of stage.querySelectorAll('[data-lf-rail-fits]'))rail.removeAttribute('data-lf-rail-fits')})
},unmounted(stage){cleanup.get(stage)?.();cleanup.delete(stage)}}
