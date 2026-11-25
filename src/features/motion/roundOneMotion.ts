import type {App,Directive} from 'vue'
import type {Router} from 'vue-router'
import {PREMIUM_MOTION_ENABLED} from './premiumMotionMode.ts'
export type EntranceRows={within?:string;match:string}
export type EntranceGroup={id:string;ready?:boolean;premiumOnly?:boolean;rows:EntranceRows[]}
export const DATA_REVEAL_MS=160
const blocked='[inert],[hidden],[aria-hidden="true"],.lf-motion-leaving,[data-lf-track-inactive],[role="dialog"],[role="alertdialog"],.modal-overlay'
const moving='[data-lf-motion-dragging],[data-lf-external-pair],[data-lf-external-moving],.lf-native-track-rail[data-lf-track-moving],.lf-section-next-enter-active,.lf-section-prev-enter-active,.lf-chat-open-enter-active,.lf-chat-close-enter-active'
// Only explicit direct-child targets, never the entire page, editor, or branding.
export function entranceTargets(root:HTMLElement,group:EntranceGroup,limit=6):HTMLElement[]{
 const out:HTMLElement[]=[]
 for(const row of group.rows){
  if(out.length>=limit)break
  const host=row.within?root.querySelector(row.within):root
  if(!host)continue
  for(let i=0;i<Math.min(host.children.length,16)&&out.length<limit;i++){
   const e=host.children[i]
   if(e instanceof HTMLElement&&e.matches(row.match)&&!e.matches('[hidden],[aria-hidden="true"],.hidden,.modal-overlay,.notice,[role="alert"],[role="status"],.lf14-gym-identity,.lf14-brand-container')&&!out.some(parent=>parent===e||parent.contains(e)||e.contains(parent)))out.push(e)
  }
 }
 return out
}
/** E.8.3: no navigation reveals, no delay/stagger and no deferred retries.
 * Only a first false -> true data transition may fade newly inserted targets.
 * If a real page is moving, skip permanently, never wait for settlement. */
export function installRoundOneMotion(router:Router,app:App):void{
 if(typeof window==='undefined'||typeof document==='undefined')return
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)')
 const groups=new WeakMap<HTMLElement,{pending:boolean;before:WeakSet<HTMLElement>}>()
 const active=new Map<Animation,HTMLElement>()
 function cancel(root?:HTMLElement){for(const [a,el] of active){if(root&&root!==el&&!root.contains(el))continue;active.delete(a);try{a.cancel()}catch{/* optional */}}}
 function remember(el:HTMLElement,group:EntranceGroup,state:{before:WeakSet<HTMLElement>}){for(const target of entranceTargets(el,group,64))state.before.add(target)}
 const directive:Directive<HTMLElement,EntranceGroup>={
  mounted(el,b){const state={pending:b.value.ready===false,before:new WeakSet<HTMLElement>()};groups.set(el,state);if(state.pending)remember(el,b.value,state)},
  updated(el,b){
   const state=groups.get(el);if(!state?.pending)return
   if(b.value.ready===false){remember(el,b.value,state);return}
   state.pending=false
   if(b.oldValue?.ready!==false||b.value.ready!==true||b.oldValue.id!==b.value.id||(!PREMIUM_MOTION_ENABLED&&b.value.premiumOnly)||document.hidden||reduce.matches||!el.isConnected||el.closest(blocked)||el.closest(moving)||document.querySelector(moving))return
   for(const target of entranceTargets(el,b.value)){
    if(state.before.has(target)||target.closest(blocked)||target.querySelector('[role="dialog"],.modal-overlay,.lf-p24-confirm-layer')||typeof target.animate!=='function')continue
    try{const a=target.animate([{opacity:.94},{opacity:1}],{duration:DATA_REVEAL_MS,delay:0,easing:'ease-out'});active.set(a,target);a.onfinish=a.oncancel=()=>{active.delete(a)}}catch{/* optional */}
   }
  },
  beforeUnmount(el){groups.delete(el);cancel(el)}
 }
 app.directive('lf-entrance',directive)
 router.afterEach((to,from,failure)=>{if(!failure&&to.path!==from.path)cancel()})
 const changed=()=>{if(reduce.matches)cancel()}
 if(typeof reduce.addEventListener==='function')reduce.addEventListener('change',changed);else reduce.addListener?.(changed)
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()})
 for(const event of ['lionfit:content-gesture-start','lionfit:motion-scope-invalidated','lionfit:content-scope-invalidated'])window.addEventListener(event,()=>cancel())
}
