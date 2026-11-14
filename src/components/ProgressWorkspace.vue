<script setup lang="ts">
/** LionFit Progressi 360 — dedicated, tenant-scoped records, no legacy sheet mutations. */
import {computed,onMounted,onUnmounted,ref,shallowRef,watch} from 'vue'
import {useRoute,RouterLink,onBeforeRouteLeave} from 'vue-router'
import {collection,doc,getDocFromServer,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore'
import {onAuthStateChanged} from 'firebase/auth'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,readNavigationSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {isOperationalMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {watchAthleteSheets} from '../integrations/firestore/sheets'
import {watchProgress,watchChecks,watchGoals,addGoal,setGoalStatus,recordSession,recordCheck,uploadCheckPhoto,removeStagedPhoto,loadPhoto,checkCollection,correctWorkout,watchCorrectionHeads,watchRevisions,requestRevision,changeRevisionStatus,syncPendingWorkout,checkSharingEnabled,watchCheckShares,changeCheckShare,type ProgramRevision,type RevisionStatus} from '../integrations/firestore/progress'
import {uniqueProgressSheets,emptyEntries,normalizeEntries,exerciseSeries,sheetSummary,progressMetrics,sheetPerformanceTimeline,setLabel,historySheets,historyExercises,matchesHistoryExercise,lastSet,applyCorrectionHeads,type CorrectionHead,type WorkoutSet,type ProgressSheet,type RecordedExercise,type ProgressSession,type ProgressCheck,type CheckPhoto} from '../features/progress/progressModel'
import {archiveItemFromRaw,type HistoricalArchive} from '../features/athletes/labArchive'
import {shownGoals,statusLabel,type ProgressGoal,type ProgressGoalStatus} from '../features/progress/goalsModel'
import {compressCheckPhoto,supportedCheckPhoto,MAX_CHECK_PHOTO_BYTES} from '../features/progress/checkPhotoCompression'
import {groupExerciseRows} from '../features/sheets/supersetEditor'
import {substituteExercise} from '../features/sheets/approvedAlternatives'
import {Capacitor} from '@capacitor/core'
import CheckComparison from './CheckComparison.vue'
import {checkSides,sideLabel} from '../features/progress/checkComparison'
import {blankOffline,readOffline,saveOffline,cacheSheet,queueWorkout,acknowledgeWorkout,type OfflineScope,type OfflineState,type WorkoutDraft} from '../features/progress/offlineWorkouts'
import {progressReportHtml,type ReportPhoto} from '../features/progress/progressReport'
import type {Personal,ProgramWeek,Groups,ExerciseRecord} from '../features/sheets/domain'
const props=defineProps<{role:'athlete'|'coach'}>()
const route=useRoute()
const context=shallowRef<StagingSession|null>(null)
const athleteId=ref(''),athletes=ref<Array<{id:string;name:string}>>([]),loading=ref(true),error=ref(''),writeError=ref(''),notice=ref('')
const sheetData=shallowRef<{personal:Personal[];weeks:ProgramWeek[];groups:Groups}|null>(null)
const archived=ref<HistoricalArchive[]>([]),rawSessions=ref<ProgressSession[]>([]),checks=ref<ProgressCheck[]>([]),goals=ref<ProgressGoal[]>([])
const correctionHeads=ref<CorrectionHead[]>([]),correctionReady=ref(false),correctionError=ref('')
const sessions=computed(()=>applyCorrectionHeads(rawSessions.value,correctionHeads.value))
const tab=ref<'home'|'history'|'record'|'check'|'goals'|'trend'|'report'|'review'>('home'),sheetFilter=ref<'all'|'programmed'|'unprogrammed'|'historical'>('all'),search=ref('')
const chosenSheetId=ref(''),editor=ref<RecordedExercise[]>([]),performedOn=ref(localDate()),busy=ref(false),lastSaved=ref(false)
const historyListFilter=ref(''),historyPeriod=ref('all'),detailId=ref(''),savedSessionId=ref(''),pageSize=ref(250),progressLoading=ref(false),advanced=ref(false)
const directSession=ref<ProgressSession|null>(null)
const detail=computed(()=>sessions.value.find(s=>s.id===detailId.value)||(directSession.value?.id===detailId.value?applyCorrectionHeads([directSession.value],correctionHeads.value)[0]:null))
const historicalSheets=computed(()=>historySheets(sessions.value))
const filteredHistory=computed(()=>sessions.value.filter(s=>(!historyListFilter.value||s.sheetId===historyListFilter.value)&&withinPeriod(s.performedOn,historyPeriod.value)))
const correction=ref<{ei:number;si:number;kg:string;reps:string;expected:WorkoutSet}|null>(null)
const revisions=ref<ProgramRevision[]>([]),revisionError=ref(''),revisionSheet=ref(''),revisionReason=ref('Disponibilità'),revisionNotes=ref('')
const reportFrom=ref(''),reportTo=ref(localDate()),reportNotes=ref(''),reportBusy=ref(false)
const reportPhotoPaths=ref<string[]>([])
const reportPhotos=computed(()=>checks.value.filter(c=>(!reportFrom.value||c.performedOn>=reportFrom.value)&&(!reportTo.value||c.performedOn<=reportTo.value)).flatMap(c=>c.photos.map(p=>({p,date:c.performedOn}))))
watch([reportFrom,reportTo,athleteId],()=>{reportPhotoPaths.value=[]})
const reportRows=computed(()=>sessions.value.filter(s=>(!reportFrom.value||s.performedOn>=reportFrom.value)&&(!reportTo.value||s.performedOn<=reportTo.value)))
const guided=ref(true),stepIndex=ref(0),showSummary=ref(false),activePrescription=ref<ExerciseRecord[]>([]),altChoice=ref<Record<number,number>>({}),timerSeconds=ref(0),timerId=ref<ReturnType<typeof setInterval>|null>(null)
const exerciseGroups=computed(()=>groupExerciseRows(activePrescription.value))
const prescribedTimer=computed(()=>{const g=exerciseGroups.value[stepIndex.value];if(!g)return 90;const ex=activePrescription.value[g.secondaryIndex??g.primaryIndex];const raw=String(g.secondaryIndex!==null?ex?.supersetRest||ex?.rest||'':ex?.rest||'').trim();const m=raw.match(/^(\d+)\s*(s|sec|secondi|m|min|minuti|')$/i);if(!m)return 90;return Math.max(1,Math.min(900,Number(m[1])*(/^(m|min|minuti|')$/i.test(m[2])?60:1)))})
const visibleExerciseIndices=computed(()=>{const g=exerciseGroups.value[stepIndex.value];return g?(g.secondaryIndex===null?[g.primaryIndex]:[g.primaryIndex,g.secondaryIndex]):[]})
const displayEditorRows=computed(()=>editor.value.map((exercise,i)=>({exercise,i})).filter(({i})=>!guided.value||(!showSummary.value&&visibleExerciseIndices.value.includes(i))))
const historySheetId=ref(''),historyKey=ref(''),metric=ref<'kg'|'volume'|'estimate'>('kg'),repFilter=ref('all'),period=ref('all'),sheetGraph=ref<'volume'|'completion'|'performance'>('volume')
const checkDate=ref(localDate()),checkNotes=ref(''),selectedPhotos=ref<Partial<Record<CheckPhoto['side'],File>>>({}),photoUrls=ref<Record<string,string>>({}),photoStatus=ref('')
const online=ref(navigator.onLine),offlineState=shallowRef<OfflineState|null>(null),offlineError=ref(''),syncing=ref(false),offlineScope=shallowRef<OfflineScope|null>(null),downloadedMode=ref(false),shareIds=ref<string[]>([]),shareReady=ref(false),shareEnabled=checkSharingEnabled()
let restoring=false
const sharedChecks=computed(()=>props.role==='athlete'?checks.value:checks.value.filter(c=>shareIds.value.includes(c.id)))
const photoScope=computed(()=>`${context.value?.gymId||''}:${athleteId.value}`)
const canWrite=computed(()=>props.role==='athlete'&&mayWriteLive()&&context.value?.uid===athleteId.value)
const hasDraft=computed(()=>editor.value.some(e=>e.skipped||e.sets.some(s=>s.kg!==null||s.reps!==null)))
onBeforeRouteLeave(()=>!hasDraft.value||(!!offlineState.value?.draft&&!offlineError.value)||window.confirm('L’allenamento non è ancora salvato. Vuoi uscire?'))
const canManageGoals=computed(()=>props.role==='coach'&&mayWriteLive()&&!!context.value&&!!athleteId.value&&context.value.uid!==athleteId.value)
const goalTitle=ref(''),goalNotes=ref(''),goalDate=ref(''),goalBusy=ref(false),goalError=ref(''),showArchivedGoals=ref(false)
const visibleGoals=computed(()=>shownGoals(goals.value,showArchivedGoals.value))
const sheets=computed(()=>!online.value||downloadedMode.value?offlineState.value?.sheets||[]:uniqueProgressSheets(sheetData.value?.personal||[],archived.value))
const visibleSheets=computed(()=>sheets.value.filter(s=>{
 if(!s.title.toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it')) && !s.exercises.some(e=>e.name.toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it'))))return false
 if(!online.value||downloadedMode.value)return true
 if(sheetFilter.value==='historical')return s.historical
 if(sheetFilter.value==='programmed')return (sheetData.value?.groups.programmed||[]).some(g=>g.sheet.id===s.id)
 if(sheetFilter.value==='unprogrammed')return (sheetData.value?.groups.unprogrammed||[]).some(g=>g.sheet.id===s.id)
 return true
}))
const selectedSheet=shallowRef<ProgressSheet|null>(null)
const selectedHistoryExercises=computed(()=>historyExercises(sessions.value,historySheetId.value))
const selectedHistoryEx=computed(()=>selectedHistoryExercises.value.find(e=>e.key===historyKey.value)||null)
const repsChoice=computed(()=>repFilter.value==='all'?null:Number(repFilter.value))
const availableReps=computed(()=>[...new Set(sessions.value.filter(s=>s.sheetId===historySheetId.value).flatMap(s=>s.exercises.filter(e=>matchesHistoryExercise(e,historyKey.value)).flatMap(e=>e.sets.map(x=>x.reps).filter((n):n is number=>n!==null))))].sort((a,b)=>a-b))
const series=computed(()=>historySheetId.value&&historyKey.value?exerciseSeries(sessions.value,historySheetId.value,historyKey.value,repsChoice.value):[])
const filteredSeries=computed(()=>series.value.filter(s=>withinPeriod(s.date,period.value)))
const currentPoints=computed(()=>filteredSeries.value.map(p=>({id:p.id,x:p.date,y:metric.value==='kg'?p.kg:metric.value==='volume'?p.volume:p.estimate})).filter((x):x is {id:string;x:string;y:number}=>x.y!==null))
const historySummary=computed(()=>sheetSummary(sessions.value,historySheetId.value))
const sheetPerformance=computed(()=>sheetPerformanceTimeline(sessions.value,historySheetId.value))
const sheetGraphPoints=computed(()=>historySummary.value.slice().reverse().map(s=>{
 const value=sheetGraph.value==='volume'?s.volume:sheetGraph.value==='completion'?(s.total?100*s.completed/s.total:0):sheetPerformance.value.find(r=>r.id===s.id)?.index??null
 return {id:s.id,x:s.date,y:value}
}).filter((x):x is {id:string;x:string;y:number}=>x.y!==null))
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
let shortcutConsumed=false
let stops:Unsubscribe[]=[],stopChild:Unsubscribe[]=[],alive=true,stopProgress:Unsubscribe|null=null
function localDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function withinPeriod(value:string,p:string){if(p==='all')return true;const n=Number(p);if(!Number.isInteger(n))return true;const after=new Date();after.setUTCMonth(after.getUTCMonth()-n);return value>=after.toISOString().slice(0,10)}
function exerciseKeyLocal(ex:{exerciseId?:string;catalogId?:string;id?:string},i:number){return String(ex.exerciseId||ex.catalogId||ex.id||`position:${i}`)}
function stopCurrent(){restoring=true;offlineScope.value=null;offlineState.value=null;downloadedMode.value=false;shareIds.value=[];shareReady.value=false;selectedPhotos.value={};stopProgress?.();stopProgress=null;clearTimer();pageSize.value=250;detailId.value='';directSession.value=null;savedSessionId.value='';correction.value=null;revisions.value=[];revisionError.value='';historyListFilter.value='';activePrescription.value=[];tab.value='home';photoStatus.value='';for(const f of stopChild)f();stopChild=[];sheetData.value=null;archived.value=[];rawSessions.value=[];revisionSheet.value='';revisionNotes.value='';reportNotes.value='';correctionHeads.value=[];correctionReady.value=false;correctionError.value='';checks.value=[];goals.value=[];goalError.value='';goalTitle.value='';goalNotes.value='';goalDate.value='';chosenSheetId.value='';selectedSheet.value=null;editor.value=[];historySheetId.value='';historyKey.value='';clearUrls();restoring=false}
function clearUrls(){Object.values(photoUrls.value).forEach(url=>URL.revokeObjectURL(url));photoUrls.value={}}
function bindAthlete(id:string){
 stopCurrent();athleteId.value=id
 const s=context.value;if(!s||!id)return
 const {db}=getStagingClients();loading.value=true;error.value='';let loadedSheets=false
 if(props.role==='athlete'&&s.uid===id){offlineScope.value={project:db.app.options.projectId||'',gym:s.gymId,uid:s.uid};try{offlineState.value=readOffline(localStorage,offlineScope.value);if(offlineState.value){if(!online.value){downloadedMode.value=true;loading.value=false;loadedSheets=true}restoreLocalDraft();if(online.value)void flushOffline()}}catch(e){offlineError.value=String(e)}}
 if(shareEnabled)stopChild.push(watchCheckShares(db,s.gymId,id,v=>{if(alive&&athleteId.value===id){shareIds.value=v;shareReady.value=true;if(props.role==='coach')clearUrls()}},()=>{if(alive&&athleteId.value===id){shareReady.value=false;shareIds.value=[];clearUrls()}}))
 stopChild.push(watchAthleteSheets(db,s.gymId,id,result=>{
  if(!alive||athleteId.value!==id)return
  sheetData.value=result;loadedSheets=true;loading.value=false
  const requested=typeof route.query.sheetId==='string'?route.query.sheetId:'';if(props.role==='athlete'&&requested&&!shortcutConsumed&&!chosenSheetId.value){const found=sheets.value.find(x=>x.id===requested||x.sourceId===requested);if(found){shortcutConsumed=true;tab.value='record';openSheet(found)}}
 },e=>{error.value='Schede non disponibili: '+e.message;loading.value=false}))
 stopChild.push(onSnapshot(collection(db,'gyms',s.gymId,'athlete_programs',id,'archive_templates'),snap=>{
  if(alive&&athleteId.value===id){archived.value=snap.docs.map(d=>archiveItemFromRaw(d.id,d.data()));const requested=typeof route.query.sheetId==='string'?route.query.sheetId:'';if(props.role==='athlete'&&requested&&!shortcutConsumed&&!chosenSheetId.value){const found=sheets.value.find(x=>x.id===requested||x.sourceId===requested);if(found){shortcutConsumed=true;tab.value='record';openSheet(found)}}}
 },e=>{if(alive)notice.value='Alcune schede storiche non sono leggibili: '+e.message}))
 bindProgress()
 stopChild.push(watchCorrectionHeads(db,s.gymId,id,v=>{if(alive&&athleteId.value===id){correctionHeads.value=v;correctionReady.value=true;correctionError.value=''}},e=>{if(alive&&athleteId.value===id){correctionReady.value=false;correctionError.value='Correzioni non attive: verificare le nuove Rules Firestore.'}}))
 stopChild.push(watchRevisions(db,s.gymId,id,v=>{if(alive&&athleteId.value===id)revisions.value=v},e=>{if(alive&&athleteId.value===id)revisionError.value='Richieste non disponibili: '+e.message}))
 stopChild.push(watchChecks(db,s.gymId,id,v=>{if(alive&&athleteId.value===id)checks.value=v},e=>{if(alive)writeError.value='Check Zone: '+e.message+' (controllare Firestore Rules Progressi)'}))
 stopChild.push(watchGoals(db,s.gymId,id,v=>{if(alive&&athleteId.value===id)goals.value=v},e=>{if(alive)goalError.value='Obiettivi non disponibili: '+e.message+' (verifica Firestore Rules Progressi)'}))
 if(!loadedSheets)loading.value=true
}
onMounted(async()=>{window.addEventListener('online',networkChanged);window.addEventListener('offline',networkChanged);window.addEventListener('storage',externalStorage); 
 if(!isOperationalMode()){loading.value=false;error.value='Progressi LIVE disponibile solo con accesso Firebase configurato.';return}
 try{
  const s=await (navigator.onLine||props.role==='coach'?readStagingSession():readNavigationSession());if(!alive)return
  context.value=s
  if(props.role==='athlete'){
   if(s.role!=='atleta')throw new Error('Accedi con un profilo Atleta.')
   bindAthlete(s.uid)
  }else{
   if(s.role==='atleta')throw new Error('La vista Coach richiede un account Coach.')
   const {db}=getStagingClients()
   const u=typeof route.query.athleteId==='string'?route.query.athleteId:''
   stops.push(onSnapshot(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','athlete')),snap=>{
    if(!alive||!context.value)return
    athletes.value=snap.docs.map(d=>({id:d.id,name:String(d.data().name||d.id)})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
    if(athleteId.value&&!athletes.value.some(a=>a.id===athleteId.value)){stopCurrent();athleteId.value=''}
    if(!athleteId.value&&athletes.value.length){const selected=athletes.value.some(a=>a.id===u)?u:athletes.value[0].id;bindAthlete(selected)}
    if(!athletes.value.length)loading.value=false
   },e=>{error.value='Elenco Atleti non disponibile: '+e.message;loading.value=false}))
  }
  const {auth}=getStagingClients()
  stops.push(onAuthStateChanged(auth,user=>{if(!user||user.uid!==s.uid){stopCurrent();athleteId.value='';context.value=null;error.value='Sessione terminata: accedi nuovamente.'}}))
 }catch(e){loading.value=false;error.value=e instanceof Error?e.message:String(e)}
})
watch(()=>route.query.athleteId,value=>{
 if(props.role!=='coach'||!context.value||typeof value!=='string'||!value||value===athleteId.value)return
 if(athletes.value.some(a=>a.id===value))bindAthlete(value)
})
onUnmounted(()=>{window.removeEventListener('online',networkChanged);window.removeEventListener('offline',networkChanged);window.removeEventListener('storage',externalStorage);alive=false;stopCurrent();for(const f of stops)f();stops=[]})
watch(historicalSheets,rows=>{if(!rows.some(s=>s.id===historySheetId.value))historySheetId.value=rows[0]?.id||''})
watch(selectedHistoryExercises,rows=>{if(!rows.some(e=>e.key===historyKey.value))historyKey.value=rows[0]?.key||''})
watch(historyKey,()=>{repFilter.value='all'})
function bindProgress(){const s=context.value,id=athleteId.value;if(!s||!id)return;stopProgress?.();progressLoading.value=true;stopProgress=watchProgress(getStagingClients().db,s.gymId,id,v=>{if(alive&&athleteId.value===id){rawSessions.value=v;progressLoading.value=false}},e=>{if(alive&&athleteId.value===id){progressLoading.value=false;writeError.value='Storico allenamenti: '+e.message}},pageSize.value)}
function loadOlder(){if(progressLoading.value)return;pageSize.value+=250;bindProgress()}
function navigateTab(next:typeof tab.value){if(tab.value==='record'&&next!=='record')clearTimer();tab.value=next;writeError.value='';correction.value=null;if(next==='history')detailId.value=''}
async function openHistory(id:string){tab.value='history';detailId.value=id;directSession.value=null;correction.value=null;writeError.value='';const s=context.value,aid=athleteId.value;if(!s||sessions.value.some(r=>r.id===id))return;try{const snap=await getDocFromServer(doc(getStagingClients().db,'gyms',s.gymId,'progress',aid,'sessions',id));if(alive&&athleteId.value===aid&&detailId.value===id&&snap.exists())directSession.value={...snap.data(),id:snap.id} as ProgressSession}catch(e){if(alive&&athleteId.value===aid&&detailId.value===id)writeError.value='Registrazione non disponibile: '+(e instanceof Error?e.message:String(e))}}
function startCorrection(ei:number,si:number,row:WorkoutSet){correction.value={ei,si,kg:row.kg===null?'':String(row.kg),reps:row.reps===null?'':String(row.reps),expected:{...row}}}
async function saveCorrection(){const c=correction.value,s=context.value,d=detail.value;if(!c||!s||!d||!canWrite.value||!correctionReady.value||busy.value)return;busy.value=true;writeError.value='';try{await correctWorkout(getStagingClients().db,s.gymId,s.uid,d.id,c.ei,c.si,String(c.kg).trim()===''?null:Number(c.kg),String(c.reps).trim()===''?null:Number(c.reps),s.uid,c.expected);correction.value=null;notice.value='Correzione salvata.'}catch(e){writeError.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
function previousSet(i:number,j:number){const e=editor.value[i];if(!e||!selectedSheet.value)return null;const scoped=sessions.value.filter(s=>s.sheetId===selectedSheet.value?.id||!!(activePrescription.value[i]?.exerciseId||activePrescription.value[i]?.catalogId));return lastSet(scoped,e.key,j,performedOn.value,activePrescription.value[i]?.exerciseId||activePrescription.value[i]?.catalogId?undefined:e.name)}
function usePrevious(i:number,j:number){const found=previousSet(i,j);if(!found)return;editCell(i,j,'kg',found.kg===null?'':String(found.kg));editCell(i,j,'reps',found.reps===null?'':String(found.reps))}
function changeAlternative(i:number,choice:number){const base=selectedSheet.value?.exercises[i];if(!base)return;const current=editor.value[i];if(current?.sets.some(x=>x.kg!==null||x.reps!==null)&&!window.confirm('Cambiare esercizio? I valori inseriti per questa riga saranno azzerati.'))return;const alt=base.alternatives?.[choice];const ex=alt?substituteExercise(base,alt):base;activePrescription.value[i]=ex;altChoice.value={...altChoice.value,[i]:choice};const row=emptyEntries({id:'tmp',title:'',sourceId:'',historical:false,exercises:[ex]})[0];row.key=alt?(alt.exerciseId||'alternative:'+alt.name.toLocaleLowerCase('it')):exerciseKeyLocal(base,i);if(alt)row.plannedKey=exerciseKeyLocal(base,i);editor.value[i]=row}
function closeWorkout(){if(hasDraft.value&&!window.confirm('Abbandonare questa registrazione non salvata?'))return;if(offlineState.value&&!commitLocal({...offlineState.value,draft:null}))return;chosenSheetId.value='';selectedSheet.value=null;editor.value=[];clearTimer()}
function clearTimer(){if(timerId.value!==null)clearInterval(timerId.value);timerId.value=null;timerSeconds.value=0}
function startTimer(){clearTimer();timerSeconds.value=prescribedTimer.value;timerId.value=setInterval(()=>{timerSeconds.value--;if(timerSeconds.value<=0)clearTimer()},1000)}
function step(delta:number){clearTimer();if(stepIndex.value+delta>=exerciseGroups.value.length){showSummary.value=true;return}showSummary.value=false;stepIndex.value=Math.max(0,stepIndex.value+delta)}
watch(tab,()=>{if(typeof window!=='undefined')window.scrollTo({top:0,behavior:'auto'})})
const revisionLabels:Record<RevisionStatus,string>={pending:'Da valutare',working:'In lavorazione',completed:'Completata'}
async function sendRevision(){const s=context.value,sh=sheets.value.find(x=>x.id===revisionSheet.value);if(!s||!sh||!canWrite.value||busy.value)return;busy.value=true;revisionError.value='';try{await requestRevision(getStagingClients().db,s.gymId,s.uid,sh,revisionReason.value,revisionNotes.value,s.uid);revisionNotes.value='';notice.value='Richiesta inviata al Coach.'}catch(e){revisionError.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function updateRevision(r:ProgramRevision,status:RevisionStatus){const s=context.value;if(!s||!canManageGoals.value||busy.value)return;busy.value=true;revisionError.value='';try{await changeRevisionStatus(getStagingClients().db,s.gymId,athleteId.value,r.id,status,s.uid);notice.value='Richiesta aggiornata.'}catch(e){revisionError.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function printReport(){if(reportBusy.value||!reportRows.value.length)return;reportBusy.value=true;writeError.value='';try{const title=props.role==='athlete'?context.value?.label||'Atleta':athletes.value.find(a=>a.id===athleteId.value)?.name||'Atleta';const scope=photoScope.value;const photos:ReportPhoto[]=[];if(props.role==='athlete'&&reportPhotoPaths.value.length){if(!online.value)throw new Error('Le foto del report richiedono connessione.');if(!window.confirm('Includere le foto selezionate nel PDF? Il documento potrà essere condiviso fuori da LionFit.'))return;for(const row of reportPhotos.value.filter(x=>reportPhotoPaths.value.includes(x.p.storagePath)).slice(0,4)){const url=await loadPhoto(row.p.storagePath);try{const blob=await (await fetch(url)).blob();const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)});photos.push({label:sideLabel(row.p.side),date:row.date,dataUrl})}finally{URL.revokeObjectURL(url)}}}if(!alive||photoScope.value!==scope)throw new Error('Sessione cambiata.');const html=progressReportHtml(title,reportRows.value,reportFrom.value,reportTo.value,reportNotes.value,photos);if(Capacitor.isNativePlatform()){const {Printer}=await import('@capgo/capacitor-printer');await Printer.printHtml({html})}else{const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;right:0;border:0;';document.body.appendChild(frame);const d=frame.contentDocument;if(!d||!frame.contentWindow){frame.remove();throw new Error('Stampa non disponibile.')}d.open();d.write(html);d.close();const win=frame.contentWindow;win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print();setTimeout(()=>frame.remove(),60000)}}catch(e){writeError.value=e instanceof Error?e.message:String(e)}finally{reportBusy.value=false}}

function openSheet(s:ProgressSheet){if(hasDraft.value&&!window.confirm('Sostituire la bozza di allenamento in corso?'))return;restoring=true;selectedSheet.value=JSON.parse(JSON.stringify(s));chosenSheetId.value=s.id;activePrescription.value=JSON.parse(JSON.stringify(s.exercises));editor.value=emptyEntries(s);altChoice.value={};stepIndex.value=0;showSummary.value=false;guided.value=true;clearTimer();performedOn.value=localDate();lastSaved.value=false;writeError.value='';restoring=false;if(offlineState.value)persistDraft()}
function editCell(ei:number,si:number,field:'kg'|'reps',value:string){
 const next=editor.value.map((ex,i)=>i===ei?{...ex,sets:ex.sets.map((s,j)=>j===si?{...s,[field]:value.trim()===''?null:Number(value)}:s)}:ex)
 editor.value=next
}
function addSet(i:number){editor.value=editor.value.map((e,j)=>j===i&&e.sets.length<30?{...e,sets:[...e.sets,{kg:null,reps:null}]}:e)}
function removeSet(i:number){editor.value=editor.value.map((e,j)=>j===i?{...e,sets:e.sets.slice(0,-1)}:e)}
function skipExercise(i:number){editor.value=editor.value.map((e,j)=>j===i?{...e,skipped:!e.skipped}:e)}
function draftSnapshot():WorkoutDraft|null{const sh=selectedSheet.value;if(!sh)return null;return JSON.parse(JSON.stringify({sheet:sh,entries:editor.value,prescription:activePrescription.value,alternatives:altChoice.value,date:performedOn.value,step:stepIndex.value,guided:guided.value}))}
function commitLocal(next:OfflineState){if(!offlineScope.value)return false;try{saveOffline(localStorage,offlineScope.value,next);offlineState.value=next;offlineError.value='';return true}catch(e){offlineError.value='Salvataggio sul dispositivo non riuscito: '+String(e);return false}}
function enableOffline(){if(!offlineScope.value||offlineState.value)return;if(!window.confirm('Scaricare schede e salvare carichi su questo dispositivo? I dati locali non sono cifrati da LionFit. Non usare su dispositivi condivisi.'))return;try{const existing=readOffline(localStorage,offlineScope.value);if(existing){offlineState.value=existing;restoreLocalDraft();return}if(commitLocal(blankOffline()))persistDraft()}catch(e){offlineError.value=String(e)}}
function downloadSheet(sh:ProgressSheet){if(!offlineState.value||!online.value)return;try{if(commitLocal(cacheSheet(offlineState.value,sh)))notice.value='Scheda disponibile sul dispositivo.'}catch(e){offlineError.value=String(e)}}
function removeDownload(id:string){const st=offlineState.value;if(st&&!busy.value)commitLocal({...st,sheets:st.sheets.filter(s=>s.id!==id)})}
function disableOffline(){const st=offlineState.value,scope=offlineScope.value;if(!st||!scope||syncing.value)return;if((st.queue.length||st.draft)&&!window.confirm('Eliminare definitivamente bozze e registrazioni non sincronizzate dal dispositivo?'))return;try{localStorage.removeItem('lionfit.offline.v1:'+JSON.stringify([scope.project,scope.gym,scope.uid]));offlineState.value=null;downloadedMode.value=false;offlineError.value=''}catch(e){offlineError.value=String(e)}}
function persistDraft(){if(restoring||!offlineState.value||!offlineScope.value||!selectedSheet.value||!canWrite.value)return;const draft=draftSnapshot();if(draft)commitLocal({...offlineState.value,draft})}
watch([editor,activePrescription,altChoice,performedOn,stepIndex,guided],persistDraft,{deep:true,flush:'sync'})
function restoreLocalDraft(){const draft=offlineState.value?.draft;if(!draft)return;restoring=true;selectedSheet.value=draft.sheet;chosenSheetId.value=draft.sheet.id;editor.value=draft.entries;activePrescription.value=draft.prescription;altChoice.value=draft.alternatives;performedOn.value=draft.date;stepIndex.value=draft.step;guided.value=draft.guided;showSummary.value=false;restoring=false}
function networkChanged(){online.value=navigator.onLine;if(!online.value&&offlineState.value){downloadedMode.value=true;loading.value=false;sheetFilter.value='all'}else if(online.value){downloadedMode.value=false;void flushOffline()}}
function externalStorage(e:StorageEvent){const scope=offlineScope.value;if(!scope||e.key!=='lionfit.offline.v1:'+JSON.stringify([scope.project,scope.gym,scope.uid]))return;offlineScope.value=null;offlineState.value=null;offlineError.value='Dati offline modificati in un’altra scheda. Ricarica questa pagina prima di continuare.'}
async function flushOffline(){const scope=offlineScope.value,s=context.value;if(!scope||!s||!canWrite.value||!online.value||syncing.value||!offlineState.value?.queue.length)return;syncing.value=true;offlineError.value='';try{
 const verified=await readStagingSession();if(verified.uid!==scope.uid||verified.gymId!==scope.gym||verified.role!=='atleta')throw new Error('Account non corrispondente alla coda offline.')
 while(offlineState.value?.queue.length){const pending=offlineState.value.queue[0];if(!alive||offlineScope.value!==scope||!online.value)break;await syncPendingWorkout(getStagingClients().db,scope.gym,scope.uid,pending,verified.uid);if(!alive||offlineScope.value!==scope||!offlineState.value)break;if(!commitLocal(acknowledgeWorkout(offlineState.value,pending.id)))break;savedSessionId.value=pending.id;lastSaved.value=true;notice.value='Allenamento sincronizzato.'}
 }catch(e){if(alive)offlineError.value='Sincronizzazione non riuscita: '+String(e)+'. I dati restano sul dispositivo.'}finally{syncing.value=false}}
async function saveWorkout(){
 if(!selectedSheet.value||!context.value||!canWrite.value||busy.value)return
 busy.value=true;writeError.value='';notice.value=''
 try{
  const s=selectedSheet.value;normalizeEntries(editor.value);if(performedOn.value>localDate())throw new Error('Data allenamento futura.')
  if(offlineState.value){const draft=draftSnapshot();if(!draft)return;const id=doc(collection(getStagingClients().db,'gyms',context.value.gymId,'progress',context.value.uid,'sessions')).id;if(!commitLocal(queueWorkout(offlineState.value,id,draft)))return;notice.value='Salvato sul dispositivo · da sincronizzare.';savedSessionId.value='';lastSaved.value=false}
  else {if(!online.value)throw new Error('Connessione assente. Attiva il salvataggio sul dispositivo prima di allenarti offline.');const id=await recordSession(getStagingClients().db,context.value.gymId,context.value.uid,s,performedOn.value,editor.value,context.value.uid);savedSessionId.value=id;lastSaved.value=true;notice.value='Allenamento salvato. Lo storico si aggiorna automaticamente.'}
  restoring=true;tab.value='home';historySheetId.value=s.id;chosenSheetId.value='';selectedSheet.value=null;editor.value=[];clearTimer();restoring=false;if(offlineState.value&&online.value)void flushOffline()
 }catch(e){writeError.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}
}
async function toggleShare(c:ProgressCheck){const s=context.value;if(!s||!online.value||!canWrite.value||!shareReady.value||busy.value)return;const enable=!shareIds.value.includes(c.id);if(enable&&!window.confirm('Condividere tutte le foto di questo check con i Coach attivi della tua palestra? Potranno visualizzarle finché non revochi la condivisione. Non è possibile revocare copie già effettuate.'))return;busy.value=true;try{await changeCheckShare(getStagingClients().db,s.gymId,s.uid,c.id,enable,s.uid)}catch(e){writeError.value=String(e)}finally{busy.value=false}}
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
 if(!context.value||!canWrite.value||busy.value||!online.value)return
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
 try{const scope=photoScope.value;const url=await loadPhoto(p.storagePath);if(!alive||scope!==photoScope.value||!sharedChecks.value.some(c=>c.photos.some(x=>x.storagePath===p.storagePath))){URL.revokeObjectURL(url);return}photoUrls.value={...photoUrls.value,[p.storagePath]:url}}
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
function switchToHistory(s:ProgressSheet){historySheetId.value=s.id;tab.value='trend';historyKey.value=s.exercises[0]?exerciseKeyLocal(s.exercises[0],0):''}
</script>
<template>
 <section class="lf-progress360 stack">
  <header class="lf-p360-head"><div><span class="eyebrow">LION FIT · {{role==='athlete'?'AREA ATLETA':'AREA COACH'}}</span><h1>{{role==='athlete'?'Allenamenti':'Allenamenti Atleta'}}</h1><p class="muted">Allenamenti, carichi, Check Zone e obiettivi in un unico spazio.</p></div><span class="lf-p360-head-icon">↗</span></header>
  <p v-if="error" class="notice lf-p360-error" role="alert">{{error}}</p>
  <p v-if="writeError" class="notice lf-p360-error" role="alert">{{writeError}}</p>
  <p v-if="notice" class="notice" role="status">{{notice}}</p>
  <p v-if="loading" class="muted" role="status">Caricamento allenamenti…</p>
  <div v-if="role==='coach'" class="panel lf-p360-coach-selector"><label for="lf-p360-athlete">Seleziona Atleta</label><select id="lf-p360-athlete" :value="athleteId" @change="bindAthlete(($event.target as HTMLSelectElement).value)"><option v-for="a in athletes" :key="a.id" :value="a.id">{{a.name}}</option></select><small class="muted">Consultazione Coach. Le registrazioni e i check sono personali dell'Atleta.</small></div>
  <section v-if="role==='athlete'&&context&&offlineScope&&(tab==='home'||tab==='record')" class="panel lf-p360-card lf-p15-offline"><div class="row between"><b>{{online?'Salvataggio sul dispositivo':'Connessione assente'}}</b><span class="pill">{{online?'Online':'Offline'}}</span></div><p v-if="offlineError" role="alert">{{offlineError}}</p><template v-if="offlineState"><p class="muted small">{{offlineState.sheets.length}} schede scaricate · {{offlineState.queue.length}} da sincronizzare<span v-if="offlineState.draft"> · Bozza salvata</span></p><div class="lf-p360-filters"><button class="secondary" :disabled="syncing||!online||!offlineState.queue.length" @click="flushOffline">{{syncing?'Sincronizzazione…':'Sincronizza ora'}}</button><button class="secondary" @click="downloadedMode=!downloadedMode;sheetFilter='all';navigateTab('record')">{{downloadedMode&&online?'Tutte le schede':'Schede scaricate'}}</button><button class="secondary" :disabled="syncing||busy" @click="disableOffline">Disattiva</button></div><p class="muted small">Offline sono disponibili le schede scaricate e le bozze, non foto o prenotazioni. Resta nell'app dopo aver effettuato l'accesso online.</p></template><button v-else-if="online" class="secondary" @click="enableOffline">Attiva modalità offline</button></section>
  <p v-else-if="offlineError" role="alert">{{offlineError}}</p>
  <template v-if="!loading&&athleteId">
   <button v-if="tab!=='home'" class="lf-p360-back" type="button" @click="navigateTab('home')">← Allenamenti</button>
   <template v-if="tab==='home'">
    <section v-if="role==='athlete'" class="lf-p12-hero"><img src="/lionfit-redesign/mma-gym-banner.jpg" alt=""/><div><span class="eyebrow">IL TUO ALLENAMENTO</span><h2>{{selectedSheet?.title||'Pronto ad allenarti?'}}</h2><p>{{chosenSheetId?'Riprendi la registrazione in corso.':'Registra le tue serie e segui il programma.'}}</p><button type="button" class="primary wide" @click="navigateTab('record')">▶ {{chosenSheetId?'Riprendi allenamento':'Inizia allenamento'}}</button></div></section>
    <button v-if="savedSessionId" class="primary wide" type="button" @click="openHistory(savedSessionId)">Visualizza allenamento salvato</button>
    <nav class="lf-p12-hub" aria-label="Sezioni Allenamenti">
     <button type="button" @click="navigateTab('history')"><b>◷ Storico allenamenti</b><small>Le tue registrazioni</small></button>
     <button type="button" @click="navigateTab('trend')"><b>↗ Progressi</b><small>Andamento e grafici</small></button>
     <button type="button" @click="navigateTab('goals')"><b>◎ Obiettivi</b><small>Traguardi e indicazioni</small></button>
     <button type="button" @click="navigateTab('check')"><b>▣ Check Zone</b><small>Foto e check</small></button>
     <button type="button" @click="navigateTab('report')"><b>▤ Report PDF</b><small>Esporta i risultati</small></button>
     <button type="button" @click="navigateTab('review')"><b>✎ Revisione programma</b><small>{{role==='coach'?revisions.filter(r=>r.status==='pending').length+' da valutare':'Richiedi una modifica'}}</small></button>
    </nav>
   </template>
   <template v-if="tab==='record'&&role==='athlete'">
    <template v-if="!selectedSheet">
     <section class="panel lf-p360-card lf-p360-sheet-picker">
      <div class="row between lf-p360-picker-heading"><div><span class="eyebrow">SCEGLI LA SCHEDA</span><h2>Le mie schede</h2></div><span class="pill">{{sheets.length}} schede</span></div>
      <p class="muted small">Scegli una scheda per registrare serie, kg e ripetizioni. Le assegnazioni originali restano intatte.</p>
      <input v-model="search" type="search" aria-label="Cerca scheda o esercizio" placeholder="⌕ Cerca una scheda…"/>
      <div v-if="online&&!downloadedMode" class="lf-p360-filters lf-p360-picker-filters" role="group" aria-label="Filtra schede">
       <button v-for="f in ([['all','Tutte'],['programmed','Programmate'],['unprogrammed','Senza programma'],['historical','Storiche']] as const)" :key="f[0]" type="button" :class="{on:sheetFilter===f[0]}" @click="sheetFilter=f[0]">{{f[1]}}</button>
      </div>
      <div class="lf-p360-sheet-list lf-p360-compact-list">
       <div v-for="s in visibleSheets" :key="s.id" class="lf-p15-sheet-row"><button class="lf-p360-sheet lf-p360-compact-sheet" type="button" :aria-label="`Apri la scheda ${s.title} per registrare i carichi`" @click="openSheet(s)">
        <span class="lf-p360-square" aria-hidden="true">▤</span>
        <span class="lf-p360-sheet-copy"><b :title="s.title">{{s.title}}</b><small>{{s.exercises.length}} esercizi <span aria-hidden="true">·</span> {{s.historical?'Archivio':'Assegnata'}}</small></span>
        <span class="lf-p360-arrow" aria-hidden="true">›</span>
       </button>
       <div v-if="offlineState" class="lf-p15-download-actions"><button v-if="offlineState.sheets.some(x=>x.id===s.id)" class="secondary" :disabled="busy" @click="removeDownload(s.id)">Rimuovi copia</button><button v-else class="secondary" :disabled="!online||busy" @click="downloadSheet(s)">Scarica per offline</button></div></div>
       <p v-if="!visibleSheets.length" class="muted small lf-p360-empty">Nessuna scheda trovata. Prova un filtro diverso.</p>
      </div>
     </section>
    </template>
    <template v-else>
     <button class="lf-p360-back" type="button" @click="closeWorkout">← Tutte le schede</button>
     <section class="panel lf-p360-card"><span class="eyebrow">REGISTRA ALLENAMENTO</span><h2>{{selectedSheet.title}}</h2><div class="lf-p360-date"><label for="lf-p360-date">Data dell'allenamento</label><input id="lf-p360-date" v-model="performedOn" type="date" :max="localDate()"/></div><p class="muted small">Inserisci solo ciò che hai eseguito. Campi lasciati vuoti = non registrati, non zero. Puoi segnare un esercizio come saltato.</p><div class="lf-p360-filters"><button :class="{on:guided}" @click="guided=true;showSummary=false">Guidato</button><button :class="{on:!guided}" @click="guided=false;showSummary=false">Registro completo</button></div><p v-if="guided&&!showSummary" class="muted small">Blocco {{stepIndex+1}} di {{exerciseGroups.length}} <span v-if="visibleExerciseIndices.length===2">· Superset A + B</span></p></section>
     <section v-for="{exercise,i} in displayEditorRows" :key="exercise.key+'-'+i" class="panel lf-p360-card lf-p360-exercise"><div class="row between"><div><h3>{{exercise.name}}</h3><small class="muted">Previsto: {{exercise.plannedSets}} serie × {{exercise.plannedReps}} rip.</small></div><button class="secondary lf-p360-skip" @click="skipExercise(i)">{{exercise.skipped?'Ripristina':'Saltato'}}</button></div>
      <p v-if="activePrescription[i]?.load" class="muted small">Carico previsto: {{activePrescription[i].load}}</p><p v-if="activePrescription[i]?.rest" class="muted small">Recupero: {{activePrescription[i].rest}}</p><p v-if="activePrescription[i]?.supersetRest" class="muted small">Recupero dopo il superset: {{activePrescription[i].supersetRest}}</p><p v-if="activePrescription[i]?.notes" class="muted small">Note: {{activePrescription[i].notes}}</p>
      <details v-if="selectedSheet.exercises[i]?.alternatives?.length"><summary>Visualizza alternativa</summary><div class="lf-p360-row-actions"><button class="secondary" type="button" @click="changeAlternative(i,-1)">Originale</button><button v-for="(a,ai) in selectedSheet.exercises[i].alternatives" :key="ai" type="button" class="secondary" @click="changeAlternative(i,ai)">{{a.name}}</button></div></details>
      <template v-if="!exercise.skipped"><div class="lf-p360-set-header"><span>Serie</span><span>Kg</span><span>Rip.</span></div><div v-for="(set,j) in exercise.sets" :key="j" class="lf-p360-set"><b>{{j+1}}</b><input aria-label="Carico kg" type="number" min="0" max="2000" step="0.5" :value="set.kg??''" placeholder="—" @input="editCell(i,j,'kg',($event.target as HTMLInputElement).value)"/><input aria-label="Ripetizioni" type="number" min="1" max="300" step="1" :value="set.reps??''" placeholder="—" @input="editCell(i,j,'reps',($event.target as HTMLInputElement).value)"/><div v-if="previousSet(i,j)" class="lf-p12-last"><small>{{previousSet(i,j)?.position===undefined?'Ultimo valore (serie non identificata)':'Ultima volta'}}: {{previousSet(i,j)?.kg??'—'}} kg × {{previousSet(i,j)?.reps??'—'}}</small><button type="button" class="secondary" @click="usePrevious(i,j)">Usa valori</button></div></div><div class="lf-p360-row-actions"><button type="button" class="secondary" :disabled="exercise.sets.length>=30" @click="addSet(i)">＋ Serie</button><button type="button" class="secondary" :disabled="!exercise.sets.length" @click="removeSet(i)">− Serie</button></div></template><p v-else class="muted small">Esercizio saltato: nessun carico verrà registrato.</p>
     </section>
     <section v-if="guided&&!showSummary" class="panel lf-p360-card"><div class="row between"><button class="secondary" :disabled="stepIndex===0" @click="step(-1)">← Indietro</button><button class="primary" @click="step(1)">{{stepIndex+1===exerciseGroups.length?'Riepilogo':'Avanti →'}}</button></div><div class="lf-p360-row-actions"><button class="secondary" @click="startTimer">{{timerSeconds?`Recupero ${timerSeconds}s`:`Timer ${prescribedTimer} s`}}</button><button v-if="timerSeconds" class="secondary" @click="clearTimer">Ferma</button></div></section>
     <section v-if="!guided||showSummary" class="panel lf-p360-card"><div class="row between"><strong>Riepilogo</strong><span class="muted small">{{selectedSummary.completed}}/{{selectedSummary.total}} esercizi con dati</span></div><div v-for="(e,i) in editor" :key="i" class="lf-p12-detail-exercise"><b>{{e.name}}</b><p class="muted small">{{e.skipped?'Saltato':e.sets.filter(s=>s.kg!==null||s.reps!==null).length+' serie registrate'}}</p></div><p class="muted small">Volume documentato: {{formatKg(selectedSummary.volume)}} kg · Carico massimo: {{formatKg(selectedSummary.max)}} kg</p><button v-if="guided" class="secondary wide" @click="showSummary=false">← Torna agli esercizi</button><button class="primary lf-p360-main-button" :disabled="!canWrite||busy" @click="saveWorkout">{{busy?'Salvataggio…':'✓ Salva allenamento'}}</button><p v-if="!canWrite" class="muted small">Scrittura non abilitata nella configurazione LIVE attuale.</p></section>
    </template>
   </template>
   <template v-if="tab==='history'">
    <section v-if="detailId" class="panel lf-p360-card"><button class="lf-p360-back" @click="detailId='';correction=null">← Tutto lo storico</button><template v-if="detail"><h2>{{detail.sheetTitle}}</h2><p v-if="correctionError" class="muted small">{{correctionError}}</p><p class="muted">{{displayDate(detail.performedOn)}}</p><p v-if="detail.exercises.some(e=>e.sets.some(s=>s.position===undefined))" class="muted small">Registrazione precedente: le voci senza numero di serie indicano l’ordine dei valori salvati, non la posizione originale.</p>
     <article v-for="(ex,ei) in detail.exercises" :key="ei" class="lf-p12-detail-exercise"><h3>{{ex.name}}</h3><p v-if="ex.skipped" class="muted">Esercizio saltato</p><p v-else-if="!ex.sets.length" class="muted">Non registrato</p><template v-else><div v-for="(set,si) in ex.sets" :key="si" class="lf-p12-history-set"><b>{{setLabel(set,si)}}</b><span>{{set.kg===null?'Non registrato':formatKg(set.kg)+' kg'}}</span><span>{{set.reps===null?'Non registrato':set.reps+' rip.'}}</span><button v-if="canWrite&&correctionReady" class="secondary" type="button" @click="startCorrection(ei,si,set)">Modifica</button><div v-if="correction&&correction.ei===ei&&correction.si===si" class="lf-p12-correction"><label>Carico kg<input v-model="correction.kg" type="number" min="0" max="2000" step="any"/></label><label>Ripetizioni<input v-model="correction.reps" type="number" min="1" max="300"/></label><button class="primary" :disabled="busy" @click="saveCorrection">Salva correzione</button><button class="secondary" @click="correction=null">Annulla</button></div></div></template></article>
     <details v-if="detail.corrections?.length"><summary>Storico correzioni ({{detail.corrections.length}})</summary><div v-for="(c,i) in detail.corrections" :key="i" class="lf-p12-detail-exercise"><b>{{detail.exercises[c.exerciseIndex]?.name}}</b><p>{{c.previous.kg??'—'}} kg × {{c.previous.reps??'—'}} → {{c.next.kg??'—'}} kg × {{c.next.reps??'—'}}</p><small>{{c.at?new Date(c.at).toLocaleString('it-IT'):'In sincronizzazione'}} · {{c.author===detail.athleteId?'Atleta':c.author}}</small></div></details>
    </template><p v-else class="muted">Registrazione in caricamento o non disponibile nell’elenco corrente.</p></section>
    <section v-else class="panel lf-p360-card"><h2>Storico allenamenti</h2><p class="muted small">Apri qualsiasi allenamento, anche con una sola serie registrata.</p><p v-if="correctionError" class="muted small">{{correctionError}}</p><div class="lf-p360-line-filters"><label>Scheda<select v-model="historyListFilter"><option value="">Tutte</option><option v-for="s in historicalSheets" :key="s.id" :value="s.id">{{s.title}}</option></select></label><label>Periodo<select v-model="historyPeriod"><option value="all">Tutto</option><option value="1">1 mese</option><option value="3">3 mesi</option><option value="6">6 mesi</option><option value="12">1 anno</option></select></label></div><button v-for="row in filteredHistory" :key="row.id" class="lf-p360-sheet" @click="openHistory(row.id)"><span class="lf-p360-sheet-copy"><b>{{row.sheetTitle}}</b><small>{{displayDate(row.performedOn)}} · {{row.exercises.filter(e=>!e.skipped&&e.sets.length).length}} esercizi registrati</small></span><span class="lf-p360-arrow">›</span></button><p v-if="!filteredHistory.length" class="muted small">Nessun allenamento con questi filtri.</p><button v-if="rawSessions.length>=pageSize" class="secondary wide" :disabled="progressLoading" @click="loadOlder">{{progressLoading?'Caricamento…':'Carica allenamenti più vecchi'}}</button></section>
   </template>
   <template v-if="tab==='review'"><section class="panel lf-p360-card"><h2>Revisione programma</h2><p v-if="revisionError" class="notice lf-p360-error" role="alert">{{revisionError}}</p><template v-if="role==='athlete'"><label class="lf-p360-field-label">Scheda<select v-model="revisionSheet"><option value="">Seleziona scheda</option><option v-for="s in sheets" :key="s.id" :value="s.id">{{s.title}}</option></select></label><label class="lf-p360-field-label">Motivo<select v-model="revisionReason"><option>Disponibilità</option><option>Attrezzatura</option><option>Difficoltà</option><option>Altro</option></select></label><label class="lf-p360-field-label">Descrizione<textarea v-model="revisionNotes" maxlength="1000" rows="4"/></label><button type="button" class="primary wide" :disabled="busy||!canWrite||!!revisionError&&revisionError.startsWith('Richieste non disponibili')||!revisionSheet||!revisionNotes.trim()" @click="sendRevision">Invia richiesta</button></template><div v-for="r in revisions" :key="r.id" class="lf-p12-detail-exercise"><b>{{r.sheetTitle}} · {{revisionLabels[r.status]}}</b><p>{{r.reason}} — {{r.notes}}</p><button v-if="role==='coach'&&r.status!=='completed'" class="secondary" :disabled="busy||!canManageGoals" @click="updateRevision(r,r.status==='pending'?'working':'completed')">{{r.status==='pending'?'Prendi in carico':'Completa'}}</button></div><p v-if="!revisions.length" class="muted">Nessuna richiesta.</p></section></template>
   <template v-if="tab==='report'"><section class="panel lf-p360-card"><h2>Report allenamenti · Stampa / PDF</h2><p class="muted small">Include le registrazioni disponibili caricate nello storico. Le foto sono facoltative e non selezionate inizialmente.</p><div class="lf-p360-line-filters"><label>Da<input type="date" v-model="reportFrom"/></label><label>A<input type="date" v-model="reportTo"/></label></div><label class="lf-p360-field-label">Osservazioni nel report<textarea v-model="reportNotes" maxlength="1000" rows="3"/></label><template v-if="role==='athlete'&&reportPhotos.length&&online"><details><summary>Includi foto (facoltativo, massimo 4)</summary><label v-for="row in reportPhotos" :key="row.p.storagePath" class="lf-p360-archived-toggle"><input type="checkbox" v-model="reportPhotoPaths" :value="row.p.storagePath" :disabled="reportPhotoPaths.length>=4&&!reportPhotoPaths.includes(row.p.storagePath)"/>{{displayDate(row.date)}} · {{sideLabel(row.p.side)}}</label></details></template><p>{{reportRows.length}} allenamenti disponibili nel periodo.</p><p v-if="rawSessions.length>=pageSize" class="muted small">Lo storico può contenere dati più vecchi: caricali prima di esportare un periodo completo.</p><p v-if="correctionError" class="muted small">{{correctionError}}</p><button v-if="rawSessions.length>=pageSize" class="secondary wide" :disabled="progressLoading" @click="loadOlder">Carica dati precedenti</button><button class="primary wide" :disabled="reportBusy||!reportRows.length||(reportFrom!==''&&reportTo!==''&&reportFrom>reportTo)" @click="printReport">Stampa / salva PDF</button></section></template>
   <template v-if="tab==='trend'">
    <div class="lf-p360-stat-grid"><div class="lf-p360-stat"><span>ALLENAMENTI</span><strong>{{totalSessions}}</strong></div><div class="lf-p360-stat"><span>ESERCIZI REGISTRATI</span><strong>{{uniqueRecords}}</strong></div><div class="lf-p360-stat"><span>SCHEDE DISPONIBILI</span><strong>{{sheets.length}}</strong></div></div>
    <section class="panel lf-p360-card"><div class="row between"><h2>Andamento</h2><span class="pill">{{sessions.length}} sessioni</span></div><p class="muted small">Scegli una scheda e un esercizio per visualizzare l'andamento.</p><p v-if="correctionError" class="muted small">{{correctionError}}</p><button v-if="rawSessions.length>=pageSize" class="secondary" :disabled="progressLoading" @click="loadOlder">Carica allenamenti più vecchi</button>
      <select v-model="historySheetId" aria-label="Scheda storico"><option value="" disabled>Seleziona scheda</option><option v-for="s in historicalSheets" :key="s.id" :value="s.id">{{s.title}}</option></select>
      <select v-if="selectedHistoryExercises.length" v-model="historyKey" aria-label="Esercizio storico"><option value="" disabled>Seleziona esercizio</option><option v-for="(e,i) in selectedHistoryExercises" :key="e.key" :value="e.key">{{e.name}}</option></select>
      <button class="secondary" @click="advanced=!advanced;metric='kg'">{{advanced?'Nascondi indicatori avanzati':'Indicatori avanzati'}}</button><div v-if="advanced" class="lf-p360-filters"><button v-for="m in ([['kg','Carico'],['volume','Volume'],['estimate','Stima 1RM']] as const)" :key="m[0]" :class="{on:metric===m[0]}" @click="metric=m[0]">{{m[1]}}</button></div>
      <div class="lf-p360-line-filters"><label>Ripetizioni <select v-model="repFilter"><option value="all">Tutte</option><option v-for="n in availableReps" :key="n" :value="String(n)">{{n}} rip.</option></select></label><label>Periodo <select v-model="period"><option value="all">Tutto</option><option value="1">1 mese</option><option value="3">3 mesi</option><option value="6">6 mesi</option><option value="12">1 anno</option></select></label></div>
      <div v-if="currentPoints.length" class="lf-p360-graph"><svg viewBox="0 0 100 106" preserveAspectRatio="none" role="group" :aria-label="`Andamento ${selectedHistoryEx?.name||'esercizio'}`"><path d="M6 15 H94 M6 49 H94 M6 88 H94" fill="none" stroke="currentColor" stroke-width=".3" opacity=".18"/><path :d="chartStroke" fill="none" stroke="#2fe38c" stroke-width="2.0" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle v-for="(p,i) in currentPoints" :key="i" :cx="currentPoints.length===1?50:7+i*86/(currentPoints.length-1)" :cy="90-(p.y-chartMin)/(chartMax-chartMin||1)*76" r="2.4" fill="#76ffc0" style="cursor:pointer" :aria-label="displayDate(p.x)+' · '+formatKg(p.y)" role="button" tabindex="0" @click="openHistory(p.id)" @keydown.enter="openHistory(p.id)" @keydown.space.prevent="openHistory(p.id)"/></svg><div v-if="currentPoints.length===1" class="muted small">Prima registrazione</div><div class="lf-p360-graph-caption"><span>{{displayDate(currentPoints[0].x)}}</span><span>{{displayDate(currentPoints[currentPoints.length-1].x)}}</span></div><div class="row between"><small class="muted">Prima: {{formatKg(currentPoints[0].y)}}</small><b>Ultima: {{formatKg(currentPoints[currentPoints.length-1].y)}}</b></div></div>
      <p v-else class="muted small lf-p360-empty">Nessuna registrazione confrontabile con questi filtri. Non vengono inventati punti intermedi.</p><p v-if="metric==='estimate'" class="muted small">1RM stimato (formula indicativa per serie fino a 10 ripetizioni): non è un massimale realmente sollevato.</p>
    </section>
    <section v-if="advanced" class="panel lf-p360-card"><h2>Andamento generale della scheda</h2>
     <div class="lf-p360-filters"><button v-for="g in ([['volume','Volume'],['completion','Completamento'],['performance','Indice prestazioni']] as const)" :key="g[0]" :class="{on:sheetGraph===g[0]}" @click="sheetGraph=g[0]">{{g[1]}}</button></div>
     <div v-if="sheetGraphPoints.length" class="lf-p360-graph"><svg viewBox="0 0 100 106" preserveAspectRatio="none" role="img" aria-label="Grafico generale della scheda"><path d="M6 15 H94 M6 49 H94 M6 88 H94" fill="none" stroke="currentColor" stroke-width=".3" opacity=".18"/><path :d="sheetGraphPath" fill="none" stroke="#2fe38c" stroke-width="2" vector-effect="non-scaling-stroke"/><circle v-for="(p,i) in sheetGraphPoints" :key="i" :cx="sheetGraphPoints.length===1?50:7+i*86/(sheetGraphPoints.length-1)" :cy="90-(p.y-sheetGraphMin)/(sheetGraphMax-sheetGraphMin||1)*76" r="2.4" fill="#76ffc0" style="cursor:pointer" :aria-label="displayDate(p.x)" role="button" tabindex="0" @click="openHistory(p.id)" @keydown.enter="openHistory(p.id)" @keydown.space.prevent="openHistory(p.id)"/></svg><div class="lf-p360-graph-caption"><span>{{displayDate(sheetGraphPoints[0].x)}}</span><span>{{displayDate(sheetGraphPoints[sheetGraphPoints.length-1].x)}}</span></div></div>
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
      <template v-if="role==='athlete'"><div class="lf-p360-date"><label for="lf-p360-checkdate">Data check</label><input id="lf-p360-checkdate" v-model="checkDate" type="date" :max="localDate()"/></div><div class="lf-p360-photo-grid"><label v-for="side in checkSides.map(s=>[s.id,s.label] as const)" :key="side[0]" class="lf-p360-photo-select"><span>▧</span><strong>{{side[1]}}</strong><small>{{cleanFile(selectedPhotos[side[0]])||'＋ Aggiungi'}}</small><input type="file" accept="image/*,.heic,.heif,.avif,.bmp,.tif,.tiff" :disabled="busy" @change="chooseFile(side[0],$event)"/></label></div><label class="lf-p360-field-label">Note facoltative <textarea v-model="checkNotes" maxlength="500" rows="2" placeholder="Come ti senti, dettagli utili…"/></label><p v-if="photoStatus" class="muted small lf-p360-photo-status" role="status">{{photoStatus}}</p><p class="muted small">Formati comuni e HEIC/HEIF supportati dove decodificabili. Le fotografie originali non vengono caricate; la compressione può ridurre leggermente i dettagli. HEIC può richiedere internet per il convertitore.</p><button class="primary lf-p360-main-button" :disabled="!canWrite||busy||!online" @click="saveCheck">{{busy?'Ottimizzazione e caricamento…':'＋ Salva nuovo check'}}</button><p v-if="!canWrite" class="muted small">Upload disponibile soltanto quando le regole Firebase Progressi saranno autorizzate.</p></template>
     <p v-else class="muted small">Consultazione Coach: puoi vedere soltanto i check fotografici condivisi esplicitamente dall'Atleta.</p>
    </section>
    <CheckComparison v-if="role==='athlete'||(shareEnabled&&shareReady)" :checks="sharedChecks" :scope="photoScope"/><section class="panel lf-p360-card"><h2>I check precedenti</h2><div v-for="c in checks" :key="c.id" class="lf-p360-check-row"><strong>{{displayDate(c.performedOn)}}</strong><span class="muted small">{{c.photos.length}} foto</span><p v-if="c.notes" class="muted small">{{c.notes}}</p><button v-if="role==='athlete'&&shareEnabled&&shareReady" class="secondary" :disabled="busy||!online" @click="toggleShare(c)">{{shareIds.includes(c.id)?'Revoca condivisione Coach':'Condividi con i Coach'}}</button><div v-if="role==='athlete'||(shareEnabled&&shareReady&&shareIds.includes(c.id))" class="lf-p360-photo-grid"><div v-for="p in c.photos" :key="p.storagePath"><button class="secondary" type="button" @click="showCheckPhoto(p)">{{sideLabel(p.side)}} · Visualizza</button><img v-if="photoUrls[p.storagePath]" :src="photoUrls[p.storagePath]" :alt="sideLabel(p.side)"/></div></div></div><p v-if="!checks.length" class="muted small">Nessun check ancora registrato.</p></section>
   </template>
  </template>
  <RouterLink v-if="role==='coach'" to="/coach/atleti" class="secondary lf-p360-back-link">← Gestione Atleti</RouterLink>
 </section>
</template>
