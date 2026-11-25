import {createPremiumSeam,premiumSeamOpacity,premiumSeamX} from './premiumPageSeam.ts'
/** E.5.1 — continuous gesture geometry. No routing, persistence or data loading. */
export type MotionSummary={heading:string;lines:readonly string[];sections?:readonly {heading:string;lines:readonly string[]}[]}
/** Route-specific structure only. No invented entries, private chat text,
 * cached DOM or unverified account data. A real scoped summary takes priority. */
export function motionOutline(path:string):MotionSummary|null{
 const labels:Record<string,readonly string[]>={
  '/home':['Allenamento di oggi','Il tuo percorso','Agenda'],
  '/piano':['Il tuo allenamento','Programma e settimane','Calendario del piano'],
  '/archivio':['Le mie schede','Archivio programmazioni'],
  '/progressi':['Allenamenti','Storico allenamenti','Andamento'],
  '/prenotazioni':['Agenda','Lezioni ed eventi'],
  '/profilo':['Profilo','Impostazioni'],
  '/messaggi':['Conversazioni','Nuovo messaggio'],
  '/coach':['Dashboard','Atleti','Agenda'],
  '/coach/atleti':['Gestione atleti','Elenco atleti'],
  '/coach/archivio':['Archivio schede','Programmazioni'],
  '/coach/libreria':['Libreria esercizi','Esercizi'],
  '/coach/prenotazioni':['Agenda','Lezioni ed eventi'],
  '/coach/progressi':['Allenamenti','Progressi'],
  '/coach/profilo':['Profilo','Palestra'],
  '/coach/messaggi':['Conversazioni','Nuovo messaggio']
 }
 const headings=Object.hasOwn(labels,path)?labels[path]:undefined
 return headings?.length?{heading:headings[0],lines:[],sections:headings.slice(1).map(heading=>({heading,lines:[]}))}:null
}
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
 const span=Math.max(1,stage.clientWidth)
 // The cue is one complete viewport surface, not a narrow content card.
 // The origin must match the stage's clipping edge and the transition span.
 const left=stage.scrollLeft
 const viewport=typeof window!=='undefined'?window.visualViewport:null
 const viewTop=Math.max(outer.top+stage.clientTop,viewport?.offsetTop||0)
 const top=stage.scrollTop+Math.max(0,viewTop-outer.top-stage.clientTop)
 const available=(viewport?.height??(typeof window!=='undefined'?window.innerHeight:0))+(viewport?.offsetTop||0)-viewTop
 const height=Math.max(1,Math.min(Math.max(1,stage.clientHeight||available||rect.height||240),available>0?available:stage.clientHeight||rect.height||240))
 const inset=Math.max(8,Math.min(32,rect.left-paintedOffset-outer.left-stage.clientLeft+stage.scrollLeft))
 const panel=document.createElement('div');panel.className='lf-motion-cue';panel.setAttribute('aria-hidden','true');panel.inert=true;panel.hidden=true
 panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.width=`${span}px`;panel.style.height=`${height}px`
 panel.style.paddingInline=`${inset}px`;panel.style.paddingTop=`${Math.max(12,Math.min(80,rect.top-viewTop))}px`
 const title=document.createElement('strong');title.className='lf-motion-cue-title';panel.append(title)
 const content=document.createElement('div');content.className='lf-motion-cue-content';panel.append(content)
 let last=0,side=0,animation:Animation|null=null,disposed=false,renderedLabel:string|null=null,renderedSummary:MotionSummary|null=null,visible=false,lastTransform=''
 stage.append(panel)
 const seam=createPremiumSeam(stage,{left,top,height})
 function dispose(){if(disposed)return;disposed=true;const old=animation;animation=null;if(old){old.onfinish=null;old.oncancel=null;old.cancel()}seam?.dispose();panel.remove()}
 return {paint(offset,direction,label,summary){
  if(disposed)return;last=offset;side=Math.sign(direction)
  const nextVisible=!!side&&!!label
  if(nextVisible!==visible){visible=nextVisible;panel.hidden=!visible}
  // The caller retains the same summary object for this gesture/destination.
  // Rebuild only when the projection changes, not on each animation frame.
  if(!visible){seam?.paint(0,0);if(renderedLabel!==null){content.replaceChildren();title.textContent='';renderedLabel=null;renderedSummary=null}return}
  if(renderedLabel!==label||renderedSummary!==summary){renderedLabel=label;renderedSummary=summary;title.textContent=label;content.replaceChildren()
   if(summary){
    const sections=[summary,...(summary.sections||[])].slice(0,3)
    for(const section of sections){const card=document.createElement('div');card.className='lf-motion-cue-card';const heading=document.createElement('strong');heading.textContent=section.heading;card.append(heading)
     for(const line of section.lines.slice(0,4)){const p=document.createElement('p');p.textContent=line;card.append(p)}
     if(!section.lines.length){const shape=document.createElement('div');shape.className='lf-motion-cue-shape';card.append(shape)}content.append(card)}
   }else{const block=document.createElement('div');block.className='lf-motion-cue-neutral';content.append(block)}
  }
  const transform=`translate3d(${pairedPosition(offset,span,side)}px,0,0)`
  if(lastTransform!==transform){lastTransform=transform;panel.style.transform=transform}
  seam?.paint(premiumSeamX(offset,span,side),premiumSeamOpacity(offset,span))
 },returnToEdge(duration){if(disposed)return;if(!side||panel.hidden||typeof panel.animate!=='function'){dispose();return}
  try{
   animation=panel.animate([{transform:`translate3d(${pairedPosition(last,span,side)}px,0,0)`},{transform:`translate3d(${pairedPosition(0,span,side)}px,0,0)`}],{duration,easing:'cubic-bezier(.18,1,.35,1)',fill:'forwards'})
   seam?.settle(premiumSeamX(last,span,side),premiumSeamOpacity(last,span),premiumSeamX(0,span,side),duration,'cubic-bezier(.18,1,.35,1)',typeof animation.startTime==='number'?animation.startTime:undefined)
   animation.onfinish=dispose;animation.oncancel=dispose
  }catch{dispose()}
 },dispose}
}
