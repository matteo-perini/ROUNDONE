<script setup lang="ts">
/** The EXACT original Coach archive screen remains available in DEMO mode.
 * This component is mounted ONLY at /coach/archivio in Vite DEV,
 * behind verified Firebase Auth and the local emulator client; it never runs on production.
 */
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
import {coachAclEnforced} from '../features/athletes/coachAclV2'
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
const personal=ref<Personal[]>([]),error=ref(''),notice=ref(''),loading=ref(true),busy=ref(false),consent=ref(false)
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

function blankExercise():Exercise{return {id:newId(),name:'',sets:'4',reps:'10',load:'',rest:'90 sec',notes:'90 sec',exerciseId:'',catalogId:'',supersetWithPrevious:false,supersetRest:'',executionMode:'normale'}}
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
const currentAthlete=computed(()=>visibleRoster.value.find(a=>a.id===athleteId.value)??null)
const writable=computed(()=>mayWriteLive() && !!session.value && ['titolare','collaboratore'].includes(session.value.role))
const activeCount=computed(()=>models.value.filter(s=>!s.deletedAt).length)
const choice=computed(()=>models.value.filter(s=>(filter.value==='all'||(filter.value==='trash'?!!s.deletedAt:!s.deletedAt)) &&
 `${s.title} ${s.category} ${s.exercises.map(e=>e.name).join(' ')}`.toLowerCase().includes(search.value.toLowerCase()))
 .slice().sort((a,b)=>sort.value==='az'?a.title.localeCompare(b.title,'it'):sort.value==='za'?b.title.localeCompare(a.title,'it'):sort.value==='more'?b.exercises.length-a.exercises.length:b.createdMs-a.createdMs))
