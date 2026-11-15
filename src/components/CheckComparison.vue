<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {ProgressCheck,CheckPhoto} from '../features/progress/progressModel'
import {checkPhotos,orderChecks,comparableSides,type PhotoScope} from '../features/progress/checkGallery'
import {sideLabel} from '../features/progress/checkComparison'
import {useCheckPhotos} from '../features/progress/useCheckPhotos'
import CheckPhotoViewer from './CheckPhotoViewer.vue'
const props=defineProps<{checks:ProgressCheck[];scope:PhotoScope}>()
const scope=computed(()=>props.scope),rows=computed(()=>orderChecks(props.checks)),before=ref(''),after=ref(''),side=ref<CheckPhoto['side']>('front'),viewer=ref(''),zoom=ref(1)
const first=computed(()=>rows.value.find(c=>c.id===before.value)),last=computed(()=>rows.value.find(c=>c.id===after.value))
const later=computed(()=>rows.value.filter(c=>first.value&&c.id!==first.value.id&&c.performedOn>=first.value.performedOn))
const sides=computed(()=>comparableSides(first.value,last.value,scope.value))
watch(()=>JSON.stringify(scope.value),()=>{before.value='';after.value='';viewer.value=''},{flush:'sync'})
watch(rows,rs=>{if(!rs.some(c=>c.id===before.value))before.value='';if(!rs.some(c=>c.id===after.value))after.value=''},{flush:'sync'})
watch(later,rs=>{if(!rs.some(c=>c.id===after.value))after.value=''},{flush:'sync'})
watch(sides,ss=>{if(ss.length&&!ss.some(s=>s.id===side.value))side.value=ss[0].id},{flush:'sync'})
const requests=computed(()=>first.value&&last.value&&sides.value.some(s=>s.id===side.value)?[first.value,last.value].flatMap(c=>checkPhotos(c,scope.value).filter(p=>p.side===side.value)):[])
const {urls,errors,pending,retry}=useCheckPhotos(requests,scope)
watch(()=>requests.value.map(p=>p.storagePath).join('|'),()=>{zoom.value=1;viewer.value=''},{flush:'sync'})
const viewerUrl=computed(()=>urls.value[viewer.value]||'')
function date(c:ProgressCheck){return c.performedOn.split('-').reverse().join('/')+' · '+(rows.value.length-rows.value.indexOf(c))}
</script>
<template><section class="panel lf-p360-card lf-p15-compare lf25-compare"><h2>Prima e dopo</h2><p class="muted small">Seleziona due check e passa da un’inquadratura all’altra. Solo le pose presenti in entrambi sono confrontabili.</p>
<p v-if="rows.length<2" class="muted small">Servono almeno due check fotografici disponibili.</p>
<template v-else><div class="lf-p15-pair"><label>PRIMA<select v-model="before"><option value="">Seleziona check</option><option v-for="c in rows" :key="c.id" :value="c.id">{{date(c)}}</option></select></label><label>DOPO<select v-model="after" :disabled="!first"><option value="">Seleziona check</option><option v-for="c in later" :key="c.id" :value="c.id">{{date(c)}}</option></select></label></div>
<p v-if="first&&last&&!sides.length" class="muted small">Questi check non hanno inquadrature in comune.</p>
<div v-if="sides.length" class="lf25-poses" aria-label="Inquadratura"><button v-for="s in sides" :key="s.id" type="button" class="secondary" :class="{on:side===s.id}" :aria-pressed="side===s.id" @click="side=s.id">{{s.label.replace('Foto ','')}}</button></div>
<div v-if="requests.length===2" class="lf-p15-pair"><figure v-for="(p,i) in requests" :key="p.storagePath"><figcaption>{{i?'DOPO':'PRIMA'}} · {{(i?last:first)?.performedOn.split('-').reverse().join('/')}}</figcaption><div class="lf-p15-photo-frame"><button v-if="urls[p.storagePath]" type="button" class="lf25-image" @click="viewer=p.storagePath" :aria-label="`Ingrandisci ${i?'dopo':'prima'}`"><img :src="urls[p.storagePath]" :style="{transform:`scale(${zoom})`}" :alt="`${i?'Dopo':'Prima'} · ${sideLabel(side)}`"/></button><div v-else class="lf25-status"><span v-if="pending[p.storagePath]" role="status">Caricamento…</span><template v-else><span>{{errors[p.storagePath]||'Foto non disponibile'}}</span><button type="button" class="secondary" @click="retry(p)">Riprova</button></template></div></div></figure></div>
<label v-if="requests.length===2&&requests.every(p=>urls[p.storagePath])">Zoom comune <input v-model.number="zoom" type="range" min="1" max="2" step="0.1"/></label><p v-if="first&&last" class="muted small">Misure storiche non disponibili: il profilo registra soltanto peso e altezza correnti.</p></template><CheckPhotoViewer :url="viewerUrl" :label="sideLabel(side)" @close="viewer=''"/></section></template>
<style scoped>
.lf25-poses{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.lf25-poses button{font-size:12px;min-height:36px;text-transform:capitalize}.lf25-poses button.on{border-color:var(--mint);background:var(--green-bg);color:var(--mint)}.lf25-image{width:100%;height:100%;min-width:0;min-height:0;display:block;padding:0;border:0;overflow:hidden;background:transparent}.lf25-status{display:grid;gap:8px;text-align:center;padding:8px;font-size:12px;overflow-wrap:anywhere}.lf25-status button{font-size:12px}.lf25-compare figcaption{font-size:12px}
</style>
