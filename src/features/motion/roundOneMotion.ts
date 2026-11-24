/** PATCH 28 R2: bounded Premium Motion on explicit page groups.
 * No subtree observer, synchronous layout reads, or animation-dependent data flow. */
import {nextTick,type App,type Directive} from 'vue'
import type {Router} from 'vue-router'
import {isMobileSectionSlide} from '../navigation/continuousMotion.ts'
import {PREMIUM_MOTION_ENABLED} from './premiumMotionMode.ts'
export const ROUNDONE_MOTION=Object.freeze(PREMIUM_MOTION_ENABLED?{titleMs:510,panelMs:510,rowMs:450,staggerMs:70,rowStaggerMs:80,maxDelayMs:140,maxPanels:8,entryWindowMs:1600}:{titleMs:170,panelMs:210,rowMs:210,staggerMs:12,rowStaggerMs:12,maxDelayMs:36,maxPanels:8,entryWindowMs:1600})
export type MotionRole='title'|'panel'|'row'|'page'
export const ROUNDONE_TITLE_FRAMES:Keyframe[]=PREMIUM_MOTION_ENABLED?[{opacity:.7,translate:'28px 0'},{opacity:1,translate:'0 0'}]:[{opacity:.84,translate:'0 5px'},{opacity:1,translate:'0 0'}]
export const ROUNDONE_PANEL_FRAMES:Keyframe[]=PREMIUM_MOTION_ENABLED?[{opacity:.72,translate:'0 25px',scale:'.97'},{opacity:1,translate:'0 0',scale:'1'}]:[{opacity:.82,translate:'0 9px'},{opacity:1,translate:'0 0'}]
const ROW:Keyframe[]=[{opacity:.75,translate:'18px 0'},{opacity:1,translate:'0 0'}]
const FADE:Keyframe[]=PREMIUM_MOTION_ENABLED?[{opacity:.8},{opacity:1}]:[{opacity:.94},{opacity:1}]
export function roundOneMotionOptions(role:MotionRole,index:number):KeyframeAnimationOptions{
 const row=role==='row'
 return {duration:row?ROUNDONE_MOTION.rowMs:role==='title'||role==='page'?ROUNDONE_MOTION.titleMs:ROUNDONE_MOTION.panelMs,delay:Math.min(Math.max(0,index)*(row?ROUNDONE_MOTION.rowStaggerMs:ROUNDONE_MOTION.staggerMs),ROUNDONE_MOTION.maxDelayMs),easing:PREMIUM_MOTION_ENABLED?'cubic-bezier(.22,1,.36,1)':'cubic-bezier(.22,.72,.24,1)',fill:'backwards'}
}
export type EntranceRows={within?:string;match:string}
export type EntranceGroup={id:string;ready?:boolean;premiumOnly?:boolean;rows:EntranceRows[]}
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
   if(e instanceof HTMLElement&&e.matches(row.match)&&!e.matches('[hidden],[aria-hidden="true"],.hidden,.modal-overlay,.notice,[role="alert"],[role="status"]')&&!(PREMIUM_MOTION_ENABLED&&e.matches('.lf14-gym-identity,.lf14-brand-container'))&&!out.includes(e))out.push(e)
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
 function animate(el:HTMLElement,role:MotionRole,index:number,fadeOnly=false,late=false){
  if(typeof el.animate!=='function')return
  try{
   // Individual translate composes with existing card transforms; older WebViews fade only.
   const canTranslate=typeof CSS!=='undefined'&&CSS.supports('translate','0 9px')
   const frames=late&&PREMIUM_MOTION_ENABLED?[{opacity:.9},{opacity:1}]:fadeOnly||!canTranslate?FADE:role==='title'||role==='page'?ROUNDONE_TITLE_FRAMES:role==='row'&&PREMIUM_MOTION_ENABLED?ROW:ROUNDONE_PANEL_FRAMES
   const safeFrames=canTranslate&&typeof CSS!=='undefined'&&!CSS.supports('scale','.97')?frames.map(({scale,...frame})=>frame):frames
   const a=el.animate(safeFrames,late&&PREMIUM_MOTION_ENABLED?{duration:180,delay:0,easing:'ease-out',fill:'backwards'}:roundOneMotionOptions(role,index));active.add(a)
   a.onfinish=a.oncancel=()=>{active.delete(a)}
  }catch{/* A browser without animation support must still render the page normally. */}
 }
 function flush(){
  if(!allowed())return
  const isFirst=firstFrame;firstFrame=false
  // Map contains only explicitly registered groups, not individual cards or the entire DOM.
  for(const [el,group] of groups){
   if(!el.isConnected||el.closest?.('[data-lf-track-inactive],.lf-native-track-rail[data-lf-track-moving]')||group.ready===false||seen.has(group.id)||(!PREMIUM_MOTION_ENABLED&&group.premiumOnly))continue
   seen.add(group.id) // even an empty first snapshot is consumed; filters do not replay the entrance
   for(const target of entranceTargets(el,group,ROUNDONE_MOTION.maxPanels-used)){
    // Branding remains independent of route animations. Skip fixed/modal-containing wrappers.
    if(PREMIUM_MOTION_ENABLED&&target.matches('.lf14-gym-identity,.lf14-brand-container'))continue
    const role:MotionRole=target.matches('h1,h2,h3,header,.lf-v3-intro,.lf-coach-greeting,.lf-p360-head,.lfsettings-header,.wr-head')?'title':PREMIUM_MOTION_ENABLED&&target.matches('.lf-roster-card,.archive-card,.lf-archive-v4-item,.lf-p360-sheet,.lf-p360-history-row,.wr-day,.lf-agenda-group,.lf-ms-row,.lf19c-gym')?'row':'panel'
    animate(target,role,used++,false,!isFirst)
   }
  }
  if(isFirst&&used===0&&!explicitRoutes.has(path)){
   const main=document.querySelector(PREMIUM_MOTION_ENABLED?'main.main-layout,main.booking-main,main.login-main':'main.main-layout,main.booking-main')
   const target=main&&Array.from(main.children).find(e=>!e.matches('.lf-route-back,.version,.lf17-bell-wrap,.notice,.modal-overlay,.lf27-delayed-loading,[role="alert"],[role="status"],button,aside')&&!e.querySelector('.modal-overlay'))
   if(target instanceof HTMLElement){
    // Translate only the selected content root, never the persistent shell/branding or an open dialog.
    if(PREMIUM_MOTION_ENABLED&&!target.matches('.lf14-gym-identity,.lf14-brand-container')&&!target.querySelector('.lf14-gym-identity,.lf14-brand-container,[role=dialog],.lf-p24-confirm-layer,.lf-quiet-status'))animate(target,'page',0)
    else {const title=PREMIUM_MOTION_ENABLED?target.querySelector('h1'):null;if(title instanceof HTMLElement)animate(title,'page',0);else if(!PREMIUM_MOTION_ENABLED)animate(target,'panel',0,true)}
   }
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
 function enter(nextPath:string,sectionSlide=false){stop();path=nextPath;seen.clear();used=0;if(sectionSlide)return;deadline=performance.now()+ROUNDONE_MOTION.entryWindowMs;firstFrame=true;schedule()}
 router.afterEach((to,from,failure)=>{if(failure)return;if(to.path!==from.path)enter(to.path,isMobileSectionSlide(from.path,to.path,window.innerWidth));else if(to.fullPath!==from.fullPath)deadline=0})
 // Legacy embedded WebViews use addListener rather than addEventListener.
 const changed=()=>{if(reduce.matches)stop()}
 if(typeof reduce.addEventListener==='function')reduce.addEventListener('change',changed);else reduce.addListener?.(changed)
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()})
 // When the user starts scrolling or tapping, do not animate additional async rows.
 function finishEntrance(){
  deadline=0;firstFrame=false
  // Let already-running transitions finish; cancellation causes a visible snap.
 }
 document.addEventListener('pointerdown',finishEntrance,{passive:true,capture:true})
 document.addEventListener('touchstart',finishEntrance,{passive:true,capture:true})
 document.addEventListener('wheel',finishEntrance,{passive:true,capture:true})
 document.addEventListener('keydown',finishEntrance,{capture:true})
 enter(path)
}
