/** E.5 — gesture policy for real-page navigation. All distances in CSS pixels,
 * velocities in px/ms. No DOM, routing, data or storage dependencies. */
export type SwipeSample={x:number;at:number}
export function appendSwipeSample(samples:SwipeSample[],x:number,at:number):void{
 if(!Number.isFinite(x)||!Number.isFinite(at))return
 if(samples.length&&at<samples[samples.length-1].at)return
 samples.push({x,at})
 // Retain a short history, including the sample just before the velocity window.
 while(samples.length>2&&samples[1].at<at-110)samples.shift()
 if(samples.length>12)samples.splice(0,samples.length-12)
}
export function recentSwipeVelocity(samples:readonly SwipeSample[]):number{
 const end=samples[samples.length-1];if(!end)return 0
 let first=end
 for(let i=samples.length-2;i>=0;i--){
  const item=samples[i];if(end.at-item.at>120)break
  first=item
 }
 const dt=end.at-first.at
 return dt>=12?Math.max(-4,Math.min(4,(end.x-first.x)/dt)):0
}
export type SwipeDecision={dx:number;dy:number;elapsed:number;width:number;velocity:number;hasNeighbor:boolean}
function valid(s:SwipeDecision):boolean{
 return s.hasNeighbor&&[s.dx,s.dy,s.elapsed,s.width,s.velocity].every(Number.isFinite)&&s.width>0&&s.elapsed>=16&&Math.abs(s.dx)>=Math.abs(s.dy)*1.04
}
function forward(s:SwipeDecision):number{return Math.sign(s.dx)*s.velocity}
export function earlySwipeCommit(s:SwipeDecision):boolean{
 if(!valid(s)||Math.abs(s.dx)<Math.abs(s.dy)*1.28||forward(s)<-.18)return false
 // Only commit before release for an unmistakable gesture. Small or ambiguous
 // drags remain reversible. A flick that never crosses this is handled at end.
 const long=Math.max(88,Math.min(124,s.width*.26))
 return Math.abs(s.dx)>=long||(Math.abs(s.dx)>=64&&forward(s)>=.9)
}
export function releaseSwipeCommit(s:SwipeDecision):boolean{
 if(!valid(s)||forward(s)<-.22)return false
 const distance=Math.abs(s.dx),threshold=Math.max(48,Math.min(82,s.width*.14))
 // Recent velocity rather than the mean over a long press/gesture.
 return distance>=threshold||(distance>=26&&forward(s)>=.48)
}
export function nativeDragOffset(dx:number,width:number,hasNeighbor:boolean):number{
 if(![dx,width].every(Number.isFinite)||width<=0||Math.abs(dx)<.01)return 0
 // Keep the pre-navigation feedback small: no fabricated destination content,
 // no exposing a large empty screen while the authorized route is resolved.
 const limit=Math.min(hasNeighbor?28:14,width*(hasNeighbor ? .075 : .04))
 return Math.sign(dx)*Math.min(limit,Math.abs(dx)*.92)
}
export function nativeCommitMotion(offset:number,span:number,direction:number,velocity:number):{offset:number;duration:number}|null{
 if(![offset,span,direction,velocity].every(Number.isFinite)||span<=0||direction===0)return null
 const bounded=Math.sign(offset)===Math.sign(direction)?Math.sign(offset)*Math.min(Math.abs(offset),28,span*.075):0
 const speed=Math.max(0,Math.sign(direction)*velocity)
 return {offset:bounded,duration:Math.round(Math.max(190,Math.min(285,285-speed*45-Math.abs(bounded)*.8)))}
}
