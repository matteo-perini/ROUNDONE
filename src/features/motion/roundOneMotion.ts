/** PATCH 27 R2: short, progressive entrance on explicit page groups.
 * No subtree observer, synchronous layout reads, or animation-dependent data flow. */
import {nextTick,type App,type Directive} from 'vue'
import type {Router} from 'vue-router'
export const ROUNDONE_MOTION=Object.freeze({titleMs:170,panelMs:210,staggerMs:12,maxDelayMs:36,maxPanels:8,entryWindowMs:1600})
export type MotionRole='title'|'panel'
export const ROUNDONE_TITLE_FRAMES:Keyframe[]=[{opacity:.84,translate:'0 5px'},{opacity:1,translate:'0 0'}]
export const ROUNDONE_PANEL_FRAMES:Keyframe[]=[{opacity:.82,translate:'0 9px'},{opacity:1,translate:'0 0'}]
const FADE:Keyframe[]=[{opacity:.94},{opacity:1}]
export function roundOneMotionOptions(role:MotionRole,index:number):KeyframeAnimationOptions{
 return {duration:role==='title'?ROUNDONE_MOTION.titleMs:ROUNDONE_MOTION.panelMs,delay:Math.min(Math.max(0,index)*ROUNDONE_MOTION.staggerMs,ROUNDONE_MOTION.maxDelayMs),easing:'cubic-bezier(.22,.72,.24,1)',fill:'backwards'}
}
export type EntranceRows={within?:string;match:string}
export type EntranceGroup={id:string;ready?:boolean;rows:EntranceRows[]}
// Explicit direct-child selectors only. Stop walking when the animation budget is exhausted.
export function entranceTargets(root:HTMLElement,group:EntranceGroup,limit:number):HTMLElement[]{
 const out:HTMLElement[]=[]
 for(const row of group.rows){
  if(out.length>=limit)break
  const host=row.within?root.querySelector(row.within):root
  if(!host)continue
  // Bound even when the requested rows are absent (large lists or a hidden section).
  for(let i=0;i<Math.min(host.children.length,16)&&out.length<limit;i++){
   const e=host.children[i]
   if(e instanceof HTMLElement&&e.matches(row.match)&&!e.matches('[hidden],[aria-hidden="true"],.hidden,.modal-overlay,.notice,[role="alert"],[role="status"]')&&!out.includes(e))out.push(e)
  }
 }
 return out
}
export function installRoundOneMotion(router:Router,app:App):void{
 if(typeof window==='undefined'||typeof document==='undefined')return
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)')
 const active=new Set<Animation>(),groups=new Map<HTMLElement,EntranceGroup>(),seen=new Set<string>()
 const explicitRoutes=new Set(['/home','/piano','/archivio','/coach','/coach/atleti','/coach/archivio'])
 let generation=0,frame=0,queued=false,deadline=0,used=0,firstFrame=false,path=router.currentRoute.value.path
 const allowed=()=>!document.hidden&&!reduce.matches&&performance.now()<=deadline
 function stop(){generation++;queued=false;deadline=0;firstFrame=false;if(frame){cancelAnimationFrame(frame);frame=0}for(const a of active){try{a.cancel()}catch{/* optional visual enhancement */}}active.clear()}
 function animate(el:HTMLElement,role:MotionRole,index:number,fadeOnly=false){
  if(typeof el.animate!=='function')return
  try{
   // Individual translate composes with existing card transforms; older WebViews fade only.
   const canTranslate=typeof CSS!=='undefined'&&CSS.supports('translate','0 9px')
   const frames=fadeOnly||!canTranslate?FADE:role==='title'?ROUNDONE_TITLE_FRAMES:ROUNDONE_PANEL_FRAMES
   const a=el.animate(frames,roundOneMotionOptions(role,index));active.add(a)
   a.onfinish=a.oncancel=()=>{active.delete(a)}
  }catch{/* A browser without animation support must still render the page normally. */}
 }
 function flush(){
  if(!allowed())return
  const isFirst=firstFrame;firstFrame=false
  // Map contains only explicitly registered groups, not individual cards or the entire DOM.
  for(const [el,group] of groups){
   if(!el.isConnected||group.ready===false||seen.has(group.id))continue
   seen.add(group.id) // even an empty first snapshot is consumed; filters do not replay the entrance
   for(const target of entranceTargets(el,group,ROUNDONE_MOTION.maxPanels-used)){
    animate(target,target.matches('h1,h2,h3,header,.lf-v3-intro')?'title':'panel',used++)
   }
  }
  if(isFirst&&used===0&&!explicitRoutes.has(path)){
   const main=document.querySelector('main.main-layout,main.booking-main')
   const target=main&&Array.from(main.children).find(e=>!e.matches('.lf-route-back,.version,.lf17-bell-wrap,.notice,.modal-overlay,.lf27-delayed-loading,[role="alert"],[role="status"],button,aside')&&!e.querySelector('.modal-overlay'))
   if(target instanceof HTMLElement)animate(target,'panel',0,true)
  }
 }
 function schedule(){
  if(queued||!allowed())return
  queued=true;const epoch=generation
  void nextTick(()=>{
   if(epoch!==generation)return
   frame=requestAnimationFrame(()=>{frame=0;queued=false;if(epoch===generation)flush()})
  })
 }
 function ready(el:HTMLElement,group:EntranceGroup){groups.set(el,group);if(group.ready!==false&&!seen.has(group.id))schedule()}
 const directive:Directive<HTMLElement,EntranceGroup>={
  mounted(el,b){ready(el,b.value)},
  updated(el,b){
   groups.set(el,b.value)
   // Only the initial explicit data-ready edge can schedule a later first entrance.
   if(b.oldValue?.ready===false&&b.value.ready!==false&&!seen.has(b.value.id))schedule()
  },
  beforeUnmount(el){groups.delete(el)}
 }
 app.directive('lf-entrance',directive)
 function enter(nextPath:string){stop();path=nextPath;seen.clear();used=0;deadline=performance.now()+ROUNDONE_MOTION.entryWindowMs;firstFrame=true;schedule()}
 router.afterEach((to,from,failure)=>{if(failure)return;if(to.path!==from.path)enter(to.path);else if(to.fullPath!==from.fullPath)deadline=0})
 // Legacy embedded WebViews use addListener rather than addEventListener.
 const changed=()=>{if(reduce.matches)stop()}
 if(typeof reduce.addEventListener==='function')reduce.addEventListener('change',changed);else reduce.addListener?.(changed)
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()})
 // When the user starts scrolling or tapping, do not animate additional async rows.
 function finishEntrance(){deadline=0;firstFrame=false}
 document.addEventListener('pointerdown',finishEntrance,{passive:true,capture:true})
 document.addEventListener('touchstart',finishEntrance,{passive:true,capture:true})
 document.addEventListener('wheel',finishEntrance,{passive:true,capture:true})
 document.addEventListener('keydown',finishEntrance,{capture:true})
 enter(path)
}
