<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import type {ExerciseRecord} from '../features/sheets/domain'
import {supersetView} from '../features/sheets/supersetView'
import {groupExerciseRows} from '../features/sheets/supersetEditor'
import {loadCatalog,rankedExercises,exactCatalogMatches,type CatalogExercise} from '../features/exercises/catalog'
import {findVideoByName} from '../features/exercises/videoMatch'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {loadGymExerciseVideos,type ExerciseVideo} from '../integrations/firestore/exerciseVideos'
import {readLegacyExerciseCatalog} from '../integrations/firestore/legacyExerciseCatalog'
import {readStagingSession} from '../integrations/firebase/stagingSession'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import ExerciseMotion from './ExerciseMotion.vue'
import LionIcon from './LionIcon.vue'
/** Stessa vista, per schede assegnate, archivio e demo. Solo lettura. */
type SheetForDisplay={title:string;exercises:readonly ExerciseRecord[]}
type VideoRecord=ExerciseVideo
const props=defineProps<{sheet:SheetForDisplay}>()
const supersets=computed(()=>supersetView(props.sheet.exercises))
const groups=computed(()=>groupExerciseRows(props.sheet.exercises))
const catalog=ref<CatalogExercise[]>([]),videos=ref<VideoRecord[]>([])
const detail=ref<CatalogExercise|null>(null),playing=ref<VideoRecord|null>(null)
const alternatives=ref<CatalogExercise[]>([])
const language=ref<'it'|'en'>('it')
const emit=defineEmits<{close:[];finish:[title:string]}>()
function escapeSheetDetail(e:KeyboardEvent){
 if(e.key!=='Escape')return
 if(playing.value){playing.value=null;e.stopImmediatePropagation();return}
 if(detail.value){detail.value=null;e.stopImmediatePropagation();return}
 if(alternatives.value.length){alternatives.value=[];e.stopImmediatePropagation();return}
 emit('close');e.stopImmediatePropagation()
}
// Printing opens a native system view on mobile. Return to the app and close the
// sheet overlay only AFTER the print UI has been dismissed; leave the print CSS intact.
let printing=false,printStarted=0
function mobilePrint(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(window.matchMedia?.('(pointer: coarse)').matches??false)}
function finishMobilePrint(){if(!printing)return;printing=false;if(mobilePrint())emit('close')}
function onPrintFocus(){if(printing && Date.now()-printStarted>800)finishMobilePrint()}
function printSheet(){
 if(printing)return
 printing=true;printStarted=Date.now()
 try{window.print()}catch{printing=false}
}
onMounted(()=>{
 window.addEventListener('keydown',escapeSheetDetail)
 window.addEventListener('afterprint',finishMobilePrint)
 window.addEventListener('focus',onPrintFocus)
 window.addEventListener('pageshow',onPrintFocus)
})
onUnmounted(()=>{
 window.removeEventListener('keydown',escapeSheetDetail)
 window.removeEventListener('afterprint',finishMobilePrint)
 window.removeEventListener('focus',onPrintFocus)
 window.removeEventListener('pageshow',onPrintFocus)
})
function matchingExercise(ex:ExerciseRecord):CatalogExercise|null{
 const ids=[ex.exerciseId,ex.catalogId].filter(Boolean)
 for(const id of ids){const byId=catalog.value.find(x=>x.id===id);if(byId)return byId}
 const matches=exactCatalogMatches(catalog.value,ex.name)
 // Never choose the first ranked/exact result when multiple IDs fit the name.
 return matches.length===1?matches[0]:null
}
function candidatesFor(ex:ExerciseRecord):CatalogExercise[]{
 if(matchingExercise(ex))return []
 const exact=exactCatalogMatches(catalog.value,ex.name)
 return exact.length?exact:rankedExercises(catalog.value,ex.name,'',5)
}
function videoFor(ex:ExerciseRecord):VideoRecord|null{
 return findVideoByName(videos.value,ex.name)
}
function viewExercise(ex:ExerciseRecord){
 const x=matchingExercise(ex)
 if(x){detail.value=x;language.value='it';alternatives.value=[]}
 else alternatives.value=candidatesFor(ex)
}
function chooseAlternative(ex:CatalogExercise){detail.value=ex;language.value='it';alternatives.value=[]}
onMounted(async()=>{
 void loadCatalog(isStagingMode()?readLegacyExerciseCatalog:undefined).then(xs=>{catalog.value=xs}).catch(()=>{})
 if(!isStagingMode())return
 try{
  const s=await readStagingSession(),{db}=getStagingClients()
  videos.value=await loadGymExerciseVideos(db,s.gymId,s.uid)
 }catch{/* Il dettaglio della scheda rimane disponibile anche senza video */}
})
</script>
<template>
 <div class="sheet-modal-bg" @click.self="$emit('close')">
  <div class="sheet-modal" role="dialog" aria-modal="true" :aria-label="sheet.title">
    <div class="sheet-modal-head"><h2>🏋️ {{sheet.title}}</h2><div class="row"><button class="ghost" @click="printSheet">🖨 Stampa / PDF</button><button class="bare" aria-label="Chiudi" @click="$emit('close')"><LionIcon name="x"/></button></div></div>
    <div class="sheet-modal-body">
      <div v-for="(group,groupNumber) in groups" :key="group.primaryIndex" class="sheet-pair-group" :class="{'sheet-pair-active':group.secondaryIndex!==null}">
       <div v-if="group.secondaryIndex!==null" class="sheet-pair-head"><strong>↔ SUPERSET {{String(groupNumber+1).padStart(2,'0')}}</strong><small>Due esercizi collegati · esegui in successione</small></div>
      <article v-for="i in (group.secondaryIndex===null?[group.primaryIndex]:[group.primaryIndex,group.secondaryIndex])" :key="i" class="exercise-item" :class="{'superset-first':supersets[i]?.position==='first','superset-second':supersets[i]?.position==='second'}">
        <p v-if="supersets[i]" class="superset-caption">{{supersets[i]?.position==='first'?'A · ESERCIZIO PRINCIPALE':'B · ESERCIZIO IN SUPERSET'}}</p>
        <div class="sheet-exercise-heading"><ExerciseMotion v-if="matchingExercise(sheet.exercises[i])" :exercise="matchingExercise(sheet.exercises[i])!" class="sheet-exercise-mini"/><h3>{{i+1}}. {{sheet.exercises[i].name.toUpperCase()}}</h3></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin:7px 0 10px">
         <button v-if="matchingExercise(sheet.exercises[i])" class="secondary" type="button" @click="viewExercise(sheet.exercises[i])">▶ Vedi esercizio</button><button v-else-if="candidatesFor(sheet.exercises[i]).length" class="secondary" type="button" @click="viewExercise(sheet.exercises[i])">🔎 Scegli illustrazione</button>
         <button v-if="videoFor(sheet.exercises[i])" class="secondary" type="button" @click="playing=videoFor(sheet.exercises[i])">📹 Video</button>
        </div>
        <div class="row between"><span class="exercise-tag">{{sheet.exercises[i].sets}} SET × {{sheet.exercises[i].reps}} REPS</span><span v-if="sheet.exercises[i].load || sheet.exercises[i].kg" class="exercise-tag">CARICO: {{sheet.exercises[i].load || (sheet.exercises[i].kg + ' KG')}}</span></div>
        <div v-if="supersets[i]?.position==='second'" class="exercise-tag">RECUPERO DOPO LA COPPIA: {{supersets[i]?.rest || 'come da indicazioni'}}</div><div v-if="sheet.exercises[i].rest || sheet.exercises[i].notes" class="exercise-note">NOTE: {{sheet.exercises[i].rest || sheet.exercises[i].notes}}</div>
      </article>
      </div>
    </div>
    <div class="sheet-modal-foot"><button class="primary" @click="$emit('close')">CHIUDI</button></div>
  </div>
  <div v-if="alternatives.length" class="modal-overlay" style="z-index:1102" @click.self="alternatives=[]"><div class="dialog" role="dialog" aria-modal="true" aria-label="Seleziona esercizio"><div class="row between"><h2>Seleziona l'esercizio corretto</h2><button class="secondary" @click="alternatives=[]">CHIUDI ✕</button></div><p class="muted">Nome non univoco: nessun ID viene scelto automaticamente e nessun dato viene modificato.</p><div v-for="option in alternatives" :key="option.id" class="line-card row between"><span>{{option.name_it||option.name}} <small class="muted">{{option.id}}</small></span><button class="primary" @click="chooseAlternative(option)">Visualizza</button></div></div></div>
  <div v-if="detail" class="modal-overlay" style="z-index:1102" @click.self="detail=null"><div class="dialog exercise-dialog" role="dialog" aria-modal="true" :aria-label="detail.name_it||detail.name">
   <div class="row between"><h2>{{detail.name_it||detail.name}}</h2><button class="secondary" @click="detail=null">CHIUDI ✕</button></div>
   <ExerciseMotion :exercise="detail" eager/>
   <p class="muted small">EN: {{detail.name}} · {{detail.target}}</p>
   <button class="ghost" :disabled="!detail.instructions_it?.length" @click="language=language==='it'?'en':'it'">{{language==='it'?'Mostra inglese':'Mostra italiano'}}</button>
   <ol class="exercise-steps"><li v-for="(line,i) in (language==='it'&&detail.instructions_it?.length?detail.instructions_it:detail.instructions||[])" :key="i">{{line}}</li></ol>
  </div></div>
  <div v-if="playing" class="modal-overlay" style="z-index:1103" @click.self="playing=null"><div class="dialog" role="dialog" aria-modal="true" :aria-label="playing.name">
   <div class="row between"><h2>📹 {{playing.name}}</h2><button class="secondary" @click="playing=null">CHIUDI ✕</button></div>
   <video :key="playing.url" :src="playing.url" controls playsinline preload="metadata" style="width:100%;max-height:66dvh;border-radius:12px"/>
  </div></div>
 </div>
