<script setup lang="ts">
/** Navigazione Atleta isolata dai container e CSS legacy.
 * Il Teleport impedisce che overflow/stacking context dell'app nascondano la barra.
 * Sorgenti e link sono quelli della shell (DEMO, Emulator o Live) e non creano accessi.
 */
import { RouterLink,useRoute } from 'vue-router'
import {computed,ref,onMounted,onUnmounted,watch,nextTick} from 'vue'
import {dockIndicatorGeometry} from '../features/navigation/dockIndicator.ts'
import LionIcon from './LionIcon.vue'
import {uiText} from '../features/i18n/interfaceLanguage'

type NavigationItem = {to:string;label:string;icon:string}
const props=defineProps<{items:readonly NavigationItem[];theme:string}>()
const route=useRoute(),dock=ref<HTMLElement|null>(null)
const currentIndex=computed(()=>props.items.findIndex(item=>item.to.split('?')[0]===route.path))
const position=ref<{x:number;y:number;width:number;height:number}|null>(null)
let observer:ResizeObserver|null=null,frame=0,alive=true
function measure(){
 frame=0;const el=dock.value;if(!alive||!el||currentIndex.value<0||!el.getClientRects().length)return
 const link=el.querySelectorAll<HTMLElement>('.lionfit-dock-item')[currentIndex.value]
 if(!link)return
 const next=dockIndicatorGeometry(el.getBoundingClientRect(),link.getBoundingClientRect(),el.clientLeft,el.clientTop)
 if(next)position.value=next
}
function schedule(){if(alive&&!frame)frame=requestAnimationFrame(measure)}
function observe(){observer?.disconnect();if(dock.value&&typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(schedule);observer.observe(dock.value);for(const el of dock.value.querySelectorAll('.lionfit-dock-item'))observer.observe(el)}}
onMounted(()=>{observe();measure();window.addEventListener('resize',schedule,{passive:true})})
watch(currentIndex,()=>{if(currentIndex.value>=0){measure();schedule()}else position.value=null},{flush:'post'})
watch(()=>props.items,async()=>{await nextTick();if(alive){observe();schedule()}},{flush:'post'})
onUnmounted(()=>{alive=false;observer?.disconnect();if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',schedule)})
const indicatorStyle=computed(()=>position.value?{width:position.value.width+'px',height:position.value.height+'px',transform:`translate3d(${position.value.x}px,${position.value.y}px,0)`}:undefined)
</script>
<template>
 <Teleport to="body">
  <nav ref="dock" class="lionfit-athlete-dock" :class="[props.theme==='light'?'dock-light':'dock-dark',{'dock-indicator-ready':!!position}]" :aria-label="uiText('Navigazione inferiore Atleta')" data-lionfit-dock="athlete">
   <span v-if="position" class="lionfit-dock-indicator" :class="{'is-visible':currentIndex>=0}" :style="indicatorStyle" aria-hidden="true"/>
   <RouterLink v-for="item in props.items" :key="item.to" :to="item.to" class="lionfit-dock-item" :aria-label="uiText(item.label)">
    <LionIcon :name="item.icon" :size="21"/>
    <span>{{uiText(item.label)}}</span>
   </RouterLink>
  </nav>
 </Teleport>
</template>
<style scoped>
/* Dock unica, non flottante. Utilizza i 6 link reali ricevuti dalla shell. */
.lionfit-athlete-dock {
 position:fixed!important; inset:auto 0 0 0!important;
 display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;
 box-sizing:border-box!important;width:100%!important;max-width:100%!important;
 min-height:calc(68px + env(safe-area-inset-bottom,0px));
 padding:5px max(6px,env(safe-area-inset-right,0px)) calc(7px + env(safe-area-inset-bottom,0px)) max(6px,env(safe-area-inset-left,0px));
 gap:4px;align-items:stretch;z-index:1400!important;overflow:visible!important;
 pointer-events:auto!important;visibility:visible!important;opacity:1!important;
 border-top:1px solid #344254;border-radius:0!important;
 background:linear-gradient(155deg,#192434 0%,#0F1520 76%,#172231 100%);
 color:#eef4fb;box-shadow:0 -4px 15px rgba(0,0,0,.20);
}
.lionfit-athlete-dock.dock-light {
 background:#ffffff!important;color:#293d32!important;
 border-top:1px solid #d9e7de!important;
 box-shadow:0 -5px 17px rgba(20,75,47,.08)!important;
}
.lionfit-dock-item {
 position:relative;z-index:1;display:flex!important;flex-direction:column;align-items:center;justify-content:center;
 min-width:0;min-height:53px;padding:6px 1px 5px;border-radius:9px;
 gap:4px;color:#d8e3ee!important;font-size:clamp(8px,1.72vw,11px);
 font-weight:850;line-height:1.15;letter-spacing:0;text-decoration:none!important;
 white-space:nowrap;overflow:visible;opacity:1!important;visibility:visible!important;
}
.lionfit-dock-item :deep(svg) {display:block!important;width:21px!important;height:21px!important;flex:0 0 21px!important;stroke:currentColor!important;color:inherit!important;}
.lionfit-dock-item span{display:block;max-width:100%;white-space:nowrap;}
.lionfit-dock-item.router-link-active {
 background:linear-gradient(150deg,#16643f,#15422f)!important;
 color:#ddffeb!important;box-shadow:inset 0 0 0 1px rgba(73,244,136,.24);
}
.lionfit-dock-item:hover{background:rgba(56,184,108,.13)}
.dock-light .lionfit-dock-item{color:#4e6055!important}
.dock-light .lionfit-dock-item.router-link-active {
 background:linear-gradient(135deg,#e2faea,#c8f4d6)!important;
 color:#08783e!important;box-shadow:inset 0 0 0 1px #a7dfb9;
}
.dock-light .lionfit-dock-item:hover{background:#effbf3}
.lionfit-dock-item:focus-visible{outline:2px solid #40ee8a;outline-offset:-2px}
@media(min-width:800px){.lionfit-athlete-dock{display:none!important}}
@media(max-width:390px){.lionfit-athlete-dock{gap:1px;padding-left:2px;padding-right:2px}.lionfit-dock-item{font-size:7.5px;gap:3px}.lionfit-dock-item :deep(svg){height:19px!important;width:19px!important;flex-basis:19px!important}}
/* One shared non-interactive highlight; only the real links are tappable. */
.lionfit-dock-indicator{position:absolute;top:0;left:0;z-index:0;border-radius:9px;pointer-events:none;opacity:0;background:linear-gradient(150deg,#16643f,#15422f);box-shadow:inset 0 0 0 1px rgba(73,244,136,.24)}
.lionfit-dock-indicator.is-visible{opacity:1}
.dock-light .lionfit-dock-indicator{background:linear-gradient(135deg,#e2faea,#c8f4d6);box-shadow:inset 0 0 0 1px #a7dfb9}
.dock-indicator-ready .lionfit-dock-item.router-link-active{background:transparent!important;box-shadow:none!important}
@media(prefers-reduced-motion:no-preference){
 .lionfit-dock-item{transition:color 160ms ease}
 .lionfit-dock-indicator{transition:transform 234ms cubic-bezier(.22,1,.36,1),width 162ms ease,height 162ms ease,opacity 108ms ease}
 .lionfit-dock-item span,.lionfit-dock-item :deep(svg){transition:opacity 140ms ease-out}
 .lionfit-dock-item:active:not([aria-disabled="true"]) span,.lionfit-dock-item:active:not([aria-disabled="true"]) :deep(svg){opacity:.82;transition-duration:90ms}
}
@media(prefers-reduced-motion:reduce){.lionfit-dock-indicator,.lionfit-dock-item{transition:none!important}}
</style>
