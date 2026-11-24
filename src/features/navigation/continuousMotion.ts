/** R22B.6E.2 — mobile transition geometry and non-interactive destination preview.
 * No component mounting, account data, storage, or network requests here. */
const athleteSections=['/messaggi','/home','/piano','/archivio','/progressi','/prenotazioni','/profilo']
const coachSections=['/coach/messaggi','/coach','/coach/atleti','/coach/archivio','/coach/libreria','/coach/prenotazioni','/coach/progressi','/coach/profilo']
export function isMobileSectionSlide(from:string,to:string,width:number):boolean{
 return Number.isFinite(width)&&width>0&&from!==to&&((width<800&&athleteSections.includes(from)&&athleteSections.includes(to))||(width<901&&coachSections.includes(from)&&coachSections.includes(to)))
}
export function previewPosition(offset:number,span:number,direction:number):number{
 return offset-Math.sign(direction)*span
}
const leaving=new WeakMap<HTMLElement,{inert:boolean}>()
export function prepareSectionLeave(element:Element,name:string,enabled:boolean):void{
 if(!enabled||!name||!(element instanceof HTMLElement)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
 // Capture layout coordinates, not animated transforms. The old page keeps its
 // actual padding/width instead of jumping to the containing block's origin.
 const {offsetTop,offsetLeft,offsetWidth}=element
 leaving.set(element,{inert:element.inert})
 element.style.setProperty('--lf-leave-top',`${offsetTop}px`)
 element.style.setProperty('--lf-leave-left',`${offsetLeft}px`)
 element.style.setProperty('--lf-leave-width',`${offsetWidth}px`)
 element.classList.add('lf-motion-leaving')
 element.inert=true
}
export function finishSectionLeave(element:Element):void{
 if(!(element instanceof HTMLElement))return
 const previous=leaving.get(element);if(!previous)return
 leaving.delete(element)
 element.inert=previous.inert
 element.classList.remove('lf-motion-leaving')
 for(const name of ['--lf-leave-top','--lf-leave-left','--lf-leave-width'])element.style.removeProperty(name)
}
export type SectionPreview={paint:(offset:number,direction:number,label:string)=>void;returnToEdge:(duration:number)=>void;dispose:()=>void}
export function createSectionPreview(stage:HTMLElement,root:HTMLElement,paintedOffset=0):SectionPreview{
 const rect=root.getBoundingClientRect(),outer=stage.getBoundingClientRect()
 const span=Math.max(1,stage.clientWidth),left=rect.left-paintedOffset-outer.left-stage.clientLeft+stage.scrollLeft
 const top=rect.top-outer.top-stage.clientTop+stage.scrollTop
 const panel=document.createElement('div');panel.className='lf-motion-preview';panel.setAttribute('aria-hidden','true');panel.inert=true;panel.hidden=true
 panel.style.left=`${left}px`;panel.style.top=`${Math.max(top,stage.scrollTop,stage.scrollTop+Math.max(0,-outer.top-stage.clientTop))}px`;panel.style.width=`${rect.width}px`
 const title=document.createElement('strong');title.className='lf-motion-preview-title';panel.append(title)
 for(let i=0;i<3;i++){const block=document.createElement('div');block.className='lf-motion-preview-block';panel.append(block)}
 let last=0,side=0,animation:Animation|null=null,disposed=false
 stage.append(panel);stage.dataset.lfMotionDragging='true'
 function dispose(){if(disposed)return;disposed=true;animation?.cancel();animation=null;panel.remove();delete stage.dataset.lfMotionDragging}
 return {
  paint(offset,direction,label){if(disposed)return;last=offset;side=Math.sign(direction);panel.hidden=!side||!label;if(panel.hidden)return;if(title.textContent!==label)title.textContent=label;panel.style.transform=`translate3d(${previewPosition(offset,span,side)}px,0,0)`},
  returnToEdge(duration){if(disposed)return;if(!side||panel.hidden||typeof panel.animate!=='function'){dispose();return}
   animation=panel.animate([{transform:`translate3d(${previewPosition(last,span,side)}px,0,0)`},{transform:`translate3d(${previewPosition(0,span,side)}px,0,0)`}],{duration,easing:'cubic-bezier(.18,1,.35,1)',fill:'forwards'})
   animation.onfinish=dispose;animation.oncancel=dispose
  },dispose
 }
}
