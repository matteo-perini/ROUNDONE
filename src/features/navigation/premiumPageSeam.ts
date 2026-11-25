/** E.8.1 — presentation only. A single decorative layer, independent of the
 * gesture geometry, page layout, scroll containers and authorization. */
export const PREMIUM_SEAM_WIDTH=14
export function premiumSeamOpacity(offset:number,span:number):number{
 if(!Number.isFinite(offset)||!Number.isFinite(span)||span<=0)return 0
 const d=Math.min(span,Math.abs(offset))
 return Math.max(0,Math.min(1,d/PREMIUM_SEAM_WIDTH,(span-d)/PREMIUM_SEAM_WIDTH))
}
/** Absolute coordinate of the shared edge, measured in the stage's space. */
export function premiumSeamX(offset:number,span:number,direction:number):number{
 return offset+(direction<0?span:0)
}
export type PremiumSeam={paint:(x:number,opacity:number)=>void;settle:(x:number,opacity:number,end:number,duration:number,easing:string,startTime?:number)=>void;dispose:()=>void}
export function createPremiumSeam(host:HTMLElement,geometry:{left:number;top:number;height:number|string}):PremiumSeam|null{
 const doc=host.ownerDocument
 if(!doc?.createElement||doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return null
 if(!Number.isFinite(geometry.left)||!Number.isFinite(geometry.top)||typeof geometry.height==='number'&&(!Number.isFinite(geometry.height)||geometry.height<=0))return null
 const el=doc.createElement('div');el.className='lf-premium-page-seam';el.setAttribute('aria-hidden','true');el.inert=true
 el.style.left=`${geometry.left-PREMIUM_SEAM_WIDTH/2}px`;el.style.top=`${geometry.top}px`;el.style.height=typeof geometry.height==='number'?`${geometry.height}px`:geometry.height
 el.style.width=`${PREMIUM_SEAM_WIDTH}px`;el.style.opacity='0'
 host.append(el)
 let animation:Animation|null=null,disposed=false,lastX=NaN,lastOpacity=NaN
 const transform=(x:number)=>`translate3d(${x}px,0,0)`
 function clear(){animation?.cancel();animation=null}
 return {
  paint(x,opacity){if(disposed)return;if(x!==lastX){lastX=x;el.style.transform=transform(x)}if(opacity!==lastOpacity){lastOpacity=opacity;el.style.opacity=String(opacity)}},
  settle(x,opacity,end,duration,easing,startTime){
   if(disposed)return;clear();el.style.transform=transform(x);el.style.opacity=String(opacity)
   if(!duration||typeof el.animate!=='function'){el.style.opacity='0';return}
   try{
    // Identical transform timing to the pages. The layer fades towards the
    // clipping edge rather than changing the travel distance by 14 pixels.
    animation=el.animate([{transform:transform(x),opacity,offset:0},{transform:transform(x+(end-x)*.85),opacity,offset:.85},{transform:transform(end),opacity:0,offset:1}],{duration,easing,fill:'forwards'})
    if(typeof startTime==='number')animation.startTime=startTime
   }catch{el.style.opacity='0'}
  },
  dispose(){if(disposed)return;disposed=true;clear();el.remove()}
 }
}
