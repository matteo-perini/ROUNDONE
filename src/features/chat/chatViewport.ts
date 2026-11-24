/** E.6: mobile chat layout. Geometry only; no auth, messages, storage or network. */
export type ChatViewportInput={width:number;layoutHeight:number;visibleHeight:number;offsetTop:number;scale:number;pageTop:number;dockTop:number|null;focused:boolean;baselineHeight:number;mobile:boolean}
export function chatViewportGeometry(v:ChatViewportInput){
 if(!v.mobile||!Number.isFinite(v.scale)||Math.abs(v.scale-1)>.03)return {keyboard:false,height:null}
 if(![v.width,v.layoutHeight,v.visibleHeight,v.offsetTop,v.pageTop,v.baselineHeight].every(Number.isFinite)||v.width<=0||v.visibleHeight<=0)return {keyboard:false,height:null}
 const visible=v.visibleHeight,bottom=v.offsetTop+visible
 // Handles both visual-viewport resize and WebViews which resize their layout viewport.
 // Focus alone is not evidence of a software keyboard (hardware keyboards, accessibility).
 const keyboard=v.focused&&Math.max(v.layoutHeight-visible,v.baselineHeight-visible)>=100
 const usableBottom=!keyboard&&v.dockTop!==null&&Number.isFinite(v.dockTop)?Math.min(bottom,v.dockTop):bottom
 const height=Math.floor(usableBottom-v.pageTop-6)
 // Invalid/intermediate layout must never collapse the chat. Let CSS provide
 // a usable fallback and retry after route/viewport geometry settles.
 return {keyboard,height:height>=(keyboard?112:200)?height:null}
}
const keyboardAttribute='data-lf-chat-keyboard'
let keyboardOwner:HTMLElement|null=null
export function attachChatViewport(root:HTMLElement,options:{active:()=>boolean;mobile:()=>boolean;onLayout:()=>void}){
 const vv=window.visualViewport
 let frame=0,baseline=0,width=0,disposed=false,lastHeight:number|null=null
 let retry:ReturnType<typeof setTimeout>|null=null,retryCount=0
 const retryDelays=[32,64,120,240,400,600]
 function stopRetry(){if(retry!==null){clearTimeout(retry);retry=null}retryCount=0}
 function retryGeometry(){if(retry!==null||retryCount>=retryDelays.length||disposed)return;retry=setTimeout(()=>{retry=null;schedule()},retryDelays[retryCount++])}
 const visibleHeight=()=>vv?.height??window.innerHeight
 const focused=()=>{const el=document.activeElement;return el instanceof HTMLElement&&root.contains(el)&&el.matches('textarea,input[type="search"]')}
 function setKeyboard(open:boolean){
  if(open){keyboardOwner=root;document.body.setAttribute(keyboardAttribute,'')}
  else if(keyboardOwner===root){keyboardOwner=null;document.body.removeAttribute(keyboardAttribute)}
  root.classList.toggle('lf-chat-keyboard-open',open)
 }
 function reset(blur=false,preserve=false){
  if(blur&&focused())(document.activeElement as HTMLElement).blur()
  if(frame){cancelAnimationFrame(frame);frame=0}
  stopRetry()
  // Keep the outgoing page geometry for Vue's leave animation; restore the dock now.
  if(preserve){if(keyboardOwner===root){keyboardOwner=null;document.body.removeAttribute(keyboardAttribute)}return}
  setKeyboard(false);root.style.removeProperty('--lf-chat-visible-height');lastHeight=null;baseline=0;width=0
 }
 function measure(){
  frame=0
  if(disposed||!root.isConnected||!options.active())return
  if(!options.mobile()){reset();return}
  const w=window.innerWidth,h=visibleHeight(),scale=vv?.scale??1,hasFocus=focused()
  if(!Number.isFinite(scale)||Math.abs(scale-1)>.03){stopRetry();setKeyboard(false);root.style.removeProperty('--lf-chat-visible-height');lastHeight=null;return}
  if(w!==width){width=w;baseline=Math.max(window.innerHeight,h)}
  // Keep the full-height baseline during a keyboard resize; reset once focus is gone.
  if(!hasFocus)baseline=Math.max(window.innerHeight,h)
  else baseline=Math.max(baseline,h)
  const input={width:w,layoutHeight:window.innerHeight,visibleHeight:h,offsetTop:vv?.offsetTop??0,scale,pageTop:root.getBoundingClientRect().top,dockTop:null as number|null,focused:hasFocus,baselineHeight:baseline,mobile:true}
  const keyboard=chatViewportGeometry(input).keyboard
  setKeyboard(keyboard)
  // Measure after restoring the dock; the athlete dock is teleported to body.
  if(!keyboard){const dock=document.querySelector<HTMLElement>('[data-lionfit-dock="athlete"],.app.as-coach .coach-bottom');if(dock&&dock.getClientRects().length)input.dockTop=dock.getBoundingClientRect().top}
  const result=chatViewportGeometry(input)
  if(result.height===null){
   // A stale valid height is safer than zero, but can be wrong after keyboard
   // or dock changes. Return to CSS rather than retain an invalid measurement.
   root.style.removeProperty('--lf-chat-visible-height')
   if(lastHeight!==null){lastHeight=null;options.onLayout()}
   retryGeometry();return
  }
  stopRetry()
  if(result.height!==lastHeight){lastHeight=result.height;root.style.setProperty('--lf-chat-visible-height',`${result.height}px`);options.onLayout()}
 }
 function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(measure)}
 // Capture the pre-keyboard height before the browser changes its viewport.
 function focusIn(){if(!baseline)baseline=Math.max(window.innerHeight,visibleHeight());schedule()}
 function transitionSettled(e:Event){if(e.target===root){stopRetry();schedule()}}
 root.addEventListener('transitionend',transitionSettled);root.addEventListener('transitioncancel',transitionSettled)
 root.addEventListener('focusin',focusIn);root.addEventListener('focusout',schedule)
 window.addEventListener('resize',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true,capture:true})
 vv?.addEventListener('resize',schedule,{passive:true});vv?.addEventListener('scroll',schedule,{passive:true})
 schedule()
 return {schedule,deactivate(preserve=false){reset(true,preserve)},dispose(){disposed=true;reset(true);root.removeEventListener('transitionend',transitionSettled);root.removeEventListener('transitioncancel',transitionSettled);root.removeEventListener('focusin',focusIn);root.removeEventListener('focusout',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);vv?.removeEventListener('resize',schedule);vv?.removeEventListener('scroll',schedule)}}
}
export function chatNearBottom(el:{scrollHeight:number;scrollTop:number;clientHeight:number},threshold=90){return el.scrollHeight-el.scrollTop-el.clientHeight<=threshold}
