<script setup lang="ts">
import {ref,computed,onMounted,onUnmounted,watch,nextTick} from 'vue'
import {useRoute} from 'vue-router'
import LionIcon from '../components/LionIcon.vue'
import ExerciseMotion from '../components/ExerciseMotion.vue'
import {loadCatalog,rankedExercises,type CatalogExercise} from '../features/exercises/catalog'
import {muscleLabel,exerciseLabel} from '../features/exercises/librarySelection'
import {libraryGroupOptions,exercisesInGroup,type LibraryGroupFilter} from '../features/exercises/libraryGroups'
import {readLegacyExerciseCatalog} from '../integrations/firestore/legacyExerciseCatalog'
import {uiText,interfaceLanguage} from '../features/i18n/interfaceLanguage'
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {stagingSession,readNavigationSession} from '../integrations/firebase/stagingSession'
import {onAuthStateChanged,type Unsubscribe} from 'firebase/auth'
import {favoriteKey,readFavorites,toggleFavorite,type FavoriteScope} from '../features/exercises/favoriteExercises'
const props=withDefaults(defineProps<{selectionMode?:boolean}>(),{selectionMode:false})
const emit=defineEmits<{select:[CatalogExercise];close:[]}>()
const route=useRoute()
const all=ref<CatalogExercise[]>([]),terms=ref(''),muscle=ref<LibraryGroupFilter>(''),state=ref('Caricamento catalogo V1...'),picked=ref<CatalogExercise|null>(null),pending=ref<CatalogExercise|null>(null),lang=ref<'it'|'en'>(interfaceLanguage.value),limit=ref(80),loading=ref(true),failed=ref(false)
const favoriteScope=ref<FavoriteScope|null>(null),favorites=ref<string[]>([]),onlyFavorites=ref(false),favoriteError=ref('')
const favoriteSet=computed(()=>new Set(favorites.value))
let stopFavoriteAuth:Unsubscribe|undefined,favoriteGeneration=0,favoriteAlive=true
function clearFavoriteScope(){favoriteGeneration++;favoriteScope.value=null;favorites.value=[];onlyFavorites.value=false;favoriteError.value=''}
function refreshFavorites(){if(!favoriteScope.value)return;try{favorites.value=readFavorites(localStorage,favoriteScope.value);favoriteError.value=''}catch{favoriteError.value=uiText('Preferiti non disponibili su questo dispositivo.')}}
async function bindFavorites(uid:string|undefined){clearFavoriteScope();const generation=favoriteGeneration;if(!uid)return;try{const session=await readNavigationSession(),{auth,db}=getStagingClients();if(!favoriteAlive||generation!==favoriteGeneration||auth.currentUser?.uid!==uid||session.uid!==uid||session.role==='atleta')return;const project=db.app.options.projectId;if(!project)return;favoriteScope.value={project,gym:session.gymId,uid};refreshFavorites()}catch{/* No verified Coach: do not expose local preferences. */}}
function favoriteStorage(e:StorageEvent){const scope=favoriteScope.value;if(scope&&(e.key===null||e.key===favoriteKey(scope)))refreshFavorites()}
function markFavorite(id:string){const scope=favoriteScope.value;if(!scope)return;const current=stagingSession.value;if(!current||current.uid!==scope.uid||current.gymId!==scope.gym||current.role==='atleta'||getStagingClients().auth.currentUser?.uid!==scope.uid){clearFavoriteScope();return}try{favorites.value=toggleFavorite(localStorage,scope,id);favoriteError.value=''}catch{favoriteError.value=uiText('Impossibile salvare il preferito su questo dispositivo.')}}
watch(stagingSession,current=>{const scope=favoriteScope.value;if(scope&&(!current||current.uid!==scope.uid||current.gymId!==scope.gym||current.role==='atleta'))clearFavoriteScope();if(current&&current.role!=='atleta'&&(!favoriteScope.value||favoriteScope.value.uid!==current.uid||favoriteScope.value.gym!==current.gymId)){try{const uid=getStagingClients().auth.currentUser?.uid;if(uid===current.uid)void bindFavorites(uid)}catch{}}})
const pickerRoot=ref<HTMLElement|null>(null)
let nestedOpener:HTMLElement|null=null
function focusNested(){nestedOpener=document.activeElement instanceof HTMLElement?document.activeElement:null;void nextTick(()=>pickerRoot.value?.querySelector<HTMLElement>('.lf-library-nested button')?.focus())}
function choose(e:CatalogExercise){pending.value=e;focusNested()}
function closeNested(){picked.value=null;pending.value=null;const opener=nestedOpener;nestedOpener=null;void nextTick(()=>opener?.focus())}
async function load(){loading.value=true;failed.value=false;state.value='Caricamento catalogo V1...';try{all.value=await loadCatalog(readLegacyExerciseCatalog);state.value=all.value.length+' ESERCIZI'}catch(e){failed.value=true;state.value=(e as Error).message}finally{loading.value=false}}
const muscles=computed(()=>libraryGroupOptions(all.value,interfaceLanguage.value))
const matches=computed(()=>{const scoped=exercisesInGroup(all.value,muscle.value).filter(e=>!onlyFavorites.value||favoriteSet.value.has(e.id));return rankedExercises(scoped,terms.value,'',scoped.length)})
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
onMounted(()=>{void load();if(isOperationalMode()){try{stopFavoriteAuth=onAuthStateChanged(getStagingClients().auth,user=>void bindFavorites(user?.uid));window.addEventListener('storage',favoriteStorage)}catch{}}if(props.selectionMode){document.documentElement.classList.add('lf-library-picker-open');window.addEventListener('lionfit:local-back',localBack);window.addEventListener('keydown',windowEscape);void nextTick(()=>pickerRoot.value?.focus())}})
onUnmounted(()=>{favoriteAlive=false;clearFavoriteScope();stopFavoriteAuth?.();window.removeEventListener('storage',favoriteStorage);if(props.selectionMode)document.documentElement.classList.remove('lf-library-picker-open');window.removeEventListener('lionfit:local-back',localBack);window.removeEventListener('keydown',windowEscape)})
</script>
<template>
<div :class="selectionMode?'modal-overlay lf-library-picker-overlay':'stack lf-library-browse'" @click.self="selectionMode&&back()" @keydown="handleKey">
 <div ref="pickerRoot" :class="selectionMode?'dialog lf-library-picker-dialog stack':'lf-library-browse-content'" :role="selectionMode?'dialog':undefined" :aria-modal="selectionMode?true:undefined" :aria-label="selectionMode?uiText('Seleziona esercizio'):undefined" :tabindex="selectionMode?-1:undefined" style="gap:14px">
  <div v-if="selectionMode" class="row between lf-library-picker-top"><strong>{{uiText('Seleziona esercizio')}}</strong><button class="secondary" type="button" @click="back">{{uiText('Chiudi libreria')}} ✕</button></div>
  <div :class="selectionMode?'lf-library-picker-scroll':'lf-library-browse-content'" v-lf-entrance="{id:'coach-library',ready:!selectionMode&&!loading&&!failed,rows:[{within:'.library-grid',match:'.lf-library-browse-item'}]}">
  <section class="panel library-header"><div class="row between"><div><h2 class="card-heading"><LionIcon name="book" :size="20"/> {{uiText("LIBRERIA ESERCIZI")}}</h2></div><span v-if="!loading&&!failed" class="pill">{{all.length}} {{uiText("esercizi")}}</span><span v-if="loading" v-lf-quiet-loading class="lf-quiet-status" role="status">{{uiText("Caricamento esercizi…")}}</span></div><div class="library-filters"><input v-model="terms" :placeholder="uiText('Cerca in italiano o inglese (es. panca, bench)...')" @input="limit=80"/><select v-model="muscle" @change="limit=80"><option value="">{{uiText("Tutti i Muscoli")}}</option><option v-for="m in muscles" :key="m.id" :value="m.id">{{m.label}} ({{m.count}})</option></select></div><div v-if="favoriteScope" class="lf-r5-favorite-filters"><button type="button" class="secondary" :class="{'is-selected':onlyFavorites}" :aria-pressed="onlyFavorites" @click="onlyFavorites=!onlyFavorites;limit=80"><span aria-hidden="true">{{onlyFavorites?'♥':'♡'}}</span> {{uiText('Preferiti')}} ({{favorites.length}})</button><small class="muted">{{uiText('Solo su questo dispositivo')}}</small></div><p v-if="favoriteError" role="status" class="muted small">{{favoriteError}}</p></section>
  
  <div v-if="failed" class="panel" role="alert">{{state}} <button type="button" class="secondary" @click="load">{{uiText('Riprova')}}</button></div>
  <div class="library-grid">
   <div v-for="(e,i) in results" :key="e.id" :class="[selectionMode?'lf-library-choice':'lf-library-browse-item',{'lf-r5-has-favorite':!!favoriteScope}]">
    <component :is="selectionMode?'div':'button'" :type="selectionMode?undefined:'button'" class="library-card" style="text-align:left;color:inherit" @click="!selectionMode&&open(e)">
     <button v-if="selectionMode" type="button" class="lf-library-detail" :aria-label="title(e)" @click="open(e)"></button>
     <div :class="selectionMode?'lf-library-preview-wrap':'lf-library-preview-browse'">
      <ExerciseMotion v-if="e.animation?.frames?.length" :exercise="e"/><div v-else class="exercise-motion-fallback" style="min-height:110px;display:grid;place-items:center">{{uiText('Solo istruzioni')}}</div>
     </div>
     <h3>{{title(e)}}</h3>
     <div :class="selectionMode?'lf-library-meta':'lf-library-browse-content'">
      <div :class="selectionMode?'lf-library-meta-copy':'lf-library-browse-content'"><p>EN · {{e.name}}</p><span class="green small">{{muscleLabel(e.target||'',interfaceLanguage)||uiText('ESERCIZIO')}}</span><p class="small muted">{{muscleLabel(e.bodyPart||'',interfaceLanguage)}} · {{e.equipment||uiText('Attrezzatura non specificata')}}</p></div>
      <button v-if="selectionMode&&favoriteScope" type="button" class="lf-r8b-picker-heart" :class="{'is-favorite':favoriteSet.has(e.id)}" :aria-pressed="favoriteSet.has(e.id)" :aria-label="uiText(favoriteSet.has(e.id)?'Rimuovi dai preferiti':'Aggiungi ai preferiti')+' '+title(e)" @click.stop="markFavorite(e.id)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" :fill="favoriteSet.has(e.id)?'currentColor':'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" transform="translate(0 -1)"/></svg></button>
      <button v-if="selectionMode" type="button" class="lf-library-select" :aria-label="`${uiText('Seleziona')} ${title(e)}`" @click.stop="choose(e)">{{uiText('Seleziona')}}</button>
     </div>
    </component>
    <button v-if="favoriteScope&&!selectionMode" type="button" class="lf-r5-favorite-heart" :class="{'is-favorite':favoriteSet.has(e.id)}" :aria-pressed="favoriteSet.has(e.id)" :aria-label="uiText(favoriteSet.has(e.id)?'Rimuovi dai preferiti':'Aggiungi ai preferiti')+' '+title(e)" @click.stop="markFavorite(e.id)"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" :fill="favoriteSet.has(e.id)?'currentColor':'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" transform="translate(0 -1)"/></svg></button>
   </div>
  </div>
  <div v-if="!loading&&!failed&&!results.length" class="panel">{{uiText(onlyFavorites?"Nessun preferito corrisponde ai filtri.":"Nessun esercizio trovato.")}}</div><button v-if="matches.length>limit" type="button" class="secondary" @click="limit+=80">{{uiText("Mostra altri esercizi")}} ({{limit}} / {{matches.length}})</button>
  </div>
  <div v-if="picked" class="modal-overlay lf-library-nested" @click.self="closeNested"><div class="dialog exercise-dialog"><div class="row between"><h2>{{title(picked)}}</h2><button class="secondary" type="button" @click="closeNested">{{uiText("CHIUDI")}} ✕</button></div><ExerciseMotion v-if="picked.animation?.frames?.length" :exercise="picked" eager/><p v-else class="muted">{{uiText("Animazione non disponibile.")}}</p><p class="muted" style="margin:15px 0">EN: {{picked.name}} {{uiText("· Muscolo:")}} {{muscleLabel(picked.target||'',interfaceLanguage)}} {{uiText("· Attrezzatura:")}} {{picked.equipment||uiText('non specificata')}}</p><p v-if="picked.secondaryMuscles?.length" class="small muted">{{uiText("Muscoli secondari:")}} {{picked.secondaryMuscles.map(m=>muscleLabel(m,interfaceLanguage)).join(', ')}}</p><details class="small muted"><summary>{{uiText("Licenze e fonti")}}</summary><p>{{uiText("Licenza dati:")}} {{picked.dataLicense||'non indicata'}} · Media: {{picked.animation?.license||picked.mediaStatus||'non indicati'}}</p></details><div class="row"><button class="ghost" type="button" @click="lang=lang==='it'?'en':'it'" :disabled="!picked.instructions_it?.length">{{uiText(lang==='it'?'Mostra inglese':'Mostra italiano')}}</button></div><ol class="exercise-steps"><li v-for="(step,i) in (lang==='it'&&picked.instructions_it?.length?picked.instructions_it:picked.instructions||[])" :key="i">{{step}}</li></ol></div></div>
  <div v-if="selectionMode&&pending" class="modal-overlay lf-library-nested" @click.self="closeNested"><div class="dialog lf-library-confirm" role="alertdialog" aria-modal="true" :aria-label="uiText('Inserire questo esercizio?')"><h2>{{uiText('Inserire questo esercizio?')}}</h2><p>{{title(pending)}}</p><div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button type="button" class="secondary" @click="closeNested">{{uiText('Annulla')}}</button><button type="button" class="primary" @click="confirm">{{uiText('Conferma selezione')}}</button></div></div></div>
 </div>