</template>
<style scoped>
/* Emphasis is applied ONLY to confirmed two-exercise supersets. Base ROUNDONE layout is unchanged. */
.superset-caption{font-size:11px;font-weight:950;letter-spacing:.07em;color:#8ef1bb;margin:0 0 12px}
.sheet-pair-group{margin-bottom:9px}
.sheet-pair-active{border:1px solid #438a70;background:var(--green-bg);border-radius:14px;padding:8px}
.sheet-pair-head{display:flex;gap:5px 12px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:2px 2px 9px;color:var(--mint);font-size:12px}
.sheet-pair-head small{font-size:10px;opacity:.9}
.exercise-item.superset-first{border-color:#438a70;margin-bottom:6px}
.exercise-item.superset-second{border-color:#438a70;border-left-width:4px;margin-left:12px}
@media(max-width:600px){.sheet-pair-active{padding:5px}.sheet-pair-head{font-size:11px}.exercise-item.superset-second{margin-left:6px}}
@media print {.sheet-pair-group{break-inside:avoid}.sheet-pair-active{border-color:#888;background:transparent}.sheet-pair-head{color:#333}}
.sheet-exercise-heading{display:flex;align-items:center;gap:12px;min-height:72px}
.sheet-exercise-heading h3{flex:1;min-width:0;overflow-wrap:anywhere}
.sheet-exercise-heading :deep(.sheet-exercise-mini){width:74px;max-width:74px;min-width:74px;height:74px;overflow:hidden;flex-shrink:0;border-radius:10px}
.sheet-exercise-heading :deep(.sheet-exercise-mini img){width:100%;height:100%;object-fit:contain}
</style>
