<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue'
import {PREMIUM_MOTION_ENABLED} from '../features/motion/premiumMotionMode.ts'
const props=defineProps<{value:number|null|undefined}>()
const actual=computed(()=>typeof props.value==='number'&&Number.isFinite(props.value)?props.value:null)
const displayed=ref<number|null>(actual.value)
const playing=ref(false)
let frame=0,played=false,mounted=false,media:MediaQueryList|undefined
function stop(){if(frame)cancelAnimationFrame(frame);frame=0;playing.value=false;displayed.value=actual.value}
function start(){
 const target=actual.value
 if(!mounted||!PREMIUM_MOTION_ENABLED||played||target===null||!Number.isSafeInteger(target)||target<1||media?.matches||document.hidden){stop();return}
 played=true;playing.value=true;displayed.value=0
 const origin=performance.now()
 const tick=(now:number)=>{
  if(document.hidden||media?.matches||actual.value!==target){stop();return}
  const t=Math.min(1,Math.max(0,(now-origin)/540));displayed.value=Math.round(target*(1-Math.pow(1-t,3)))
  if(t<1)frame=requestAnimationFrame(tick);else stop()
 }
 frame=requestAnimationFrame(tick)
}
function visibility(){if(document.hidden)stop()}
function preference(){if(media?.matches)stop()}
onMounted(()=>{
 mounted=true;if(!PREMIUM_MOTION_ENABLED)return
 media=window.matchMedia('(prefers-reduced-motion: reduce)')
 if(typeof media.addEventListener==='function')media.addEventListener('change',preference);else media.addListener?.(preference)
 document.addEventListener('visibilitychange',visibility);start()
})
watch(actual,()=>{if(played||playing.value)stop();else start()})
onBeforeUnmount(()=>{mounted=false;stop();document.removeEventListener('visibilitychange',visibility);if(media&&typeof media.removeEventListener==='function')media.removeEventListener('change',preference);else media?.removeListener?.(preference)})
</script>
<template><span v-if="playing" class="lf-premium-metric" aria-live="off"><span class="lf-premium-metric-real">{{actual}}</span><span aria-hidden="true" class="lf-premium-metric-visual">{{displayed}}</span></span><template v-else>{{actual??'—'}}</template></template>
<style scoped>
.lf-premium-metric{display:inline-grid;grid-template:1fr / auto}.lf-premium-metric>span{grid-area:1/1;font-variant-numeric:tabular-nums}.lf-premium-metric-real{opacity:0}.lf-premium-metric-visual{text-align:inherit}
</style>
