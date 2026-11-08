/** LION FIT · Transizioni di pagina (correzione 08 novembre 2026).
 * Rientrando in Home / Piano / Archivio / Coach la transizione riparte.
 * Cambiare solamente settimana, giorno o filtro nella stessa pagina NON anima
 * nuovamente il contenuto; non modifica dati Firebase, URL o navigazione.
 */
import {nextTick} from 'vue'
import type {Router} from 'vue-router'

export const ROUNDONE_MOTION=Object.freeze({titleMs:620,panelMs:720,staggerMs:90,maxDelayMs:450})
export type MotionRole='title'|'panel'
export const ROUNDONE_TITLE_FRAMES:Keyframe[]=[
 {opacity:0,transform:'translate3d(0,12px,0)'},
 {opacity:1,transform:'translate3d(0,0,0)'},
]
export const ROUNDONE_PANEL_FRAMES:Keyframe[]=[
 {opacity:0,transform:'translate3d(0,17px,0) scale(.987)'},
 {opacity:1,transform:'translate3d(0,0,0) scale(1)'},
]
export function roundOneMotionOptions(role:MotionRole,index:number):KeyframeAnimationOptions{
 return {duration:role==='title'?ROUNDONE_MOTION.titleMs:ROUNDONE_MOTION.panelMs,
  delay:Math.min(Math.max(0,index)*ROUNDONE_MOTION.staggerMs,ROUNDONE_MOTION.maxDelayMs),
  easing:'cubic-bezier(.22,.73,.25,1)',fill:'both'}
}
export function installRoundOneMotion(router:Router):void{
 if(typeof window==='undefined'||typeof document==='undefined')return
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)')
 const active=new Set<Animation>()
 let animated=new WeakSet<Element>()
 let frame=0
 let generation=0
 let pendingUntil=0
 let currentPath=router.currentRoute.value.path

 const root=()=>document.querySelector('main.main-layout,main.booking-main,main.login-main')
 const visible=(el:Element):el is HTMLElement=>{
  if(!(el instanceof HTMLElement)||el.closest('[hidden],[aria-hidden="true"],.hidden,.modal-overlay'))return false
  const style=getComputedStyle(el)
  if(style.display==='none'||style.visibility==='hidden')return false
  const rect=el.getBoundingClientRect()
  return rect.width>0&&rect.height>0&&rect.bottom>-30&&rect.top<innerHeight+60
 }
 const abort=()=>{
  for(const a of active){try{a.cancel()}catch{/* Element already removed */}}
  active.clear()
 }
 const targets=(main:Element):HTMLElement[]=>{
  // La Home ha quattro blocchi nella sequenza della preview approvata.
  const home=main.querySelector('.lf-home-approved')
  if(home)return Array.from(home.children).filter(visible).slice(0,9)
  // Il Piano viene animato SOLO all'ingresso nella route /piano.
  // I cambi di settimana aggiornano i suoi nodi senza una nuova animazione.
  const plan=main.querySelector('.athlete-plan')
  if(plan)return Array.from(plan.children).filter(visible).slice(0,12)
  const result:HTMLElement[]=[]
  const unwrap=(el:Element,depth:number)=>{
   if(result.length>=12)return
   if(depth<3&&el instanceof HTMLElement&&(
    el.classList.contains('stack')||el.classList.contains('athlete-live-screen')||
    el.classList.contains('booking-in-shell')
   )){
    for(const child of el.children)unwrap(child,depth+1)
    return
   }
   if(visible(el)&&!el.classList.contains('version')&&!el.classList.contains('modal-overlay'))result.push(el)
  }
  for(const child of main.children)unwrap(child,0)
  return result.slice(0,12)
 }
 const compose=(epoch:number)=>{
  if(epoch!==generation||document.hidden||reduce.matches)return
  const main=root()
  if(!main)return
  for(const [index,el] of targets(main).entries()){
   if(animated.has(el)||typeof el.animate!=='function')continue
   animated.add(el)
   const isTitle=el.matches('h1,h2,h3,.lf-v3-intro,.green-hero')
   const a=el.animate(isTitle?ROUNDONE_TITLE_FRAMES:ROUNDONE_PANEL_FRAMES,
    roundOneMotionOptions(isTitle?'title':'panel',index))
   active.add(a)
   a.onfinish=()=>{active.delete(a);try{a.cancel()}catch{/* Already done */}}
   a.oncancel=()=>active.delete(a)
  }
 }
 const schedule=()=>{
  if(document.hidden||reduce.matches||performance.now()>pendingUntil)return
  if(frame)cancelAnimationFrame(frame)
  const epoch=generation
  void nextTick(()=>{
   if(epoch!==generation||document.hidden)return
   frame=requestAnimationFrame(()=>{frame=0;compose(epoch)})
  })
 }
 const enter=(path:string)=>{
  currentPath=path
  generation++
  animated=new WeakSet<Element>()
  abort()
  pendingUntil=performance.now()+1900 // include async first snapshot, not all realtime updates
  schedule()
 }
 // DOM async: se i dati delle schede arrivano DOPO il cambio pagina,
 // anima i nuovi blocchi SOLO durante il breve intervallo di ingresso.
 const observer=new MutationObserver(mutations=>{
  if(document.hidden||reduce.matches||performance.now()>pendingUntil)return
  if(!mutations.some(m=>m.type==='childList'&&m.addedNodes.length))return
  schedule()
 })
 observer.observe(document.getElementById('app')??document.body,{childList:true,subtree:true})
 router.afterEach((to,from,failure)=>{
  if(failure)return
  if(to.path!==from.path){enter(to.path);return}
  // Query-only: /piano?week=1 → /piano?week=2. Nessun nuovo effetto.
  if(to.fullPath!==from.fullPath){pendingUntil=0;currentPath=to.path}
 })
 reduce.addEventListener('change',()=>{if(reduce.matches){pendingUntil=0;abort()}})
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){pendingUntil=0;abort();if(frame){cancelAnimationFrame(frame);frame=0}}
 })
 void router.isReady().then(()=>{if(currentPath===router.currentRoute.value.path)enter(currentPath)})
}
