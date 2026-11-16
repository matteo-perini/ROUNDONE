import {ref,type Directive} from 'vue'

// Only explicit pending reads register here. No global observer, no data cache.
export function createQuietLoadingTracker(notify:(visible:boolean)=>void,delay=350){
 const pending=new Set<object>()
 let timer:ReturnType<typeof setTimeout>|undefined
 let visible=false
 function show(next:boolean){if(visible!==next){visible=next;notify(next)}}
 return {
  begin(key:object){
   if(pending.has(key))return
   pending.add(key)
   if(pending.size===1)timer=setTimeout(()=>{timer=undefined;if(pending.size)show(true)},delay)
  },
  end(key:object){
   if(!pending.delete(key)||pending.size)return
   if(timer!==undefined){clearTimeout(timer);timer=undefined}
   show(false)
  }
 }
}
export const quietLoadingVisible=ref(false)
const tracker=createQuietLoadingTracker(value=>{quietLoadingVisible.value=value})
// The existing v-if owns the lifetime. Unmount cancels pending feedback immediately.
export const quietLoading:Directive<HTMLElement>={
 mounted(el){el.setAttribute('aria-hidden','true');tracker.begin(el)},
 beforeUnmount(el){tracker.end(el)}
}
