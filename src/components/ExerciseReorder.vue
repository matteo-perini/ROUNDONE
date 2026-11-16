<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue'
import {uiText} from '../features/i18n/interfaceLanguage'
const props=defineProps<{rows:{id:string;label:string;secondary?:string}[];disabled?:boolean;canInsert?:boolean}>()
const emit=defineEmits<{move:[number,number];insert:[number]}>()
const root=ref<HTMLElement|null>(null),dragId=ref(''),targetId=ref(''),announce=ref('')
let pointer:number|null=null,handle:HTMLElement|null=null,frame=0,lastY=0
function index(id:string){return props.rows.findIndex(r=>r.id===id)}
function move(from:number,to:number){if(props.disabled||from<0||to<0||from===to||to>=props.rows.length)return;const label=props.rows[from].label;emit('move',from,to);announce.value=`${label}: ${to+1}`}
function locate(y:number){const cards=root.value?.querySelectorAll<HTMLElement>('[data-reorder-id]');if(!cards?.length)return;let nearest=Infinity;for(const card of cards){const rect=card.getBoundingClientRect(),distance=Math.abs(y-(rect.top+rect.height/2));if(distance<nearest){nearest=distance;targetId.value=card.dataset.reorderId||''}}}
function scrollContainer(el:HTMLElement|null):HTMLElement|null{for(let p=el?.parentElement;p;p=p.parentElement){if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight)return p}return null}
function tick(){if(pointer===null)return;const scroller=scrollContainer(root.value),rect=scroller?.getBoundingClientRect();const top=Math.max(0,rect?.top??0),bottom=Math.min(window.innerHeight,rect?.bottom??window.innerHeight);const speed=lastY<top+64?-Math.min(20,(top+64-lastY)/4):lastY>bottom-64?Math.min(20,(lastY-bottom+64)/4):0;if(speed){if(scroller)scroller.scrollTop+=speed;else window.scrollBy(0,speed);locate(lastY)}frame=requestAnimationFrame(tick)}
function start(e:PointerEvent,id:string){if(props.disabled||pointer!==null||e.button!==0)return;const el=e.currentTarget as HTMLElement;try{el.setPointerCapture(e.pointerId)}catch{return}pointer=e.pointerId;handle=el;dragId.value=id;targetId.value=id;lastY=e.clientY;frame=requestAnimationFrame(tick)}
function movePointer(e:PointerEvent){if(e.pointerId!==pointer)return;lastY=e.clientY;locate(lastY)}
function cleanup(){const p=pointer,el=handle;pointer=null;handle=null;cancelAnimationFrame(frame);frame=0;dragId.value='';targetId.value='';if(p!==null&&el?.hasPointerCapture(p))el.releasePointerCapture(p)}
function finish(e:PointerEvent){if(e.pointerId!==pointer)return;locate(e.clientY);const from=index(dragId.value),to=index(targetId.value);cleanup();move(from,to)}
function cancel(e:PointerEvent){if(e.pointerId===pointer)cleanup()}
onBeforeUnmount(cleanup)
</script>
<template>
 <div ref="root" class="lf-r5-reorder" @keydown.esc.stop="cleanup">
  <p class="muted small">{{uiText('Trascina la maniglia o usa le frecce. Le coppie superset si spostano insieme.')}}</p>
  <TransitionGroup name="lf-r5-order" tag="div" class="lf-r5-order-list">
   <div v-for="(row,i) in rows" :key="row.id" :data-reorder-id="row.id" class="lf-r5-order-row" :class="{'is-dragged':dragId===row.id,'is-target':dragId&&targetId===row.id&&dragId!==row.id}">
    <span class="lf-r5-order-number">{{i+1}}</span><div class="lf-r5-order-copy"><b>{{row.label||uiText('Esercizio senza nome')}}</b><small v-if="row.secondary">A + B · {{row.secondary}}</small></div>
    <button type="button" class="secondary" :aria-label="uiText('Sposta su')+' '+row.label" :disabled="disabled||i===0||!!dragId" @click="move(i,i-1)">↑</button><button type="button" class="secondary" :aria-label="uiText('Sposta giù')+' '+row.label" :disabled="disabled||i===rows.length-1||!!dragId" @click="move(i,i+1)">↓</button>
    <button v-if="canInsert" type="button" class="secondary" :disabled="disabled||!!dragId" :aria-label="uiText('Inserisci esercizio dopo')+' '+row.label" @click="emit('insert',i)">＋</button>
    <button type="button" class="lf-r5-grip" :disabled="disabled" :aria-label="uiText('Trascina per riordinare')+' '+row.label" @pointerdown="start($event,row.id)" @pointermove="movePointer" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel"><svg viewBox="0 0 20 24" width="18" height="22" aria-hidden="true" fill="currentColor"><circle v-for="n in 6" :key="n" :cx="n%2?6:14" :cy="4+Math.floor((n-1)/2)*8" r="1.9"/></svg></button>
   </div>
  </TransitionGroup><span class="lf-r5-sr" role="status">{{announce}}</span>
 </div>
</template>
<style scoped>
.lf-r5-order-list{display:grid;gap:7px}.lf-r5-order-row{display:flex;align-items:center;gap:6px;padding:9px;background:var(--card2);border:1px solid var(--border);border-radius:12px;min-width:0}.lf-r5-order-copy{flex:1;min-width:0;overflow-wrap:anywhere}.lf-r5-order-copy small{display:block;color:var(--muted);margin-top:3px}.lf-r5-order-number{font-weight:800;color:var(--mint);min-width:22px;text-align:center}.lf-r5-order-row button{flex:none;min-width:34px;padding:4px;min-height:42px}.lf-r5-grip{touch-action:none;cursor:grab;background:transparent;color:var(--text);border:1px solid var(--border);border-radius:8px;display:grid;place-items:center}.lf-r5-grip:active{cursor:grabbing}.lf-r5-order-row.is-dragged{opacity:.55}.lf-r5-order-row.is-target{outline:2px solid var(--mint);outline-offset:-2px}.lf-r5-order-move{transition:transform .32s cubic-bezier(.22,1,.36,1)}.lf-r5-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(prefers-reduced-motion:reduce){.lf-r5-order-move{transition:none}}
</style>
