<script setup lang="ts">
import {ref,watch,nextTick,onBeforeUnmount} from 'vue'
const props=defineProps<{url:string;label:string}>()
const emit=defineEmits<{close:[]}>()
const dialog=ref<HTMLDialogElement|null>(null),zoom=ref(1)
watch(()=>props.url,async url=>{zoom.value=1;await nextTick();if(!dialog.value)return;if(url&&!dialog.value.open)dialog.value.showModal();else if(!url&&dialog.value.open)dialog.value.close()},{immediate:true})
onBeforeUnmount(()=>{if(dialog.value?.open)dialog.value.close()})
</script>
<template><dialog ref="dialog" class="lf25-viewer" aria-label="Visualizzatore foto" @cancel.prevent="emit('close')" @click.self="emit('close')"><div class="lf25-viewer-body"><header><strong>{{label}}</strong><button type="button" @click="emit('close')" aria-label="Chiudi foto">✕</button></header><div class="lf25-viewer-scroll"><img v-if="url" :src="url" :alt="label" :style="{width:`${zoom*100}%`}" /></div><label>Zoom <input v-model.number="zoom" type="range" min="1" max="3" step="0.1"/></label></div></dialog></template>
<style scoped>
.lf25-viewer{position:fixed;inset:0;margin:auto;width:min(96vw,800px);max-width:96vw;max-height:94dvh;padding:0;border:1px solid #45534b;border-radius:16px;background:#111a16;color:#fff;overflow:hidden}.lf25-viewer::backdrop{background:rgba(0,0,0,.86)}.lf25-viewer-body{display:grid;gap:12px;padding:12px;max-height:90dvh}.lf25-viewer header{display:flex;align-items:center;justify-content:space-between;gap:12px}.lf25-viewer button{background:#26382f;color:#fff;border:1px solid #52655a;border-radius:10px;min-width:44px;min-height:44px}.lf25-viewer-scroll{overflow:auto;max-height:70dvh;text-align:center;overscroll-behavior:contain}.lf25-viewer-scroll img{display:block;max-width:none;height:auto;margin:auto}.lf25-viewer label{display:flex;align-items:center;gap:12px}.lf25-viewer input{flex:1;min-width:0;accent-color:#32d38b}
</style>
