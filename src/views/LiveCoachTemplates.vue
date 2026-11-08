<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Archivio Coach operativo LIVE/STAGING: ruoli verificati con Firebase Auth
 * e mutazioni protette da mayWriteLive() e dalle Rules Firestore. */
import {computed,onMounted,onUnmounted,ref,shallowRef,watch} from 'vue'
import {useRoute,useRouter,RouterLink} from 'vue-router'
import {onAuthStateChanged} from 'firebase/auth'
import {collection,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore'
import {readStagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {labCoachRoster,maySelectLabAthlete,type RosterAthlete} from '../features/athletes/liveCoachRoster'
import {verifyCoachEditor,verifyCoachArchiveEditor,canManageCoachModel} from '../features/coach/liveCoachPolicy'
import {createCoachModel,createCoachPersonal,updateCoachModel,updateCoachPersonal} from '../integrations/firestore/liveCoachOperations'
import {assignShared,assignSharedToDay,restoreFromTrash,trashShared,watchAthleteSheets} from '../integrations/firestore/sheets'
import {updateV1WeekSlot} from '../integrations/firestore/liveWeekSlots'
import {belongsToCoach,hasCoachAssignment,type CoachRosterFilter} from '../features/athletes/coachMembership'
import {editorToV1,v1ToEditor} from '../features/sheets/v1ExerciseCodec'
import {supersetView} from '../features/sheets/supersetView'
import {groupExerciseRows,primaryExerciseCount,ensurePrimaryExerciseCount,insertSuperset,removeExercise} from '../features/sheets/supersetEditor'
import {loadCatalog,rankedExercises,searchKey,exactCatalogMatches,type CatalogExercise} from '../features/exercises/catalog'
import ExerciseMotion from '../components/ExerciseMotion.vue'
import {DAY_KEYS} from '../features/sheets/domain'
import {readLegacyExerciseCatalog} from '../integrations/firestore/legacyExerciseCatalog'
import type {Exercise,Sheet} from '../model'
import {newId} from '../model'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import type {Personal} from '../features/sheets/domain'
import SheetDetail from '../components/SheetDetail.vue'

type Model = Sheet & {createdBy:string;revision:number;createdMs:number}
const route=useRoute(),router=useRouter()
const session=shallowRef<StagingSession|null>(null)
const models=ref<Model[]>([]),roster=ref<RosterAthlete[]>([]),athleteId=ref('')
const pickAssign=shallowRef<Model|null>(null)
const coachFilter=ref<CoachRosterFilter>('tutti')
const assignSearch=ref('')
let coachFilterInitialized=false
const visibleRoster=computed(()=>roster.value.filter(a=>belongsToCoach(a,session.value?.uid||'',coachFilter.value)))
const searchedRoster=computed(()=>visibleRoster.value.filter(a=>a.name.toLocaleLowerCase('it').includes(assignSearch.value.trim().toLocaleLowerCase('it'))))
const hasAnyMembership=computed(()=>roster.value.some(a=>hasCoachAssignment(a)))
function linkIntent():{weekId:string;day:number;slot:1|2;expected:string}|null{
 const w=route.query.weekId,d=route.query.day,s=route.query.slot,ath=route.query.athleteId
 if(typeof w!=='string'||typeof d!=='string'||typeof s!=='string'||typeof ath!=='string'||ath!==athleteId.value)return null
 const day=Number(d),slot=Number(s)
 if(!w||w.includes('/')||!Number.isInteger(day)||day<0||day>6||(slot!==1&&slot!==2))return null
 return {weekId:w,day,slot:slot as 1|2,expected:typeof route.query.expectedSlotId==='string'?route.query.expectedSlotId:''}
}
const personal=ref<Personal[]>([]),error=ref(''),notice=ref(''),loading=ref(true),busy=ref(false)
const editing=ref(false),editingId=ref(''),revision=ref(0),isPersonal=ref(false)
const saveAlsoShared=ref(false),pendingSharedLink=ref('')
const personalEdit=ref(false),draftNameNotice=ref('')
const title=ref(''),category=ref('Allenamento'),exercises=ref<Exercise[]>([])
const search=ref(''),sort=ref('recent'),filter=ref<'active'|'trash'|'all'>('active'),preview=shallowRef<Model|null>(null)
const exerciseCounter=ref('0'),focusedExerciseName=ref('')
const catalog=ref<CatalogExercise[]>([])
const supersetBadges=computed(()=>supersetView(exercises.value))
const supersetCount=computed(()=>supersetBadges.value.filter(x=>x?.position==='second').length)
const exerciseGroups=computed(()=>groupExerciseRows(exercises.value))
const suggest=computed(()=>focusedExerciseName.value.trim()?rankedExercises(catalog.value,focusedExerciseName.value,'',14):[])
const availableMax=computed(()=>250-exercises.value.length)
const catalogForRow=(e:Exercise):CatalogExercise|null=>{if(e.exerciseId||e.catalogId)return catalog.value.find(c=>c.id===(e.exerciseId||e.catalogId))||null;const matches=exactCatalogMatches(catalog.value,e.name);return matches.length===1?matches[0]:null}
function onEditedNameInput(e:Exercise){
 const matches=exactCatalogMatches(catalog.value,e.name)
 const found=matches.length===1?matches[0]:null
 // Prevent preserving a stale foreign exerciseId after manual rename.
 e.exerciseId=found?.id||'';e.catalogId=found?.id||''
}

function blankExercise():Exercise{return {id:newId(),name:'',sets:'',reps:'',load:'',rest:'',notes:'',exerciseId:'',catalogId:'',supersetWithPrevious:false,supersetRest:'',executionMode:'normale'}}
function alignCount(){exerciseCounter.value=String(primaryExerciseCount(exercises.value))}
function onExerciseCountInput(event:Event){
 const raw=(event.target as HTMLInputElement).value.trim()
 exerciseCounter.value=raw
 if(!/^\d{1,3}$/.test(raw))return
 const requested=Number(raw)
 if(requested>250){notice.value='Massimo 250 righe totali, comprese le coppie in superset.';return}
 const current=primaryExerciseCount(exercises.value)
 if(requested>current){
  exercises.value=ensurePrimaryExerciseCount(exercises.value,requested,blankExercise)
  alignCount()
  if(primaryExerciseCount(exercises.value)<requested)notice.value='Limite di 250 righe totali raggiunto.'
  else notice.value=''
 }
 // Smaller numbers are never interpreted as requests to delete existing data.
}
function onExerciseCountBlur(){alignCount()}
function addLinkedSuperset(e:Exercise){
 if(availableMax.value<1){notice.value='Massimo 250 esercizi totali raggiunto.';return}
 exercises.value=insertSuperset(exercises.value,e.id,blankExercise)
 alignCount();notice.value=''
}
function removeExerciseNow(e:Exercise){exercises.value=removeExercise(exercises.value,e.id);alignCount();notice.value=''}
function selectCatalogId(e:Exercise,event:Event){const id=(event.target as HTMLSelectElement).value;e.exerciseId=id;e.catalogId=id}
/** Muove un gruppo intero: le coppie superset restano contigue e l'ID non cambia. */
function moveExerciseGroup(groupNumber:number,direction:-1|1){
 const groups=exerciseGroups.value
 const target=groupNumber+direction
 if(target<0||target>=groups.length)return
 const group=groups[groupNumber],other=groups[target]
 const first=exercises.value.slice(group.primaryIndex,(group.secondaryIndex??group.primaryIndex)+1)
 const second=exercises.value.slice(other.primaryIndex,(other.secondaryIndex??other.primaryIndex)+1)
 const start=Math.min(group.primaryIndex,other.primaryIndex)
 const end=Math.max(group.secondaryIndex??group.primaryIndex,other.secondaryIndex??other.primaryIndex)+1
 const ordered=direction===1?[second,first]:[first,second]
 exercises.value=[...exercises.value.slice(0,start),...ordered.flat(),...exercises.value.slice(end)]
}

const currentAthlete=computed(()=>visibleRoster.value.find(a=>a.id===athleteId.value)??null)
const writable=computed(()=>mayWriteLive() && !!session.value && ['titolare','collaboratore'].includes(session.value.role))
const activeCount=computed(()=>models.value.filter(s=>!s.deletedAt).length)
const choice=computed(()=>models.value.filter(s=>(filter.value==='all'||(filter.value==='trash'?!!s.deletedAt:!s.deletedAt)) &&
 `${s.title} ${s.category} ${s.exercises.map(e=>e.name).join(' ')}`.toLowerCase().includes(search.value.toLowerCase()))
 .slice().sort((a,b)=>sort.value==='az'?a.title.localeCompare(b.title,'it'):sort.value==='za'?b.title.localeCompare(a.title,'it'):sort.value==='more'?b.exercises.length-a.exercises.length:b.createdMs-a.createdMs))
const lastOwnEditable=computed(()=>editingId.value && models.value.find(x=>x.id===editingId.value))
let live=true,stopModels:Unsubscribe|null=null,stopUsers:Unsubscribe|null=null,stopPersonal:Unsubscribe|null=null,stopAuth:Unsubscribe|null=null
const closeListeners=()=>{stopModels?.();stopModels=null;stopUsers?.();stopUsers=null;stopPersonal?.();stopPersonal=null;stopAuth?.();stopAuth=null}
watch(athleteId,()=>{stopPersonal?.();stopPersonal=null;personal.value=[]
 if(!session.value||!maySelectLabAthlete(roster.value,session.value.gymId,athleteId.value))return
 const {db}=getStagingClients(),s=session.value,id=athleteId.value
 stopPersonal=watchAthleteSheets(db,s.gymId,id,sheets=>{if(live && athleteId.value===id)personal.value=sheets.personal},e=>{if(live)error.value=`Schede personali non leggibili: ${e.message}`})
})
function beginPersonal(){isPersonal.value=true;personalEdit.value=false;saveAlsoShared.value=!!linkIntent();editing.value=true;editingId.value='';revision.value=0;title.value='';category.value='Personalizzata';exercises.value=[];alignCount();notice.value=''}
function beginEditPersonal(sheet:Personal){
 if(!session.value||!currentAthlete.value||sheet.deletedAt)return
 isPersonal.value=true;personalEdit.value=true;saveAlsoShared.value=false;editing.value=true;editingId.value=sheet.id;
 // Legacy personal records have no revision; watchAthleteSheets exposes it when present.
 revision.value=Number((sheet as Personal & {revision?:number}).revision||0)
 title.value=sheet.title;category.value=sheet.category;exercises.value=v1ToEditor(sheet.exercises);alignCount();notice.value='La copia storica non viene mai modificata.'
}
watch(personal,rows=>{const id=route.query.editPersonalId;if(typeof id!=='string'||editing.value)return;const sheet=rows.find(r=>r.id===id&&!r.deletedAt);if(sheet)beginEditPersonal(sheet)})
function beginModel(){isPersonal.value=false;personalEdit.value=false;editing.value=true;editingId.value='';revision.value=0;title.value='';category.value='Allenamento';exercises.value=[];alignCount();notice.value=''}
function edit(s:Model){
 if(!session.value||!canManageCoachModel(s.id,session.value.role)||s.deletedAt){notice.value='Modello non attivo o Coach non autorizzato.';return}
 isPersonal.value=false;personalEdit.value=false;editing.value=true;editingId.value=s.id;revision.value=s.revision;title.value=s.title;category.value=s.category
 exercises.value=v1ToEditor(s.exercises).map(e=>({...e,rest:e.rest||e.notes||'',executionMode:e.supersetWithPrevious?'superset':'normale'}))
 alignCount();notice.value=''
}
async function runWrite(label:string,fn:(ctx:{gym:string;uid:string;athlete:string})=>Promise<void>,requireAthlete=false){
 if(busy.value)return
 if(!mayWriteLive()){notice.value='Modifiche temporaneamente disabilitate: puoi consultare l’archivio.';return}
 busy.value=true;notice.value=''
 const selected=currentAthlete.value,s=session.value
 try{
  // La pressione del pulsante e il consenso esplicito all’operazione: niente doppia spunta.
  // L’identità Coach, l’atleta e le Rules Firebase restano obbligatori.
  if(requireAthlete)verifyCoachEditor(s,selected,true)
  else verifyCoachArchiveEditor(s,true)
  const ctx={gym:s.gymId,uid:s.uid,athlete:selected?.id||''}
  await fn(ctx)
  if(live)notice.value=`${label}: operazione completata. Le schede e lo storico sono conservati.`
 }catch(e){if(live)notice.value=`${label}: ${e instanceof Error?e.message:String(e)}`}
 finally{busy.value=false}
}
/** Retry the already-created shared template; NEVER create a second model ID. */
async function retryPendingLink(){
 const id=pendingSharedLink.value,intent=linkIntent(),s=session.value,a=currentAthlete.value
 if(!id||!s||!a){notice.value='Contesto scaduto: ritrova la scheda nell Archivio e assegnala manualmente.';return}
 await runWrite('Riprendi collegamento',async({gym,uid,athlete})=>{
  const {db}=getStagingClients()
  if(intent)await assignSharedToDay(db,gym,athlete,id,uid,intent.weekId,DAY_KEYS[intent.day],intent.slot,intent.expected)
  else await assignShared(db,gym,athlete,id,uid)
  pendingSharedLink.value=''
  editing.value=false
  await router.push({path:'/coach/atleti',query:{athleteId:athlete,...(intent?{weekId:intent.weekId}:{})}})
 },true)
}
async function save(){
 if(!editing.value)return
 // All rows are edited in place; no hidden unsaved draft exercise exists.
 let rows
 try{rows=editorToV1(exercises.value)}catch(e){notice.value=e instanceof Error?e.message:String(e);return}
 const wasPersonal=isPersonal.value,wasId=editingId.value,wasPersonalEdit=personalEdit.value,rev=revision.value,name=title.value,cat=category.value
 await runWrite(wasPersonal?'Salva scheda personale':wasId?'Modifica modello':'Crea modello',async({gym,uid,athlete})=>{
  const{db}=getStagingClients(),intent=linkIntent()
  if(wasPersonalEdit){
   await updateCoachPersonal(db,gym,athlete,uid,wasId,rev,name,cat,rows)
  }else if(wasPersonal && (saveAlsoShared.value||intent)){
   // The model is created only once. If the next transaction fails, hold the
   // model ID and make retry an explicit user action, NEVER rerun create.
   const id=await createCoachModel(db,gym,uid,name,cat,rows)
   pendingSharedLink.value=id
   if(intent){
    await assignSharedToDay(db,gym,athlete,id,uid,intent.weekId,DAY_KEYS[intent.day],intent.slot,intent.expected)
   }else{
    await assignShared(db,gym,athlete,id,uid)
   }
   pendingSharedLink.value=''
  }else if(wasPersonal){
   await createCoachPersonal(db,gym,athlete,uid,name,cat,rows)
  }else if(wasId)await updateCoachModel(db,gym,uid,wasId,rev,name,cat,rows)
  else await createCoachModel(db,gym,uid,name,cat,rows)
  editing.value=false;editingId.value='';exercises.value=[];title.value='';personalEdit.value=false
  if(intent && wasPersonal)await router.push({path:'/coach/atleti',query:{athleteId:athlete,weekId:intent.weekId}})
 },wasPersonal)
}
function openAssign(s:Model){
 if(s.deletedAt)return
 pickAssign.value=s
 assignSearch.value=''
 const fromRoute=typeof route.query.athleteId==='string'?route.query.athleteId:''
 if(!currentAthlete.value)athleteId.value=roster.value.some(a=>a.id===fromRoute)?fromRoute:''
}
async function assign(s:Model){
 if(s.deletedAt||!currentAthlete.value){notice.value='Seleziona un atleta prima di assegnare.';return}
 if(personal.value.some(p=>p.id===s.id&&p.deletedAt)) {notice.value='Scheda personale nel cestino: ripristinala prima di assegnarla.';return}
 await runWrite('Assegna modello',async({gym,uid,athlete})=>{
  const{db}=getStagingClients(),intent=linkIntent()
  const result=intent?await assignSharedToDay(db,gym,athlete,s.id,uid,intent.weekId,DAY_KEYS[intent.day],intent.slot,intent.expected):await assignShared(db,gym,athlete,s.id,uid)
  if(result==='existing')notice.value='Scheda già assegnata con lo stesso ID.'
  pickAssign.value=null
  if(intent)await router.push({path:'/coach/atleti',query:{athleteId:athlete,weekId:intent.weekId}})
 },true)
}

/** Duplica apre soltanto una bozza: nessun nuovo documento Firestore finché non si salva. */
function duplicate(s:Model){
 if(s.deletedAt){notice.value='Non si duplica un modello cestinato.';return}
 isPersonal.value=false;editing.value=true;editingId.value='';revision.value=0
 title.value=s.title+' (copia)';category.value=s.category
 exercises.value=v1ToEditor(s.exercises).map(e=>({...e,id:newId()}))
 alignCount()
 notice.value='Copia in bozza: nessuna scheda verrà creata prima di SALVA NELL’ARCHIVIO SCHEDE.'
}
async function trash(s:Model){
 if(!session.value || !canManageCoachModel(s.id,session.value.role)){notice.value='Cestino: accesso Coach non autorizzato.';return}
 if(!window.confirm(`Spostare nel cestino il modello «${s.title}»? Le schede assegnate e gli archivi degli atleti restano intatti.`))return
 await runWrite('Cestina modello',async({gym,uid})=>{const{db}=getStagingClients();await trashShared(db,gym,s.id,uid)})
}
async function restore(s:Model){
 if(!session.value||!canManageCoachModel(s.id,session.value.role)){notice.value='Ripristino: accesso Coach non autorizzato.';return}
 await runWrite('Ripristina modello',async({gym,uid})=>{const{db}=getStagingClients();await restoreFromTrash(db,gym,'shared',s.id,uid)})
}
onMounted(async()=>{
 try{
  const verified=await readStagingSession();if(!live)return
  if(!['titolare','collaboratore'].includes(verified.role)||!verified.gymId||verified.gymId.includes('/')||verified.gymId.startsWith('demo-'))throw new Error('Accesso Coach non autorizzato.')
  session.value=verified
  const {db,auth}=getStagingClients()
  stopModels=onSnapshot(collection(db,'gyms',verified.gymId,'templates'),snap=>{
   if(!live)return
   models.value=snap.docs.map(d=>{const x=d.data();return {id:d.id,title:String(x.title||''),category:String(x.category||'Allenamento'),exercises:Array.isArray(x.exercises)?x.exercises:[],createdBy:String(x.createdBy||''),revision:Number(x.revision||0),createdMs:typeof x.createdAt?.toMillis==='function'?x.createdAt.toMillis():typeof x.updatedAt?.toMillis==='function'?x.updatedAt.toMillis():0,...(x.deletedAt?{deletedAt:String(x.deletedAt)}:{})} as Model})
  },e=>{if(live)error.value=`Archivio Coach non leggibile: ${e.message}`})
  stopUsers=onSnapshot(query(collection(db,'users'),where('gymId','==',verified.gymId),where('role','==','athlete')),snap=>{
   if(!live)return
   roster.value=labCoachRoster(snap.docs.map(d=>({id:d.id,data:d.data()})),verified.gymId)
   if(!coachFilterInitialized){coachFilterInitialized=true;if(roster.value.some(a=>a.primaryCoachUid===verified.uid))coachFilter.value='miei'}
   if(!maySelectLabAthlete(roster.value,verified.gymId,athleteId.value)){
    const requested=typeof route.query.athleteId==='string'?route.query.athleteId:''
    athleteId.value=roster.value.find(a=>a.id===requested)?.id||roster.value[0]?.id||''
   }
   loading.value=false
  },e=>{if(live){loading.value=false;error.value=`Elenco atleti non leggibile: ${e.message}`}})
  stopAuth=onAuthStateChanged(auth,u=>{if(!live)return;if(!u||u.uid!==verified.uid){closeListeners();void router.replace('/accesso')}})
  void loadCatalog(readLegacyExerciseCatalog).then(data=>{if(live)catalog.value=data}).catch(()=>{})
  if(route.query.mode==='personal' && typeof route.query.editPersonalId!=='string')beginPersonal()
 }catch(e){if(live){error.value=e instanceof Error?e.message:String(e);loading.value=false}}
})
onUnmounted(()=>{live=false;closeListeners()})
</script>
<template>
<div class="stack" style="gap:20px">
 <div class="notice coach-archive-guide" role="status"><strong>{{uiText("ARCHIVIO DEL COACH")}}</strong> {{uiText("· Gestisci le schede e assegnale tramite il pulsante della scheda.")}} <RouterLink :to="{path:'/coach/atleti',query:{...(athleteId?{athleteId}:{}),...(typeof route.query.weekId==='string'?{weekId:route.query.weekId}:{})}}">{{uiText("← Torna alla settimana dell’atleta")}}</RouterLink></div>
 <section class="panel"><div class="row between"><div><h2 class="card-heading">{{uiText("ARCHIVIO SCHEDE")}}</h2><p class="muted" style="margin:7px 0 0">{{uiText("CREA SCHEDE RIUTILIZZABILI E ASSEGNALE AI TUOI ATLETI")}}</p></div><button v-if="!editing" class="primary" :disabled="!writable||busy" @click="beginModel">{{uiText("＋ Crea nuova scheda dell'archivio")}}</button></div></section>
 <p v-if="error" class="notice" role="alert">{{error}}</p>
 <p v-if="loading" class="muted">{{uiText("Verifica del Coach e lettura degli archivi…")}}</p>
 <section v-if="!loading && session && (!writable || notice)" class="panel">
  <p v-if="!writable" class="notice">{{uiText("Le modifiche sono temporaneamente disabilitate. Puoi consultare le schede.")}}</p>
  <p v-if="notice" class="notice" role="status">{{notice}}</p>
 </section>
 <section v-if="editing && !loading && session" class="panel lf-editor-panel">
  <div class="lf-editor-heading">
   <div><span class="lf-editor-kicker">{{uiText("LION FIT · EDITOR COACH")}}</span><h2>{{isPersonal?(personalEdit?'MODIFICA SCHEDA PERSONALE':'CREA SCHEDA PERSONALE'):editingId?'MODIFICA SCHEDA DELL’ARCHIVIO':'CREA NUOVA SCHEDA DELL’ARCHIVIO'}}</h2></div>
   <button class="secondary" type="button" @click="editing=false">{{uiText("← Torna all'archivio")}}</button>
  </div>
  <div class="lf-editor-metadata">
   <label>{{uiText("Nome scheda")}}<input v-model="title" maxlength="200" placeholder="Es. Potenza Esplosiva 1, Ipertrofia A"/></label>
   <label>{{uiText("Categoria")}}<input v-model="category" maxlength="100" placeholder="Allenamento"/></label>
   <label class="lf-count-field">{{uiText("Esercizi principali")}}<input :value="exerciseCounter" type="number" inputmode="numeric" min="0" max="250" step="1" aria-label="Numero esercizi principali" @input="onExerciseCountInput" @blur="onExerciseCountBlur"/></label>
  </div>
  <div class="lf-editor-list-head">
   <strong>{{uiText("ESERCIZI DELLA SCHEDA")}}</strong>
   <span>{{exerciseGroups.length}} {{uiText("esercizi ·")}} {{supersetCount}} {{uiText("superset ·")}} {{exercises.length}} {{uiText("righe")}}</span>
  </div>
  <p class="muted small lf-editor-hint">{{uiText("Aumentando il numero si aggiungono righe vuote; diminuendolo non elimini esercizi già compilati. Le note tecniche delle schede condivise non devono contenere dati sanitari.")}}</p>
  <datalist id="lf-superset-exercise-names"><option v-for="item in suggest" :key="item.id" :value="item.name_it||item.name">{{item.name}}</option></datalist>
  <div class="lf-editor-groups">
   <div v-for="(group,groupNumber) in exerciseGroups" :key="exercises[group.primaryIndex].id" class="lf-exercise-group" :class="{'lf-has-superset':group.secondaryIndex!==null}">
    <div class="lf-exercise-group-head">
     <span class="lf-group-number">{{groupNumber+1}}</span>
     <strong>{{group.secondaryIndex!==null?'COPPIA SUPERSET':'ESERCIZIO'}}</strong>
     <span v-if="group.secondaryIndex!==null" class="lf-pair-pill">A + B</span>
     <div class="lf-group-reorder">
      <button type="button" class="lf-mini-button" :disabled="groupNumber===0" :aria-label="'Sposta esercizio '+(groupNumber+1)+' su'" @click="moveExerciseGroup(groupNumber,-1)">↑</button>
      <button type="button" class="lf-mini-button" :disabled="groupNumber===exerciseGroups.length-1" :aria-label="'Sposta esercizio '+(groupNumber+1)+' giù'" @click="moveExerciseGroup(groupNumber,1)">↓</button>
     </div>
    </div>
    <div v-for="(index,part) in (group.secondaryIndex===null?[group.primaryIndex]:[group.primaryIndex,group.secondaryIndex])" :key="exercises[index].id" class="lf-exercise-editor" :class="{'lf-superset-secondary':part===1}">
     <div v-if="part===1" class="lf-pair-line" aria-hidden="true">↳ B</div>
     <span v-else-if="group.secondaryIndex!==null" class="lf-pair-line" aria-hidden="true">A</span>
     <div class="lf-editor-motion"><ExerciseMotion v-if="catalogForRow(exercises[index])" :exercise="catalogForRow(exercises[index])!"/><span v-else class="lf-editor-motion-fallback" aria-hidden="true">✚</span></div>
     <label class="lf-editor-exercise-name">{{uiText("Esercizio")}}<input v-model="exercises[index].name" list="lf-superset-exercise-names" placeholder="Cerca o scrivi esercizio…" autocomplete="off" @focus="focusedExerciseName=exercises[index].name" @input="onEditedNameInput(exercises[index]);focusedExerciseName=exercises[index].name"/></label>
     <label class="lf-editor-short">{{uiText("Serie")}}<input v-model="exercises[index].sets" inputmode="numeric" placeholder="—"/></label>
     <label class="lf-editor-short">{{uiText("Ripetizioni")}}<input v-model="exercises[index].reps" placeholder="—"/></label>
     <label class="lf-editor-load">{{uiText("Carico / intensità")}}<input v-model="exercises[index].load" placeholder="—"/></label>
     <label class="lf-editor-rest">{{uiText("Recupero / note")}}<input v-model="exercises[index].rest" placeholder="—"/></label>
     <button type="button" class="lf-exercise-remove" :aria-label="'Elimina '+(part===1?'superset':'esercizio')+' '+exercises[index].name" title="Rimuovi questa riga" @click="removeExerciseNow(exercises[index])">✕</button>
     <div v-if="exactCatalogMatches(catalog,exercises[index].name).length>1" class="lf-editor-disambiguation"><label>{{uiText("Nome ambiguo: scegli l'esercizio corretto")}}<select :value="exercises[index].exerciseId||''" @change="selectCatalogId(exercises[index],$event)"><option value="">{{uiText("Nessuna illustrazione selezionata")}}</option><option v-for="candidate in exactCatalogMatches(catalog,exercises[index].name)" :key="candidate.id" :value="candidate.id">{{candidate.name_it||candidate.name}} · ID {{candidate.id}}</option></select></label></div>
     <label v-if="part===1" class="lf-editor-pair-rest">{{uiText("Recupero dopo la coppia")}}<input v-model="exercises[index].supersetRest" placeholder="Es. 90 sec"/></label>
    </div>
    <button v-if="group.secondaryIndex===null && availableMax>0" type="button" class="lf-superset-add" @click="addLinkedSuperset(exercises[group.primaryIndex])">{{uiText("＋ Aggiungi superset")}}</button>
   </div>
  </div>
  <p v-if="!exerciseGroups.length" class="muted small">{{uiText("Imposta il numero di esercizi principali per iniziare.")}}</p>
  <p v-if="notice" class="notice" role="alert">{{notice}}</p>
  <label v-if="isPersonal && !personalEdit && !linkIntent()" class="checkline"><input v-model="saveAlsoShared" type="checkbox"/> {{uiText("Salva anche nell’Archivio Coach e assegna allo stesso atleta (stesso ID)")}}</label>
  <p class="muted small" v-if="isPersonal">{{personalEdit?'Aggiorna solo la copia personale. La copia protetta resta immutabile.':linkIntent()?'Creazione dal giorno: il nuovo modello va anche in Archivio Coach, poi personale+protetta+giorno con lo stesso ID.':'La scheda personale mantiene una copia storica protetta immutabile.'}}</p>
  <p v-if="pendingSharedLink" class="notice" role="alert">{{uiText("Scheda creata con ID")}} {{pendingSharedLink}}{{uiText("; collegamento incompleto. Non premere di nuovo Salva: premi Riprendi collegamento.")}}</p>
  <button v-if="pendingSharedLink" class="secondary wide" :disabled="busy" @click="retryPendingLink">{{uiText("Riprendi collegamento senza creare duplicati")}}</button>
  <div class="lf-editor-actions"><button type="button" class="secondary" @click="editing=false">{{uiText("← Indietro")}}</button><button class="primary" :disabled="busy||!!pendingSharedLink||!writable||!title.trim()||!exercises.length" @click="save">{{isPersonal?(personalEdit?'SALVA MODIFICHE PERSONALI':'SALVA SCHEDA PERSONALE'):editingId?'SALVA MODIFICHE':'SALVA SCHEDA'}}</button></div>
 </section>
 <section v-else-if="!loading && session" class="panel">
  <div class="row between"><div><h2 class="card-heading">{{uiText("ARCHIVIO · SCHEDE")}}</h2><span class="muted small">{{choice.length}} {{uiText("di")}} {{activeCount}} {{uiText("schede attive nell'archivio")}}</span></div><button v-if="typeof route.query.athleteId==='string'" class="secondary" :disabled="!writable||busy" @click="beginPersonal">{{uiText("+ Crea scheda personale")}}</button></div>
  <div class="coach-archive-toolbar"><input v-model="search" type="search" placeholder="Cerca una scheda…" aria-label="Cerca una scheda"/><button class="secondary" @click="filter=filter==='trash'?'active':'trash'">{{filter==='trash'?'← Archivio schede':'Apri cestino'}}</button><select v-model="sort" aria-label="Ordina schede"><option value="recent">{{uiText("Più recenti")}}</option><option value="az">{{uiText("Nome A–Z")}}</option><option value="more">{{uiText("Più esercizi")}}</option></select></div>
  <div class="grid2"><div v-for="s in choice" :key="s.id" class="archive-card">
   <h3 style="margin:0">{{s.title}}</h3><p class="muted small">{{s.category}} · {{s.exercises.length}} {{uiText("esercizi ·")}} {{s.deletedAt?'Nel cestino':'Attivo'}}</p><p class="small">{{s.exercises.slice(0,2).map(x=>x.name).join(' · ')}}</p><div class="divider"/>
   <p v-if="personal.some(p=>p.id===s.id)" class="muted small">{{personal.find(p=>p.id===s.id)?.deletedAt?'Scheda personale nel cestino':'Già assegnato a questo atleta (riutilizzabile per il giorno)'}}</p>
   <div class="archive-actions"><button class="secondary" @click="preview=s">{{uiText("Visualizza")}}</button>
    <button v-if="!s.deletedAt" class="secondary" :disabled="!session||!canManageCoachModel(s.id,session.role)" @click="edit(s)">{{uiText("Modifica")}}</button>
    <button v-if="!s.deletedAt" class="secondary" :disabled="busy||!writable" @click="duplicate(s)">{{uiText("Duplica")}}</button>
    <button v-if="!s.deletedAt" class="primary" :disabled="busy||!writable" @click="openAssign(s)">{{uiText("Assegna")}}</button>
    <button v-if="!s.deletedAt" class="danger" :disabled="busy||!writable||!session||!canManageCoachModel(s.id,session.role)" @click="trash(s)">{{uiText("Nel Cestino")}}</button>
    <button v-if="s.deletedAt" class="secondary" :disabled="busy||!writable||!session||!canManageCoachModel(s.id,session.role)" @click="restore(s)">{{uiText("Ripristina")}}</button>
   </div>
  </div></div>
  <p v-if="!choice.length" class="muted">{{uiText("Nessuna scheda corrisponde ai filtri.")}}</p>
  <p class="notice">{{uiText("I modelli ROUNDONE vengono modificati mantenendo il loro ID. Ogni salvataggio verifica la revisione, inclusa la revisione iniziale 0 dei modelli legacy. Le copie storiche degli atleti non sono modificabili.")}}</p>
 </section>
 <div v-if="pickAssign" class="modal-overlay" @click.self="pickAssign=null"><div class="dialog coach-assign-dialog"><div class="row between"><h2>{{uiText("Assegna ·")}} {{pickAssign.title}}</h2><button class="bare" :aria-label="uiText('Chiudi')" @click="pickAssign=null">✕</button></div><p class="small muted">{{uiText("Scegli un atleta. I filtri raggruppano i coach ma non modificano le Rules pubblicate.")}}</p>
 <label>{{uiText("Visualizza atleti")}}<select v-model="coachFilter" aria-label="Filtra atleti per coach"><option value="miei">{{uiText("I miei")}}</option><option value="condivisi">{{uiText("Condivisi")}}</option><option value="tutti">{{uiText("Tutti")}}</option></select></label>
 <p v-if="!hasAnyMembership" class="small muted">{{uiText("Atleti storici senza assegnazione coach: disponibili in Tutti.")}}</p>
 <label class="lfp-search-label">{{uiText("Cerca atleta")}} <input class="lfp-inline-lookup" v-model="assignSearch" type="search" autocomplete="off" aria-label="Cerca atleta per nome" placeholder="Nome o cognome…"/></label><label>{{uiText("Atleta")}}<select v-model="athleteId" :disabled="busy"><option value="">{{uiText("Seleziona atleta…")}}</option><option v-for="a in searchedRoster" :key="a.id" :value="a.id">{{a.name}}</option></select></label><p v-if="!searchedRoster.length" class="muted small">{{uiText("Nessun atleta corrisponde alla ricerca nei filtri attivi.")}}</p><p v-if="currentAthlete&&personal.some(p=>p.id===pickAssign?.id)" class="notice">{{uiText("Scheda già assegnata a questo atleta.")}}</p><button class="primary wide" :disabled="busy||!writable||!currentAthlete||personal.some(p=>p.id===pickAssign?.id&&p.deletedAt)" @click="assign(pickAssign)">{{uiText("Assegna scheda")}}</button></div></div>
 <SheetDetail v-if="preview" :sheet="preview" @close="preview=null"/>
</div>
</template>

<style scoped>
/* PATCH 4: editor compatto, senza alterare il formato delle schede V1. */
.lf-editor-panel{--lf-editor-gap:8px;padding:18px!important}
.lf-editor-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--border)}
.lf-editor-heading h2{font-size:16px;margin:5px 0 0;line-height:1.25}
.lf-editor-kicker{font-size:9px;letter-spacing:.14em;color:var(--mint);font-weight:850}
.lf-editor-metadata{display:grid;grid-template-columns:minmax(0,2.3fr) minmax(140px,1fr) minmax(100px,.52fr);gap:10px;margin:12px 0}
.lf-editor-panel label{display:block;min-width:0;font-size:10px;font-weight:800;color:var(--muted);letter-spacing:.02em}
.lf-editor-panel input,.lf-editor-panel select{width:100%;min-width:0;margin:5px 0 0;height:35px;min-height:35px;padding:6px 9px;font-size:12px;border-radius:8px;color:var(--text);background:var(--field);border:1px solid var(--border)}
.lf-editor-panel input:focus-visible,.lf-editor-panel select:focus-visible{outline:2px solid var(--mint);outline-offset:1px}
.lf-count-field input{text-align:center;font-weight:850;border-color:var(--mint)}
.lf-editor-list-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px;font-size:11px}
.lf-editor-list-head span{font-size:10px;color:var(--muted)}
.lf-editor-hint{font-size:10px!important;line-height:1.35;margin:6px 0 8px}
.lf-editor-groups{display:grid;gap:8px}
.lf-exercise-group{border:1px solid var(--border);border-radius:11px;padding:8px;background:var(--card2);min-width:0;transition:border-color .15s ease}
.lf-exercise-group.lf-has-superset{border-color:var(--mint)}
.lf-exercise-group-head{display:flex;align-items:center;gap:8px;padding:0 2px 6px;min-height:25px;font-size:10px}
.lf-group-number{width:23px;height:23px;border:1px solid var(--mint);border-radius:50%;display:grid;place-items:center;color:var(--mint);font-size:11px;font-weight:800}
.lf-pair-pill{color:var(--mint);border:1px solid var(--mint);border-radius:7px;padding:2px 6px;font-size:9px}
.lf-group-reorder{margin-left:auto;display:flex;gap:4px}
.lf-mini-button{border:1px solid var(--border);border-radius:6px;min-width:24px;min-height:24px;padding:0 4px;background:var(--card);color:var(--text);font-size:14px}
.lf-mini-button:disabled{opacity:.3}
.lf-exercise-editor{display:grid;grid-template-columns:50px minmax(115px,2.4fr) minmax(52px,.48fr) minmax(70px,.7fr) minmax(80px,.75fr) minmax(90px,1.05fr) 28px;align-items:center;gap:7px;min-width:0;padding:6px 5px;border:1px solid transparent;border-radius:8px;position:relative}
.lf-exercise-editor.lf-superset-secondary{border:1px solid var(--mint);background:var(--green-bg);margin-top:4px;padding-left:17px}
.lf-editor-motion{width:48px;height:48px;border:1px solid var(--border);border-radius:8px;background:var(--card);display:flex;align-items:center;justify-content:center;overflow:hidden}
.lf-editor-motion :deep(> *){width:100%!important;height:100%!important;min-width:0!important;min-height:0!important}
.lf-editor-motion-fallback{color:var(--muted);font-size:19px}
.lf-pair-line{position:absolute;left:3px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--mint);font-weight:900}
.lf-exercise-remove{border:1px solid rgba(245,109,109,.45);background:rgba(245,70,70,.12);color:#ff8383;width:27px;height:27px;border-radius:50%;padding:0;display:grid;place-items:center;line-height:1}
.lf-exercise-remove:hover{background:rgba(245,70,70,.25)}
.lf-editor-disambiguation,.lf-editor-pair-rest{grid-column:2 / -2}
.lf-editor-pair-rest{max-width:260px}
.lf-superset-add{margin:5px 0 0 55px;min-height:29px;padding:4px 12px;border:1px solid var(--mint);border-radius:8px;background:var(--green-bg);color:var(--mint);font-weight:800;font-size:10px}
.lf-editor-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:15px;padding-top:12px;border-top:1px solid var(--border)}
.lf-editor-actions button{min-height:37px}
@media(max-width:1100px){.lf-exercise-editor{grid-template-columns:48px minmax(125px,2fr) repeat(2,minmax(60px,.6fr)) minmax(80px,1fr) 28px}.lf-editor-rest{grid-column:2 / -2}.lf-editor-disambiguation,.lf-editor-pair-rest{grid-column:2 / -2}}
@media(max-width:700px){.lf-editor-panel{padding:12px!important}.lf-editor-metadata{grid-template-columns:minmax(0,1fr) 100px}.lf-editor-metadata>label:first-child{grid-column:1/-1}.lf-exercise-editor{grid-template-columns:43px minmax(0,1fr) 28px;gap:6px}.lf-editor-motion{width:42px;height:42px}.lf-editor-exercise-name{grid-column:2}.lf-editor-short,.lf-editor-load,.lf-editor-rest{grid-column:auto}.lf-editor-short:nth-of-type(2){grid-column:1}.lf-editor-short:nth-of-type(3){grid-column:2}.lf-editor-load{grid-column:1 / 3}.lf-editor-rest{grid-column:1 / -1}.lf-exercise-remove{grid-column:3;grid-row:1}.lf-editor-disambiguation,.lf-editor-pair-rest{grid-column:1/-1}.lf-exercise-editor.lf-superset-secondary{padding-left:11px}.lf-pair-line{display:none}.lf-superset-add{margin-left:0}.lf-editor-actions{justify-content:stretch}.lf-editor-actions button{flex:1}}
@media(prefers-reduced-motion:reduce){.lf-exercise-group{transition:none}}
</style>
