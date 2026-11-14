<script setup lang="ts">
import {useRoute,useRouter} from 'vue-router'
import {substituteExercise} from '../features/sheets/approvedAlternatives'
import {uiText,interfaceLanguage} from '../features/i18n/interfaceLanguage'
import {Capacitor} from '@capacitor/core'
import {sheetPrintHtml} from '../features/print/sheetPrint'
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
type SheetForDisplay={id?:string;title:string;exercises:readonly ExerciseRecord[]}
type VideoRecord=ExerciseVideo
const props=defineProps<{sheet:SheetForDisplay}>()
const route=useRoute(),router=useRouter()
const athleteView=computed(()=>['/home','/piano','/archivio'].includes(route.path))
const approvedChoices=ref<Record<number,number>>({})
const displayExercises=computed(()=>props.sheet.exercises.map((e,i)=>{const a=e.alternatives?.[approvedChoices.value[i]];return a?{...substituteExercise(e,a),id:e.id}:e}))
function startTraining(){if(!props.sheet.id||!athleteView.value)return;emit('close');void router.push({path:'/progressi',query:{...route.query,sheetId:props.sheet.id}})}
const supersets=computed(()=>supersetView(props.sheet.exercises))
const notesOpen=ref<number[]>([])
function hasData(value:unknown):boolean{return value!==null&&value!==undefined&&String(value).trim().length>0}
function prescribedLoad(ex:ExerciseRecord):string{
 if(hasData(ex.load))return String(ex.load)
 return typeof ex.kg==='number'&&Number.isFinite(ex.kg)?`${ex.kg} kg`:''
}
// Only catalog-linked exercises use catalog translations; custom Coach names stay intact.
function catalogName(item:CatalogExercise):string{return interfaceLanguage.value==='en'?item.name:(item.name_it||item.name)}
function exerciseDisplayName(ex:ExerciseRecord):string{
 const id=ex.exerciseId||ex.catalogId
 if(!id)return ex.name
 const found=catalog.value.find(x=>x.id===id)
 return found?catalogName(found):ex.name
}
function toggleNotes(index:number){notesOpen.value=notesOpen.value.includes(index)?notesOpen.value.filter(i=>i!==index):[...notesOpen.value,index]}

const groups=computed(()=>groupExerciseRows(props.sheet.exercises))
const catalog=ref<CatalogExercise[]>([]),videos=ref<VideoRecord[]>([])
const detail=ref<CatalogExercise|null>(null),playing=ref<VideoRecord|null>(null)
const alternatives=ref<CatalogExercise[]>([])
const illustrationUnavailableAt=ref<number|null>(null)
const language=ref<'it'|'en'>('it')
const emit=defineEmits<{close:[];finish:[title:string]}>()
function escapeSheetDetail(e:KeyboardEvent){
 if(e.key!=='Escape')return
 if(playing.value){playing.value=null;e.stopImmediatePropagation();return}
 if(detail.value){detail.value=null;e.stopImmediatePropagation();return}
 if(alternatives.value.length){alternatives.value=[];e.stopImmediatePropagation();return}
 emit('close');e.stopImmediatePropagation()
}
const printError=ref(''),printing=ref(false)
/** Il browser interno Android non gestisce window.print in modo affidabile.
 * Il plugin nativo apre PrintManager (anche "Salva come PDF").
 * Sul sito continuiamo a usare il dialogo di stampa del browser.
 */
