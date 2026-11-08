<script setup lang="ts">
/** Navigazione Atleta isolata dai container e CSS legacy.
 * Il Teleport impedisce che overflow/stacking context dell'app nascondano la barra.
 * Sorgenti e link sono quelli della shell (DEMO, Emulator o Live) e non creano accessi.
 */
import { RouterLink } from 'vue-router'
import LionIcon from './LionIcon.vue'
import {uiText} from '../features/i18n/interfaceLanguage'

type NavigationItem = {to:string;label:string;icon:string}
const props=defineProps<{items:readonly NavigationItem[];theme:string}>()
</script>
<template>
 <Teleport to="body">
  <nav class="lionfit-athlete-dock" :class="props.theme==='light'?'dock-light':'dock-dark'" :aria-label="uiText('Navigazione inferiore Atleta')" data-lionfit-dock="athlete">
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
 display:flex!important;flex-direction:column;align-items:center;justify-content:center;
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
@media(prefers-reduced-motion:no-preference){.lionfit-dock-item{transition:background .18s ease,color .18s ease}}
</style>
