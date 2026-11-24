import {onMounted,onUnmounted,ref} from 'vue'
import {nextRomeDaySample} from './romeDayClock'
/** Preserve the reactive sample until the Rome calendar day really changes.
 * Check every 30s only while visible, and immediately on focus/resume. */
export function useRomeDayClock(){
 const clock=ref(Date.now())
 let timer:ReturnType<typeof setInterval>|null=null
 const refresh=()=>{clock.value=nextRomeDaySample(clock.value,Date.now())}
 const stop=()=>{if(timer!==null){clearInterval(timer);timer=null}}
 const resume=()=>{
  if(document.hidden){stop();return}
  refresh()
  if(timer===null)timer=setInterval(refresh,30_000)
 }
 onMounted(()=>{
  document.addEventListener('visibilitychange',resume)
  window.addEventListener('focus',resume)
  resume()
 })
 onUnmounted(()=>{
  stop()
  document.removeEventListener('visibilitychange',resume)
  window.removeEventListener('focus',resume)
 })
 return clock
}
