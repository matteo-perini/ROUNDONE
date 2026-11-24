/** E.7.4 — guarded outer page pair. The incoming and outgoing elements are
 * the real RouterView roots; no route pre-mount, retained component, clone,
 * persistent storage or additional subscriptions. One shared animation clock.
 * The existing internal nativePageTrack owns the shared athlete workspace. */
export type ExternalPairPlan={from:string;to:string;scope:string;span:number;offset:number;direction:number;duration:number}
export type PairKind='enter'|'leave'
export function externalPairPlan(from:string,to:string,order:readonly string[],scope:string,span:number,offset:number,duration:number):ExternalPairPlan|null{
 const a=order.indexOf(from),b=order.indexOf(to)
 if(!scope||a<0||b<0||a===b||![span,offset,duration].every(Number.isFinite)||span<=0||duration<=0)return null
 const direction=Math.sign(a-b)
 return {from,to,scope,span,offset:Math.sign(offset)===direction?direction*Math.min(Math.abs(offset),span*.88):0,direction,duration:Math.min(400,duration)}
}
export function externalPairPositions(plan:ExternalPairPlan,progress:number){
 const p=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0))
 const leave=plan.offset+(plan.direction*plan.span-plan.offset)*p
 return {leave,enter:leave-plan.direction*plan.span}
}
type Surface={element:HTMLElement;originalTransform:string;originalWillChange:string;done?:()=>void;animation?:Animation}
type Pair={plan:ExternalPairPlan;origin:HTMLElement;enter?:Surface;leave?:Surface;timer?:ReturnType<typeof setTimeout>;started:boolean;finishing:boolean}
const translate=(x:number)=>`translate3d(${x}px,0,0)`
export function createExternalPageMotion(options:{scope:()=>string;path:()=>string;onHandoff:()=>void;onSettled:()=>void;waitMs?:number}){
 let pair:Pair|null=null
 function finish(p:Pair|null){
  if(!p||p.finishing)return
  p.finishing=true;if(pair===p)pair=null
  if(p.timer!==undefined)clearTimeout(p.timer)
  const surfaces=[p.leave,p.enter].filter((x):x is Surface=>!!x)
  // Cancel effects before restoring styles. The Vue leave callback removes
  // the old DOM immediately; never keep a disconnected account surface.
  for(const s of surfaces){if(s.animation){s.animation.onfinish=null;s.animation.oncancel=null;s.animation.cancel()}s.element.style.transform=s.originalTransform;s.element.style.willChange=s.originalWillChange;delete s.element.dataset.lfExternalMoving}
  options.onHandoff()
  for(const s of surfaces){const done=s.done;s.done=undefined;done?.()}
  options.onSettled()
 }
 function start(p:Pair){
  if(pair!==p||p.started||!p.enter?.done||!p.leave?.done)return
  if(options.scope()!==p.plan.scope||options.path()!==p.plan.to||!p.enter.element.isConnected||!p.leave.element.isConnected){finish(p);return}
  p.started=true;if(p.timer!==undefined)clearTimeout(p.timer)
  const first=externalPairPositions(p.plan,0),last=externalPairPositions(p.plan,1)
  try{
   const timing:KeyframeAnimationOptions={duration:p.plan.duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'}
   const time=p.enter.element.ownerDocument.timeline?.currentTime
   for(const kind of ['leave','enter'] as const){const s=p[kind]!;s.animation=s.element.animate([{transform:translate(first[kind])},{transform:translate(last[kind])}],timing);if(typeof time==='number')s.animation.startTime=time}
   // Replace a temporary visual cue only once both actual surfaces have their
   // initial transforms and animations, in this very same DOM update.
   options.onHandoff()
   const incoming=p.enter.animation!;incoming.onfinish=()=>finish(p);incoming.oncancel=()=>finish(p)
   p.leave.animation!.oncancel=()=>finish(p)
   // Hidden tabs, interrupted browser timelines and WebViews must not strand DOM.
   p.timer=setTimeout(()=>finish(p),p.plan.duration+120)
  }catch{finish(p)}
 }
 function prime(kind:PairKind,element:Element){
  const p=pair
  if(!p||p.started||!(element instanceof HTMLElement)||options.scope()!==p.plan.scope||options.path()!==p.plan.to||kind==='leave'&&element!==p.origin||kind==='enter'&&element===p.origin)return false
  if(p[kind])return p[kind]!.element===element
  p[kind]={element,originalTransform:element.style.transform,originalWillChange:element.style.willChange}
  element.style.transform=translate(externalPairPositions(p.plan,0)[kind]);element.style.willChange='transform';element.dataset.lfExternalMoving=kind
  return true
 }
 return {
  begin(plan:ExternalPairPlan|null,origin:HTMLElement|null){finish(pair);if(!plan||!origin?.isConnected||options.scope()!==plan.scope||options.path()!==plan.to)return false;const p:Pair={plan,origin,started:false,finishing:false};pair=p;p.timer=setTimeout(()=>finish(p),Math.max(50,Math.min(400,options.waitMs??240)));return true},
  prime,
  attach(kind:PairKind,element:Element,done:()=>void){const p=pair;if(!p||!prime(kind,element)){done();return}const s=p[kind]!;if(s.done){done();return}s.done=done;start(p)},
  // Vue may cancel enter/leave while another guarded route is committing.
  cancelled(element:Element){const p=pair;if(p&&(p.enter?.element===element||p.leave?.element===element))finish(p)},
  abort(){finish(pair)},
  waiting(){return !!pair&&!pair.started},
  moving(){return !!pair}
 }
}
