<script setup lang="ts">
import {ref,computed,onMounted,onUnmounted,watch,nextTick} from 'vue'
import {useRoute} from 'vue-router'
import LionIcon from '../components/LionIcon.vue'
import ExerciseMotion from '../components/ExerciseMotion.vue'
import {loadCatalog,rankedExercises,type CatalogExercise} from '../features/exercises/catalog'
import {muscleLabel,exerciseLabel} from '../features/exercises/librarySelection'
import {readLegacyExerciseCatalog} from '../integrations/firestore/legacyExerciseCatalog'
import {uiText,interfaceLanguage} from '../features/i18n/interfaceLanguage'
const props=withDefaults(defineProps<{selectionMode?:boolean}>(),{selectionMode:false})
const emit=defineEmits<{select:[CatalogExercise];close:[]}>()
const route=useRoute()
const all=ref<CatalogExercise[]>([]),terms=ref(''),muscle=ref(''),state=ref('Caricamento catalogo V1...'),picked=ref<CatalogExercise|null>(null),pending=ref<CatalogExercise|null>(null),lang=ref<'it'|'en'>(interfaceLanguage.value),limit=ref(80),loading=ref(true),failed=ref(false)
const pickerRoot=ref<HTMLElement|null>(null)
let nestedOpener:HTMLElement|null=null
function focusNested(){nestedOpener=document.activeElement instanceof HTMLElement?document.activeElement:null;void nextTick(()=>pickerRoot.value?.querySelector<HTMLElement>('.lf-library-nested button')?.focus())}
function choose(e:CatalogExercise){pending.value=e;focusNested()}
function closeNested(){picked.value=null;pending.value=null;const opener=nestedOpener;nestedOpener=null;void nextTick(()=>opener?.focus())}
async function load(){loading.value=true;failed.value=false;state.value='Caricamento catalogo V1...';try{all.value=await loadCatalog(readLegacyExerciseCatalog);state.value=all.value.length+' ESERCIZI'}catch(e){failed.value=true;state.value=(e as Error).message}finally{loading.value=false}}
const muscles=computed(()=>[...new Set(all.value.flatMap(e=>[e.target,e.bodyPart]).filter((x):x is string=>!!x).map(x=>x.toUpperCase()))].sort((a,b)=>muscleLabel(a,interfaceLanguage.value).localeCompare(muscleLabel(b,interfaceLanguage.value),interfaceLanguage.value)))
const matches=computed(()=>rankedExercises(all.value,terms.value,muscle.value,all.value.length))
const results=computed(()=>matches.value.slice(0,limit.value))
const title=(e:CatalogExercise)=>exerciseLabel(e,interfaceLanguage.value)
function open(e:CatalogExercise){picked.value=e;lang.value=interfaceLanguage.value;if(props.selectionMode)focusNested()}
function handleKey(event:KeyboardEvent){
 if(event.key==='Escape'&&(props.selectionMode||picked.value)){event.stopPropagation();event.preventDefault();back();return}
 if(event.key!=='Tab'||!props.selectionMode||!pickerRoot.value)return
 const zone=pickerRoot.value.querySelector<HTMLElement>('.lf-library-nested .dialog')||pickerRoot.value
 const controls=Array.from(zone.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],textarea:not([disabled])')).filter(el=>el.getClientRects().length>0)
 if(!controls.length)return
 const first=controls[0],last=controls[controls.length-1],active=document.activeElement
 if(!controls.includes(active as HTMLElement)||(event.shiftKey&&active===first)||(!event.shiftKey&&active===last)){event.preventDefault();(event.shiftKey?last:first).focus()}
}
function windowEscape(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented&&props.selectionMode)handleKey(event)}
function localBack(event:Event){if(!props.selectionMode||event.defaultPrevented)return;event.preventDefault();back()}
function back(){if(pending.value||picked.value){closeNested();return}emit('close')}
function confirm(){if(!props.selectionMode||!pending.value)return;const exercise=pending.value;pending.value=null;emit('select',exercise)}
watch([()=>route.query.exerciseId,all],()=>{if(props.selectionMode)return;const id=route.query.exerciseId;if(typeof id!=='string')return;const exercise=all.value.find(e=>e.id===id);if(exercise){terms.value=title(exercise);open(exercise)}},{immediate:true})
onMounted(()=>{void load();if(props.selectionMode){window.addEventListener('lionfit:local-back',localBack);window.addEventListener('keydown',windowEscape);void nextTick(()=>pickerRoot.value?.focus())}})
onUnmounted(()=>{window.removeEventListener('lionfit:local-back',localBack);window.removeEventListener('keydown',windowEscape)})
</script>
<template>
<div :class="selectionMode?'modal-overlay lf-library-picker-overlay':'stack lf-library-browse'" @click.self="selectionMode&&back()" @keydown="handleKey">
 <div ref="pickerRoot" :class="selectionMode?'dialog lf-library-picker-dialog stack':'lf-library-browse-content'" :role="selectionMode?'dialog':undefined" :aria-modal="selectionMode?true:undefined" :aria-label="selectionMode?uiText('Seleziona esercizio'):undefined" :tabindex="selectionMode?-1:undefined" style="gap:14px">
  <div v-if="selectionMode" class="row between lf-library-picker-top"><strong>{{uiText('Seleziona esercizio')}}</strong><button class="secondary" type="button" @click="back">{{uiText('Chiudi libreria')}} ✕</button></div>
  <section class="panel library-header"><div class="row between"><div><h2 class="card-heading"><LionIcon name="book" :size="20"/> {{uiText("LIBRERIA ESERCIZI")}}</h2><p class="muted small" style="margin:5px 0 0">{{uiText("CATALOGO ESERCIZI CONDIVISO LION FIT")}}</p></div><span class="pill">{{uiText(state)}}</span></div><div class="library-filters"><input v-model="terms" :placeholder="uiText('Cerca in italiano o inglese (es. panca, bench)...')" @input="limit=80"/><select v-model="muscle" @change="limit=80"><option value="">{{uiText("Tutti i Muscoli")}}</option><option v-for="m in muscles" :key="m" :value="m">{{muscleLabel(m,interfaceLanguage)}}</option></select></div></section>
  <div class="notice notice-success library-explain">{{selectionMode?uiText('Premi Seleziona per inserire un esercizio nella scheda.'):interfaceLanguage==='en'?'Animated exercise previews start automatically. Open an exercise for instructions and playback controls.':'Le anteprime SVG si animano automaticamente: scorri per vedere gli esercizi in movimento senza aprirli.'}}</div>
  <div v-if="failed" class="panel" role="alert">{{state}} <button type="button" class="secondary" @click="load">{{uiText('Riprova')}}</button></div>
  <div class="library-grid">
   <div v-for="(e,i) in results" :key="e.id" :class="selectionMode?'lf-library-choice':'lf-library-browse-item'">
    <button v-if="selectionMode" type="button" class="lf-library-select" :aria-label="`${uiText('Seleziona')} ${title(e)}`" @click="choose(e)">{{uiText('Seleziona')}}</button>
    <button type="button" class="library-card" style="text-align:left;color:inherit" @click="open(e)"><ExerciseMotion v-if="e.animation?.frames?.length" :exercise="e"/><div v-else class="exercise-motion-fallback" style="min-height:110px;display:grid;place-items:center">{{uiText('📖 Solo istruzioni, senza SVG')}}</div><h3>{{title(e)}}</h3><p>EN · {{e.name}}</p><span class="green small">{{muscleLabel(e.target||'',interfaceLanguage)||uiText('ESERCIZIO')}}</span><p class="small muted">{{muscleLabel(e.bodyPart||'',interfaceLanguage)}} · {{e.equipment||uiText('Attrezzatura non specificata')}}</p><span v-if="terms&&i===0" class="best-result">{{uiText("★ MIGLIOR RISULTATO")}}</span></button>
   </div>
  </div>
  <div v-if="!loading&&!failed&&!results.length" class="panel">{{uiText("Nessun esercizio trovato.")}}</div><button v-if="matches.length>limit" type="button" class="secondary" @click="limit+=80">{{uiText("Mostra altri esercizi")}} ({{limit}} / {{matches.length}})</button>
  <div v-if="picked" class="modal-overlay lf-library-nested" @click.self="closeNested"><div class="dialog exercise-dialog"><div class="row between"><h2>{{title(picked)}}</h2><button class="secondary" type="button" @click="closeNested">{{uiText("CHIUDI")}} ✕</button></div><ExerciseMotion v-if="picked.animation?.frames?.length" :exercise="picked" eager/><p v-else class="muted">{{uiText("Questo esercizio ha istruzioni testuali ma non un’animazione SVG nella libreria originale.")}}</p><p class="muted" style="margin:15px 0">EN: {{picked.name}} {{uiText("· Muscolo:")}} {{muscleLabel(picked.target||'',interfaceLanguage)}} {{uiText("· Attrezzatura:")}} {{picked.equipment||uiText('non specificata')}}</p><p v-if="picked.secondaryMuscles?.length" class="small muted">{{uiText("Muscoli secondari:")}} {{picked.secondaryMuscles.map(m=>muscleLabel(m,interfaceLanguage)).join(', ')}}</p><p class="small muted">{{uiText("Licenza dati:")}} {{picked.dataLicense||'non indicata'}} · Media: {{picked.animation?.license||picked.mediaStatus||'non indicati'}}</p><div class="row"><button class="ghost" type="button" @click="lang=lang==='it'?'en':'it'" :disabled="!picked.instructions_it?.length">{{uiText(lang==='it'?'Mostra inglese':'Mostra italiano')}}</button></div><ol class="exercise-steps"><li v-for="(step,i) in (lang==='it'&&picked.instructions_it?.length?picked.instructions_it:picked.instructions||[])" :key="i">{{step}}</li></ol></div></div>
  <div v-if="selectionMode&&pending" class="modal-overlay lf-library-nested" @click.self="closeNested"><div class="dialog lf-library-confirm" role="alertdialog" aria-modal="true" :aria-label="uiText('Inserire questo esercizio?')"><h2>{{uiText('Inserire questo esercizio?')}}</h2><p>{{title(pending)}}</p><p class="muted small">{{uiText('L’esercizio verrà inserito nella riga selezionata della scheda.')}}</p><div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button type="button" class="secondary" @click="closeNested">{{uiText('Annulla')}}</button><button type="button" class="primary" @click="confirm">{{uiText('Conferma selezione')}}</button></div></div></div>
 </div>