const lastOwnEditable=computed(()=>editingId.value && models.value.find(x=>x.id===editingId.value))
let live=true,stopModels:Unsubscribe|null=null,stopUsers:Unsubscribe|null=null,stopPersonal:Unsubscribe|null=null,stopAuth:Unsubscribe|null=null
const closeListeners=()=>{stopModels?.();stopModels=null;stopUsers?.();stopUsers=null;stopPersonal?.();stopPersonal=null;stopAuth?.();stopAuth=null}
function resetConsent(){consent.value=false}
watch(athleteId,()=>{resetConsent();stopPersonal?.();stopPersonal=null;personal.value=[]
 if(!session.value||!maySelectLabAthlete(roster.value,session.value.gymId,athleteId.value))return
 const {db}=getStagingClients(),s=session.value,id=athleteId.value
 stopPersonal=watchAthleteSheets(db,s.gymId,id,sheets=>{if(live && athleteId.value===id)personal.value=sheets.personal},e=>{if(live)error.value=`Schede personali non leggibili: ${e.message}`})
})
function beginPersonal(){isPersonal.value=true;personalEdit.value=false;saveAlsoShared.value=!!linkIntent();editing.value=true;editingId.value='';revision.value=0;title.value='';category.value='Personalizzata';exercises.value=[];alignCount();notice.value='';resetConsent()}
function beginEditPersonal(sheet:Personal){
 if(!session.value||!currentAthlete.value||sheet.deletedAt)return
 isPersonal.value=true;personalEdit.value=true;saveAlsoShared.value=false;editing.value=true;editingId.value=sheet.id;
 // Legacy personal records have no revision; watchAthleteSheets exposes it when present.
 revision.value=Number((sheet as Personal & {revision?:number}).revision||0)
 title.value=sheet.title;category.value=sheet.category;exercises.value=v1ToEditor(sheet.exercises);alignCount();notice.value='La copia storica non viene mai modificata.';resetConsent()
}
watch(personal,rows=>{const id=route.query.editPersonalId;if(typeof id!=='string'||editing.value)return;const sheet=rows.find(r=>r.id===id&&!r.deletedAt);if(sheet)beginEditPersonal(sheet)})
function beginModel(){isPersonal.value=false;personalEdit.value=false;editing.value=true;editingId.value='';revision.value=0;title.value='';category.value='Allenamento';exercises.value=[];alignCount();notice.value='';resetConsent()}
function edit(s:Model){
 if(!session.value||!canManageCoachModel(s.id,session.value.role)||s.deletedAt){notice.value='Modello non attivo o Coach non autorizzato.';return}
 isPersonal.value=false;personalEdit.value=false;editing.value=true;editingId.value=s.id;revision.value=s.revision;title.value=s.title;category.value=s.category
 exercises.value=v1ToEditor(s.exercises).map(e=>({...e,rest:e.rest||e.notes||'',executionMode:e.supersetWithPrevious?'superset':'normale'}))
 alignCount();notice.value='';resetConsent()
}
async function runWrite(label:string,fn:(ctx:{gym:string;uid:string;athlete:string})=>Promise<void>,requireAthlete=false){
 if(busy.value)return
 if(!mayWriteLive()){notice.value='Modifiche temporaneamente disabilitate: puoi consultare l’archivio.';return}
 busy.value=true;notice.value=''
 const selected=currentAthlete.value,s=session.value
 try{
  if(requireAthlete)verifyCoachEditor(s,selected,consent.value)
  else verifyCoachArchiveEditor(s,consent.value)
  const ctx={gym:s.gymId,uid:s.uid,athlete:selected?.id||''}
  await fn(ctx)
  if(live)notice.value=`${label}: operazione completata. Le schede e lo storico sono conservati.`
 }catch(e){if(live)notice.value=`${label}: ${e instanceof Error?e.message:String(e)}`}
 finally{consent.value=false;busy.value=false}
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
 resetConsent()
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
 resetConsent()
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
  stopUsers=onSnapshot(verified.role==='titolare' || !coachAclEnforced()
   ?query(collection(db,'users'),where('gymId','==',verified.gymId),where('role','==','athlete'))
   :query(collection(db,'users'),where('gymId','==',verified.gymId),where('role','==','athlete'),where('coachUids','array-contains',verified.uid)),snap=>{
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
 <div class="notice coach-archive-guide" role="status"><strong>ARCHIVIO DEL COACH</strong> · Gestisci le schede e assegnale tramite il pulsante della scheda. <RouterLink :to="{path:'/coach/atleti',query:{...(athleteId?{athleteId}:{}),...(typeof route.query.weekId==='string'?{weekId:route.query.weekId}:{})}}">← Torna alla settimana dell’atleta</RouterLink></div>
 <section class="panel"><div class="row between"><div><h2 class="card-heading">ARCHIVIO SCHEDE</h2><p class="muted" style="margin:7px 0 0">CREA SCHEDE RIUTILIZZABILI E ASSEGNALE AI TUOI ATLETI</p></div><button v-if="!editing" class="primary" :disabled="!writable||busy" @click="beginModel">＋ Crea nuova scheda dell'archivio</button></div></section>
 <p v-if="error" class="notice" role="alert">{{error}}</p>
 <p v-if="loading" class="muted">Verifica del Coach e lettura degli archivi…</p>
 <section v-if="!loading && session" class="panel">
  <label v-if="writable" class="checkline"><input v-model="consent" type="checkbox" :disabled="busy"/> Confermo le modifiche all'archivio</label>
  <p v-else class="notice">Le modifiche sono temporaneamente disabilitate. Puoi consultare le schede.</p>
  <p v-if="notice" class="notice" role="status">{{notice}}</p>
 </section>
 <section v-if="editing && !loading && session" class="panel">
  <div class="row between"><h2>{{isPersonal?(personalEdit?'MODIFICA SCHEDA PERSONALE':'CREA SCHEDA PERSONALE'):editingId?'MODIFICA SCHEDA DELL’ARCHIVIO':'CREA NUOVA SCHEDA DELL’ARCHIVIO'}}</h2><button class="secondary" @click="editing=false;resetConsent()">← Torna all'archivio</button></div><div class="divider"/>
  <label>NOME SCHEDA</label><input v-model="title" maxlength="200" placeholder="Es. Potenza Esplosiva 1, Ipertrofia A"/>
  <label>CATEGORIA</label><input v-model="category" maxlength="100" placeholder="Allenamento"/>
  <div class="lf-superset-toolbar"><div><strong>ESERCIZI DELLA SCHEDA</strong><p class="muted small">Imposta il numero di esercizi principali: si aggiungono subito, senza conferma. Ridurre il numero non elimina nulla.</p></div><label class="lf-exercise-count">Nº esercizi<input :value="exerciseCounter" type="number" inputmode="numeric" min="0" max="250" step="1" aria-label="Numero esercizi principali" @input="onExerciseCountInput" @blur="onExerciseCountBlur"/></label></div>
  <p class="muted small" role="note"><strong>Privacy delle note:</strong> nelle schede condivise inserisci solo indicazioni tecniche, non dati sanitari.</p>
  <p class="lf-superset-summary" role="status"><strong>{{exerciseGroups.length}}</strong> esercizi principali · <strong>{{supersetCount}}</strong> coppie superset · {{exercises.length}} righe totali</p>
  <datalist id="lf-superset-exercise-names"><option v-for="item in suggest" :key="item.id" :value="item.name_it||item.name">{{item.name}}</option></datalist>
  <div v-for="(group,groupNumber) in exerciseGroups" :key="exercises[group.primaryIndex].id" class="lf-exercise-group" :class="{'lf-has-superset':group.secondaryIndex!==null}">
   <div class="lf-exercise-group-head"><strong>ESERCIZIO {{String(groupNumber+1).padStart(2,'0')}}</strong><span v-if="group.secondaryIndex!==null" class="lf-pair-pill">SUPERSET · 2 ESERCIZI</span></div>
   <div v-for="(index,part) in (group.secondaryIndex===null?[group.primaryIndex]:[group.primaryIndex,group.secondaryIndex])" :key="exercises[index].id" class="lf-exercise-editor" :class="{'lf-superset-secondary':part===1}">
    <div class="row between lf-exercise-row-top"><b>{{part===0?'ESERCIZIO PRINCIPALE':'↳ SUPERSET · ESERCIZIO COLLEGATO'}}</b><button type="button" class="lf-exercise-remove" :aria-label="'Elimina '+(part===0?'esercizio':'superset')+' '+exercises[index].name" title="Elimina questa riga, senza conferma" @click="removeExerciseNow(exercises[index])">✕</button></div>
    <div class="row" style="gap:12px;align-items:center"><ExerciseMotion v-if="catalogForRow(exercises[index])" :exercise="catalogForRow(exercises[index])!" style="width:65px;height:65px;flex:0 0 65px"/><div style="flex:1;min-width:0"><label>Nome esercizio</label><input v-model="exercises[index].name" list="lf-superset-exercise-names" placeholder="Cerca o scrivi il nome" autocomplete="off" @focus="focusedExerciseName=exercises[index].name" @input="onEditedNameInput(exercises[index]);focusedExerciseName=exercises[index].name"/></div></div>
    <label v-if="exactCatalogMatches(catalog,exercises[index].name).length>1">Nome ambiguo: seleziona l'esercizio corretto<select :value="exercises[index].exerciseId||''" @change="selectCatalogId(exercises[index],$event)"><option value="">Nessuna illustrazione selezionata</option><option v-for="candidate in exactCatalogMatches(catalog,exercises[index].name)" :key="candidate.id" :value="candidate.id">{{candidate.name_it||candidate.name}} · ID {{candidate.id}}</option></select></label>
    <div class="grid2"><div><label>Serie</label><input v-model="exercises[index].sets"/></div><div><label>Ripetizioni</label><input v-model="exercises[index].reps"/></div><div><label>Carico / intensità</label><input v-model="exercises[index].load"/></div><div><label>Recupero / note</label><input v-model="exercises[index].rest"/></div></div>
    <label v-if="part===1">Recupero al termine della coppia<input v-model="exercises[index].supersetRest" placeholder="90 sec"/></label>
   </div>
   <button v-if="group.secondaryIndex===null && availableMax>0" type="button" class="lf-superset-add" @click="addLinkedSuperset(exercises[group.primaryIndex])">＋ Aggiungi superset a questo esercizio</button>
  </div>
  <p v-if="!exerciseGroups.length" class="muted small">Inserisci un numero nel contatore per creare i primi esercizi.</p>
  <p v-if="notice" class="notice" role="alert">{{notice}}</p>
  <label v-if="isPersonal && !personalEdit && !linkIntent()" class="checkline"><input v-model="saveAlsoShared" type="checkbox"/> Salva anche nell’Archivio Coach e assegna allo stesso atleta (stesso ID)</label>
  <p class="muted small" v-if="isPersonal">{{personalEdit?'Aggiorna solo la copia personale. La copia protetta resta immutabile.':linkIntent()?'Creazione dal giorno: il nuovo modello va anche in Archivio Coach, poi personale+protetta+giorno con lo stesso ID.':'La scheda personale mantiene una copia storica protetta immutabile.'}}</p>
  <p v-if="pendingSharedLink" class="notice" role="alert">Scheda creata con ID {{pendingSharedLink}}; collegamento incompleto. Non premere di nuovo Salva: premi Riprendi collegamento.</p>
  <button v-if="pendingSharedLink" class="secondary wide" :disabled="busy" @click="retryPendingLink">Riprendi collegamento senza creare duplicati</button>
  <button class="primary wide" :disabled="!consent||busy||!!pendingSharedLink||!writable||!title.trim()||!exercises.length" @click="save">{{isPersonal?(personalEdit?'SALVA MODIFICHE PERSONALI':'SALVA SCHEDA PERSONALE'):editingId?'SALVA MODIFICHE':'SALVA NELL’ARCHIVIO SCHEDE'}}</button>
 </section>
 <section v-else-if="!loading && session" class="panel">
  <div class="row between"><div><h2 class="card-heading">ARCHIVIO · SCHEDE</h2><span class="muted small">{{choice.length}} di {{activeCount}} schede attive nell'archivio</span></div><button v-if="typeof route.query.athleteId==='string'" class="secondary" :disabled="!writable||busy" @click="beginPersonal">+ Crea scheda personale</button></div>
  <div class="coach-archive-toolbar"><input v-model="search" type="search" placeholder="Cerca una scheda…" aria-label="Cerca una scheda"/><button class="secondary" @click="filter=filter==='trash'?'active':'trash'">{{filter==='trash'?'← Archivio schede':'Apri cestino'}}</button><select v-model="sort" aria-label="Ordina schede"><option value="recent">Più recenti</option><option value="az">Nome A–Z</option><option value="more">Più esercizi</option></select></div>
  <div class="grid2"><div v-for="s in choice" :key="s.id" class="archive-card">
   <h3 style="margin:0">{{s.title}}</h3><p class="muted small">{{s.category}} · {{s.exercises.length}} esercizi · {{s.deletedAt?'Nel cestino':'Attivo'}}</p><p class="small">{{s.exercises.slice(0,2).map(x=>x.name).join(' · ')}}</p><div class="divider"/>
   <p v-if="personal.some(p=>p.id===s.id)" class="muted small">{{personal.find(p=>p.id===s.id)?.deletedAt?'Scheda personale nel cestino':'Già assegnato a questo atleta (riutilizzabile per il giorno)'}}</p>
   <div class="archive-actions"><button class="secondary" @click="preview=s">Visualizza</button>
    <button v-if="!s.deletedAt" class="secondary" :disabled="!session||!canManageCoachModel(s.id,session.role)" @click="edit(s)">Modifica</button>
    <button v-if="!s.deletedAt" class="secondary" :disabled="busy||!consent||!writable" @click="duplicate(s)">Duplica</button>
    <button v-if="!s.deletedAt" class="primary" :disabled="busy||!writable" @click="openAssign(s)">Assegna</button>
    <button v-if="!s.deletedAt" class="danger" :disabled="busy||!consent||!writable||!session||!canManageCoachModel(s.id,session.role)" @click="trash(s)">Nel Cestino</button>
    <button v-if="s.deletedAt" class="secondary" :disabled="busy||!consent||!writable||!session||!canManageCoachModel(s.id,session.role)" @click="restore(s)">Ripristina</button>
   </div>
  </div></div>
  <p v-if="!choice.length" class="muted">Nessuna scheda corrisponde ai filtri.</p>
  <p class="notice">I modelli ROUNDONE vengono modificati mantenendo il loro ID. Ogni salvataggio verifica la revisione, inclusa la revisione iniziale 0 dei modelli legacy. Le copie storiche degli atleti non sono modificabili.</p>
 </section>
 <div v-if="pickAssign" class="modal-overlay" @click.self="pickAssign=null"><div class="dialog coach-assign-dialog"><div class="row between"><h2>Assegna · {{pickAssign.title}}</h2><button class="bare" aria-label="Chiudi" @click="pickAssign=null">✕</button></div><p class="small muted">Scegli un atleta. I filtri raggruppano i coach ma non modificano le Rules pubblicate.</p>
 <label>Visualizza atleti<select v-model="coachFilter" aria-label="Filtra atleti per coach"><option value="miei">I miei</option><option value="condivisi">Condivisi</option><option value="tutti">Tutti</option></select></label>
 <p v-if="!hasAnyMembership" class="small muted">Atleti storici senza assegnazione coach: disponibili in Tutti.</p>
 <label class="lfp-search-label">Cerca atleta <input class="lfp-inline-lookup" v-model="assignSearch" type="search" autocomplete="off" aria-label="Cerca atleta per nome" placeholder="Nome o cognome…"/></label><label>Atleta<select v-model="athleteId" :disabled="busy"><option value="">Seleziona atleta…</option><option v-for="a in searchedRoster" :key="a.id" :value="a.id">{{a.name}}</option></select></label><p v-if="!searchedRoster.length" class="muted small">Nessun atleta corrisponde alla ricerca nei filtri attivi.</p><p v-if="currentAthlete&&personal.some(p=>p.id===pickAssign?.id)" class="notice">Scheda già assegnata a questo atleta.</p><label class="checkline"><input v-model="consent" type="checkbox" :disabled="busy"/> Confermo l'assegnazione</label><button class="primary wide" :disabled="busy||!writable||!consent||!currentAthlete||personal.some(p=>p.id===pickAssign?.id&&p.deletedAt)" @click="assign(pickAssign)">Assegna scheda</button></div></div>
 <SheetDetail v-if="preview" :sheet="preview" @close="preview=null"/>
</div>
</template>

<style scoped>
.lf-superset-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:16px 0 10px;flex-wrap:wrap}
.lf-superset-toolbar p{margin:4px 0 0;max-width:550px;line-height:1.4}
.lf-exercise-count{display:flex;align-items:center;gap:8px;margin:0;font-size:12px;font-weight:900;white-space:nowrap}
.lf-exercise-count input{width:84px;min-height:40px;text-align:center;font-weight:900;background:var(--field);color:var(--text);border:1px solid var(--mint);border-radius:10px}
.lf-superset-summary{background:var(--card2);padding:10px 12px;border-radius:11px;font-size:12px;border:1px solid var(--border)}
.lf-exercise-group{margin:12px 0;border:1px solid var(--outline);border-radius:17px;padding:10px;background:var(--card2);min-width:0}
.lf-exercise-group.lf-has-superset{border-color:var(--mint)}
.lf-exercise-group-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:3px 2px 10px;font-size:12px}
.lf-pair-pill{color:var(--mint);background:var(--green-bg);border:1px solid var(--mint);border-radius:30px;padding:4px 8px;font-size:10px;font-weight:900}
.lf-exercise-editor{padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--card);margin-bottom:7px;min-width:0}
.lf-exercise-editor.lf-superset-secondary{border:1px solid var(--mint);border-left:4px solid var(--mint);margin-left:13px;background:var(--green-bg)}
.lf-exercise-row-top{gap:9px;margin-bottom:9px;font-size:11px}
.lf-exercise-remove{min-width:30px;min-height:30px;border:1px solid #da575f;background:#6e1724;color:#fff;border-radius:9px;font-weight:900}
.lf-superset-add{width:100%;margin-top:2px;min-height:35px;border-radius:10px;border:1px dashed var(--mint);background:var(--green-bg);color:var(--mint);font-weight:900;font-size:12px}
@media(max-width:600px){.lf-exercise-count{margin-left:auto}.lf-exercise-group{padding:7px}.lf-exercise-editor{padding:9px}.lf-exercise-editor.lf-superset-secondary{margin-left:8px}.lf-superset-toolbar{align-items:flex-start}}
</style>
