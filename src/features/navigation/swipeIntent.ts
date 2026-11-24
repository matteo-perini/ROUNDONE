/** R22B.6C — surface and direction arbitration for mobile section gestures.
 * Ordinary clickable content may initiate a swipe. Native editing, dragging,
 * charts and horizontal scroll containers retain their own gestures.
 */
export type SwipeIntent='pending'|'horizontal'|'vertical'
export function resolveSwipeIntent(previous:SwipeIntent,dx:number,dy:number):SwipeIntent{
 if(previous!=='pending')return previous
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return 'pending'
 const x=Math.abs(dx),y=Math.abs(dy)
 if(Math.max(x,y)<7)return 'pending'
 if(x>=y*1.18)return 'horizontal'
 if(y>=x*1.10)return 'vertical'
 // Resolve ambiguous diagonals conservatively, in favour of native scrolling.
 return Math.max(x,y)>=20?'vertical':'pending'
}
export const protectedSwipeSelector='input,textarea,select,option,video,audio,iframe,canvas,dialog,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="slider"],[role="listbox"],[draggable="true"],[data-lf-no-chat-swipe],[data-lf-no-section-swipe],.modal-overlay,.lf15-video-backdrop,.lf-r5-grip,.swiper,.carousel,.recharts-wrapper,.apexcharts-canvas,.lf-p360-graph,.lf-ms-chart'
export function hasNativeHorizontalScroll(scrollWidth:number,clientWidth:number,overflowX:string):boolean{
 return clientWidth>0&&scrollWidth>clientWidth+2&&['auto','scroll','overlay'].includes(overflowX)
}
export function insideSystemEdge(x:number,width:number):boolean{
 return !Number.isFinite(x)||!Number.isFinite(width)||width<=0||x<20||x>width-20
}
export function suppressSwipeClick(ageMs:number,detail:number,relatedTarget:boolean,firesTouchEvents?:boolean):boolean{
 // Never swallow keyboard activation or known physical mouse input. The
 // guard is only a fallback after preventDefault, scoped to the touch target.
 return ageMs>=0&&ageMs<=450&&detail>0&&relatedTarget&&firesTouchEvents!==false
}
