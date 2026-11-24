/** E.5.1 — continuous gesture geometry. No routing, persistence or data loading. */
export type MotionSummary={heading:string;lines:readonly string[]}
export function continuousDragOffset(dx:number,width:number,neighbor:boolean):number{
 if(!Number.isFinite(dx)||!Number.isFinite(width)||width<=0)return 0
 const distance=Math.abs(dx)
 if(!neighbor)return Math.sign(dx)*Math.min(18,Math.sqrt(distance)*1.7)
 const limit=width*.88
 return Math.sign(dx)*Math.min(limit,distance*.98)
}
export function continuousCommitMotion(offset:number,span:number,direction:number,velocity:number){
 if(![offset,span,direction,velocity].every(Number.isFinite)||span<=0||direction===0)return null
 const bounded=Math.sign(offset)===Math.sign(direction)?Math.sign(offset)*Math.min(Math.abs(offset),span*.88):0
 const remaining=1-Math.abs(bounded)/span
 const speed=Math.max(0,Math.sign(direction)*velocity)
 return {offset:bounded,duration:Math.round(Math.max(125,Math.min(300,175+remaining*125-speed*22)))}
}
export function pairedPosition(offset:number,span:number,direction:number){return offset-Math.sign(direction)*span}
export type MotionCue={paint:(offset:number,direction:number,label:string,summary:MotionSummary|null)=>void;returnToEdge:(duration:number)=>void;dispose:()=>void}
/** Gesture-only, inert projection, never a cloned or cached page. All data comes
 * from the currently mounted authorized workspace; no new Vue components. */
export function createMotionCue(stage:HTMLElement,root:HTMLElement,paintedOffset=0):MotionCue{
 const rect=root.getBoundingClientRect(),outer=stage.getBoundingClientRect()
 const span=Math.max(1,stage.clientWidth),left=rect.left-paintedOffset-outer.left-stage.clientLeft+stage.scrollLeft
 const top=Math.max(rect.top-outer.top-stage.clientTop+stage.scrollTop,stage.scrollTop,stage.scrollTop+Math.max(0,-outer.top-stage.clientTop))
 const panel=document.createElement('div');panel.className='lf-motion-cue';panel.setAttribute('aria-hidden','true');panel.inert=true;panel.hidden=true
 panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.width=`${rect.width}px`
 const title=document.createElement('strong');title.className='lf-motion-cue-title';panel.append(title)
 const content=document.createElement('div');content.className='lf-motion-cue-content';panel.append(content)
 let last=0,side=0,animation:Animation|null=null,disposed=false,renderedLabel:string|null=null,renderedSummary:MotionSummary|null=null,visible=false,lastTransform=''
 stage.append(panel)
 function dispose(){if(disposed)return;disposed=true;animation?.cancel();animation=null;panel.remove()}
 return {paint(offset,direction,label,summary){
  if(disposed)return;last=offset;side=Math.sign(direction)
  const nextVisible=!!side&&!!label
  if(nextVisible!==visible){visible=nextVisible;panel.hidden=!visible}
  // The caller retains the same summary object for this gesture/destination.
  // Rebuild only when the projection changes, not on each animation frame.
  if(!visible){if(renderedLabel!==null){content.replaceChildren();title.textContent='';renderedLabel=null;renderedSummary=null}return}
  if(renderedLabel!==label||renderedSummary!==summary){renderedLabel=label;renderedSummary=summary;title.textContent=label;content.replaceChildren()
   if(summary){const card=document.createElement('div');card.className='lf-motion-cue-card';const heading=document.createElement('strong');heading.textContent=summary.heading;card.append(heading)
    for(const line of summary.lines.slice(0,3)){const p=document.createElement('p');p.textContent=line;card.append(p)}content.append(card)
   }else{const block=document.createElement('div');block.className='lf-motion-cue-neutral';content.append(block)}
  }
  const transform=`translate3d(${pairedPosition(offset,span,side)}px,0,0)`
  if(lastTransform!==transform){lastTransform=transform;panel.style.transform=transform}
 },returnToEdge(duration){if(disposed)return;if(!side||panel.hidden||typeof panel.animate!=='function'){dispose();return}
  animation=panel.animate([{transform:`translate3d(${pairedPosition(last,span,side)}px,0,0)`},{transform:`translate3d(${pairedPosition(0,span,side)}px,0,0)`}],{duration,easing:'cubic-bezier(.18,1,.35,1)',fill:'forwards'})
  animation.onfinish=dispose;animation.oncancel=dispose
 },dispose}
}
