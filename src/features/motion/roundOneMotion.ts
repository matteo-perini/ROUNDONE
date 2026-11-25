/** E.8.2.1: bounded horizontal reveal after actual page motion settles.
 * No subtree observer, synchronous layout reads, or animation-dependent data flow. */
import {nextTick,type App,type Directive} from 'vue'
import type {Router} from 'vue-router'
import {isMobileSectionSlide} from '../navigation/continuousMotion.ts'
import {PREMIUM_MOTION_ENABLED} from './premiumMotionMode.ts'
export const ROUNDONE_MOTION=Object.freeze(PREMIUM_MOTION_ENABLED?{titleMs:550,panelMs:550,rowMs:550,staggerMs:55,rowStaggerMs:55,maxDelayMs:165,maxPanels:8,entryWindowMs:1600}:{titleMs:170,panelMs:210,rowMs:210,staggerMs:12,rowStaggerMs:12,maxDelayMs:36,maxPanels:8,entryWindowMs:1600})
export type MotionRole='title'|'panel'|'row'|'page'
export const ROUNDONE_TITLE_FRAMES:Keyframe[]=PREMIUM_MOTION_ENABLED?[{opacity:.12,translate:'28px 0'},{opacity:1,translate:'0 0'}]:[{opacity:.84,translate:'0 5px'},{opacity:1,translate:'0 0'}]
export const ROUNDONE_PANEL_FRAMES:Keyframe[]=PREMIUM_MOTION_ENABLED?[{opacity:.12,translate:'28px 0'},{opacity:1,translate:'0 0'}]:[{opacity:.82,translate:'0 9px'},{opacity:1,translate:'0 0'}]
const ROW:Keyframe[]=ROUNDONE_PANEL_FRAMES
// Late data may have painted before Vue's post-render callback: use a gentler
// opacity floor, but the same horizontal movement and timing.
const LATE:Keyframe[]=[{opacity:.72,translate:'28px 0'},{opacity:1,translate:'0 0'}]
const FADE:Keyframe[]=PREMIUM_MOTION_ENABLED?[{opacity:.8},{opacity:1}]:[{opacity:.94},{opacity:1}]
export function roundOneMotionOptions(role:MotionRole,index:number):KeyframeAnimationOptions{
 const row=role==='row'
 return {duration:row?ROUNDONE_MOTION.rowMs:role==='title'||role==='page'?ROUNDONE_MOTION.titleMs:ROUNDONE_MOTION.panelMs,delay:Math.min(Math.max(0,index)*(row?ROUNDONE_MOTION.rowStaggerMs:ROUNDONE_MOTION.staggerMs),ROUNDONE_MOTION.maxDelayMs),easing:PREMIUM_MOTION_ENABLED?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.22,.72,.24,1)',fill:'backwards'}
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
   if(e instanceof HTMLElement&&e.matches(row.match)&&!e.matches('[hidden],[aria-hidden="true"],.hidden,.modal-overlay,.notice,[role="alert"],[role="status"]')&&!(PREMIUM_MOTION_ENABLED&&e.matches('.lf14-gym-identity,.lf14-brand-container'))&&!out.some(parent=>parent===e||parent.contains?.(e)||e.contains?.(parent)))out.push(e)
  }
 }
 return out
}
export function installRoundOneMotion(router:Router,app:App):void{
 if(typeof window==='undefined'||typeof document==='undefined')return
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)')
 const active=new Map<Animation,HTMLElement>(),groups=new Map<HTMLElement,EntranceGroup>(),seen=new Set<string>()
 // IDs are scoped to a committed navigation. Re-entry may reveal once;
 // updates and remounts within that navigation do not replay.
 const explicitRoutes=new Set(['/home','/piano','/archivio','/coach','/coach/atleti','/coach/archivio','/messaggi','/coach/messaggi'])
 const blockedSelector='[inert],[hidden],[aria-hidden="true"],.lf-motion-leaving,[data-lf-track-inactive],[role="dialog"],[role="alertdialog"],.modal-overlay'
 const movingSelector='[data-lf-motion-dragging],[data-lf-external-pair],[data-lf-external-moving],.lf-native-track-rail[data-lf-track-moving],.lf-section-next-enter-active,.lf-section-prev-enter-active,.lf-chat-open-enter-active,.lf-chat-close-enter-active'
 let generation=0,frame=0,queued=false,deadline=0,used=0,firstFrame=false,sectionSlide=false,path=router.currentRoute.value.path
 let retryAfter=0
 const allowed=()=>!document.hidden&&!reduce.matches&&deadline>0&&performance.now()<=deadline
 function cancelActive(root?:HTMLElement){for(const [a,el] of active){if(root&&root!==el&&!root.contains?.(el))continue;active.delete(a);try{a.cancel()}catch{/* optional visual enhancement */}}}
 function stop(){generation++;queued=false;deadline=0;firstFrame=false;retryAfter=0;if(frame){cancelAnimationFrame(frame);frame=0}cancelActive()}
 function animate(el:HTMLElement,role:MotionRole,index:number,fadeOnly=false,late=false){
  if(typeof el.animate!=='function')return
  try{
   // Individual translate composes with existing layout transforms. Older WebViews fade only.
   const canTranslate=typeof CSS!=='undefined'&&CSS.supports('translate','28px 0')
   const frames=fadeOnly||!canTranslate?FADE:late&&PREMIUM_MOTION_ENABLED?LATE:role==='title'||role==='page'?ROUNDONE_TITLE_FRAMES:role==='row'&&PREMIUM_MOTION_ENABLED?ROW:ROUNDONE_PANEL_FRAMES
   const a=el.animate(frames,roundOneMotionOptions(role,index));active.set(a,el)
   a.onfinish=a.oncancel=()=>{active.delete(a)}
  }catch{/* Optional motion must never block content. */}
 }
 function flush(){
  if(!allowed())return
  // The shell's paired marker can outlive the real native rail by 1.2s.
  // Observe only actual active motion. Retry within the existing bounded
  // entrance window, at most one DOM check every 40ms while moving.
  if(PREMIUM_MOTION_ENABLED&&sectionSlide){
   if(performance.now()<retryAfter){schedule();return}
   if(document.querySelector(movingSelector)){retryAfter=performance.now()+40;schedule();return}
  }
  const isFirst=firstFrame;firstFrame=false
  let hasExplicit=false,retry=false
  for(const [el,group] of groups){
   if(!el.isConnected||el.closest?.(blockedSelector)||(!PREMIUM_MOTION_ENABLED&&group.premiumOnly))continue
   hasExplicit=true
   if(group.ready===false||seen.has(group.id))continue
   if(!PREMIUM_MOTION_ENABLED&&sectionSlide)continue
   if(el.closest?.(movingSelector)){retry=true;continue}
   // Mark only after motion has settled. The same group can now enter again
   // on a real route change, but cannot replay on filter/realtime updates.
   seen.add(group.id)
   for(const target of entranceTargets(el,group,ROUNDONE_MOTION.maxPanels-used)){
    if(target.closest?.(blockedSelector)||(PREMIUM_MOTION_ENABLED&&target.matches('.lf14-gym-identity,.lf14-brand-container'))||target.querySelector('[role="dialog"],.modal-overlay,.lf-p24-confirm-layer'))continue
    const role:MotionRole=target.matches('h1,h2,h3,header,.lf-v3-intro,.lf-coach-greeting,.lf-p360-head,.lfsettings-header,.wr-head,.lf-r13-heading')?'title':PREMIUM_MOTION_ENABLED&&target.matches('.lf-roster-card,.archive-card,.lf-archive-v4-item,.lf-p360-sheet,.lf-p360-history-row,.wr-day,.lf-agenda-group,.lf-ms-row,.lf19c-gym,.lf-chat-person,.lf-r15-history-program')?'row':'panel'
    // Already visible real pages should not disappear again. Use the gentle
    // opacity floor for their 550ms reveal; cold entries retain the full effect.
    animate(target,role,used++,false,sectionSlide||!isFirst)
   }
  }
  if(isFirst&&(!sectionSlide||PREMIUM_MOTION_ENABLED)&&!hasExplicit&&used===0&&!explicitRoutes.has(path)){
   const main=document.querySelector(PREMIUM_MOTION_ENABLED?'main.main-layout,main.booking-main,main.login-main':'main.main-layout,main.booking-main')
   const target=main&&Array.from(main.children).find(e=>!e.matches('.lf-route-back,.version,.lf17-bell-wrap,.notice,.modal-overlay,.lf27-delayed-loading,[role="alert"],[role="status"],button,aside')&&!e.closest?.(blockedSelector)&&!e.querySelector('.modal-overlay'))
   if(target instanceof HTMLElement&&!target.closest?.(movingSelector)){
    const title=target.matches('h1,h2')?target:target.querySelector('h1')
    if(PREMIUM_MOTION_ENABLED&&title instanceof HTMLElement){animate(title,'page',used++,false,sectionSlide)}else if(!PREMIUM_MOTION_ENABLED)animate(target,'panel',used++,true)
   }
  }
  if(retry&&used<ROUNDONE_MOTION.maxPanels)schedule()
 }
 function schedule(){
  if(queued||!allowed())return
  queued=true;const epoch=generation
  void nextTick(()=>{
   if(epoch!==generation)return
   frame=requestAnimationFrame(()=>{frame=0;queued=false;if(epoch===generation)flush()})
  })
 }
 const directive:Directive<HTMLElement,EntranceGroup>={
  mounted(el,b){groups.set(el,b.value);if(b.value.ready!==false&&!seen.has(b.value.id))schedule()},
  updated(el,b){
   groups.set(el,b.value)
   if(b.value.ready===false){cancelActive(el);return}
   if(b.oldValue?.ready===false&&!seen.has(b.value.id))schedule()
  },
  beforeUnmount(el){groups.delete(el);cancelActive(el)}
 }
 app.directive('lf-entrance',directive)
 function enter(nextPath:string,slide=false){stop();path=nextPath;seen.clear();used=0;sectionSlide=slide;if(slide&&!PREMIUM_MOTION_ENABLED)return;deadline=performance.now()+ROUNDONE_MOTION.entryWindowMs;firstFrame=true;schedule()}
 router.afterEach((to,from,failure)=>{if(failure)return;if(to.path!==from.path)enter(to.path,isMobileSectionSlide(from.path,to.path,window.innerWidth));else if(to.fullPath!==from.fullPath){deadline=0}})
 const changed=()=>{if(reduce.matches)stop()}
 if(typeof reduce.addEventListener==='function')reduce.addEventListener('change',changed);else reduce.addListener?.(changed)
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()})
 // A normal tap must not jump a card away from its finger. Only confirmed
 // horizontal intent cancels running reveals; all input closes future reveals.
 function finishEntrance(){deadline=0;firstFrame=false}
 document.addEventListener('pointerdown',finishEntrance,{passive:true,capture:true})
 document.addEventListener('touchstart',finishEntrance,{passive:true,capture:true})
 document.addEventListener('wheel',finishEntrance,{passive:true,capture:true})
 document.addEventListener('keydown',finishEntrance,{capture:true})
 window.addEventListener?.('lionfit:content-gesture-start',()=>{if(PREMIUM_MOTION_ENABLED){finishEntrance();cancelActive()}})
 const resetScope=()=>{stop();seen.clear()}
 window.addEventListener?.('lionfit:motion-scope-invalidated',resetScope)
 window.addEventListener?.('lionfit:content-scope-invalidated',resetScope)
 enter(path)
}