async function printSheet(){
 if(printing.value)return
 printError.value=''
 printing.value=true
 try{
  if(Capacitor.isNativePlatform()){
   const {Printer}=await import('@capgo/capacitor-printer')
   await Printer.printHtml({html:sheetPrintHtml(props.sheet)})
  }else{
   window.print()
  }
 }catch(e){
  printError.value='Impossibile aprire la stampa. Verifica il servizio di stampa Android o riprova dal sito web.'
  console.warn('LionFit print:',e)
 }finally{printing.value=false}
}
onMounted(()=>{window.addEventListener('keydown',escapeSheetDetail)})
onUnmounted(()=>{window.removeEventListener('keydown',escapeSheetDetail)})
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
function viewExercise(ex:ExerciseRecord,index?:number){
 illustrationUnavailableAt.value=null
 const x=matchingExercise(ex)
 if(x){detail.value=x;language.value=interfaceLanguage.value;alternatives.value=[]}
 else {
  alternatives.value=candidatesFor(ex)
  if(!alternatives.value.length)illustrationUnavailableAt.value=index??null
 }
}
function chooseAlternative(ex:CatalogExercise){detail.value=ex;language.value=interfaceLanguage.value;alternatives.value=[]}
const resolved=computed(()=>displayExercises.value.map(ex=>matchingExercise(ex)))

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
 <div class="sheet-modal-bg lf6-backdrop" @click.self="$emit('close')">
  <div class="sheet-modal lf6-sheet" role="dialog" aria-modal="true" :aria-label="sheet.title">
   <header class="sheet-modal-head lf6-header">
    <h2>{{sheet.title}}</h2>
    <div class="lf6-head-actions">
     <button type="button" class="lf6-print" :disabled="printing" @click="printSheet">{{printing?uiText("Apertura stampa…"):uiText("Stampa / PDF")}}</button>
     <button type="button" class="lf6-close" :aria-label="uiText('Chiudi scheda')" @click="$emit('close')"><LionIcon name="x" :size="20"/></button>
    </div>
   </header>
   <p v-if="printError" class="notice" role="alert">{{printError}}</p>
   <div class="sheet-modal-body lf6-body">
    <div v-if="!sheet.exercises.length" class="lf6-empty">{{uiText("Questa scheda non contiene ancora esercizi.")}}</div>
    <section v-for="(group,groupNumber) in groups" :key="sheet.exercises[group.primaryIndex]?.id||group.primaryIndex"
      class="lf6-group" :class="{'lf6-superset':group.secondaryIndex!==null}">
     <header v-if="group.secondaryIndex!==null" class="lf6-superset-head">
      <span class="lf6-pair-mark">A + B</span>
      <strong>SUPERSET {{String(groupNumber+1).padStart(2,'0')}}</strong>
      <small>{{uiText("Due esercizi collegati")}}</small>
     </header>
     <article v-for="(i,part) in (group.secondaryIndex===null?[group.primaryIndex]:[group.primaryIndex,group.secondaryIndex])"
       :key="displayExercises[i].id||i" class="lf6-exercise" :class="{'lf6-exercise-second':part===1}">
      <div class="lf6-preview-wrap">
       <ExerciseMotion v-if="resolved[i]" :exercise="resolved[i]!" controls class="lf6-preview"/>
       <div v-else class="lf6-preview-empty" :aria-label="'Nessuna illustrazione disponibile per '+displayExercises[i].name">
        <LionIcon name="dumbbell" :size="31"/>
       </div>
       <button v-if="resolved[i]" type="button" class="lf6-enlarge" :aria-label="'Ingrandisci '+displayExercises[i].name" @click="viewExercise(displayExercises[i],i)">
        <LionIcon name="search" :size="15"/> {{uiText("Ingrandisci")}}
       </button>
      </div>
      <div class="lf6-content">
       <div class="lf6-name-line">
        <span class="lf6-sequence">{{group.secondaryIndex!==null?(part===0?'A':'B'):String(groupNumber+1).padStart(2,'0')}}</span>
        <h3>{{exerciseDisplayName(displayExercises[i])}}</h3>
        <button v-if="hasData(displayExercises[i].notes)" type="button" class="lf6-more"
         :aria-label="'Note del Coach per '+displayExercises[i].name" :aria-expanded="notesOpen.includes(i)"
         :title="notesOpen.includes(i)?'Chiudi note del Coach':'Leggi note del Coach'" @click="toggleNotes(i)">•••</button>
       </div>
       <details v-if="sheet.exercises[i].alternatives?.length" class="lf6-extra-actions"><summary>Visualizza alternativa</summary><button type="button" class="secondary" @click="approvedChoices={...approvedChoices,[i]:-1}">Originale</button><button v-for="(a,ai) in sheet.exercises[i].alternatives" :key="ai" class="secondary" type="button" @click="approvedChoices={...approvedChoices,[i]:ai}">{{a.name}}</button></details>
       <div class="lf6-values">
        <span v-if="hasData(displayExercises[i].sets)" class="lf6-chip"><b>{{uiText("Serie")}}</b> {{displayExercises[i].sets}}</span>
        <span v-if="hasData(displayExercises[i].reps)" class="lf6-chip"><b>{{uiText("Rip.")}}</b> {{displayExercises[i].reps}}</span>
        <span v-if="prescribedLoad(displayExercises[i])" class="lf6-chip"><b>{{uiText("Carico previsto")}}</b> {{prescribedLoad(displayExercises[i])}}</span>
        <span v-if="hasData(displayExercises[i].rest)" class="lf6-chip"><b>{{uiText("Recupero")}}</b> {{displayExercises[i].rest}}</span>
       </div>
       <p v-if="illustrationUnavailableAt===i" class="lf6-illustration-unavailable">{{uiText("Nessuna illustrazione corrispondente trovata nel catalogo. La scheda non è stata modificata.")}}</p>
       <p v-if="hasData(displayExercises[i].notes)" v-show="notesOpen.includes(i)" class="lf6-coach-note"><strong>{{uiText("Note del Coach")}}</strong>{{displayExercises[i].notes}}</p>
       <div v-if="videoFor(displayExercises[i])||(!resolved[i]&&catalog.length)" class="lf6-extra-actions">
        <button v-if="!resolved[i]&&catalog.length" type="button" class="lf6-text-link" @click="viewExercise(displayExercises[i],i)">{{uiText("Cerca illustrazione")}}</button>
        <button v-if="videoFor(displayExercises[i])" type="button" class="lf6-text-link" @click="playing=videoFor(displayExercises[i])">{{uiText("Apri video del Coach")}}</button>
       </div>
      </div>
     </article>
     <div v-if="group.secondaryIndex!==null&&hasData(supersets[group.secondaryIndex]?.rest)" class="lf6-pair-recovery">
      <LionIcon name="clock" :size="15"/><strong>{{uiText("Recupero dopo il superset:")}}</strong> {{supersets[group.secondaryIndex]?.rest}}
     </div>
    </section>
   </div>
   <footer class="sheet-modal-foot lf6-footer"><button v-if="athleteView&&sheet.id" type="button" class="primary" @click="startTraining">Inizia allenamento</button><button type="button" class="primary" @click="$emit('close')">{{uiText("Chiudi scheda")}}</button></footer>
  </div>
  <div v-if="alternatives.length" class="modal-overlay lf6-dialog-layer" @click.self="alternatives=[]">
   <div class="dialog" role="dialog" aria-modal="true" :aria-label="uiText('Seleziona esercizio')">
    <div class="row between"><h2>{{uiText("Seleziona l'esercizio corretto")}}</h2><button class="secondary" @click="alternatives=[]">{{uiText("CHIUDI ✕")}}</button></div>
    <p class="muted small">{{uiText("Il nome potrebbe riferirsi a più movimenti. La scelta mostra soltanto l'illustrazione e non modifica la scheda.")}}</p>
    <div v-for="option in alternatives" :key="option.id" class="line-card row between">
     <span>{{catalogName(option)}} <small class="muted">{{option.id}}</small></span>
     <button class="primary" @click="chooseAlternative(option)">{{uiText("Visualizza")}}</button>
    </div>
   </div>
  </div>
  <div v-if="detail" class="modal-overlay lf6-dialog-layer" @click.self="detail=null">
   <div class="dialog exercise-dialog lf6-enlarged" role="dialog" aria-modal="true" :aria-label="catalogName(detail)">
    <div class="row between"><h2>{{catalogName(detail)}}</h2><button class="secondary" @click="detail=null">{{uiText("CHIUDI ✕")}}</button></div>
    <ExerciseMotion :exercise="detail" eager/>
    <p class="muted small">EN: {{detail.name}} · {{detail.target}}</p>
    <button class="ghost" :disabled="!detail.instructions_it?.length" @click="language=language==='it'?'en':'it'">{{uiText(language==='it'?'Mostra inglese':'Mostra italiano')}}</button>
    <ol class="exercise-steps"><li v-for="(line,i) in (language==='it'&&detail.instructions_it?.length?detail.instructions_it:detail.instructions||[])" :key="i">{{line}}</li></ol>
   </div>
  </div>
  <div v-if="playing" class="modal-overlay lf6-video-layer" @click.self="playing=null">
   <div class="dialog" role="dialog" aria-modal="true" :aria-label="playing.name">
    <div class="row between"><h2>{{playing.name}}</h2><button class="secondary" @click="playing=null">{{uiText("CHIUDI ✕")}}</button></div>
    <video :key="playing.url" :src="playing.url" controls playsinline preload="metadata" style="width:100%;max-height:66dvh;border-radius:12px"/>
   </div>
  </div>
 </div>