</div>
</template>
<style scoped>
.lf-r5-favorite-filters{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}.lf-r5-favorite-filters button.is-selected{border-color:var(--mint);color:var(--mint)}.lf-r5-has-favorite{position:relative;display:flex!important;min-width:0}.lf-r5-has-favorite>.library-card{width:100%;flex:1}.lf-r5-favorite-heart{position:absolute;z-index:5;top:6px;right:6px;width:36px!important;height:36px!important;min-height:0!important;padding:0!important;display:grid;place-items:center;border:1px solid var(--border);border-radius:50%;color:var(--text);background:var(--card2);box-shadow:none!important}.lf-r5-favorite-heart.is-favorite{color:#e44969}.lf-r5-favorite-heart:active svg{transform:scale(.87)}.lf-r5-favorite-heart svg{transition:transform .17s ease}.lf-r5-favorite-heart:focus-visible{outline:2px solid var(--mint);outline-offset:2px}@media(prefers-reduced-motion:reduce){.lf-r5-favorite-heart svg{transition:none}}

.lf-library-browse{gap:14px}
.lf-library-browse-content,.lf-library-browse-item{display:contents}
.lf-library-choice{display:flex;flex-direction:column;min-width:0}
.lf-library-choice .library-card{position:relative;isolation:isolate;width:100%;flex:1;min-width:0}
.lf-library-preview-browse{display:contents}
.lf-library-preview-wrap{position:relative;width:100%;flex:none;min-width:0}
/* Keep details and selection separate. The select button is below the SVG, inside its own card. */
.lf-library-choice .lf-library-detail{position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;border:0;border-radius:inherit;background:transparent;box-shadow:none}
.lf-library-choice .lf-library-meta{display:flex;align-items:flex-end;gap:8px;min-width:0;margin-top:2px;flex:1}
.lf-library-choice .lf-library-meta-copy{flex:1;min-width:0;overflow-wrap:anywhere}
.lf-library-choice .lf-library-select{position:relative;z-index:3;flex:none;align-self:flex-end;width:auto;min-height:34px;border:0;border-radius:7px;background:var(--green,#15803d);color:#fff;font-size:11px;font-weight:800;padding:6px 10px;white-space:nowrap}
.lf-library-choice .lf-library-detail:focus-visible,.lf-library-choice .lf-library-select:focus-visible{outline:2px solid var(--mint);outline-offset:-2px}
/* In selection mode only, override legacy fixed pixel preview sizes. */
.lf-library-picker-dialog .library-grid .lf-library-choice .library-card .lf-library-preview-wrap :deep(.exercise-preview.lf76-auto-preview){width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:5/4;flex:none!important;display:flex!important;align-items:center!important;justify-content:center!important}
.lf-library-picker-dialog .library-grid .lf-library-choice .library-card .lf-library-preview-wrap :deep(.exercise-preview.lf76-auto-preview img){width:90%!important;height:88%!important;max-width:90%!important;max-height:88%!important;object-fit:contain!important;object-position:center!important}
.lf-library-picker-dialog .library-grid .lf-library-choice .library-card .lf-library-preview-wrap .exercise-motion-fallback{width:100%;aspect-ratio:5/4;min-height:0!important;padding:10px;text-align:center}
/* Fullscreen with a stationary header and exactly one scrolling content area. */
:global(html.lf-library-picker-open),:global(html.lf-library-picker-open body){overflow:hidden!important;overscroll-behavior:none}
.lf-library-picker-overlay{position:fixed!important;inset:0!important;z-index:1600!important;display:flex!important;align-items:stretch!important;justify-content:stretch!important;padding:0!important;background:var(--bg)!important;overflow:hidden!important}
.lf-library-picker-dialog{box-sizing:border-box;width:100%!important;max-width:none!important;height:100%!important;height:100dvh!important;max-height:100%!important;min-height:0;min-width:0;margin:0!important;border:0!important;border-radius:0!important;background:var(--bg)!important;padding:0!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;gap:0!important}
.lf-library-picker-top{flex:0 0 auto;position:relative;z-index:5;box-sizing:border-box;width:100%;background:var(--card,var(--bg));padding:calc(10px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--border);gap:10px;min-width:0}
.lf-library-picker-top button{min-height:36px;white-space:nowrap}
.lf-library-picker-scroll{flex:1 1 0;min-height:0;min-width:0;width:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:14px;padding:14px max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));box-sizing:border-box}
.lf-library-picker-scroll > *{flex-shrink:0}
.lf-library-picker-overlay .lf-library-nested{z-index:1610!important}
.lf-library-confirm{width:min(100%,420px)}
/* Fit five previews per row on wide desktop screens, only in the selector. */
@media(min-width:1200px){.lf-library-picker-dialog .library-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media(max-width:600px){.lf-library-picker-top{padding:calc(8px + env(safe-area-inset-top,0px)) max(10px,env(safe-area-inset-right,0px)) 8px max(10px,env(safe-area-inset-left,0px))}.lf-library-picker-scroll{padding:10px max(10px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px))}.lf-library-picker-dialog .library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lf-library-choice .lf-library-meta{flex-wrap:wrap}.lf-library-choice .lf-library-meta-copy{flex:1 1 100%}.lf-library-choice .lf-library-select{margin-left:auto;min-height:40px}}

/* PATCH 30 R8B: only the SVG picker gets the compact favorite control LEFT of Select. */
.lf-library-choice .lf-r8b-picker-heart{position:relative;z-index:4;display:grid;place-items:center;align-self:flex-end;flex:0 0 36px;width:36px!important;height:36px!important;min-height:36px!important;margin:0 2px 0 0!important;padding:0!important;border:1px solid var(--border);border-radius:10px;background:var(--card2);color:var(--muted)}
.lf-library-choice .lf-r8b-picker-heart.is-favorite{color:#df4d73;border-color:rgba(223,77,115,.5)}
.lf-library-choice .lf-r8b-picker-heart:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
@media(max-width:600px){.lf-library-choice .lf-r8b-picker-heart{min-height:40px!important;height:40px!important;flex-basis:40px}}
</style>
