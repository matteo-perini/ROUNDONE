<script setup lang="ts">
/** LionFit Progressi 360 — dedicated, tenant-scoped records, no legacy sheet mutations. */
import {computed,onMounted,onUnmounted,ref,shallowRef,watch} from 'vue'
import {useRoute,RouterLink} from 'vue-router'
import {collection,doc,getDocFromServer,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore'
import {onAuthStateChanged} from 'firebase/auth'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {isOperationalMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {watchAthleteSheets} from '../integrations/firestore/sheets'
import {watchProgress,watchChecks,watchGoals,addGoal,setGoalStatus,recordSession,recordCheck,uploadCheckPhoto,removeStagedPhoto,loadPhoto,checkCollection} from '../integrations/firestore/progress'
import {uniqueProgressSheets,emptyEntries,normalizeEntries,exerciseSeries,sheetSummary,progressMetrics,sheetPerformanceTimeline,type ProgressSheet,type RecordedExercise,type ProgressSession,type ProgressCheck,type CheckPhoto} from '../features/progress/progressModel'
import {archiveItemFromRaw,type HistoricalArchive} from '../features/athletes/labArchive'
import {shownGoals,statusLabel,type ProgressGoal,type ProgressGoalStatus} from '../features/progress/goalsModel'
import {compressCheckPhoto,supportedCheckPhoto,MAX_CHECK_PHOTO_BYTES} from '../features/progress/checkPhotoCompression'
import type {Personal,ProgramWeek,Groups} from '../features/sheets/domain'
const props=defineProps<{role:'athlete'|'coach'}>()
const route=useRoute()
const context=shallowRef<StagingSession|null>(null)
const athleteId=ref(''),athletes=ref<Array<{id:string;name:string}>>([]),loading=ref(true),error=ref(''),writeError=ref(''),notice=ref('')
const sheetData=shallowRef<{personal:Personal[];weeks:ProgramWeek[];groups:Groups}|null>(null)
const archived=ref<HistoricalArchive[]>([]),sessions=ref<ProgressSession[]>([]),checks=ref<ProgressCheck[]>([]),goals=ref<ProgressGoal[]>([])
const tab=ref<'history'|'record'|'check'|'goals'>('history'),sheetFilter=ref<'all'|'programmed'|'unprogrammed'|'historical'>('all'),search=ref('')
const chosenSheetId=ref(''),editor=ref<RecordedExercise[]>([]),performedOn=ref(localDate()),busy=ref(false),lastSaved=ref(false)
const historySheetId=ref(''),historyKey=ref(''),metric=ref<'kg'|'volume'|'estimate'>('kg'),repFilter=ref('all'),period=ref('all'),sheetGraph=ref<'volume'|'completion'|'performance'>('volume')
const checkDate=ref(localDate()),checkNotes=ref(''),selectedPhotos=ref<Partial<Record<CheckPhoto['side'],File>>>({}),photoUrls=ref<Record<string,string>>({}),photoStatus=ref('')
const canWrite=computed(()=>props.role==='athlete'&&mayWriteLive()&&context.value?.uid===athleteId.value)
const canManageGoals=computed(()=>props.role==='coach'&&mayWriteLive()&&!!context.value&&!!athleteId.value&&context.value.uid!==athleteId.value)
const goalTitle=ref(''),goalNotes=ref(''),goalDate=ref(''),goalBusy=ref(false),goalError=ref(''),showArchivedGoals=ref(false)
const visibleGoals=computed(()=>shownGoals(goals.value,showArchivedGoals.value))
const sheets=computed(()=>uniqueProgressSheets(sheetData.value?.personal||[],archived.value))
const visibleSheets=computed(()=>sheets.value.filter(s=>{
 if(!s.title.toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it')) && !s.exercises.some(e=>e.name.toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it'))))return false
 if(sheetFilter.value==='historical')return s.historical
 if(sheetFilter.value==='programmed')return (sheetData.value?.groups.programmed||[]).some(g=>g.sheet.id===s.id)
 if(sheetFilter.value==='unprogrammed')return (sheetData.value?.groups.unprogrammed||[]).some(g=>g.sheet.id===s.id)
 return true
}))
const selectedSheet=computed(()=>sheets.value.find(s=>s.id===chosenSheetId.value)||null)
const selectedHistorySheet=computed(()=>sheets.value.find(s=>s.id===historySheetId.value)||null)
const selectedHistoryExercises=computed(()=>selectedHistorySheet.value?.exercises||[])
const selectedHistoryEx=computed(()=>selectedHistoryExercises.value.find((e,i)=>exerciseKeyLocal(e,i)===historyKey.value)||null)
const repsChoice=computed(()=>repFilter.value==='all'?null:Number(repFilter.value))
const availableReps=computed(()=>[...new Set(sessions.value.filter(s=>s.sheetId===historySheetId.value).flatMap(s=>s.exercises.filter(e=>e.key===historyKey.value).flatMap(e=>e.sets.map(x=>x.reps).filter((n):n is number=>n!==null))))].sort((a,b)=>a-b))
const series=computed(()=>historySheetId.value&&historyKey.value?exerciseSeries(sessions.value,historySheetId.value,historyKey.value,repsChoice.value):[])
const filteredSeries=computed(()=>series.value.filter(s=>withinPeriod(s.date,period.value)))
const currentPoints=computed(()=>filteredSeries.value.map(p=>({x:p.date,y:metric.value==='kg'?p.kg:metric.value==='volume'?p.volume:p.estimate})).filter((x):x is {x:string;y:number}=>x.y!==null))
const historySummary=computed(()=>sheetSummary(sessions.value,historySheetId.value))
const sheetPerformance=computed(()=>sheetPerformanceTimeline(sessions.value,historySheetId.value))
const sheetGraphPoints=computed(()=>historySummary.value.slice().reverse().map(s=>{
 const value=sheetGraph.value==='volume'?s.volume:sheetGraph.value==='completion'?(s.total?100*s.completed/s.total:0):sheetPerformance.value.find(r=>r.id===s.id)?.index??null
 return {x:s.date,y:value}
}).filter((x):x is {x:string;y:number}=>x.y!==null))
const sheetGraphMin=computed(()=>sheetGraphPoints.value.length?Math.min(...sheetGraphPoints.value.map(p=>p.y)):0)
const sheetGraphMax=computed(()=>sheetGraphPoints.value.length?Math.max(...sheetGraphPoints.value.map(p=>p.y)):0)
const sheetGraphPath=computed(()=>sheetGraphPoints.value.map((p,i)=>`${i===0?'M':'L'}${sheetGraphPoints.value.length===1?50:(7+i*86/(sheetGraphPoints.value.length-1)).toFixed(2)},${(90-(p.y-sheetGraphMin.value)/(sheetGraphMax.value-sheetGraphMin.value||1)*76).toFixed(2)}`).join(' '))
const chartMin=computed(()=>currentPoints.value.length?Math.min(...currentPoints.value.map(p=>p.y)):0)
const chartMax=computed(()=>currentPoints.value.length?Math.max(...currentPoints.value.map(p=>p.y)):0)
const chartStroke=computed(()=>{
 const p=currentPoints.value;if(p.length===0)return ''
 const min=chartMin.value,max=chartMax.value,range=max-min||1
 return p.map((x,i)=>`${i===0?'M':'L'}${(p.length===1?50:7+i*86/(p.length-1)).toFixed(2)},${(90-(x.y-min)/range*76).toFixed(2)}`).join(' ')
})
const totalSessions=computed(()=>sessions.value.length)
const uniqueRecords=computed(()=>new Set(sessions.value.flatMap(s=>s.exercises.filter(e=>e.sets.length>0).map(e=>`${s.sheetId}:${e.key}`))).size)
const selectedSummary=computed(()=>progressMetrics(editor.value))
const displayDate=(d:string)=>{try{return new Date(d+'T12:00:00Z').toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})}catch{return d}}
const formatKg=(n:number)=>n.toLocaleString('it-IT',{maximumFractionDigits:1})
const cleanFile=(file?:File)=>file?`${file.name.slice(0,22)} · ${(file.size/1024/1024).toFixed(1)} MB origine`:''
let stops:Unsubscribe[]=[],stopChild:Unsubscribe[]=[],alive=true
function localDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function withinPeriod(value:string,p:string){if(p==='all')return true;const n=Number(p);if(!Number.isInteger(n))return true;const after=new Date();after.setUTCMonth(after.getUTCMonth()-n);return value>=after.toISOString().slice(0,10)}
function exerciseKeyLocal(ex:{exerciseId?:string;catalogId?:string;id?:string},i:number){return String(ex.exerciseId||ex.catalogId||ex.id||`position:${i}`)}
function stopCurrent(){photoStatus.value='';for(const f of stopChild)f();stopChild=[];sheetData.value=null;archived.value=[];sessions.value=[];checks.value=[];goals.value=[];goalError.value='';goalTitle.value='';goalNotes.value='';goalDate.value='';chosenSheetId.value='';editor.value=[];historySheetId.value='';historyKey.value='';clearUrls()}
function clearUrls(){Object.values(photoUrls.value).forEach(url=>URL.revokeObjectURL(url));photoUrls.value={}}
function bindAthlete(id:string){
 stopCurrent();athleteId.value=id
 const s=context.value;if(!s||!id)return
 const {db}=getStagingClients();loading.value=true;error.value='';let loadedSheets=false
 stopChild.push(watchAthleteSheets(db,s.gymId,id,result=>{
  if(!alive||athleteId.value!==id)return
  sheetData.value=result;loadedSheets=true;loading.value=false
  if(!historySheetId.value&&sheets.value.length)historySheetId.value=sheets.value[0].id
 },e=>{error.value='Schede non disponibili: '+e.message;loading.value=false}))
 stopChild.push(onSnapshot(collection(db,'gyms',s.gymId,'athlete_programs',id,'archive_templates'),snap=>{
  if(alive&&athleteId.value===id)archived.value=snap.docs.map(d=>archiveItemFromRaw(d.id,d.data()))
 },e=>{if(alive)notice.value='Alcune schede storiche non sono leggibili: '+e.message}))
 stopChild.push(watchProgress(db,s.gymId,id,v=>{if(alive&&athleteId.value===id)sessions.value=v},e=>{if(alive)writeError.value='Storico Progressi: '+e.message+' (controllare Firestore Rules Progressi)'}))
 stopChild.push(watchChecks(db,s.gymId,id,v=>{if(alive&&athleteId.value===id)checks.value=v},e=>{if(alive)writeError.value='Check Zone: '+e.message+' (controllare Firestore Rules Progressi)'}))
 stopChild.push(watchGoals(db,s.gymId,id,v=>{if(alive&&athleteId.value===id)goals.value=v},e=>{if(alive)goalError.value='Obiettivi non disponibili: '+e.message+' (verifica Firestore Rules Progressi)'}))
 if(!loadedSheets)loading.value=true
}
onMounted(async()=>{
 if(!isOperationalMode()){loading.value=false;error.value='Progressi LIVE disponibile solo con accesso Firebase configurato.';return}
 try{
  const s=await readStagingSession();if(!alive)return
  context.value=s
  if(props.role==='athlete'){
   if(s.role!=='atleta')throw new Error('Accedi con un profilo Atleta.')
   bindAthlete(s.uid)
  }else{
   if(s.role==='atleta')throw new Error('La vista Coach richiede un account Coach.')
   const {db}=getStagingClients()
   const u=typeof route.query.athleteId==='string'?route.query.athleteId:''
   stops.push(onSnapshot(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','athlete')),snap=>{
    if(!alive)return
    athletes.value=snap.docs.map(d=>({id:d.id,name:String(d.data().name||d.id)})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
    if(!athleteId.value&&athletes.value.length){const selected=athletes.value.some(a=>a.id===u)?u:athletes.value[0].id;bindAthlete(selected)}
    if(!athletes.value.length)loading.value=false
   },e=>{error.value='Elenco Atleti non disponibile: '+e.message;loading.value=false}))
  }
  const {auth}=getStagingClients()
  stops.push(onAuthStateChanged(auth,user=>{if(!user||user.uid!==s.uid){stopCurrent();error.value='Sessione terminata: accedi nuovamente.'}}))
 }catch(e){loading.value=false;error.value=e instanceof Error?e.message:String(e)}
})
watch(()=>route.query.athleteId,value=>{
 if(props.role!=='coach'||!context.value||typeof value!=='string'||!value||value===athleteId.value)return
 if(athletes.value.some(a=>a.id===value))bindAthlete(value)
})
onUnmounted(()=>{alive=false;stopCurrent();for(const f of stops)f();stops=[]})
watch([selectedHistorySheet,historyKey],([s])=>{if(s&&!s.exercises.some((e,i)=>exerciseKeyLocal(e,i)===historyKey.value))historyKey.value=s.exercises[0]?exerciseKeyLocal(s.exercises[0],0):'';repFilter.value='all'})
function openSheet(s:ProgressSheet){chosenSheetId.value=s.id;editor.value=emptyEntries(s);performedOn.value=localDate();lastSaved.value=false;writeError.value=''}
function editCell(ei:number,si:number,field:'kg'|'reps',value:string){
 const next=editor.value.map((ex,i)=>i===ei?{...ex,sets:ex.sets.map((s,j)=>j===si?{...s,[field]:value.trim()===''?null:Number(value)}:s)}:ex)
 editor.value=next
}
function addSet(i:number){editor.value=editor.value.map((e,j)=>j===i&&e.sets.length<30?{...e,sets:[...e.sets,{kg:null,reps:null}]}:e)}
function removeSet(i:number){editor.value=editor.value.map((e,j)=>j===i?{...e,sets:e.sets.slice(0,-1)}:e)}
function skipExercise(i:number){editor.value=editor.value.map((e,j)=>j===i?{...e,skipped:!e.skipped}:e)}
async function saveWorkout(){
 if(!selectedSheet.value||!context.value||!canWrite.value||busy.value)return
 busy.value=true;writeError.value='';notice.value=''
 try{
  const s=selectedSheet.value;normalizeEntries(editor.value)
  await recordSession(getStagingClients().db,context.value.gymId,context.value.uid,s,performedOn.value,editor.value,context.value.uid)
  lastSaved.value=true;notice.value='Allenamento salvato. Lo storico si aggiorna automaticamente.';tab.value='history';historySheetId.value=s.id;chosenSheetId.value=''
 }catch(e){writeError.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}
}
function chooseFile(side:CheckPhoto['side'],event:Event){
 const input=event.target as HTMLInputElement
 const file=input.files?.[0]
 input.value='' // allow choosing the same image again after correcting it
 if(!file)return
 if(!supportedCheckPhoto(file)){
  writeError.value='Formato non supportato oppure foto originale oltre 40 MB. JPG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP e TIFF decodificabile.'
  return
 }
 writeError.value='';selectedPhotos.value={...selectedPhotos.value,[side]:file}
}
async function saveCheck(){
 if(!context.value||!canWrite.value||busy.value)return
 const files=Object.entries(selectedPhotos.value) as Array<[CheckPhoto['side'],File]>
 if(!files.length){writeError.value='Seleziona almeno una foto per creare il check.';return}
 busy.value=true;writeError.value='';notice.value='';const uploaded:CheckPhoto[]=[]
 const id=doc(checkCollection(getStagingClients().db,context.value.gymId,context.value.uid)).id
 try{
  for(const [index,[side,file]] of files.entries()){
   photoStatus.value=`Ottimizzo foto ${index+1}/${files.length} · ${file.name.slice(0,28)}`
   const resized=await compressCheckPhoto(file)
   if(resized.size>=MAX_CHECK_PHOTO_BYTES)throw new Error('La foto supera il limite di 1 MB.')
   photoStatus.value=`Carico foto ${index+1}/${files.length} · ${(resized.size/1024).toFixed(0)} KB`
   uploaded.push(await uploadCheckPhoto(context.value.gymId,context.value.uid,id,side,resized))
  }
  await recordCheck(getStagingClients().db,context.value.gymId,context.value.uid,checkDate.value,checkNotes.value,uploaded,context.value.uid,id)
  selectedPhotos.value={};checkNotes.value='';notice.value='Check Zone salvato. Foto ottimizzate sotto 1 MB e archiviate privatamente.'
 }catch(e){writeError.value=e instanceof Error?e.message:String(e);for(const p of uploaded)await removeStagedPhoto(p.storagePath)}finally{busy.value=false;photoStatus.value=''}
}
async function showCheckPhoto(p:CheckPhoto){
 if(photoUrls.value[p.storagePath])return
 try{const url=await loadPhoto(p.storagePath);photoUrls.value={...photoUrls.value,[p.storagePath]:url}}
 catch(e){writeError.value='Foto non disponibile: '+(e instanceof Error?e.message:String(e))}
}
async function saveGoal(){
 const s=context.value,id=athleteId.value
 if(!s||!id||!canManageGoals.value||goalBusy.value)return
 goalError.value='';goalBusy.value=true
 try{
  await addGoal(getStagingClients().db,s.gymId,id,{title:goalTitle.value,notes:goalNotes.value,dueDate:goalDate.value},s.uid)
  if(id===athleteId.value){goalTitle.value='';goalNotes.value='';goalDate.value='';notice.value='Obiettivo assegnato all’Atleta.'}
 }catch(e){goalError.value=e instanceof Error?e.message:String(e)}finally{goalBusy.value=false}
}
async function changeGoalStatus(goal:ProgressGoal,status:ProgressGoalStatus){
 const s=context.value,id=athleteId.value
 if(!s||!id||!canManageGoals.value||goalBusy.value||!goals.value.some(g=>g.id===goal.id))return
 if(status==='archived'&&!window.confirm(`Archiviare l’obiettivo «${goal.title}»? Rimarrà nello storico e non sarà eliminato.`))return
 goalBusy.value=true;goalError.value=''
 try{await setGoalStatus(getStagingClients().db,s.gymId,id,goal.id,status,s.uid);notice.value='Stato obiettivo aggiornato.'}
 catch(e){goalError.value=e instanceof Error?e.message:String(e)}finally{goalBusy.value=false}
}
function switchToHistory(s:ProgressSheet){historySheetId.value=s.id;tab.value='history';historyKey.value=s.exercises[0]?exerciseKeyLocal(s.exercises[0],0):''}
</script>
<template>
 <section class="lf-progress360 stack">
  <header class="lf-p360-head"><div><span class="eyebrow">LION FIT · {{role==='athlete'?'AREA ATLETA':'AREA COACH'}}</span><h1>{{role==='athlete'?'I miei Progressi':'Progressi Atleta 360°'}}</h1><p class="muted">Allenamenti, carichi, Check Zone e obiettivi in un unico spazio.</p></div><span class="lf-p360-head-icon">↗</span></header>
  <p v-if="error" class="notice lf-p360-error" role="alert">{{error}}</p>
  <p v-if="writeError" class="notice lf-p360-error" role="alert">{{writeError}}</p>
  <p v-if="notice" class="notice" role="status">{{notice}}</p>
  <p v-if="loading" class="muted" role="status">Caricamento Progressi…</p>
  <div v-if="role==='coach'" class="panel lf-p360-coach-selector"><label for="lf-p360-athlete">Seleziona Atleta</label><select id="lf-p360-athlete" :value="athleteId" @change="bindAthlete(($event.target as HTMLSelectElement).value)"><option v-for="a in athletes" :key="a.id" :value="a.id">{{a.name}}</option></select><small class="muted">Consultazione Coach. Le registrazioni e i check sono personali dell'Atleta.</small></div>
  <template v-if="!loading&&sheetData&&athleteId">
   <nav class="lf-p360-tabs" :class="{'lf-p360-tabs-coach':role==='coach'}" aria-label="Sezioni Progressi">
    <button type="button" :class="{on:tab==='history'}" @click="tab='history'">▥ <span>Storico</span></button>
    <button v-if="role==='athlete'" type="button" :class="{on:tab==='record'}" @click="tab='record';chosenSheetId=''">⚑ <span>Registro carichi</span></button>
    <button type="button" :class="{on:tab==='check'}" @click="tab='check'">▣ <span>Check Zone</span></button>
    <button type="button" :class="{on:tab==='goals'}" @click="tab='goals'">◎ <span>Obiettivi</span></button>
   </nav>
   <template v-if="tab==='record'&&role==='athlete'">
    <template v-if="!selectedSheet">
     <section class="panel lf-p360-card lf-p360-sheet-picker">
      <div class="row between lf-p360-picker-heading"><div><span class="eyebrow">SCEGLI LA SCHEDA</span><h2>Le mie schede</h2></div><span class="pill">{{sheets.length}} schede</span></div>
      <p class="muted small">Scegli una scheda per registrare serie, kg e ripetizioni. Le assegnazioni originali restano intatte.</p>
      <input v-model="search" type="search" aria-label="Cerca scheda o esercizio" placeholder="⌕ Cerca una scheda…"/>
      <div class="lf-p360-filters lf-p360-picker-filters" role="group" aria-label="Filtra schede">
       <button v-for="f in ([['all','Tutte'],['programmed','Programmate'],['unprogrammed','Senza programma'],['historical','Storiche']] as const)" :key="f[0]" type="button" :class="{on:sheetFilter===f[0]}" @click="sheetFilter=f[0]">{{f[1]}}</button>
      </div>
      <div class="lf-p360-sheet-list lf-p360-compact-list">
       <button v-for="s in visibleSheets" :key="s.id" class="lf-p360-sheet lf-p360-compact-sheet" type="button" :aria-label="`Apri la scheda ${s.title} per registrare i carichi`" @click="openSheet(s)">
        <span class="lf-p360-square" aria-hidden="true">▤</span>
        <span class="lf-p360-sheet-copy"><b :title="s.title">{{s.title}}</b><small>{{s.exercises.length}} esercizi <span aria-hidden="true">·</span> {{s.historical?'Archivio':'Assegnata'}}</small></span>
        <span class="lf-p360-arrow" aria-hidden="true">›</span>
       </button>
       <p v-if="!visibleSheets.length" class="muted small lf-p360-empty">Nessuna scheda trovata. Prova un filtro diverso.</p>
      </div>
     </section>
    </template>
    <template v-else>
     <button class="lf-p360-back" type="button" @click="chosenSheetId='';editor=[]">← Tutte le schede</button>
     <section class="panel lf-p360-card"><span class="eyebrow">REGISTRA ALLENAMENTO</span><h2>{{selectedSheet.title}}</h2><div class="lf-p360-date"><label for="lf-p360-date">Data dell'allenamento</label><input id="lf-p360-date" v-model="performedOn" type="date" :max="localDate()"/></div><p class="muted small">Inserisci solo ciò che hai eseguito. Campi lasciati vuoti = non registrati, non zero. Puoi segnare un esercizio come saltato.</p></section>
     <section v-for="(exercise,i) in editor" :key="exercise.key+'-'+i" class="panel lf-p360-card lf-p360-exercise"><div class="row between"><div><h3>{{exercise.name}}</h3><small class="muted">Previsto: {{exercise.plannedSets}} serie × {{exercise.plannedReps}} rip.</small></div><button class="secondary lf-p360-skip" @click="skipExercise(i)">{{exercise.skipped?'Ripristina':'Saltato'}}</button></div>
      <template v-if="!exercise.skipped"><div class="lf-p360-set-header"><span>Serie</span><span>Kg</span><span>Rip.</span></div><div v-for="(set,j) in exercise.sets" :key="j" class="lf-p360-set"><b>{{j+1}}</b><input aria-label="Carico kg" type="number" min="0" max="2000" step="0.5" :value="set.kg??''" placeholder="—" @input="editCell(i,j,'kg',($event.target as HTMLInputElement).value)"/><input aria-label="Ripetizioni" type="number" min="1" max="300" step="1" :value="set.reps??''" placeholder="—" @input="editCell(i,j,'reps',($event.target as HTMLInputElement).value)"/></div><div class="lf-p360-row-actions"><button type="button" class="secondary" :disabled="exercise.sets.length>=30" @click="addSet(i)">＋ Serie</button><button type="button" class="secondary" :disabled="!exercise.sets.length" @click="removeSet(i)">− Serie</button></div></template><p v-else class="muted small">Esercizio saltato: nessun carico verrà registrato.</p>
     </section>
     <section class="panel lf-p360-card"><div class="row between"><strong>Riepilogo</strong><span class="muted small">{{selectedSummary.completed}}/{{selectedSummary.total}} esercizi con dati</span></div><p class="muted small">Volume documentato: {{formatKg(selectedSummary.volume)}} kg · Carico massimo: {{formatKg(selectedSummary.max)}} kg</p><button class="primary lf-p360-main-button" :disabled="!canWrite||busy" @click="saveWorkout">{{busy?'Salvataggio…':'✓ Salva allenamento'}}</button><p v-if="!canWrite" class="muted small">Scrittura non abilitata nella configurazione LIVE attuale.</p></section>
    </template>
   </template>
   <template v-if="tab==='history'">
    <div class="lf-p360-stat-grid"><div class="lf-p360-stat"><span>ALLENAMENTI</span><strong>{{totalSessions}}</strong></div><div class="lf-p360-stat"><span>ESERCIZI REGISTRATI</span><strong>{{uniqueRecords}}</strong></div><div class="lf-p360-stat"><span>SCHEDE DISPONIBILI</span><strong>{{sheets.length}}</strong></div></div>
    <section class="panel lf-p360-card"><div class="row between"><h2>Storico schede</h2><span class="pill">Ultime 250 sessioni</span></div><p class="muted small">Scegli una scheda e un esercizio per visualizzare l'andamento.</p>
      <select v-model="historySheetId" aria-label="Scheda storico"><option value="" disabled>Seleziona scheda</option><option v-for="s in sheets" :key="s.id" :value="s.id">{{s.title}}</option></select>
      <select v-if="selectedHistorySheet" v-model="historyKey" aria-label="Esercizio storico"><option value="" disabled>Seleziona esercizio</option><option v-for="(e,i) in selectedHistoryExercises" :key="exerciseKeyLocal(e,i)" :value="exerciseKeyLocal(e,i)">{{e.name}}</option></select>
      <div class="lf-p360-filters"><button v-for="m in ([['kg','Carico'],['volume','Volume'],['estimate','Stima 1RM']] as const)" :key="m[0]" :class="{on:metric===m[0]}" @click="metric=m[0]">{{m[1]}}</button></div>
      <div class="lf-p360-line-filters"><label>Ripetizioni <select v-model="repFilter"><option value="all">Tutte</option><option v-for="n in availableReps" :key="n" :value="String(n)">{{n}} rip.</option></select></label><label>Periodo <select v-model="period"><option value="all">Tutto</option><option value="1">1 mese</option><option value="3">3 mesi</option><option value="6">6 mesi</option><option value="12">1 anno</option></select></label></div>
      <div v-if="currentPoints.length" class="lf-p360-graph"><svg viewBox="0 0 100 106" preserveAspectRatio="none" role="img" :aria-label="`Andamento ${selectedHistoryEx?.name||'esercizio'}`"><path d="M6 15 H94 M6 49 H94 M6 88 H94" fill="none" stroke="currentColor" stroke-width=".3" opacity=".18"/><path :d="chartStroke" fill="none" stroke="#2fe38c" stroke-width="2.0" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle v-for="(p,i) in currentPoints" :key="i" :cx="currentPoints.length===1?50:7+i*86/(currentPoints.length-1)" :cy="90-(p.y-chartMin)/(chartMax-chartMin||1)*76" r="1.8" fill="#76ffc0"/></svg><div class="lf-p360-graph-caption"><span>{{displayDate(currentPoints[0].x)}}</span><span>{{displayDate(currentPoints[currentPoints.length-1].x)}}</span></div><div class="row between"><small class="muted">Prima: {{formatKg(currentPoints[0].y)}}</small><b>Ultima: {{formatKg(currentPoints[currentPoints.length-1].y)}}</b></div></div>
      <p v-else class="muted small lf-p360-empty">Nessuna registrazione confrontabile con questi filtri. Non vengono inventati punti intermedi.</p><p v-if="metric==='estimate'" class="muted small">1RM stimato (formula indicativa per serie fino a 10 ripetizioni): non è un massimale realmente sollevato.</p>
    </section>
    <section class="panel lf-p360-card"><h2>Andamento generale della scheda</h2>
     <div class="lf-p360-filters"><button v-for="g in ([['volume','Volume'],['completion','Completamento'],['performance','Indice prestazioni']] as const)" :key="g[0]" :class="{on:sheetGraph===g[0]}" @click="sheetGraph=g[0]">{{g[1]}}</button></div>
     <div v-if="sheetGraphPoints.length" class="lf-p360-graph"><svg viewBox="0 0 100 106" preserveAspectRatio="none" role="img" aria-label="Grafico generale della scheda"><path d="M6 15 H94 M6 49 H94 M6 88 H94" fill="none" stroke="currentColor" stroke-width=".3" opacity=".18"/><path :d="sheetGraphPath" fill="none" stroke="#2fe38c" stroke-width="2" vector-effect="non-scaling-stroke"/><circle v-for="(p,i) in sheetGraphPoints" :key="i" :cx="sheetGraphPoints.length===1?50:7+i*86/(sheetGraphPoints.length-1)" :cy="90-(p.y-sheetGraphMin)/(sheetGraphMax-sheetGraphMin||1)*76" r="1.8" fill="#76ffc0"/></svg><div class="lf-p360-graph-caption"><span>{{displayDate(sheetGraphPoints[0].x)}}</span><span>{{displayDate(sheetGraphPoints[sheetGraphPoints.length-1].x)}}</span></div></div>
     <p v-else class="muted small lf-p360-empty">Non ci sono ancora dati per questo grafico.</p>
     <p class="muted small">{{sheetGraph==='volume'?'Volume: somma dei kg × ripetizioni registrate; le sessioni incomplete non sono direttamente confrontabili.':sheetGraph==='completion'?'Completamento: quota degli esercizi con almeno una serie registrata.':'Indice orientativo: media dei miglioramenti percentuali dei singoli esercizi rispetto al primo dato valido; esclude esercizi non misurati e non misura la massa muscolare.'}}</p>
     <div v-for="row in historySummary.slice(0,24)" :key="row.id" class="lf-p360-history-row"><b>{{displayDate(row.date)}}</b><span>{{row.completed}}/{{row.total}} esercizi</span><span>{{formatKg(row.volume)}} kg volume</span></div><p v-if="!historySummary.length" class="muted small">Nessun allenamento registrato per questa scheda.</p></section>
   </template>
   <template v-if="tab==='goals'">
    <section class="panel lf-p360-card">
     <div class="row between"><h2>Obiettivi dell’Atleta</h2><span class="pill">{{goals.filter(g=>g.status==='active').length}} attivi</span></div>
     <p class="muted small">Annotazioni e traguardi assegnati dai Coach. L’Atleta può leggerli, ma non modificarli.</p>
     <div v-if="role==='coach'" class="lf-p360-goal-editor">
      <h3>Assegna un obiettivo</h3>
      <label class="lf-p360-field-label">Titolo <input v-model="goalTitle" type="text" maxlength="100" placeholder="Es. Aumentare la panca a 80 kg × 5"/></label>
      <label class="lf-p360-field-label">Annotazione per l’Atleta <textarea v-model="goalNotes" maxlength="1000" rows="3" placeholder="Obiettivo, consigli e indicazioni del Coach…"/></label>
      <label class="lf-p360-field-label">Scadenza (facoltativa) <input v-model="goalDate" type="date"/></label>
      <p v-if="goalError" class="notice lf-p360-error" role="alert">{{goalError}}</p>
      <button type="button" class="primary lf-p360-main-button" :disabled="goalBusy||!canManageGoals" @click="saveGoal">{{goalBusy?'Salvataggio…':'＋ Assegna obiettivo'}}</button>
      <p v-if="!canManageGoals" class="muted small">Per assegnare obiettivi servono un account Coach autorizzato e le Rules Progressi attive.</p>
     </div>
     <p v-else class="muted small">Gli obiettivi vengono inseriti e aggiornati dal Coach. Puoi consultarli qui quando vuoi.</p>
     <label class="lf-p360-archived-toggle"><input v-model="showArchivedGoals" type="checkbox"/> Mostra anche gli obiettivi archiviati</label>
     <div v-for="goal in visibleGoals" :key="goal.id" class="lf-p360-goal">
      <div class="row between lf-p360-goal-heading"><h3>{{goal.title}}</h3><span class="lf-p360-goal-status" :class="'status-'+goal.status">{{statusLabel(goal.status)}}</span></div>
      <p class="lf-p360-goal-text">{{goal.notes}}</p>
      <p v-if="goal.dueDate" class="muted small">Scadenza indicativa: {{displayDate(goal.dueDate)}}</p>
      <div v-if="role==='coach'&&goal.status!=='archived'" class="lf-p360-goal-actions">
       <button v-if="goal.status!=='reached'" type="button" class="secondary" :disabled="goalBusy||!canManageGoals" @click="changeGoalStatus(goal,'reached')">✓ Raggiunto</button>
       <button v-if="goal.status!=='active'" type="button" class="secondary" :disabled="goalBusy||!canManageGoals" @click="changeGoalStatus(goal,'active')">Riattiva</button>
       <button v-if="goal.status==='active'" type="button" class="secondary" :disabled="goalBusy||!canManageGoals" @click="changeGoalStatus(goal,'paused')">In pausa</button>
       <button type="button" class="secondary" :disabled="goalBusy||!canManageGoals" @click="changeGoalStatus(goal,'archived')">Archivia</button>
      </div>
     </div>
     <p v-if="!visibleGoals.length" class="muted small lf-p360-empty">Nessun obiettivo {{showArchivedGoals?'registrato':'attivo o raggiunto'}} per questo Atleta.</p>
     <p v-if="role!=='coach'&&goalError" class="notice lf-p360-error" role="alert">{{goalError}}</p>
    </section>
   </template>
   <template v-if="tab==='check'">
    <section class="panel lf-p360-card"><h2>Check Zone</h2><p class="muted small">Aggiungi foto quando vuoi: verranno convertite in JPG e compresse automaticamente sotto 1 MB prima di essere salvate nel tuo Storage privato. Nessuna analisi medica automatica.</p>
      <template v-if="role==='athlete'"><div class="lf-p360-date"><label for="lf-p360-checkdate">Data check</label><input id="lf-p360-checkdate" v-model="checkDate" type="date" :max="localDate()"/></div><div class="lf-p360-photo-grid"><label v-for="side in ([['front','Frontale'],['back','Posteriore'],['left','Laterale SX'],['right','Laterale DX']] as const)" :key="side[0]" class="lf-p360-photo-select"><span>▧</span><strong>{{side[1]}}</strong><small>{{cleanFile(selectedPhotos[side[0]])||'＋ Aggiungi'}}</small><input type="file" accept="image/*,.heic,.heif,.avif,.bmp,.tif,.tiff" :disabled="busy" @change="chooseFile(side[0],$event)"/></label></div><label class="lf-p360-field-label">Note facoltative <textarea v-model="checkNotes" maxlength="500" rows="2" placeholder="Come ti senti, dettagli utili…"/></label><p v-if="photoStatus" class="muted small lf-p360-photo-status" role="status">{{photoStatus}}</p><p class="muted small">Formati comuni e HEIC/HEIF supportati dove decodificabili. Le fotografie originali non vengono caricate; la compressione può ridurre leggermente i dettagli. HEIC può richiedere internet per il convertitore.</p><button class="primary lf-p360-main-button" :disabled="!canWrite||busy" @click="saveCheck">{{busy?'Ottimizzazione e caricamento…':'＋ Salva nuovo check'}}</button><p v-if="!canWrite" class="muted small">Upload disponibile soltanto quando le regole Firebase Progressi saranno autorizzate.</p></template>
     <p v-else class="muted small">Consultazione Coach: i check fotografici richiedono autorizzazioni di lettura dedicate e una condivisione esplicita dell'Atleta.</p>
    </section>
    <section class="panel lf-p360-card"><h2>I check precedenti</h2><div v-for="c in checks" :key="c.id" class="lf-p360-check-row"><strong>{{displayDate(c.performedOn)}}</strong><span class="muted small">{{c.photos.length}} foto</span><p v-if="c.notes" class="muted small">{{c.notes}}</p><div v-if="role==='athlete'" class="lf-p360-photo-grid"><div v-for="p in c.photos" :key="p.storagePath"><button class="secondary" type="button" @click="showCheckPhoto(p)">{{p.side}} · Visualizza</button><img v-if="photoUrls[p.storagePath]" :src="photoUrls[p.storagePath]" alt="Foto privata del check fisico"/></div></div></div><p v-if="!checks.length" class="muted small">Nessun check ancora registrato.</p></section>
   </template>
  </template>
  <RouterLink v-if="role==='coach'" to="/coach/atleti" class="secondary lf-p360-back-link">← Gestione Atleti</RouterLink>
 </section>
</template>