</template>
<style scoped>
/* PATCH 6/7: schede atleta (la stessa vista in Archivio e nelle anteprime Coach).
 * Nessuna modifica a ID, Firebase o formato dati. Usa sempre la palette del tema. */
.lf6-backdrop{padding:clamp(5px,1.5vw,12px);z-index:450}
.lf6-sheet{width:min(820px,100%);height:min(95dvh,920px);border-radius:16px;background:var(--card);color:var(--text);border-color:var(--border)}
.lf6-header{flex:0 0 auto;padding:13px 16px;border-color:var(--border);gap:10px}
.lf6-header h2{margin:0;font-size:clamp(16px,2.2vw,21px);line-height:1.25;font-weight:950;min-width:0;overflow-wrap:anywhere}
.lf6-head-actions{display:flex;align-items:center;gap:7px;flex:none}
.lf6-print{background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:9px;min-height:33px;padding:7px 10px;font-size:11px;font-weight:800}
.lf6-close{background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:9px;min-height:34px;min-width:34px;display:grid;place-items:center}
.lf6-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:grid;align-content:start;gap:9px;padding:13px!important}
.lf6-empty{padding:22px;text-align:center;color:var(--muted);font-size:12px}
.lf6-group{margin:0;padding:6px;background:var(--card2);border:1px solid var(--border);border-radius:12px;min-width:0;break-inside:avoid}
.lf6-group.lf6-superset{border:1px solid var(--mint);background:var(--green-bg);padding:8px}
.lf6-superset-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 3px 8px;color:var(--mint)}
.lf6-superset-head strong{font-size:10px;letter-spacing:.08em}.lf6-superset-head small{font-size:10px;margin-left:auto;color:var(--muted)}
.lf6-pair-mark{background:var(--green-bg);border:1px solid var(--mint);padding:4px 7px;border-radius:7px;font-size:9px;font-weight:900}
.lf6-exercise{display:flex;align-items:stretch;gap:12px;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:9px;margin:0}
.lf6-exercise+.lf6-exercise{margin-top:6px}.lf6-superset .lf6-exercise-second{border-left:3px solid var(--mint)}
.lf6-preview-wrap{flex:0 0 116px;display:flex;flex-direction:column;gap:4px;min-width:0}
.lf6-preview-wrap :deep(.lf6-preview){width:116px;height:103px;min-width:0;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:var(--card2);position:relative;display:grid;place-items:center}
.lf6-preview-wrap :deep(.lf6-preview img){width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;pointer-events:none}
.lf6-preview-wrap :deep(.exercise-motion-command){left:3px;right:3px;bottom:3px;min-height:23px;padding:2px 5px;border-radius:6px;font-size:9px;white-space:nowrap;background:rgba(10,58,41,.93);border-color:var(--mint)}
.lf6-preview-empty{display:grid;place-items:center;width:116px;height:103px;color:var(--muted);background:var(--card2);border:1px dashed var(--border);border-radius:9px}
.lf6-enlarge{border:1px solid var(--border);border-radius:7px;background:var(--card2);color:var(--mint);min-height:26px;padding:3px 5px;display:flex;gap:5px;align-items:center;justify-content:center;font-size:9px;font-weight:800}
.lf6-content{flex:1;display:flex;flex-direction:column;justify-content:center;gap:9px;min-width:0}
.lf6-name-line{display:flex;gap:7px;align-items:start;min-width:0}
.lf6-sequence{flex:none;display:grid;place-items:center;min-width:25px;height:25px;padding:0 5px;font-size:11px;font-weight:900;color:var(--mint);border:1px solid var(--mint);border-radius:7px}
.lf6-name-line h3{flex:1;min-width:0;margin:1px 0 0;font-size:clamp(12px,1.6vw,15px);line-height:1.35;font-weight:900;overflow-wrap:anywhere;color:var(--text);text-transform:uppercase}
.lf6-more{flex:none;display:grid;place-items:center;min-width:32px;height:29px;background:var(--card2);color:var(--mint);border:1px solid var(--border);border-radius:8px;font-weight:900;letter-spacing:1px;font-size:15px;padding:0 4px}
.lf6-more[aria-expanded="true"]{border-color:var(--mint)}
.lf6-values{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.lf6-chip{font-size:11px;line-height:1.2;color:var(--text);padding:6px 8px;background:var(--card2);border:1px solid var(--border);border-radius:7px;overflow-wrap:anywhere}
.lf6-chip b{font-size:9px;color:var(--mint);text-transform:uppercase;letter-spacing:.025em;margin-right:3px}
.lf6-illustration-unavailable{color:var(--muted);font-size:10px;margin:0;line-height:1.45}
.lf6-coach-note{margin:0;padding:9px 10px;color:var(--text);background:var(--card2);border-left:2px solid var(--mint);border-radius:7px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.lf6-coach-note strong{display:block;color:var(--mint);font-size:10px;margin-bottom:4px}
.lf6-extra-actions{display:flex;gap:7px;flex-wrap:wrap}
.lf6-text-link{border:1px solid var(--border);border-radius:7px;background:var(--card2);color:var(--mint);font-size:10px;padding:5px 8px;min-height:27px}
.lf6-pair-recovery{display:flex;gap:6px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:11px;padding:9px 4px 2px;line-height:1.3}
.lf6-pair-recovery strong{color:var(--mint)}
.lf6-footer{padding:9px 13px;border-color:var(--border);background:var(--card)}
.lf6-footer button{min-height:35px;padding:6px 15px;font-size:11px}
.lf6-dialog-layer{z-index:1102}.lf6-video-layer{z-index:1103}
.lf6-enlarged{background:var(--card);color:var(--text)}
.lf6-enlarged :deep(.exercise-preview){height:clamp(190px,38vh,320px);width:100%}
@media(max-width:600px){
 .lf6-backdrop{padding:max(4px,env(safe-area-inset-top,0px)) 4px max(4px,env(safe-area-inset-bottom,0px));align-items:center}.lf6-sheet{height:100%;max-height:100%;border-radius:12px}
 .lf6-header{padding:10px;gap:8px}.lf6-header h2{font-size:16px}.lf6-print{font-size:10px;padding:6px}
 .lf6-body{padding:8px!important;gap:7px}.lf6-group{padding:4px}.lf6-superset-head small{display:none}
 .lf6-exercise{gap:8px;padding:7px;border-radius:8px}
 .lf6-preview-wrap{flex-basis:106px}.lf6-preview-wrap :deep(.lf6-preview),.lf6-preview-empty{width:106px;height:100px}
 .lf6-name-line{gap:5px}.lf6-name-line h3{font-size:12px}.lf6-sequence{min-width:22px;height:22px;font-size:10px}
 .lf6-values{gap:4px}.lf6-chip{font-size:10px;padding:5px 6px}.lf6-chip b{font-size:8px}
 .lf6-footer{padding:8px 10px}
}
@media(max-width:370px){.lf6-preview-wrap{flex-basis:88px}.lf6-preview-wrap :deep(.lf6-preview),.lf6-preview-empty{width:88px;height:92px}.lf6-exercise{gap:6px}.lf6-name-line h3{font-size:11px}.lf6-chip{padding:4px}}
@media print{
 .lf6-backdrop{position:static!important;display:block!important;padding:0!important;background:#fff!important}
 .lf6-sheet{height:auto!important;max-height:none!important;overflow:visible!important;border:0!important;background:#fff!important;color:#000!important}
 .lf6-header,.lf6-body,.lf6-group,.lf6-exercise{background:#fff!important;color:#000!important;overflow:visible!important;max-height:none!important;break-inside:avoid}
 .lf6-body{display:block!important}.lf6-group{margin-bottom:8px}.lf6-exercise{border-color:#aaa!important}
 .lf6-print,.lf6-close,.lf6-footer,.lf6-enlarge,.lf6-more,.lf6-extra-actions,.lf6-preview-wrap :deep(.exercise-motion-command){display:none!important}
 .lf6-name-line h3,.lf6-chip{color:#000!important}.lf6-chip{border-color:#aaa!important;background:#fff!important}
 .lf6-coach-note{display:block!important;color:#000!important}
}
@media(prefers-reduced-motion:reduce){.lf6-group,.lf6-exercise{transition:none}}
</style>
