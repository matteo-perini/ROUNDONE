<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import type {ProgressCheck,CheckPhoto} from '../features/progress/progressModel'
import {checkSides,comparisonOptions,validComparison} from '../features/progress/checkComparison'
import {loadPhoto} from '../integrations/firestore/progress'
const props=defineProps<{checks:ProgressCheck[];scope:string}>()
const side=ref<CheckPhoto['side']>('front'),from=ref(''),to=ref(''),before=ref(''),after=ref(''),urls=ref(['','']),error=ref(''),loading=ref(false),zoom=ref(1)
const options=computed(()=>comparisonOptions(props.checks,side.value,from.value,to.value))
let generation=0
function clear(){generation++;urls.value.forEach(u=>{if(u)URL.revokeObjectURL(u)});urls.value=['',''];loading.value=false;error.value=''}
watch([side,from,to,()=>props.scope],()=>{before.value='';after.value='';clear()})
watch(options,rows=>{if(!rows.some(r=>r.id===before.value))before.value='';if(!rows.some(r=>r.id===after.value))after.value='';if(!before.value||!after.value)clear()})
watch([before,after],async()=>{clear();const a=options.value.find(x=>x.id===before.value),b=options.value.find(x=>x.id===after.value);if(!a||!b)return;if(!validComparison(a,b)){error.value='Scegli due check distinti in ordine cronologico.';return}const ticket=generation;loading.value=true;try{for(const [i,row] of [a,b].entries()){const url=await loadPhoto(row.photo.storagePath);if(ticket!==generation){URL.revokeObjectURL(url);return}urls.value[i]=url}}catch(e){if(ticket===generation){clear();error.value=e instanceof Error?e.message:String(e)}}finally{if(ticket===generation)loading.value=false}})
onUnmounted(clear)
</script>
<template><section class="panel lf-p360-card lf-p15-compare"><h2>Confronto Prima e Dopo</h2><p class="muted small">Scegli due fotografie della stessa posa. Nessuna analisi automatica.</p><label>Inquadratura<select v-model="side"><option v-for="s in checkSides" :key="s.id" :value="s.id">{{s.label}}</option></select></label><div class="lf-p15-pair"><label>Dal <input v-model="from" type="date"/></label><label>Al <input v-model="to" type="date"/></label></div><div class="lf-p15-pair"><label>PRIMA<select v-model="before"><option value="">Seleziona data</option><option v-for="(o,i) in options" :key="o.id" :value="o.id">{{o.date}} · {{options.length-i}}</option></select></label><label>DOPO<select v-model="after"><option value="">Seleziona data</option><option v-for="(o,i) in options" :key="o.id" :value="o.id">{{o.date}} · {{options.length-i}}</option></select></label></div><p v-if="options.length<2" class="muted small">Servono almeno due check con questa inquadratura.</p><p v-if="loading" role="status">Caricamento foto private…</p><p v-if="error" role="alert">{{error}}</p><div v-if="urls.some(Boolean)" class="lf-p15-pair"><figure v-for="(url,i) in urls" :key="i"><figcaption>{{i?'DOPO':'PRIMA'}}</figcaption><div class="lf-p15-photo-frame"><img v-if="url" :src="url" :style="{transform:`scale(${zoom})`}" :alt="i?'Foto dopo':'Foto prima'"/></div></figure></div><label v-if="urls.every(Boolean)">Zoom comune <input v-model.number="zoom" type="range" min="1" max="2" step="0.1"/></label></section></template>
