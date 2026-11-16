<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {ProgressCheck} from '../features/progress/progressModel'
import {checkSides,sideLabel} from '../features/progress/checkComparison'
import {checkPhotos,orderChecks,type PhotoScope} from '../features/progress/checkGallery'
import {useCheckPhotos} from '../features/progress/useCheckPhotos'
import CheckPhotoViewer from './CheckPhotoViewer.vue'
const props=defineProps<{checks:ProgressCheck[];allowed:ProgressCheck[];scope:PhotoScope;role:'athlete'|'coach';shareIds:string[];shareEnabled:boolean;shareReady:boolean;online:boolean;busy:boolean}>()
const emit=defineEmits<{share:[check:ProgressCheck,enabled:boolean]}>()
const scope=computed(()=>props.scope),rows=computed(()=>orderChecks(props.checks)),selected=ref(''),viewer=ref(''),confirm=ref('')
const allowedIds=computed(()=>new Set(props.allowed.map(c=>c.id)))
const active=computed(()=>props.allowed.find(c=>c.id===selected.value))
const requests=computed(()=>active.value?checkPhotos(active.value,scope.value):[])
const {urls,errors,pending,retry,imageFailed}=useCheckPhotos(requests,scope)
const viewerPhoto=computed(()=>requests.value.find(p=>p.storagePath===viewer.value)),viewerUrl=computed(()=>urls.value[viewer.value]||'')
watch(()=>JSON.stringify(scope.value),()=>{selected.value='';viewer.value='';confirm.value=''},{flush:'sync'})
watch(allowedIds,ids=>{if(!ids.has(selected.value)){selected.value='';viewer.value=''}},{flush:'sync'})
watch(selected,()=>{viewer.value=''},{flush:'sync'})
watch(()=>props.shareReady,ready=>{if(!ready)confirm.value=''})
function open(c:ProgressCheck){selected.value=selected.value===c.id?'':c.id}
function askShare(c:ProgressCheck){if(props.shareIds.includes(c.id)){emit('share',c,false);return}confirm.value=c.id}
function accept(c:ProgressCheck){confirm.value='';emit('share',c,true)}
function date(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('/'):s}
</script>
<template>
<section class="panel lf-p360-card lf25-gallery"><h2>Storico fotografico</h2>
<p v-if="!online" class="muted small">Collegati a Internet per visualizzare le foto private.</p>
<p v-else-if="!shareEnabled" class="muted small">Condivisione non disponibile.</p>
<p v-else-if="!shareReady" class="muted small" role="status">Condivisione non verificata. Riprova.</p>
<article v-for="c in rows" :key="c.id" class="lf25-check">
 <div class="lf25-check-head"><div><strong>{{date(c.performedOn)}}</strong><small class="muted">{{c.photos?.length||0}} foto · {{shareIds.includes(c.id)&&shareReady?'Condiviso':'Privato'}}</small></div><button v-if="allowedIds.has(c.id)" type="button" class="secondary" :aria-expanded="selected===c.id" @click="open(c)">{{selected===c.id?'Chiudi':'Apri foto'}}</button><span v-else class="muted small">{{online?'Foto non disponibili':'Connessione necessaria'}}</span></div>
 <p v-if="c.notes" class="muted small lf25-notes">{{c.notes}}</p>
 <template v-if="role==='athlete'&&shareEnabled&&shareReady"><button type="button" class="secondary lf25-share" :disabled="busy||!online" @click="askShare(c)">{{shareIds.includes(c.id)?'Revoca condivisione':'Condividi con i Coach'}}</button><div v-if="confirm===c.id" class="lf25-consent"><p>Condividere le foto di questo check con i Coach attivi della tua palestra? Puoi revocare il permesso, ma non eventuali copie già effettuate.</p><div><button type="button" class="secondary" @click="confirm=''">Annulla</button><button type="button" class="primary" :disabled="busy||!online" @click="accept(c)">Condividi</button></div></div></template>
 <div v-if="selected===c.id&&active" class="lf25-grid"><figure v-for="side in checkSides" :key="side.id"><figcaption>{{side.label}}</figcaption><template v-if="requests.some(p=>p.side===side.id)"><template v-for="p in requests.filter(r=>r.side===side.id)" :key="p.storagePath"><button v-if="urls[p.storagePath]" class="lf25-photo" type="button" @click="viewer=p.storagePath" :aria-label="`Ingrandisci ${side.label}`"><img :src="urls[p.storagePath]" @error="imageFailed(p.storagePath,($event.target as HTMLImageElement).getAttribute('src')||'')" :alt="side.label"/><span>Ingrandisci</span></button><div v-else class="lf25-placeholder"><span v-if="pending[p.storagePath]" role="status">Caricamento…</span><template v-else><span>{{errors[p.storagePath]||'Foto non disponibile'}}</span><button type="button" class="secondary" @click="retry(p)">Riprova</button></template></div></template></template><div v-else class="lf25-placeholder">Non registrata</div></figure></div>
</article><p v-if="!rows.length" class="muted small">Nessun check ancora registrato.</p><CheckPhotoViewer :url="viewerUrl" :label="viewerPhoto?sideLabel(viewerPhoto.side):''" @close="viewer=''"/>
</section>
</template>
<style scoped>
.lf25-check{border:1px solid var(--border);background:var(--card2);border-radius:13px;padding:12px;margin-top:10px}.lf25-check-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.lf25-check-head small{display:block;margin-top:4px}.lf25-check-head button,.lf25-share{min-height:38px;font-size:12px}.lf25-notes{white-space:pre-wrap;overflow-wrap:anywhere}.lf25-share{margin-top:9px}.lf25-consent{padding:10px;border:1px solid var(--border);border-radius:10px;margin-top:9px;font-size:13px}.lf25-consent>div{display:flex;gap:8px;flex-wrap:wrap}.lf25-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.lf25-grid figure{min-width:0;margin:0}.lf25-grid figcaption{font-size:12px;margin-bottom:5px;font-weight:700}.lf25-photo,.lf25-placeholder{width:100%;min-width:0;aspect-ratio:3/4;border:1px solid var(--border);border-radius:10px;background:var(--card);overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;color:var(--text);padding:4px}.lf25-photo img{width:100%;min-height:0;flex:1;object-fit:contain}.lf25-photo span{font-size:11px}.lf25-placeholder{padding:8px;text-align:center;font-size:12px;overflow-wrap:anywhere}.lf25-placeholder button{min-height:34px;font-size:11px}@media(min-width:820px){.lf25-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