</div>
</template>
<style scoped>
.lf-library-browse{gap:14px}
.lf-library-browse-content,.lf-library-browse-item{display:contents}
.lf-library-choice{display:flex;flex-direction:column;gap:4px;min-width:0}
.lf-library-choice .library-card{width:100%;flex:1;min-width:0}
.lf-library-select{width:100%;min-height:32px;border:0;border-radius:8px;background:var(--green,#15803d);color:#fff;font-size:12px;font-weight:800;padding:5px}
.lf-library-picker-overlay{z-index:1600!important}
.lf-library-picker-dialog{width:min(100%,1040px)!important;max-width:1040px!important;max-height:calc(100dvh - max(24px,env(safe-area-inset-top,0px)) - max(24px,env(safe-area-inset-bottom,0px)))!important;overflow-y:auto!important;overscroll-behavior:contain;min-width:0}
.lf-library-picker-dialog > *{flex-shrink:0}
.lf-library-picker-top{position:sticky;top:0;z-index:3;background:var(--card);padding:6px 0;border-bottom:1px solid var(--border)}
.lf-library-picker-top button{min-height:35px;white-space:nowrap}
.lf-library-picker-overlay .lf-library-nested{z-index:1610!important}
.lf-library-confirm{width:min(100%,420px)}
@media(max-width:600px){.lf-library-picker-dialog{padding:10px!important}.lf-library-picker-dialog .library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
