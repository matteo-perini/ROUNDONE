import type { Directive } from 'vue'
import { PREMIUM_MOTION_ENABLED } from './premiumMotionMode.ts'

// One local observer for each explicitly marked tab strip; no DOM-wide observer.
// A pseudo-element moves independently of Firebase and never intercepts input.
type TabState={selected:HTMLElement|null; frame:number; measured:HTMLElement|null; geometry:string; observer?:ResizeObserver; resize:()=>void}
const states=new WeakMap<HTMLElement,TabState>()
function active(el:HTMLElement):HTMLElement|null{
 return Array.from(el.children).find((child):child is HTMLElement=>child instanceof HTMLElement&&child.matches('button.selected,button.on,button[aria-pressed="true"],button[aria-selected="true"]'))??null
}
function measure(el:HTMLElement,state:TabState){
 if(state.frame)cancelAnimationFrame(state.frame)
 state.frame=requestAnimationFrame(()=>{
  state.frame=0;if(!el.isConnected)return
  const selected=active(el);if(!selected||!el.offsetWidth||!selected.offsetWidth){el.removeAttribute('data-lf-tab-indicator');el.removeAttribute('data-lf-tab-slide');state.measured=null;state.geometry='';return}
  // Offset geometry is local and is unaffected by ancestor entrance transforms.
  const x=selected.offsetLeft,y=selected.offsetTop+selected.offsetHeight-3
  const geometry=`${x}:${y}:${selected.offsetWidth}`
  if(state.measured===selected&&state.geometry===geometry)return
  el.toggleAttribute('data-lf-tab-slide',state.measured!==null&&state.measured!==selected&&el.hasAttribute('data-lf-tab-indicator'))
  state.measured=selected;state.geometry=geometry
  el.style.setProperty('--lf-tab-x',`${x}px`);el.style.setProperty('--lf-tab-y',`${y}px`);el.style.setProperty('--lf-tab-w',`${selected.offsetWidth}px`)
  el.setAttribute('data-lf-tab-indicator','')
 })
}
function update(el:HTMLElement,state:TabState){
 const selected=active(el);if(selected===state.selected)return
 if(state.selected)state.observer?.unobserve(state.selected)
 state.selected=selected;if(selected)state.observer?.observe(selected)
 measure(el,state)
}
export const premiumMotionTabs:Directive<HTMLElement>={
 mounted(el){if(!PREMIUM_MOTION_ENABLED)return;const state:TabState={selected:null,frame:0,measured:null,geometry:'',resize:()=>measure(el,state)};states.set(el,state);el.classList.add('lf-premium-tabs');if(typeof ResizeObserver!=='undefined'){state.observer=new ResizeObserver(state.resize);state.observer.observe(el)}else window.addEventListener('resize',state.resize,{passive:true});update(el,state)},
 updated(el){const state=states.get(el);if(state)update(el,state)},
 beforeUnmount(el){const state=states.get(el);if(!state)return;state.observer?.disconnect();window.removeEventListener('resize',state.resize);if(state.frame)cancelAnimationFrame(state.frame);states.delete(el)}
}
