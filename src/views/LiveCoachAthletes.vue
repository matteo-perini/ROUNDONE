<script setup lang="ts">
/** Layout V1 Coach: gli stessi IDs delle settimane/archivi reali, senza fallback DEMO. */
import {onMounted,onUnmounted,ref,computed,shallowRef,watch,nextTick} from 'vue'
import {RouterLink,useRouter,useRoute,onBeforeRouteLeave} from 'vue-router'
import {onAuthStateChanged} from 'firebase/auth'
import {collection,doc,getDocFromServer,onSnapshot,query,where,updateDoc,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {assignSharedToDay,trashPersonal,watchAthleteSheets,backfillProtectedLegacy} from '../integrations/firestore/sheets'
import {createV1Program,saveV1WeekActivities,duplicateV1Week,trashV1Week,restoreV1Week} from '../integrations/firestore/programs'
import {advanceV1Monday} from '../features/sheets/v1WeekCodec'
import {hasUnsavedActivities} from '../features/sheets/weekDraftPolicy'
import {updateV1WeekSlot} from '../integrations/firestore/liveWeekSlots'
import {createCoachModel} from '../integrations/firestore/liveCoachOperations'
import {editorToV1,v1ToEditor} from '../features/sheets/v1ExerciseCodec'
import {parseWeekTable,applyWeekTableDraft} from '../features/coach/weekTableImport'
import {belongsToCoach,hasCoachAssignment,type CoachRosterFilter} from '../features/athletes/coachMembership'
import {assignedCoaches,coachAclV2Enabled,coachAclEnforced,type CoachMini} from '../features/athletes/coachAclV2'
import {labCoachRoster,type RosterAthlete} from '../features/athletes/liveCoachRoster'
import {DAY_KEYS,DAY_NAMES,copy,type Personal,type ProgramDay,type ProgramWeek,type Groups,type Link} from '../features/sheets/domain'
import {visualSheetGroups} from '../features/sheets/semanticDedup'
import SheetDetail from '../components/SheetDetail.vue'
import LionIcon from '../components/LionIcon.vue'
const route=useRoute(),router=useRouter(),session=shallowRef<StagingSession|null>(null)
const roster=ref<RosterAthlete[]>([]),search=ref(''),currentId=ref(''),selectedWeek=ref('')
const status=ref('Caricamento dati palestra…'),error=ref(''),busy=ref(false)
const data=shallowRef<{personal:Personal[];weeks:ProgramWeek[];groups:Groups}|null>(null)
const opened=shallowRef<Personal|null>(null),pick=ref<{day:number;slot:1|2}|null>(null),pickSearch=ref('')
type SharedChoice={id:string;title:string;category:string;exercises:Personal['exercises']}
const sharedChoices=ref<SharedChoice[]>([]),sharedLoading=ref(false),sharedError=ref('')
const visibleShared=computed(()=>sharedChoices.value.filter(x=>(x.title+' '+x.category+' '+x.exercises.map(y=>y.name).join(' ')).toLocaleLowerCase('it').includes(pickSearch.value.toLocaleLowerCase('it'))))
const createProgramOpen=ref(false),programName=ref('Preparazione Fighter'),monday=ref(''),weekCount=ref(4)
const showWeek=ref(true),showMaintenance=ref(false),activeDay=ref(-1)
const activityDraft=ref<ProgramDay[]>([]),draftBaseline=ref<ProgramDay[]>([]),draftWeekId=ref(''),pendingRemote=ref(false)
const dirty=computed(()=>hasUnsavedActivities(draftBaseline.value,activityDraft.value))
const message=ref(''),showDelete=ref<{title:string;links:Link[]}|null>(null)
function discardIfDirty(action:string):boolean{
 if(!dirty.value)return true
 if(!window.confirm(`Ci sono attività non salvate. ${action} le perderà. Continuare?`))return false
 pendingRemote.value=false
 return true
}
function syncActivityDraft(w:ProgramWeek|null){
 draftWeekId.value=w?.id||''
 draftBaseline.value=w?copy(w.days):[]
 activityDraft.value=w?copy(w.days):[]
 pendingRemote.value=false
}
function beforeUnload(e:BeforeUnloadEvent){if(dirty.value){e.preventDefault();e.returnValue=''}}
onBeforeRouteLeave(()=>discardIfDirty('Uscire dalla schermata'))

const membershipFilter=ref<CoachRosterFilter>('tutti')
const coachRoster=ref<CoachMini[]>([]),assignPrimary=ref(''),assignShared=ref<string[]>([])
const canManageAcl=computed(()=>session.value?.role==='titolare' && coachAclV2Enabled())
let membershipInitialized=false
const hasAssignedMembers=computed(()=>roster.value.some(a=>hasCoachAssignment(a)))
const visibleAthletes=computed(()=>roster.value.filter(a=>belongsToCoach(a,session.value?.uid||'',membershipFilter.value)&&
 (a.name+' '+a.email).toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it'))))
const duplicateOpen=ref(false),duplicateMonday=ref(''),duplicateSourceId=ref(''),trashedWeeksOpen=ref(false),selectedWeekTrash=ref<string[]>([]),weekTrashMode=ref(false)
const deletedWeeks=computed(()=>data.value?.weeks.filter(w=>!!w.deletedAt)??[])
const importOpen=ref(false),importMode=ref<'paste'|'drive'>('paste'),importText=ref(''),importRows=ref<ReturnType<typeof parseWeekTable>>([]),driveUrl=ref('')
function previewImport(){importRows.value=parseWeekTable(importText.value)}
function applyImport(){
 if(!week.value || !activityDraft.value.length){message.value='Apri prima una settimana.';return}
 if(!importRows.value.length){message.value='Nessun giorno riconosciuto.';return}
 if(!window.confirm('Inserire le attività nella bozza? Le schede collegate resteranno inalterate e dovrai premere Salva attività per confermare.'))return
 activityDraft.value=applyWeekTableDraft(activityDraft.value,importRows.value)
 importOpen.value=false;message.value='Tabella inserita nella bozza. Controlla i giorni e premi Salva attività per memorizzarla.'
}
async function saveDriveUrl(){
 const s=session.value,a=athlete.value,url=driveUrl.value.trim()
 if(!s||!a)return
 try{
  const parsed=new URL(url)
  if(parsed.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(parsed.hostname))throw new Error('Inserisci un link Google Drive o Fogli Google HTTPS valido.')
 }catch{message.value='Inserisci un link valido a Google Drive o Fogli Google.';return}
 await withWrite('Salva link Google Drive',async()=>{const {db}=getStagingClients();await updateDoc(doc(db,'users',a.id),{driveUrl:url});driveUrl.value='';importOpen.value=false})
}
const athlete=computed(()=>roster.value.find(a=>a.id===currentId.value))
const currentWeeks=computed(()=>data.value?.weeks.filter(w=>!w.deletedAt).slice().sort((a,b)=>String(a.startDate||a.id).localeCompare(String(b.startDate||b.id)))??[])
const week=computed(()=>currentWeeks.value.find(w=>w.id===selectedWeek.value)??currentWeeks.value.at(-1)??null)
const groups=computed(()=>data.value?visualSheetGroups(data.value.groups):null)
const personal=computed(()=>data.value?.personal.filter(x=>!x.deletedAt)??[])
const byId=(id:string)=>personal.value.find(x=>x.id===id)
const canWrite=computed(()=>mayWriteLive() && !!session.value && !!athlete.value)
let alive=true,stopUsers:Unsubscribe|null=null,stopCoaches:Unsubscribe|null=null,stopSheets:Unsubscribe|null=null,stopAuth:Unsubscribe|null=null
// Modelli Archivio Coach: listener aperto solo al primo accesso al selettore.
// Riusato per i successivi giorni senza ri-leggere la collezione ad ogni clic.
let stopShared:Unsubscribe|null=null,sharedGeneration=0
function stopSharedListening(){
 sharedGeneration++;stopShared?.();stopShared=null;sharedLoading.value=false
}
function stopSelected(){stopSheets?.();stopSheets=null;data.value=null;opened.value=null;pick.value=null;selectedWeek.value='';selectedWeekTrash.value=[];weekTrashMode.value=false;syncActivityDraft(null)}
function choose(id:string){if(!roster.value.some(a=>a.id===id)||id===currentId.value||!discardIfDirty('Cambiare atleta'))return;currentId.value=id;showWeek.value=true
 const a=roster.value.find(a=>a.id===id);assignPrimary.value=a?.primaryCoachUid||'';assignShared.value=(a?.coachUids||[]).filter(uid=>uid!==assignPrimary.value)
}
async function saveCoachAssignment(){
 const s=session.value,a=athlete.value;if(!s||!a||!canManageAcl.value||busy.value)return
 try{
  const selected=assignedCoaches(assignPrimary.value,assignShared.value,coachRoster.value,s.gymId)
  if(!window.confirm('Aggiornare i coach autorizzati a visualizzare e modificare i dati di questo atleta?'))return
  await withWrite('Assegna Coach',async()=>{const {db}=getStagingClients();await updateDoc(doc(db,'users',a.id),{primaryCoachUid:assignPrimary.value,coachUids:selected})})
 }catch(e){message.value=e instanceof Error?e.message:String(e)}
}
function close(){if(!discardIfDirty('Tornare all’elenco atleti'))return;currentId.value='';stopSelected()}
function chooseWeek(id:string){
 if(weekTrashMode.value){selectedWeekTrash.value=selectedWeekTrash.value.includes(id)?selectedWeekTrash.value.filter(x=>x!==id):[...selectedWeekTrash.value,id];return}
 if(id===week.value?.id){showWeek.value=!showWeek.value;return}
 if(!discardIfDirty('Cambiare settimana'))return
 selectedWeek.value=id;showWeek.value=true;activeDay.value=-1;pick.value=null;syncActivityDraft(currentWeeks.value.find(w=>w.id===id)||null)
}
function toggleTrashMode(){weekTrashMode.value=!weekTrashMode.value;selectedWeekTrash.value=[]}
const linksLabel=(links:Link[])=>{
 const m=new Map<string,Set<string>>()
 links.forEach(l=>{const days=m.get(l.weekName)||new Set<string>();days.add(l.dayName);m.set(l.weekName,days)})
 return [...m].map(([wk,days])=>wk+' · '+[...days].join(', ')).join(' · ')
}
watch(week,w=>{
 if(w?.id===draftWeekId.value && dirty.value){
  if(JSON.stringify(w?.days)!==JSON.stringify(draftBaseline.value))pendingRemote.value=true
  return // snapshot remoto non deve sovrascrivere attività non salvate
 }
 syncActivityDraft(w)
},{immediate:true})
watch(currentId,id=>{
 stopSelected();const s=session.value
 if(!s||!id||!roster.value.some(a=>a.id===id&&a.gymId===s.gymId))return
 const {db}=getStagingClients()
 stopSheets=watchAthleteSheets(db,s.gymId,id,change=>{if(!alive||currentId.value!==id)return;data.value=change;
  const requested=route.query.weekId
  if(typeof requested==='string' && change.weeks.some(w=>w.id===requested&&!w.deletedAt)){
   if(!dirty.value||selectedWeek.value===requested)selectedWeek.value=requested
  }else if(typeof requested==='string' && requested && !selectedWeek.value){message.value='La settimana richiesta non è più attiva: seleziona una settimana disponibile.'}
  status.value='Sincronizzato con Firebase';},e=>{if(alive)error.value='Schede atleta: '+e.message})
})
onMounted(async()=>{window.addEventListener('beforeunload',beforeUnload);try{
 const s=await readStagingSession();if(!alive)return
 if(s.role==='atleta')throw new Error('Accesso Coach non autorizzato');session.value=s
 const {db,auth}=getStagingClients();const p=await getDocFromServer(doc(db,'users',s.uid))
 if(!p.exists()||p.data().gymId!==s.gymId||p.data().role!=='admin')throw new Error('Identità Coach non verificata')
 stopAuth=onAuthStateChanged(auth,u=>{if(alive&&u?.uid!==s.uid){stopSharedListening();close();void router.replace('/accesso')}})
 const usersCollection=collection(db,'users')
 // Le palestre legacy non hanno ancora coachUids: filtrare solo dopo ACL V2 vera.
 const athletesQuery=s.role==='titolare' || !coachAclEnforced()
  ?query(usersCollection,where('gymId','==',s.gymId),where('role','==','athlete'))
  :query(usersCollection,where('gymId','==',s.gymId),where('role','==','athlete'),where('coachUids','array-contains',s.uid))
 if(s.role==='titolare')stopCoaches=onSnapshot(query(usersCollection,where('gymId','==',s.gymId),where('role','==','admin')),sn=>{
   if(!alive)return;coachRoster.value=sn.docs.map(d=>({id:d.id,gymId:String(d.data().gymId||''),role:String(d.data().role||''),membershipStatus:d.data().membershipStatus}))
 },e=>{if(alive)error.value='Elenco coach: '+e.message})
 stopUsers=onSnapshot(athletesQuery,sn=>{
 if(!alive)return;roster.value=labCoachRoster(sn.docs.map(d=>({id:d.id,data:d.data()})),s.gymId)
 if(!membershipInitialized){membershipInitialized=true;if(roster.value.some(a=>a.primaryCoachUid===s.uid))membershipFilter.value='miei'}
 if(currentId.value&&!roster.value.some(a=>a.id===currentId.value))close();
 if(!currentId.value && typeof route.query.athleteId==='string' && roster.value.some(a=>a.id===route.query.athleteId))currentId.value=route.query.athleteId;
 status.value='Atleti aggiornati da Firebase'
 },e=>{if(alive)error.value='Elenco atleti: '+e.message})
}catch(e){error.value=e instanceof Error?e.message:String(e)}})
onUnmounted(()=>{window.removeEventListener('beforeunload',beforeUnload);alive=false;stopSharedListening();stopSelected();stopUsers?.();stopCoaches?.();stopAuth?.()})
function linkToEditor(kind:'personal'|'shared',day?:number,slot?:1|2){
 if(!athlete.value)return
 // Never discard one of the 14 activity fields while navigating to the archive.
 if(dirty.value){
  message.value='Ci sono attività non salvate nella settimana. Premi Salva attività prima di aprire l’Archivio Coach.';return
 }
 void router.push({path:'/coach/archivio',query:{athleteId:athlete.value.id,...(week.value?{weekId:week.value.id}:{}),...(kind==='personal'?{mode:'personal'}:{}),...(day!==undefined&&slot!==undefined&&week.value?{day:String(day),slot:String(slot),expectedSlotId:String(slot===1?week.value.days[day]?.templateId||'':week.value.days[day]?.templateId2||'')}:{} )}})
}
async function withWrite(action:string,run:()=>Promise<void|string>){
 if(busy.value)return
 if(!canWrite.value){message.value='La modifica reale è protetta: verifica prima Rules e compatibilità APK V1.';return}
 // Il clic su Salva/Assegna e' l'azione esplicita; evitiamo una seconda spunta
 // e un popup generico. Restano i controlli identita', permessi e le conferme rischiose.
 busy.value=true;try{const result=await run();message.value=typeof result==='string'?result:action+' completato.'}
 catch(e){message.value=action+': '+(e instanceof Error?e.message:String(e))}
 finally{busy.value=false}
}
function saveActivities(){const s=session.value,w=week.value,a=athlete.value;if(!s||!w||!a)return
 if(!dirty.value){message.value='Nessuna attività modificata.';return}
 const next=copy(activityDraft.value),baseline=copy(draftBaseline.value),originalWeekId=w.id,originalAthlete=a.id
 void withWrite('Salva le attività della settimana',async()=>{
  const {db}=getStagingClients()
  await saveV1WeekActivities(db,s.gymId,a.id,w.id,next,baseline,s.uid)
  if(currentId.value===originalAthlete&&week.value?.id===originalWeekId){draftBaseline.value=copy(next);pendingRemote.value=false}
 })}
function openDatePicker(event:MouseEvent){
 const wrapper=event.currentTarget as HTMLElement
 const input=wrapper.querySelector('input[type="date"]') as HTMLInputElement|null
 if(!input || event.target===input)return
 try{input.showPicker()}catch{input.focus()}
}
function newProgram(){const s=session.value,a=athlete.value;if(!s||!a||!discardIfDirty('Creare un nuovo programma'))return
 void withWrite('Crea nuovo programma',async()=>{const {db}=getStagingClients();await createV1Program(db,s.gymId,a.id,programName.value,monday.value,weekCount.value,s.uid);createProgramOpen.value=false})}
function refreshSharedChoices(force=false){
 const s=session.value;if(!s||!alive)return
 if(stopShared&&!force)return
 // Aggiorna manuale: re-iscrizione esplicita, non lettura su ogni click del selettore.
 stopSharedListening()
 const generation=sharedGeneration
 sharedLoading.value=true;sharedError.value=''
 const {db}=getStagingClients()
 stopShared=onSnapshot(collection(db,'gyms',s.gymId,'templates'),snap=>{
  if(!alive||generation!==sharedGeneration)return
  sharedChoices.value=snap.docs.filter(d=>!d.data().deletedAt).map(d=>({id:d.id,title:String(d.data().title||''),category:String(d.data().category||'Allenamento'),exercises:Array.isArray(d.data().exercises)?d.data().exercises:[]}))
  sharedLoading.value=false;sharedError.value=''
 },err=>{
  if(!alive||generation!==sharedGeneration)return
  sharedError.value=err instanceof Error?err.message:String(err)
  stopSharedListening()
 })
}
function openSharedPreview(s:SharedChoice){
 const a=athlete.value;if(!a)return
 opened.value={id:s.id,athleteId:a.id,title:s.title,category:s.category,exercises:s.exercises}
}
function assignFromShared(s:SharedChoice){
 const me=session.value,a=athlete.value,w=week.value,slot=pick.value
 if(!me||!a||!w||!slot)return
 const expected=String(slot.slot===1?w.days[slot.day]?.templateId||'':w.days[slot.day]?.templateId2||'')
 void withWrite('Assegna Archivio Coach al giorno',async()=>{
  const {db}=getStagingClients()
  await assignSharedToDay(db,me.gymId,a.id,s.id,me.uid,w.id,DAY_KEYS[slot.day],slot.slot,expected)
  pick.value=null;showWeek.value=true;activeDay.value=slot.day
 })
}
function openPick(day:number,slot:1|2){activeDay.value=day;pickSearch.value='';pick.value={day,slot};void refreshSharedChoices()}
function applySlot(nextId:string){const s=session.value,a=athlete.value,w=week.value,p=pick.value;if(!s||!a||!w||!p)return
 const expected=p.slot===1?w.days[p.day].templateId:w.days[p.day].templateId2
 void withWrite(nextId?'Collega la scheda':'Scollega la scheda',async()=>{
 const {db}=getStagingClients();await updateV1WeekSlot(db,s.gymId,a.id,w.id,p.day,p.slot,expected,nextId,s.uid)
 pick.value=null;showWeek.value=true;activeDay.value=p.day
 void nextTick(()=>document.getElementById('live-week-'+p.day)?.scrollIntoView({behavior:'smooth',block:'nearest'}))
 })
}
function unlink(day:number,slot:1|2){
 if(!window.confirm('Scollegare la scheda da questo giorno? La scheda resterà nell’archivio.'))return
 openPick(day,slot);applySlot('')
}
function unlinkExact(l:Link){
 const s=session.value,a=athlete.value
 if(!s||!a)return
 if(!window.confirm('Scollegare la scheda da questo giorno? La scheda resterà nell’archivio.'))return
 void withWrite('Scollega uno slot',async()=>{
  const{db}=getStagingClients()
  await updateV1WeekSlot(db,s.gymId,a.id,l.weekId,l.dayIndex,l.slot,l.templateId,'',s.uid)
  showDelete.value=null
  if(!dirty.value)selectedWeek.value=l.weekId
 })
}

function manageDays(links:Link[]){const l=links[0];if(!l)return;selectedWeek.value=l.weekId;showWeek.value=true;activeDay.value=l.dayIndex
 void nextTick(()=>document.getElementById('live-week-'+l.dayIndex)?.scrollIntoView({behavior:'smooth',block:'center'}))}
function openDuplicate(){
 if(!week.value||!discardIfDirty('Aprire la duplicazione'))return
 duplicateSourceId.value=week.value.id
 duplicateMonday.value=week.value.startDate?advanceV1Monday(week.value.startDate,1):''
 duplicateOpen.value=true
}

function duplicateCurrentWeek(){const s=session.value,a=athlete.value,w=currentWeeks.value.find(x=>x.id===duplicateSourceId.value)
 if(!s||!a||!w)return
 void withWrite('Duplica settimana',async()=>{
  const {db}=getStagingClients();await duplicateV1Week(db,s.gymId,a.id,w.id,duplicateMonday.value,s.uid)
  duplicateOpen.value=false
 })
}

function trashCurrentWeek(){const s=session.value,a=athlete.value,w=week.value
 if(!s||!a||!w||!discardIfDirty('Spostare la settimana nel Cestino'))return
 if(!window.confirm(`Spostare nel Cestino la settimana «${w.name}»? Potrai ripristinarla.`))return
 void withWrite('Sposta settimana nel Cestino',async()=>{
  const {db}=getStagingClients();await trashV1Week(db,s.gymId,a.id,w.id,s.uid)
  selectedWeek.value='';showWeek.value=false
 })
}
function restoreWeek(id:string){const s=session.value,a=athlete.value
 if(!s||!a||!discardIfDirty('Ripristinare la settimana'))return
 void withWrite('Ripristina settimana',async()=>{
  const {db}=getStagingClients();await restoreV1Week(db,s.gymId,a.id,id,s.uid)
  trashedWeeksOpen.value=false
 })
}
function trashMultipleWeeks(){
 const s=session.value,a=athlete.value,ids=[...selectedWeekTrash.value]
 if(!s||!a||!ids.length||!discardIfDirty('Spostare le settimane selezionate nel Cestino'))return
 if(!window.confirm(`Spostare nel Cestino ${ids.length} settimane? Potrai ripristinarle.`))return
 void withWrite(`Cestina ${ids.length} settimane`,async()=>{
  const {db}=getStagingClients()
  for(const id of ids)await trashV1Week(db,s.gymId,a.id,id,s.uid)
  selectedWeekTrash.value=[];selectedWeek.value='';weekTrashMode.value=false
 })
}
function alignMaintenance(){
 const s=session.value,a=athlete.value
 if(!s||!a)return
 if(!window.confirm('Creare soltanto le copie protette ancora mancanti, con lo stesso ID delle schede personali? Il contenuto sarà quello attuale e le copie già esistenti resteranno immutate.'))return
 void withWrite('Allinea copie protette mancanti',async()=>{
  const{db}=getStagingClients()
  const report=await backfillProtectedLegacy(db,s.gymId,a.id,s.uid)
  return `Archivio: ${report.created} copie create, ${report.alreadyPresent} già protette, ${report.pending} ancora da verificare.`
 })
}
function editPersonal(sheet:Personal){
 if(!athlete.value)return
 void router.push({path:'/coach/archivio',query:{athleteId:athlete.value.id,mode:'personal',editPersonalId:sheet.id,...(week.value?{weekId:week.value.id}:{})}})
}
function trashUnusedPersonal(sheet:Personal){
 const s=session.value,a=athlete.value;if(!s||!a||sheet.deletedAt)return
 const links=data.value?.groups.programmed.find(g=>g.sheet.id===sheet.id)?.links||[]
 if(links.length){message.value='Scheda collegata ai giorni: scollega prima tutti gli slot.';return}
 if(!window.confirm('Spostare nel cestino SOLO la scheda personale non programmata? La copia protetta resta intatta.'))return
 void withWrite('Cestina scheda personale non programmata',async()=>{const{db}=getStagingClients();await trashPersonal(db,s.gymId,a.id,sheet.id,s.uid)})
}
function copyToArchive(sheet:Personal){
 const s=session.value
 if(!s)return
 void withWrite('Copia nell’Archivio schede',async()=>{
  const {db}=getStagingClients()
  const rows=editorToV1(v1ToEditor(sheet.exercises))
  await createCoachModel(db,s.gymId,s.uid,sheet.title+' (copia)',sheet.category||'Allenamento',rows)
  message.value='Copia indipendente creata. L’originale e lo storico restano invariati.'
 })
}
</script>
<template>
<div class="stack coach-athletes-screen">
 <section v-if="!athlete" class="panel coach-team-toolbar"><div class="coach-team-title"><h2 class="card-heading">TEAM &amp; ATLETI</h2><span class="muted">SELEZIONA UN ATLETA</span></div>
  <div class="coach-team-tools"><RouterLink to="/coach/staff" class="primary">+ Invita atleta</RouterLink><input v-model="search" type="search" aria-label="Cerca atleta" placeholder="Cerca atleta per nome…"/><select v-model="membershipFilter" aria-label="Filtra per coach"><option value="miei">I miei</option><option value="condivisi">Condivisi</option><option value="tutti">Tutti</option></select></div></section>
 <p v-if="error" class="notice" role="alert">{{error}}</p><p class="small muted" role="status">{{status}}</p>
 <section v-if="!athlete" class="coach-athlete-count row between"><span class="muted">{{visibleAthletes.length}} atleti · {{membershipFilter==='miei'?'Assegnati a me':membershipFilter==='condivisi'?'Condivisi con me':session?.role==='collaboratore'&&coachAclEnforced()?'Atleti assegnati al mio account':'Tutta la palestra'}}</span><button class="secondary" @click="search='';membershipFilter='tutti'">Mostra tutti ({{roster.length}})</button></section>
 <p v-if="!athlete" class="small muted">{{session?.role==='collaboratore'&&coachAclEnforced()?'Elenco limitato agli atleti assegnati al tuo account. Le Rules Firestore restano l’autorità.':'Elenco della palestra accessibile ai Coach autorizzati secondo le Rules pubblicate. Le assegnazioni individuali saranno applicate solo dopo l’attivazione ACL V2.'}}</p>
 <p v-if="!athlete&&!hasAssignedMembers" class="small muted">Nessun atleta ha ancora un coach assegnato nei campi di associazione: puoi continuare a gestire gli atleti storici da «Tutti».</p>
 <div v-if="!athlete" class="grid2 coach-athlete-list"><button v-for="a in visibleAthletes" :key="a.id" class="action-card" @click="choose(a.id)"><span class="action-icon">🦁</span><div><strong>{{a.name.toUpperCase()}}</strong><small>{{a.email}}</small></div><b class="green" style="margin-left:auto">GESTISCI →</b></button></div>
 <template v-if="athlete">
 <section v-if="session?.role==='titolare'" class="panel"><h3>COACH ASSEGNATI ALL'ATLETA</h3>
  <p v-if="!canManageAcl" class="muted small">Assegnazione e isolamento per coach disponibili dopo il test delle Rules ACL V2 nell'Emulator e il backfill degli atleti storici. I dati non vengono modificati.</p>
  <template v-else><label>Coach principale<select v-model="assignPrimary"><option value="">Seleziona un coach</option><option v-for="c in coachRoster.filter(c=>c.role==='admin'&&c.membershipStatus!=='revoked')" :key="c.id" :value="c.id">{{c.id===session?.uid?'Titolare':c.id}}</option></select></label>
   <p class="muted small">Collaboratori condivisi (oltre al principale)</p><label v-for="c in coachRoster.filter(c=>c.role==='admin'&&c.membershipStatus!=='revoked'&&c.id!==assignPrimary)" :key="c.id" class="checkline"><input v-model="assignShared" type="checkbox" :value="c.id"/> {{c.id===session?.uid?'Titolare':c.id}}</label>
   <button class="primary" :disabled="busy||!canWrite||!assignPrimary" @click="saveCoachAssignment">Salva coach autorizzati</button></template>
 </section>
 <section class="panel coach-selected-athlete"><div class="row between coach-selected-head"><div><span class="eyebrow">GESTIONE ATLETA</span><h2>{{athlete.name.toUpperCase()}}</h2></div><button class="secondary" @click="close">CHIUDI ✕</button></div><div class="divider"/>
  <div class="grid2 coach-athlete-quick-actions">
   <button class="action-card" @click="createProgramOpen=true"><LionIcon name="calendar"/><div><strong>Nuovo programma</strong><small>Giorni e settimane</small></div></button>
   <button class="action-card" @click="linkToEditor('personal')"><LionIcon name="plus"/><div><strong>Crea scheda personale</strong><small>Parti da zero · senza programma</small></div></button>
   <button class="action-card" @click="linkToEditor('shared')"><LionIcon name="book"/><div><strong>Assegna scheda dall'archivio</strong><small>Scegli dall'archivio Coach</small></div></button>
   <button class="action-card" @click="importOpen=true;importRows=[]"><LionIcon name="clipboard"/><div><strong>Importa tabelle</strong><small>Incolla o collega dati</small></div></button>
  </div>
 </section>
 <p v-if="message" class="notice" role="status">{{message}}</p>
 <div v-if="data" class="grid2 assignment-columns"><section class="panel assignment-panel"><h3>📄 SCHEDE SINGOLE SENZA PROGRAMMA</h3><p class="muted small">Assegnate ma non collegate a giorni attivi.</p>
  <div class="assignment-scroll"><div v-if="!groups?.unprogrammed.length" class="line-card">Nessuna scheda singola senza programma.</div><div v-for="g in groups?.unprogrammed||[]" :key="g.sheet.id" class="line-card coach-v1-assignment-card"><b>🏋️ {{g.sheet.title}}</b><div class="assignment-actions"><button class="secondary" @click="opened=g.sheet">Visualizza</button><button class="secondary" @click="editPersonal(g.sheet)">Modifica</button><button class="secondary" @click="copyToArchive(g.sheet)">Copia nell'Archivio schede</button><button class="danger" @click="trashUnusedPersonal(g.sheet)">Nel Cestino</button></div></div></div>
 </section><section class="panel assignment-panel"><h3>🗓️ SCHEDE IN PROGRAMMA</h3><p class="muted small">Una sola card per scheda; settimane e giorni rimangono visibili.</p>
  <div class="assignment-scroll"><div v-if="!groups?.programmed.length" class="line-card">Nessuna scheda in programma.</div><div v-for="g in groups?.programmed||[]" :key="g.sheet.id" class="line-card coach-v1-assignment-card"><b>🏋️ {{g.sheet.title}}</b><p class="small green">{{linksLabel(g.links)}}</p><div class="assignment-actions"><button class="secondary" @click="opened=g.sheet">Visualizza</button><button class="secondary" @click="editPersonal(g.sheet)">Modifica</button><button class="secondary" @click="copyToArchive(g.sheet)">Copia nell'Archivio schede</button><button class="secondary" @click="manageDays(g.links)">Gestisci giorni</button><button class="danger" @click="showDelete={title:g.sheet.title,links:g.links}">Cancella</button></div></div></div>
 </section></div>
 <p class="muted small" v-if="groups">{{groups.unprogrammed.length}} schede senza programma · {{groups.programmed.length}} schede in programma · aggiornamento in tempo reale</p>
 <details class="panel" :open="showMaintenance" @toggle="showMaintenance=($event.target as HTMLDetailsElement).open"><summary>⚙ Manutenzione delle schede esistenti</summary><p class="small muted">Le vecchie schede possono essere protette nell'Archivio. La manutenzione non cancella automaticamente schede o settimane.</p><button class="primary" @click="alignMaintenance">Allinea schede delle settimane (manutenzione)</button></details>
 <section class="panel coach-program-compact"><div class="row between"><h2>PROGRAMMA ATTUALE</h2><span class="pill pill-neutral">{{currentWeeks.length}} SETTIMANE</span></div>
  <div class="row" style="flex-wrap:wrap;gap:8px"><button class="secondary" :disabled="!week||busy" @click="openDuplicate">Duplica settimana</button><button class="danger" :disabled="!week||busy" @click="trashCurrentWeek">Sposta settimana nel Cestino</button><button class="secondary" @click="trashedWeeksOpen=!trashedWeeksOpen">{{trashedWeeksOpen?'Chiudi cestino':'Cestino settimane'}} ({{deletedWeeks.length}})</button></div>
  <div v-if="trashedWeeksOpen" class="stack"><p v-if="!deletedWeeks.length" class="muted small">Nessuna settimana nel Cestino.</p><article v-for="w in deletedWeeks" :key="w.id" class="line-card row between"><span><b>{{w.name}}</b> · {{w.startDate}}</span><button class="secondary" :disabled="busy" @click="restoreWeek(w.id)">Ripristina</button></article></div>
  <p v-if="pendingRemote" class="notice" role="alert">Un altro Coach ha aggiornato la settimana. La tua bozza è conservata; il salvataggio controllerà eventuali conflitti sui singoli campi.</p>
  <div class="coach-week-bar"><div class="week-pills" aria-label="Numeri settimana"><button v-for="(w,i) in currentWeeks" :key="w.id" type="button" class="week-pill" :class="{selected:!weekTrashMode&&w.id===week?.id&&showWeek,'week-delete-target':weekTrashMode,'week-trash-selected':weekTrashMode&&selectedWeekTrash.includes(w.id)}" :aria-label="`${weekTrashMode?'Seleziona o deseleziona per il Cestino':'Apri o chiudi'} settimana ${i+1}: ${w.name}`" :aria-pressed="weekTrashMode?selectedWeekTrash.includes(w.id):w.id===week?.id&&showWeek" @click="chooseWeek(w.id)">{{i+1}}</button></div><div class="week-trash-controls"><button type="button" class="secondary" @click="toggleTrashMode">{{weekTrashMode?'Annulla selezione':'Seleziona settimane da eliminare'}}</button><button v-if="weekTrashMode" type="button" class="danger" :disabled="!selectedWeekTrash.length||busy||!canWrite" @click="trashMultipleWeeks">Nel Cestino ({{selectedWeekTrash.length}})</button></div></div>
  <p class="small muted">{{weekTrashMode?'Tocca i numeri per selezionare o deselezionare settimane.':'Tocca il numero della settimana per aprirla o richiuderla.'}} Le attività non salvate restano nella bozza durante la sincronizzazione.</p>
  <div v-if="week" class="stack coach-week-content"><div class="row between coach-week-heading"><h3>{{week.name}} · {{week.startDate}}</h3><button class="secondary coach-week-close" @click="showWeek=!showWeek">{{showWeek?'Chiudi settimana':'Apri settimana'}}</button></div>
   <p v-if="!canWrite && showWeek" class="small muted" role="note">Puoi compilare una bozza delle attività; il salvataggio sull’account reale rimane disabilitato finché non saranno completate le verifiche.</p>
   <div v-if="showWeek" class="program-days"><article v-for="(d,i) in week.days" :id="'live-week-'+i" :key="week.id+'-'+i" class="program-day coach-v1-day"><h3>{{DAY_NAMES[i]}}</h3>
    <div class="coach-v1-activity"><b>ATTIVITÀ 1</b><input v-if="activityDraft[i]" v-model="activityDraft[i].activity1" maxlength="200" placeholder="Scrivi l’attività…" aria-label="Attività 1"/><p v-else>{{d.activity1||'Scrivi l’attività…'}}</p></div>
    <div class="coach-v1-activity"><b>ATTIVITÀ 2</b><input v-if="activityDraft[i]" v-model="activityDraft[i].activity2" maxlength="200" placeholder="Scrivi l’attività…" aria-label="Attività 2"/><p v-else>{{d.activity2||'Scrivi l’attività…'}}</p></div>
    <div v-for="slot in ([1,2] as const)" :key="slot" class="coach-v1-sheet"><div class="coach-v1-slot-head"><b>SCHEDA {{slot}}</b></div>
      <p>{{(slot===1?d.templateId:d.templateId2)?(byId(slot===1?d.templateId:d.templateId2)?.title||'Riferimento da verificare'):(slot===1?'Nessuna scheda collegata':'Nessuna seconda scheda')}}</p>
      <button type="button" class="primary wide coach-v1-slot-link" :aria-label="'Collega scheda '+slot+' '+DAY_NAMES[i]" @click="openPick(i,slot)">Collega</button>
      <div class="coach-v1-slot-actions"><button class="secondary" @click="linkToEditor('personal',i,slot)">Crea nuova</button><button class="danger" :disabled="!(slot===1?d.templateId:d.templateId2) || busy" @click="unlink(i,slot)">Scollega</button></div>
    </div>
   </article></div><div class="row"><button class="primary" :disabled="!canWrite||busy" @click="saveActivities">Salva attività</button></div>
  </div><p v-else class="muted">Nessuna settimana attiva.</p>
 </section>
 </template>
 <div v-if="pick&&week" class="modal-overlay" @click.self="pick=null"><div class="dialog coach-picker-dialog" role="dialog" aria-modal="true" :aria-label="`Collega scheda ${pick.slot} · ${DAY_NAMES[pick.day]}`" style="max-width:540px"><div class="row between"><h2>COLLEGA SCHEDA {{pick.slot}} · {{DAY_NAMES[pick.day].toUpperCase()}}</h2><button class="bare" aria-label="Chiudi" @click="pick=null">✕</button></div>
  <input v-model="pickSearch" type="search" placeholder="Cerca scheda…" aria-label="Cerca nell’Archivio Coach"/><button class="secondary wide" @click="linkToEditor('shared',pick.day,pick.slot);pick=null">Apri Archivio Coach · Visualizza / Assegna</button>
  <div class="row between"><strong>ARCHIVIO COACH · {{visibleShared.length}} schede</strong><button class="secondary" :disabled="sharedLoading" @click="refreshSharedChoices(true)">{{sharedLoading?'Caricamento…':'Aggiorna'}}</button></div>
  <p v-if="sharedError" class="notice" role="alert">Archivio non leggibile: {{sharedError}}</p>
  <div class="coach-v1-pick-list"><article v-for="s in visibleShared" :key="s.id" class="line-card coach-pick-row"><div class="coach-pick-row-info"><b>{{s.title}}</b><p class="muted small">{{s.category}} · {{s.exercises.length}} esercizi</p></div><div class="row coach-pick-row-actions"><button class="secondary" @click="openSharedPreview(s)">Visualizza</button><button class="primary" :disabled="busy||!canWrite" @click="assignFromShared(s)">Assegna</button></div></article><p v-if="!sharedLoading&&!visibleShared.length" class="muted">Nessuna scheda nell’Archivio Coach corrisponde alla ricerca.</p></div>
  <p class="small muted">Per una nuova scheda usa «Crea nuova» nel giorno. Le schede personali già assegnate e quelle storiche restano conservate ma non compaiono in questa scelta.</p>
 </div></div>
 <div v-if="duplicateOpen" class="modal-overlay" @click.self="duplicateOpen=false"><div class="dialog" style="max-width:420px"><div class="row between"><h2>DUPLICA SETTIMANA</h2><button class="bare" aria-label="Chiudi duplicazione" @click="duplicateOpen=false">✕</button></div><p class="small muted">Copia attività e i due collegamenti a schede esistenti. L'originale non cambia.</p><label>Settimana sorgente<select v-model="duplicateSourceId"><option v-for="w in currentWeeks" :key="w.id" :value="w.id">{{w.name}} · {{w.startDate}}</option></select></label><label>Data nuovo lunedì<input v-model="duplicateMonday" type="date"/></label><button class="primary wide" :disabled="busy||!canWrite" @click="duplicateCurrentWeek">Duplica settimana</button></div></div>
 <div v-if="importOpen" class="modal-overlay" @click.self="importOpen=false"><div class="dialog" style="max-width:600px">
 <div class="row between"><h2>IMPORTA PROGRAMMA</h2><button class="bare" aria-label="Chiudi importazione" @click="importOpen=false">✕</button></div>
 <p class="small muted">Incolla una tabella o conserva un link Google Drive nel profilo dell'atleta.</p>
 <div class="row"><button :class="importMode==='paste'?'primary':'secondary'" @click="importMode='paste'">Incolla tabella</button><button :class="importMode==='drive'?'primary':'secondary'" @click="importMode='drive'">Link Google Drive</button></div>
 <template v-if="importMode==='paste'"><p class="small muted">Giorno | Attività 1 | Attività 2 · 7 righe separate da TAB o punto e virgola. Le schede collegate non vengono modificate.</p>
 <textarea v-model="importText" rows="7" placeholder="Lunedì&#9;MMA&#9;Boxe&#10;Martedì&#9;Forza&#9;Mobilità" @input="importRows=[]"/>
 <button class="secondary wide" @click="previewImport">Mostra anteprima</button>
 <div v-if="importRows.length" class="stack"><p class="small">{{importRows.length}} giorni riconosciuti:</p><p v-for="r in importRows" :key="r.dayIndex" class="line-card small"><b>{{r.name}}</b> · {{r.activity1||'—'}} | {{r.activity2||'—'}}</p></div>
 <button class="primary wide" :disabled="!week||!importRows.length" @click="applyImport">Inserisci nella settimana aperta (senza salvare)</button>
 </template><template v-else><label>Link Google Drive<input v-model="driveUrl" type="url" placeholder="https://drive.google.com/…"/></label><button class="primary wide" :disabled="!canWrite||busy" @click="saveDriveUrl">Salva link nel profilo atleta</button></template>
 </div></div>
 <div v-if="showDelete" class="modal-overlay" @click.self="showDelete=null"><div class="dialog" style="max-width:520px"><div class="row between"><h2>Cancella collegamenti · {{showDelete.title}}</h2><button class="bare" @click="showDelete=null">✕</button></div><p class="muted">Rimuovi solo il collegamento dal giorno, senza cancellare l'archivio.</p><article v-for="l in showDelete.links" :key="l.weekId+l.day+l.slot" class="line-card row between"><b>{{l.weekName}} · {{l.dayName}} · Scheda {{l.slot}}</b><button class="danger" @click="unlinkExact(l)">Scollega</button></article></div></div>
 <div v-if="createProgramOpen" class="modal-overlay" @click.self="createProgramOpen=false"><div class="dialog" style="max-width:440px"><div class="row between"><h2>NUOVO PROGRAMMA FIGHTER</h2><button class="bare" @click="createProgramOpen=false">✕</button></div><label>Nome programma<input v-model="programName" maxlength="90" placeholder="Preparazione match"/></label><label class="coach-date-picker-label" @click="openDatePicker">Data inizio (lunedì)<input v-model="monday" type="date" aria-label="Scegli la data di inizio"/></label><label>Numero settimane<input v-model.number="weekCount" type="number" min="1" max="52"/></label><button class="primary wide" :disabled="!canWrite||busy" @click="newProgram">Crea programma</button></div></div>
 <SheetDetail v-if="opened" :sheet="opened" @close="opened=null"/>
</div>
</template>
