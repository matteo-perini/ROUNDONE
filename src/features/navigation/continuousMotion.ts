/** R22B.6E.2 — mobile transition geometry; E.5 pins motion values to each real page.
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
const motionValues=['--lf-motion-span','--lf-swipe-commit-offset','--lf-swipe-commit-duration'] as const
const pinned=new WeakMap<HTMLElement,Array<{name:string;value:string;priority:string}>>()
/** Freeze geometry/duration per participating page. A new swipe must not change
 * the inherited variables of an earlier transition still finishing. */
export function prepareSectionMotion(element:Element,stage:HTMLElement|null):void{
 if(!(element instanceof HTMLElement)||!stage)return
 releaseSectionMotion(element)
 const saved=motionValues.map(name=>({name,value:element.style.getPropertyValue(name),priority:element.style.getPropertyPriority(name)}))
 pinned.set(element,saved)
 const defaults=[`${Math.max(1,stage.clientWidth)}px`,'0px','340ms']
 motionValues.forEach((name,i)=>element.style.setProperty(name,stage.style.getPropertyValue(name)||defaults[i]))
}
export function releaseSectionMotion(element:Element):void{
 if(!(element instanceof HTMLElement))return
 const saved=pinned.get(element);if(!saved)return
 pinned.delete(element)
 for(const {name,value,priority} of saved){if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name)}
}
export const activeSectionSelector='.lf-chat-open-enter-active,.lf-chat-open-leave-active,.lf-chat-close-enter-active,.lf-chat-close-leave-active,.lf-section-next-enter-active,.lf-section-prev-enter-active,.lf-section-next-leave-active,.lf-section-prev-leave-active'
export function isSectionMoving(element:HTMLElement):boolean{
 return element.matches(activeSectionSelector)||!!element.querySelector(activeSectionSelector)
}
export function prepareSectionLeave(element:Element,name:string,enabled:boolean):void{
 if(!enabled||!name||!(element instanceof HTMLElement)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
 // Capture layout coordinates, not animated transforms. The old page keeps its
 // actual padding/width instead of jumping to the containing block's origin.
 prepareSectionMotion(element,element.closest<HTMLElement>('.main-layout')||element.parentElement)
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
 releaseSectionMotion(element)
 const previous=leaving.get(element);if(!previous)return
 leaving.delete(element)
 element.inert=previous.inert
 element.classList.remove('lf-motion-leaving')
 for(const name of ['--lf-leave-top','--lf-leave-left','--lf-leave-width'])element.style.removeProperty(name)
}
