/** E.7.2: one moving rail of actual, already-authorized Vue page elements.
 * The shell remains responsible for gesture arbitration and guarded routing.
 * No router, Firebase, persistence, DOM clones or page content in this module. */
export const nativePagePaths=['/home','/piano','/archivio'] as const
export type NativePagePath=typeof nativePagePaths[number]
export const isNativePagePath=(path:string):path is NativePagePath=>(nativePagePaths as readonly string[]).includes(path)
export function nativeTrackSide(from:string,to:string):number{
 if(!isNativePagePath(from)||!isNativePagePath(to)||from===to)return 0
 return Math.sign(nativePagePaths.indexOf(to)-nativePagePaths.indexOf(from))
}
export function nativeTrackOffset(offset:number,width:number,side:number):number{
 if(!Number.isFinite(offset)||!Number.isFinite(width)||width<=0||!side||Math.sign(offset)!==-side)return 0
 return -side*Math.min(Math.abs(offset),width*.88)
}
export type NativePageTrack={paint:(from:string,to:string,offset:number)=>number|null;navigate:(from:string,to:string,duration:number)=>boolean;cancel:(animate:boolean)=>void;moving:()=>boolean;dispose:()=>void}
export function createNativePageTrack(rail:HTMLElement,initial:NativePagePath):NativePageTrack{
 let active=initial,from:NativePagePath|null=null,to:NativePagePath|null=null,offset=0,span=0,side=0
 let animation:Animation|null=null,watchdog:ReturnType<typeof setTimeout>|null=null,disposed=false
 let shown:HTMLElement[]=[]
 const pane=(path:string)=>rail.querySelector<HTMLElement>(`[data-lf-track-path="${path}"]`)
 function clearAnimation(){if(watchdog!==null){clearTimeout(watchdog);watchdog=null}const old=animation;animation=null;if(old){old.onfinish=null;old.oncancel=null;old.cancel()}}
 function rest(){
  clearAnimation();from=null;to=null;offset=0;span=0;side=0
  rail.style.removeProperty('transform');rail.style.removeProperty('will-change');delete rail.dataset.lfTrackMoving
  for(const el of shown){el.style.removeProperty('left');delete el.dataset.lfTrackShown}shown=[]
 }
 function pair(a:NativePagePath,b:NativePagePath){
  if(disposed||!rail.isConnected||!nativeTrackSide(a,b))return false
  // During the drag, reuse the span and pair. No layout reads per frame.
  if(from===a&&to===b&&!animation&&shown.every(el=>el.isConnected!==false))return true
  const first=pane(a),second=pane(b),width=rail.clientWidth
  if(!first||!second||width<=0){rest();return false}
  rest();active=a;from=a;to=b;side=nativeTrackSide(a,b);span=width;shown=[first,second]
  first.dataset.lfTrackShown='true';second.dataset.lfTrackShown='true'
  first.style.left='0px';second.style.left=`${side*span}px`
  rail.style.willChange='transform';rail.dataset.lfTrackMoving='drag'
  return true
 }
 function translate(x:number){return `translate3d(${x}px,0,0)`}
 function settle(destination:NativePagePath){active=destination;rest()}
 function animateTo(end:number,duration:number,destination:NativePagePath){
  clearAnimation();rail.dataset.lfTrackMoving='settle'
  if(!duration||typeof rail.animate!=='function'||Math.abs(end-offset)<.5){settle(destination);return}
  let a:Animation
  try{a=rail.animate([{transform:translate(offset)},{transform:translate(end)}],{duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'})}catch{settle(destination);return}
  animation=a
  // The routed target is the only active pane once the real transition ends.
  a.onfinish=()=>{if(animation===a)settle(destination)}
  a.oncancel=()=>{if(animation===a)settle(destination)}
  // WebViews may omit animation events after a suspended compositor timeline.
  // The same identity guard prevents an old timeout from settling a new pair.
  watchdog=setTimeout(()=>{if(animation===a)settle(destination)},duration+120)
 }
 return {
  paint(a,b,x){
   if(disposed||animation||!isNativePagePath(a)||!isNativePagePath(b)||!pair(a,b))return null
   const next=nativeTrackOffset(x,span,side);if(next!==offset||!rail.style.transform){offset=next;rail.style.transform=translate(offset)}return offset
  },
  navigate(a,b,duration){
   if(disposed||!isNativePagePath(a)||!isNativePagePath(b)||!nativeTrackSide(a,b))return false
   // A navbar tap can interrupt a preceding settlement. Reset to the already
   // committed route before starting the next real pair, never stack animations.
   if(animation)rest()
   if(!pair(a,b))return false
   active=b;animateTo(-side*span,Math.max(0,Math.min(400,Number.isFinite(duration)?duration:340)),b);return true
  },
  cancel(animate){if(disposed)return;if(animation){if(!animate)settle(active);return}if(from&&animate&&Math.abs(offset)>3)animateTo(0,Math.min(220,100+Math.abs(offset)*.35),from);else rest()},
  moving(){return !!animation},
  dispose(){if(disposed)return;rest();disposed=true}
 }
}
/** Use actual visible bottom; invalid geometry never collapses the viewport. */
export function nativeTrackHeight(top:number,bottom:number):number|null{
 const available=Math.floor(bottom-top)
 return Number.isFinite(available)&&available>=140?available:null
}
