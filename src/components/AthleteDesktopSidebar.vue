<script setup lang="ts">
/** Sidebar Atleta desktop, indipendente dalla navbar Coach e dal dock mobile. */
import { RouterLink } from 'vue-router'
import LionIcon from './LionIcon.vue'
import {uiText} from '../features/i18n/interfaceLanguage'
import appMeta from '../../package.json'
type NavItem={to:string;label:string;icon:string}
defineProps<{items:readonly NavItem[];expanded:boolean;avatarUrl?:string}>()
const emit=defineEmits<{(e:'toggle'):void;(e:'logout'):void}>()
</script>
<template>
 <aside class="lf-athlete-desktop-sidebar" :class="{'is-collapsed':!expanded}" :aria-label="uiText('Menu Atleta desktop')">
  <div class="lf-athlete-side-brand"><img src="/v1-preview/LOGO-APP.png" alt="" v-if="expanded"/><span v-if="expanded"><strong>LION <em>FIT</em></strong><small>{{uiText("AREA ATLETA")}}</small></span><button type="button" @click="emit('toggle')" :aria-label="expanded?'Riduci il menu Atleta':'Espandi il menu Atleta'" :title="expanded?'Riduci il menu':'Espandi il menu'"><LionIcon name="menu" :size="19"/></button></div>
  <nav class="lf-athlete-side-links" :aria-label="uiText('Sezioni Atleta')"><RouterLink v-for="item in items" :key="item.to" :to="item.to" :title="uiText(item.label)"><LionIcon :name="item.icon" :size="20"/><span v-if="expanded">{{uiText(item.label)}}</span></RouterLink></nav>
  <div class="lf-athlete-side-footer"><RouterLink :to="items.some(x=>x.to.includes('emulator'))?'/impostazioni?source=emulator':'/impostazioni'" :title="uiText('Impostazioni')"><LionIcon name="settings" :size="20"/><span v-if="expanded">{{uiText("Impostazioni")}}</span></RouterLink><button type="button" @click="emit('logout')" :title="uiText('Esci da Lion Fit')"><LionIcon name="logout" :size="20"/><span v-if="expanded">{{uiText("Esci da Lion Fit")}}</span></button><small v-if="expanded">LION FIT · WEB v{{appMeta.version}}</small></div>
 </aside>
</template>
