<script setup lang="ts">
/** SVG frame-by-frame REAL autoplay. Nothing to click in the library grid.
 * Only the visible previews subscribe to ONE shared clock, not one timer per card.
 * All assets remain local, original, and read-only. The detail keeps Play/Pause.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { followVisibleFrames } from '../features/exercises/visibleFrameClock'
import type { CatalogExercise } from '../features/exercises/catalog'
const props=withDefaults(defineProps<{exercise:CatalogExercise;eager?:boolean}>(),{eager:false})
const element=ref<HTMLElement|null>(null)
const visible=ref(true),paused=ref(false),failed=ref(false)
const excluded=ref<number[]>([]),step=ref(0)
const paths=computed(()=>props.exercise.animation?.frames||[])
const sequence=computed(()=>{
 const valid=paths.value.map((_,i)=>i).filter(i=>!excluded.value.includes(i))
 const requested=props.exercise.animation?.sequence||[]
 const chosen=requested.length?requested.filter(i=>Number.isInteger(i)&&valid.includes(i)):valid
 return chosen.length?chosen:valid
})
const sourceIndex=computed(()=>sequence.value[step.value%Math.max(sequence.value.length,1)]??0)
const svgUrl=computed(()=>{
 const p=paths.value[sourceIndex.value]
 return p&&/^assets\/[a-zA-Z0-9_-]+\/frame-\d+\.svg$/.test(p)?'/v1-preview/exercise-library/'+p:''
})
const animating=computed(()=>visible.value&&!paused.value&&!failed.value&&sequence.value.length>1)
let disconnectClock:(()=>void)|null=null
let observer:IntersectionObserver|null=null
let last=0
function advance(now:number){
 if(document.hidden||!animating.value){last=0;return}
 if(!last){last=now;return}
 const duration=Math.max(140,Math.min(900,props.exercise.animation?.frameDurationMs||220))
 if(now-last>=duration){step.value=(step.value+1)%sequence.value.length;last=now}
}
function syncClock(){
 disconnectClock?.();disconnectClock=null;last=0
 if(animating.value)disconnectClock=followVisibleFrames(advance)
}
function reset(){step.value=0;excluded.value=[];failed.value=false;paused.value=false;syncClock()}
function badFrame(){
 if(!excluded.value.includes(sourceIndex.value))excluded.value=[...excluded.value,sourceIndex.value]
 step.value=0
 if(!sequence.value.length)failed.value=true
 syncClock()
}
function toggle(){paused.value=!paused.value;syncClock()}
onMounted(()=>{
 // The user explicitly selected autoplay: never silently disable the entire library
 // because Windows/Android is configured for reduced UI transitions.
 visible.value=true;syncClock()
 if(!props.eager&&'IntersectionObserver'in window&&element.value){
  observer=new IntersectionObserver(([entry])=>{visible.value=!!entry?.isIntersecting;syncClock()},{threshold:0,rootMargin:'120px 0px'})
  observer.observe(element.value)
 }
 document.addEventListener('visibilitychange',syncClock)
})
onBeforeUnmount(()=>{disconnectClock?.();observer?.disconnect();document.removeEventListener('visibilitychange',syncClock)})
watch(()=>[props.exercise.id,...paths.value],reset)
watch(animating,syncClock)
</script>
<template>
 <div ref="element" class="exercise-preview lf76-auto-preview" :class="{'exercise-preview-eager':eager,'exercise-preview-running':animating}" :aria-label="`Anteprima ${exercise.name_it||exercise.name}`" :data-lionfit-frame="sourceIndex" :data-lionfit-sequence-step="step" :data-lionfit-animating="animating?'true':'false'" data-lionfit-motion="76">
  <img v-if="svgUrl&&!failed" :src="svgUrl" :alt="exercise.name_it||exercise.name" decoding="async" :loading="eager||visible?'eager':'lazy'" @error="badFrame" />
  <span v-else class="exercise-motion-fallback">Animazione non disponibile</span>
  <button v-if="eager&&failed" class="exercise-motion-command" type="button" @click.stop="reset">Riprova</button>
  <button v-else-if="eager&&sequence.length>1" class="exercise-motion-command" type="button" :aria-pressed="paused" @click.stop="toggle">{{paused?'▶ Avvia animazione':'Ⅱ Ferma animazione'}}</button>
 </div>
</template>
