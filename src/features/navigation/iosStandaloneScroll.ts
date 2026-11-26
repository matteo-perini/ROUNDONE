import type {SwipeIntent} from './swipeIntent'

/** R22B6E87: only Apple's installed web app, not Android or Safari tabs. */
export type StandaloneDevice={userAgent:string;platform:string;maxTouchPoints:number;standalone?:boolean;displayStandalone:boolean}
export function isAppleStandalone(device:StandaloneDevice):boolean{
 const apple=/iPhone|iPad|iPod/i.test(device.userAgent)||(device.platform==='MacIntel'&&device.maxTouchPoints>1)
 return apple&&(device.standalone===true||device.displayStandalone)
}
export function appleStandaloneWindow():boolean{
 if(typeof window==='undefined'||typeof navigator==='undefined')return false
 return isAppleStandalone({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,standalone:(navigator as Navigator & {standalone?:boolean}).standalone,displayStandalone:window.matchMedia('(display-mode: standalone)').matches})
}

/** A diagonal gesture should scroll, not steal WebKit's native vertical pan.
 * Lock once; never change direction after the rail has begun to move. */
export function iosStandaloneSwipeIntent(previous:SwipeIntent,dx:number,dy:number):SwipeIntent{
 if(previous!=='pending')return previous
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return 'pending'
 const x=Math.abs(dx),y=Math.abs(dy)
 if(x>=14&&x>=y*1.6)return 'horizontal'
 if(y>=10&&x<y*1.35)return 'vertical'
 if(Math.max(x,y)>=26)return 'vertical'
 return 'pending'
}

export function isViewportEditor(element:Element|null):boolean{
 return !!element?.matches('textarea,select,input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),[contenteditable]:not([contenteditable="false"])')
}
export function iosSoftwareKeyboard(focused:boolean,layoutHeight:number,visibleHeight:number,baselineHeight:number):boolean{
 return focused&&[layoutHeight,visibleHeight,baselineHeight].every(Number.isFinite)&&visibleHeight>0&&Math.max(layoutHeight,baselineHeight)-visibleHeight>=100
}

export type IosTrackGeometry={top:number;documentScrollY:number;layoutHeight:number;visibleHeight:number;visibleTop:number;scale:number;dockTop:number|null;focused:boolean;baselineHeight:number;previousHeight:number|null}
/** Stable layout geometry in the ordinary scroll case; the visual viewport is
 * reserved for the software keyboard. Do not resize the rail during pinch or
 * transient/invalid WebKit measurements. No synthetic scrolling. */
export function iosStandaloneTrackHeight(v:IosTrackGeometry):number|null{
 const previous=v.previousHeight
 if(![v.top,v.documentScrollY,v.layoutHeight,v.visibleHeight,v.visibleTop,v.scale,v.baselineHeight].every(Number.isFinite)||v.layoutHeight<=0||v.visibleHeight<=0||Math.abs(v.scale-1)>.03)return previous
 const keyboard=iosSoftwareKeyboard(v.focused,v.layoutHeight,v.visibleHeight,v.baselineHeight)
 const top=keyboard?v.top:v.top+v.documentScrollY
 const dock=v.dockTop!==null&&Number.isFinite(v.dockTop)&&v.dockTop>0?v.dockTop:v.layoutHeight
 const bottom=keyboard?v.visibleTop+v.visibleHeight:Math.min(v.layoutHeight,dock)
 const height=Math.floor(bottom-top)
 if(!Number.isFinite(height)||height<(keyboard?112:140))return previous
 return previous!==null&&Math.abs(height-previous)<=2?previous:height
}
