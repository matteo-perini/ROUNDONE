<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Layout V1 Coach: gli stessi IDs delle settimane/archivi reali, senza fallback DEMO. */
import {onMounted,onUnmounted,ref,computed,shallowRef,watch,nextTick} from 'vue'
import {RouterLink,useRouter,useRoute,onBeforeRouteLeave} from 'vue-router'
import {onAuthStateChanged} from 'firebase/auth'
import {collection,doc,getDocs,getDocFromServer,onSnapshot,query,where,updateDoc,type Unsubscribe} from 'firebase/firestore'
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
import {hasCoachAssignment} from '../features/athletes/coachMembership'
import {activeCoaches,confirmPrimaryCoach,coachAssignmentWritesReady,type GymCoach} from '../features/athletes/primaryCoachAssignment'
import {labCoachRoster,type RosterAthlete} from '../features/athletes/liveCoachRoster'
import {programOverview,type ProgramOverview} from '../features/athletes/programOverview'
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

// PATCH 3/7: i filtri sono esclusivamente organizzativi, mai un ACL per-atleta.
const membershipFilter=ref('tutti') // tutti | miei | coach:<UID> (UID dal roster reale)
const programFilter=ref<'tutti'|'con'|'senza'>('tutti')
const coachRoster=ref<GymCoach[]>([]),assignPrimary=ref('')
const canManagePrimaryCoach=computed(()=>session.value?.role==='titolare' && coachAssignmentWritesReady())
const availableCoaches=computed(()=>activeCoaches(coachRoster.value,session.value?.gymId||''))
const otherCoaches=computed(()=>availableCoaches.value.filter(c=>c.id!==session.value?.uid))
const legacyPanelOpen=ref(false),legacyPrimary=ref<Record<string,string>>({})
const unassignedAthletes=computed(()=>roster.value.filter(a=>!a.primaryCoachUid))
const coachLabel=(uid:string)=>coachRoster.value.find(c=>c.id===uid)?.name||'Coach non presente nell’elenco'
const hasAssignedMembers=computed(()=>roster.value.some(a=>hasCoachAssignment(a)))
// Non attribuire erroneamente programmi a chi possiede soltanto schede personali.
type CardInfo={loading:boolean;overview?:ProgramOverview;hasPersonal?:boolean;error?:boolean}
const cardInfo=ref<Record<string,CardInfo>>({})
const now=ref(Date.now())
let rosterEpoch=0
let refreshClock:ReturnType<typeof setInterval>|null=null
function touchClock(){now.value=Date.now()}
function coachMatches(a:RosterAthlete):boolean{
 const mode=membershipFilter.value
 if(mode==='tutti')return true
 if(mode==='miei')return a.primaryCoachUid===session.value?.uid
 return mode.startsWith('coach:')&&a.primaryCoachUid===mode.slice(6)
}
const filteredByCoach=computed(()=>roster.value.filter(a=>coachMatches(a)&&
 (a.name+' '+a.email).toLocaleLowerCase('it').includes(search.value.toLocaleLowerCase('it'))))
const visibleAthletes=computed(()=>filteredByCoach.value.filter(a=>{
 if(programFilter.value==='tutti')return true
 const info=cardInfo.value[a.id]
 return !!info?.overview&&(programFilter.value==='con'?info.overview.hasProgram:!info.overview.hasProgram)
}))
const waitingCardCount=computed(()=>filteredByCoach.value.filter(a=>!cardInfo.value[a.id]?.overview&&!cardInfo.value[a.id]?.error).length)
const currentFilterLabel=computed(()=>membershipFilter.value==='tutti'?'Tutta la palestra':membershipFilter.value==='miei'?'I miei Atleti':coachLabel(membershipFilter.value.slice(6)))
function initials(a:RosterAthlete):string{return a.name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w.charAt(0).toUpperCase()).join('')||'AT'}
function displayOverview(a:RosterAthlete):ProgramOverview|undefined{
 const cached=cardInfo.value[a.id]?.overview
 // Aggiorna la percentuale al trascorrere del tempo, senza nuove letture Firebase.
 void now.value
 return cached?programOverviewCache(cached,a.id):undefined
}
// Conserviamo i documenti già letti, non solo il risultato temporaneo.
const weekCache=new Map<string,ProgramWeek[]>()
function programOverviewCache(cached:ProgramOverview,id:string):ProgramOverview{
 const weeks=weekCache.get(id);return weeks?programOverview(weeks,new Date(now.value)):cached
}
function barColor(percent:number){return `hsl(${Math.round(Math.max(0,Math.min(100,percent))*1.4)}, 88%, 48%)`}
function barStyle(percent:number){return {width:percent<=0?'3px':`${Math.max(0,Math.min(100,percent))}%`,backgroundColor:barColor(percent)}}
// Tre richieste al massimo in parallelo; nessun listener per ogni Atleta.
async function readCardInfo(id:string,epoch:number){
 const s=session.value
 if(!s||!roster.value.some(a=>a.id===id))return
 try{
  const {db}=getStagingClients()
  const root=['gyms',s.gymId,'athlete_programs',id] as const
  const weeksSnap=await getDocs(collection(db,...root,'weeks'))
  if(!alive||epoch!==rosterEpoch)return
  const weeks=weeksSnap.docs.map(d=>{
   const row=d.data()
   return {id:d.id,athleteId:id,name:String(row.name||''),programTitle:typeof row.programTitle==='string'?row.programTitle:undefined,
    startDate:typeof row.startDate==='string'?row.startDate:undefined,
    weekIndex:typeof row.weekIndex==='number'?row.weekIndex:undefined,
    totalWeeks:typeof row.totalWeeks==='number'?row.totalWeeks:undefined,
    deletedAt:row.deletedAt?String(row.deletedAt):undefined,days:[]} as ProgramWeek
  })
  let hasPersonal=false
  // Leggi le schede personali solo dove NON esistono settimane attive.
  if(!weeks.some(w=>!w.deletedAt)){
   const personalSnap=await getDocs(collection(db,...root,'personal_templates'))
   hasPersonal=personalSnap.docs.some(x=>!x.data().deletedAt)
  }
  if(!alive||epoch!==rosterEpoch)return
  weekCache.set(id,weeks)
  cardInfo.value={...cardInfo.value,[id]:{loading:false,overview:programOverview(weeks,new Date(now.value)),hasPersonal}}
 }catch(e){
  if(!alive||epoch!==rosterEpoch)return
  cardInfo.value={...cardInfo.value,[id]:{loading:false,error:true}}
  // L'errore NON viene interpretato come "Nessuna programmazione".
  console.warn('Riepilogo settimane non disponibile per un atleta della palestra.',e)
 }
}
async function fillCardInfo(epoch:number){
 const ids=roster.value.map(a=>a.id).filter(id=>!cardInfo.value[id])
 for(const id of ids)cardInfo.value={...cardInfo.value,[id]:{loading:true}}
 let index=0
 async function worker(){while(alive&&epoch===rosterEpoch&&index<ids.length){
  const id=ids[index++];if(id)await readCardInfo(id,epoch)
 }}
 await Promise.all(Array.from({length:Math.min(3,ids.length)},()=>worker()))
}
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
 const a=roster.value.find(a=>a.id===id);assignPrimary.value=a?.primaryCoachUid||''
}
async function saveCoachAssignment(){
 const s=session.value,a=athlete.value;if(!s||!a||!canManagePrimaryCoach.value||busy.value)return
 try{
  const coachUid=confirmPrimaryCoach(assignPrimary.value,coachRoster.value,s.gymId)
  if(coachUid===a.primaryCoachUid){message.value='Coach principale già assegnato.';return}
  if(!window.confirm(`Assegnare ${coachLabel(coachUid)} come Coach principale di ${a.name}? Gli altri Coach della palestra manterranno l'accesso completo.`))return
  await withWrite('Assegna Coach principale',async()=>{const {db}=getStagingClients();await updateDoc(doc(db,'users',a.id),{primaryCoachUid:coachUid})})
 }catch(e){message.value=e instanceof Error?e.message:String(e)}
}
async function assignLegacyAthlete(athleteId:string){
 const s=session.value,a=roster.value.find(x=>x.id===athleteId)
 if(!s||s.role!=='titolare'||!a||a.primaryCoachUid||!canManagePrimaryCoach.value||busy.value)return
 try{
  const coachUid=confirmPrimaryCoach(legacyPrimary.value[athleteId]||'',coachRoster.value,s.gymId)
  if(!window.confirm(`Assegnare ${coachLabel(coachUid)} a ${a.name}? Non saranno cambiati schede, account, inviti o permessi degli altri Coach.`))return
  busy.value=true
  try{
   const {db}=getStagingClients()
   // Field-only patch: NEVER overwrite the profile or its historical invitation.
   await updateDoc(doc(db,'users',a.id),{primaryCoachUid:coachUid})
   delete legacyPrimary.value[athleteId]
   status.value=`Coach principale associato a ${a.name}. Gli altri dati sono invariati.`
  }finally{busy.value=false}
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
  weekCache.set(id,change.weeks);cardInfo.value={...cardInfo.value,[id]:{loading:false,overview:programOverview(change.weeks,new Date(now.value)),hasPersonal:change.personal.some(p=>!p.deletedAt)}};
  const requested=route.query.weekId
  if(typeof requested==='string' && change.weeks.some(w=>w.id===requested&&!w.deletedAt)){
   if(!dirty.value||selectedWeek.value===requested)selectedWeek.value=requested
  }else if(typeof requested==='string' && requested && !selectedWeek.value){message.value='La settimana richiesta non è più attiva: seleziona una settimana disponibile.'}
  status.value='Sincronizzato con Firebase';},e=>{if(alive)error.value='Schede atleta: '+e.message})
})
onMounted(async()=>{window.addEventListener('beforeunload',beforeUnload);document.addEventListener('visibilitychange',touchClock);refreshClock=setInterval(touchClock,15*60*1000);try{
 const s=await readStagingSession();if(!alive)return
 if(s.role==='atleta')throw new Error('Accesso Coach non autorizzato');session.value=s
 const {db,auth}=getStagingClients();const p=await getDocFromServer(doc(db,'users',s.uid))
 if(!p.exists()||p.data().gymId!==s.gymId||p.data().role!=='admin')throw new Error('Identità Coach non verificata')
 stopAuth=onAuthStateChanged(auth,u=>{if(alive&&u?.uid!==s.uid){stopSharedListening();close();void router.replace('/accesso')}})
 const usersCollection=collection(db,'users')
 // Proprietà organizzativa: nessun filtro di sicurezza per singolo Coach.
 // PATCH 2: primaryCoachUid is ONLY an organizational tag.
 // All authorized Coaches can work with every athlete of THEIR gym.
 const athletesQuery=query(usersCollection,where('gymId','==',s.gymId),where('role','==','athlete'))
 stopCoaches=onSnapshot(query(usersCollection,where('gymId','==',s.gymId),where('role','==','admin')),sn=>{
   if(!alive)return;coachRoster.value=sn.docs.map(d=>({id:d.id,name:[d.data().name,d.data().surname].filter(x=>typeof x==='string'&&x.trim()).join(' ').trim()||d.id,gymId:String(d.data().gymId||''),role:String(d.data().role||''),membershipStatus:d.data().membershipStatus}))
 },e=>{if(alive)error.value='Elenco coach: '+e.message})
 stopUsers=onSnapshot(athletesQuery,sn=>{
 if(!alive)return;roster.value=labCoachRoster(sn.docs.map(d=>({id:d.id,data:d.data()})),s.gymId)
 // Dati di ogni atleta letti una volta, con concorrenza limitata.
 void fillCardInfo(rosterEpoch)
 if(currentId.value&&!roster.value.some(a=>a.id===currentId.value))close();
 if(!currentId.value && typeof route.query.athleteId==='string' && roster.value.some(a=>a.id===route.query.athleteId))currentId.value=route.query.athleteId;
 status.value='Atleti aggiornati da Firebase'
 },e=>{if(alive)error.value='Elenco atleti: '+e.message})
}catch(e){error.value=e instanceof Error?e.message:String(e)}})
onUnmounted(()=>{window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('visibilitychange',touchClock);if(refreshClock)clearInterval(refreshClock);rosterEpoch++;alive=false;stopSharedListening();stopSelected();stopUsers?.();stopCoaches?.();stopAuth?.()})
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
 <section v-if="!athlete" class="panel coach-team-toolbar lf-roster-toolbar">
  <div class="coach-team-title"><h2 class="card-heading">{{uiText("GESTIONE ATLETI")}}</h2><span class="muted">{{uiText("SELEZIONA UN ATLETA")}}</span></div>
  <div class="coach-team-tools"><RouterLink to="/coach/staff" class="primary">{{uiText("+ Invita atleta")}}</RouterLink><input v-model="search" type="search" :aria-label="uiText('Cerca atleta')" :placeholder="uiText('Cerca atleta per nome…')"/></div>
 </section>
 <p v-if="error" class="notice" role="alert">{{error}}</p><p class="small muted" role="status">{{status}}</p>
 <section v-if="!athlete" class="lf-roster-summary">
   <span class="small muted">{{visibleAthletes.length}} {{uiText('atleti ·')}} {{uiText(currentFilterLabel)}}</span>
   <button v-if="session?.role==='titolare'&&unassignedAthletes.length" type="button" class="secondary lf-assign-legacy" @click="legacyPanelOpen=!legacyPanelOpen">{{uiText(legacyPanelOpen?'Chiudi assegnazioni':'Riassegna atleti storici')}}</button>
 </section>
 <p v-if="!athlete" class="small muted lf-roster-help">{{uiText("Tutti i Coach autorizzati possono gestire gli Atleti della stessa palestra; il Coach principale serve soltanto a organizzare l'elenco.")}}</p>
 <p v-if="!athlete&&!hasAssignedMembers" class="small muted lf-roster-help">{{uiText("Gli Atleti storici senza Coach principale restano visibili nel filtro «Tutti gli Atleti».")}}</p>
 <section v-if="!athlete&&session?.role==='titolare'&&unassignedAthletes.length&&legacyPanelOpen" class="panel">
  <div class="row between"><div><strong>{{uiText("Atleti storici senza Coach principale")}}</strong><p class="small muted">{{unassignedAthletes.length}} {{uiText("profili ancora da associare. Le schede e gli inviti non cambiano.")}}</p></div><button class="secondary" @click="legacyPanelOpen=false">{{uiText("Chiudi")}}</button></div>
  <div class="stack">
   <p v-if="!canManagePrimaryCoach" class="muted small">{{uiText("Questa migrazione sarà attiva dopo la pubblicazione delle Rules aggiornate e l'abilitazione del flag di associazione. Nessuna modifica viene effettuata ora.")}}</p>
   <div v-for="a in unassignedAthletes" :key="a.id" class="row between line-card" style="gap:12px;flex-wrap:wrap">
    <div><b>{{a.name}}</b><p class="small muted">{{a.email}}</p></div>
    <label class="small">{{uiText("Coach principale")}}<select v-model="legacyPrimary[a.id]" :disabled="!canManagePrimaryCoach"><option value="">{{uiText("Seleziona")}}</option><option v-for="c in availableCoaches" :key="c.id" :value="c.id">{{c.name}}</option></select></label>
    <button class="primary" :disabled="!canManagePrimaryCoach||busy||!legacyPrimary[a.id]" @click="assignLegacyAthlete(a.id)">{{uiText("Associa")}}</button>
   </div>
  </div>
 </section>
 <section v-if="!athlete" class="lf-roster-filters" aria-label="Filtri elenco atleti">
  <div class="lf-roster-filter-group"><strong>{{uiText("Filtro per Coach")}}</strong><div class="lf-filter-buttons">
   <button type="button" :class="{selected:membershipFilter==='miei'}" :aria-pressed="membershipFilter==='miei'" @click="membershipFilter='miei'">{{uiText("I miei Atleti")}}</button>
   <button v-for="c in otherCoaches" :key="c.id" type="button" :class="{selected:membershipFilter==='coach:'+c.id}" :aria-pressed="membershipFilter==='coach:'+c.id" @click="membershipFilter='coach:'+c.id">{{uiText("Atleti di")}} {{c.name}}</button>
   <button type="button" :class="{selected:membershipFilter==='tutti'}" :aria-pressed="membershipFilter==='tutti'" @click="membershipFilter='tutti'">{{uiText("Tutti gli Atleti")}}</button>
  </div></div>
  <div class="lf-roster-filter-group"><strong>{{uiText("Programmazione")}}</strong><div class="lf-filter-buttons">
   <button type="button" :class="{selected:programFilter==='tutti'}" :aria-pressed="programFilter==='tutti'" @click="programFilter='tutti'">{{uiText("Tutti")}}</button>
   <button type="button" :class="{selected:programFilter==='con'}" :aria-pressed="programFilter==='con'" @click="programFilter='con'">{{uiText("Con programmazione")}}</button>
   <button type="button" :class="{selected:programFilter==='senza'}" :aria-pressed="programFilter==='senza'" @click="programFilter='senza'">{{uiText("Senza programmazione")}}</button>
  </div></div>
 </section>
 <p v-if="!athlete&&waitingCardCount" class="small muted lf-roster-loading" role="status">{{uiText("Caricamento riepiloghi delle programmazioni:")}} {{waitingCardCount}}…</p>
 <p v-if="!athlete&&!visibleAthletes.length&&!waitingCardCount" class="small muted" role="status">{{uiText("Nessun Atleta corrisponde ai filtri selezionati.")}}</p>
 <div v-if="!athlete" class="grid2 lf-roster-grid">
  <button v-for="a in visibleAthletes" :key="a.id" type="button" class="lf-roster-card" :title="a.email" @click="choose(a.id)">
   <span class="lf-roster-avatar" aria-hidden="true">{{initials(a)}}</span>
   <span class="lf-roster-details">
    <span class="lf-roster-card-top">
     <strong class="lf-roster-name">{{a.name.toUpperCase()}}</strong>
     <span class="lf-roster-separator" aria-hidden="true"></span>
     <span class="lf-roster-program-label">
      <template v-if="cardInfo[a.id]?.error"><b>{{uiText("Riepilogo non disponibile")}}</b><small>{{uiText("Riprova riaprendo la pagina")}}</small></template>
      <template v-else-if="!cardInfo[a.id]?.overview"><b>{{uiText("Caricamento…")}}</b><small>{{uiText("Verifica schede")}}</small></template>
      <template v-else-if="displayOverview(a)?.hasProgram">
       <b v-if="displayOverview(a)?.weekNumber">{{uiText('Settimana')}} {{displayOverview(a)?.weekNumber}} {{uiText('di')}} {{displayOverview(a)?.totalWeeks}}</b>
       <b v-else>{{uiText("Programmazione")}}</b>
       <small :class="{'lf-roster-positive':displayOverview(a)?.phase==='active'}">{{uiText(displayOverview(a)?.phase==='active'?'Programmazione attiva':displayOverview(a)?.phase==='future'?'Programmazione in arrivo':displayOverview(a)?.phase==='expired'?'Programma terminato':'Date da verificare')}}</small>
      </template>
      <template v-else><b>{{uiText(cardInfo[a.id]?.hasPersonal?'Solo schede personali':'Nessuna scheda assegnata')}}</b><small>{{uiText("Nessuna programmazione")}}</small></template>
     </span>
    </span>
    <span v-if="displayOverview(a)?.hasProgram&&displayOverview(a)?.remainingPercent!==undefined" class="lf-roster-progress">
      <span class="lf-roster-track"><span class="lf-roster-fill" :style="barStyle(displayOverview(a)!.remainingPercent!)"></span></span>
      <span class="lf-roster-time" :title="displayOverview(a)?.remainingLabel">{{Math.round(displayOverview(a)!.remainingPercent!)}}% · {{displayOverview(a)?.remainingLabel ? uiText(displayOverview(a)!.remainingLabel!) : ''}}</span>
    </span>
   </span>
   <span class="lf-roster-manage">{{uiText("GESTISCI")}} <span aria-hidden="true">⌄</span></span>
  </button>
 </div>
 <template v-if="athlete">
 <section v-if="session?.role==='titolare'" class="panel"><h3>{{uiText("COACH PRINCIPALE")}}</h3>
  <p class="muted small">{{uiText("Assegnazione organizzativa. Riccardo, Marco e gli altri Coach attivi della stessa palestra continueranno a collaborare su tutti gli Atleti.")}}</p>
  <label>{{uiText("Coach principale")}}<select v-model="assignPrimary"><option value="">{{uiText("Seleziona un Coach")}}</option><option v-for="c in availableCoaches" :key="c.id" :value="c.id">{{c.name}}</option></select></label>
  <p v-if="athlete.invitedByUid" class="muted small">{{uiText("Invito originale creato da:")}} {{coachLabel(athlete.invitedByUid)}} {{uiText("(dato storico non modificabile).")}}</p>
  <p v-if="!canManagePrimaryCoach" class="muted small">{{uiText("Salvataggio disponibile dopo l'aggiornamento delle Rules e l'attivazione del flag VITE_LIONFIT_COACH_ASSIGNMENT_V1.")}}</p>
  <button class="primary" :disabled="busy||!canWrite||!assignPrimary||!canManagePrimaryCoach" @click="saveCoachAssignment">{{uiText("Salva Coach principale")}}</button>
 </section>
 <section class="panel coach-selected-athlete"><div class="row between coach-selected-head"><div><span class="eyebrow">{{uiText("GESTIONE ATLETA")}}</span><h2>{{athlete.name.toUpperCase()}}</h2></div><button class="secondary" @click="close">{{uiText("CHIUDI ✕")}}</button></div><div class="divider"/>
  <div class="grid2 coach-athlete-quick-actions">
   <button class="action-card" @click="createProgramOpen=true"><LionIcon name="calendar"/><div><strong>{{uiText("Nuovo programma")}}</strong><small>{{uiText("Giorni e settimane")}}</small></div></button>
   <button class="action-card" @click="linkToEditor('personal')"><LionIcon name="plus"/><div><strong>{{uiText("Crea scheda personale")}}</strong><small>{{uiText("Parti da zero · senza programma")}}</small></div></button>
   <button class="action-card" @click="linkToEditor('shared')"><LionIcon name="book"/><div><strong>{{uiText("Assegna scheda dall'archivio")}}</strong><small>{{uiText("Scegli dall'archivio Coach")}}</small></div></button>
   <button class="action-card" @click="importOpen=true;importRows=[]"><LionIcon name="clipboard"/><div><strong>{{uiText("Importa tabelle")}}</strong><small>{{uiText("Incolla o collega dati")}}</small></div></button>
  </div>
 </section>
 <p v-if="message" class="notice" role="status">{{message}}</p>
 <div v-if="data" class="grid2 assignment-columns"><section class="panel assignment-panel"><h3>{{uiText("📄 SCHEDE SINGOLE SENZA PROGRAMMA")}}</h3><p class="muted small">{{uiText("Assegnate ma non collegate a giorni attivi.")}}</p>
  <div class="assignment-scroll"><div v-if="!groups?.unprogrammed.length" class="line-card">{{uiText("Nessuna scheda singola senza programma.")}}</div><div v-for="g in groups?.unprogrammed||[]" :key="g.sheet.id" class="line-card coach-v1-assignment-card"><b>🏋️ {{g.sheet.title}}</b><div class="assignment-actions"><button class="secondary" @click="opened=g.sheet">{{uiText("Visualizza")}}</button><button class="secondary" @click="editPersonal(g.sheet)">{{uiText("Modifica")}}</button><button class="secondary" @click="copyToArchive(g.sheet)">{{uiText("Copia nell'Archivio schede")}}</button><button class="danger" @click="trashUnusedPersonal(g.sheet)">{{uiText("Nel Cestino")}}</button></div></div></div>
 </section><section class="panel assignment-panel"><h3>{{uiText("🗓️ SCHEDE IN PROGRAMMA")}}</h3><p class="muted small">{{uiText("Una sola card per scheda; settimane e giorni rimangono visibili.")}}</p>
  <div class="assignment-scroll"><div v-if="!groups?.programmed.length" class="line-card">{{uiText("Nessuna scheda in programma.")}}</div><div v-for="g in groups?.programmed||[]" :key="g.sheet.id" class="line-card coach-v1-assignment-card"><b>🏋️ {{g.sheet.title}}</b><p class="small green">{{linksLabel(g.links)}}</p><div class="assignment-actions"><button class="secondary" @click="opened=g.sheet">{{uiText("Visualizza")}}</button><button class="secondary" @click="editPersonal(g.sheet)">{{uiText("Modifica")}}</button><button class="secondary" @click="copyToArchive(g.sheet)">{{uiText("Copia nell'Archivio schede")}}</button><button class="secondary" @click="manageDays(g.links)">{{uiText("Gestisci giorni")}}</button><button class="danger" @click="showDelete={title:g.sheet.title,links:g.links}">{{uiText("Cancella")}}</button></div></div></div>
 </section></div>
 <p class="muted small" v-if="groups">{{groups.unprogrammed.length}} {{uiText("schede senza programma ·")}} {{groups.programmed.length}} {{uiText("schede in programma · aggiornamento in tempo reale")}}</p>
 <details class="panel" :open="showMaintenance" @toggle="showMaintenance=($event.target as HTMLDetailsElement).open"><summary>{{uiText("⚙ Manutenzione delle schede esistenti")}}</summary><p class="small muted">{{uiText("Le vecchie schede possono essere protette nell'Archivio. La manutenzione non cancella automaticamente schede o settimane.")}}</p><button class="primary" @click="alignMaintenance">{{uiText("Allinea schede delle settimane (manutenzione)")}}</button></details>
 <section class="panel coach-program-compact"><div class="row between"><h2>{{uiText("PROGRAMMA ATTUALE")}}</h2><span class="pill pill-neutral">{{currentWeeks.length}} {{uiText("SETTIMANE")}}</span></div>
  <div class="row" style="flex-wrap:wrap;gap:8px"><button class="secondary" :disabled="!week||busy" @click="openDuplicate">{{uiText("Duplica settimana")}}</button><button class="danger" :disabled="!week||busy" @click="trashCurrentWeek">{{uiText("Sposta settimana nel Cestino")}}</button><button class="secondary" @click="trashedWeeksOpen=!trashedWeeksOpen">{{trashedWeeksOpen?'Chiudi cestino':'Cestino settimane'}} ({{deletedWeeks.length}})</button></div>
  <div v-if="trashedWeeksOpen" class="stack"><p v-if="!deletedWeeks.length" class="muted small">{{uiText("Nessuna settimana nel Cestino.")}}</p><article v-for="w in deletedWeeks" :key="w.id" class="line-card row between"><span><b>{{w.name}}</b> · {{w.startDate}}</span><button class="secondary" :disabled="busy" @click="restoreWeek(w.id)">{{uiText("Ripristina")}}</button></article></div>
  <p v-if="pendingRemote" class="notice" role="alert">{{uiText("Un altro Coach ha aggiornato la settimana. La tua bozza è conservata; il salvataggio controllerà eventuali conflitti sui singoli campi.")}}</p>
  <div class="coach-week-bar"><div class="week-pills" aria-label="Numeri settimana"><button v-for="(w,i) in currentWeeks" :key="w.id" type="button" class="week-pill" :class="{selected:!weekTrashMode&&w.id===week?.id&&showWeek,'week-delete-target':weekTrashMode,'week-trash-selected':weekTrashMode&&selectedWeekTrash.includes(w.id)}" :aria-label="`${weekTrashMode?'Seleziona o deseleziona per il Cestino':'Apri o chiudi'} settimana ${i+1}: ${w.name}`" :aria-pressed="weekTrashMode?selectedWeekTrash.includes(w.id):w.id===week?.id&&showWeek" @click="chooseWeek(w.id)">{{i+1}}</button></div><div class="week-trash-controls"><button type="button" class="secondary" @click="toggleTrashMode">{{weekTrashMode?'Annulla selezione':'Seleziona settimane da eliminare'}}</button><button v-if="weekTrashMode" type="button" class="danger" :disabled="!selectedWeekTrash.length||busy||!canWrite" @click="trashMultipleWeeks">{{uiText("Nel Cestino (")}}{{selectedWeekTrash.length}})</button></div></div>
  <p class="small muted">{{weekTrashMode?'Tocca i numeri per selezionare o deselezionare settimane.':'Tocca il numero della settimana per aprirla o richiuderla.'}} {{uiText("Le attività non salvate restano nella bozza durante la sincronizzazione.")}}</p>
  <div v-if="week" class="stack coach-week-content"><div class="row between coach-week-heading"><h3>{{week.name}} · {{week.startDate}}</h3><button class="secondary coach-week-close" @click="showWeek=!showWeek">{{showWeek?'Chiudi settimana':'Apri settimana'}}</button></div>
   <p v-if="!canWrite && showWeek" class="small muted" role="note">{{uiText("Puoi compilare una bozza delle attività; il salvataggio sull’account reale rimane disabilitato finché non saranno completate le verifiche.")}}</p>
   <div v-if="showWeek" class="program-days"><article v-for="(d,i) in week.days" :id="'live-week-'+i" :key="week.id+'-'+i" class="program-day coach-v1-day"><h3>{{DAY_NAMES[i]}}</h3>
    <div class="coach-v1-activity"><b>{{uiText("ATTIVITÀ 1")}}</b><input v-if="activityDraft[i]" v-model="activityDraft[i].activity1" maxlength="200" placeholder="Scrivi l’attività…" :aria-label="uiText('Attività 1')"/><p v-else>{{d.activity1||'Scrivi l’attività…'}}</p></div>
    <div class="coach-v1-activity"><b>{{uiText("ATTIVITÀ 2")}}</b><input v-if="activityDraft[i]" v-model="activityDraft[i].activity2" maxlength="200" placeholder="Scrivi l’attività…" aria-label="Attività 2"/><p v-else>{{d.activity2||'Scrivi l’attività…'}}</p></div>
    <div v-for="slot in ([1,2] as const)" :key="slot" class="coach-v1-sheet"><div class="coach-v1-slot-head"><b>{{uiText("SCHEDA")}} {{slot}}</b></div>
      <p>{{(slot===1?d.templateId:d.templateId2)?(byId(slot===1?d.templateId:d.templateId2)?.title||'Riferimento da verificare'):(slot===1?'Nessuna scheda collegata':'Nessuna seconda scheda')}}</p>
      <button type="button" class="primary wide coach-v1-slot-link" :aria-label="'Collega scheda '+slot+' '+DAY_NAMES[i]" @click="openPick(i,slot)">{{uiText("Collega")}}</button>
      <div class="coach-v1-slot-actions"><button class="secondary" @click="linkToEditor('personal',i,slot)">{{uiText("Crea nuova")}}</button><button class="danger" :disabled="!(slot===1?d.templateId:d.templateId2) || busy" @click="unlink(i,slot)">{{uiText("Scollega")}}</button></div>
    </div>
   </article></div><div class="row"><button class="primary" :disabled="!canWrite||busy" @click="saveActivities">{{uiText("Salva attività")}}</button></div>
  </div><p v-else class="muted">{{uiText("Nessuna settimana attiva.")}}</p>
 </section>
 </template>
 <div v-if="pick&&week" class="modal-overlay" @click.self="pick=null"><div class="dialog coach-picker-dialog" role="dialog" aria-modal="true" :aria-label="`Collega scheda ${pick.slot} · ${DAY_NAMES[pick.day]}`" style="max-width:540px"><div class="row between"><h2>{{uiText("COLLEGA SCHEDA")}} {{pick.slot}} · {{DAY_NAMES[pick.day].toUpperCase()}}</h2><button class="bare" :aria-label="uiText('Chiudi')" @click="pick=null">✕</button></div>
  <input v-model="pickSearch" type="search" placeholder="Cerca scheda…" aria-label="Cerca nell’Archivio Coach"/><button class="secondary wide" @click="linkToEditor('shared',pick.day,pick.slot);pick=null">{{uiText("Apri Archivio Coach · Visualizza / Assegna")}}</button>
  <div class="row between"><strong>{{uiText("ARCHIVIO COACH ·")}} {{visibleShared.length}} {{uiText("schede")}}</strong><button class="secondary" :disabled="sharedLoading" @click="refreshSharedChoices(true)">{{sharedLoading?'Caricamento…':'Aggiorna'}}</button></div>
  <p v-if="sharedError" class="notice" role="alert">{{uiText("Archivio non leggibile:")}} {{sharedError}}</p>
  <div class="coach-v1-pick-list"><article v-for="s in visibleShared" :key="s.id" class="line-card coach-pick-row"><div class="coach-pick-row-info"><b>{{s.title}}</b><p class="muted small">{{s.category}} · {{s.exercises.length}} {{uiText("esercizi")}}</p></div><div class="row coach-pick-row-actions"><button class="secondary" @click="openSharedPreview(s)">{{uiText("Visualizza")}}</button><button class="primary" :disabled="busy||!canWrite" @click="assignFromShared(s)">{{uiText("Assegna")}}</button></div></article><p v-if="!sharedLoading&&!visibleShared.length" class="muted">{{uiText("Nessuna scheda nell’Archivio Coach corrisponde alla ricerca.")}}</p></div>
  <p class="small muted">{{uiText("Per una nuova scheda usa «Crea nuova» nel giorno. Le schede personali già assegnate e quelle storiche restano conservate ma non compaiono in questa scelta.")}}</p>
 </div></div>
 <div v-if="duplicateOpen" class="modal-overlay" @click.self="duplicateOpen=false"><div class="dialog" style="max-width:420px"><div class="row between"><h2>{{uiText("DUPLICA SETTIMANA")}}</h2><button class="bare" aria-label="Chiudi duplicazione" @click="duplicateOpen=false">✕</button></div><p class="small muted">{{uiText("Copia attività e i due collegamenti a schede esistenti. L'originale non cambia.")}}</p><label>{{uiText("Settimana sorgente")}}<select v-model="duplicateSourceId"><option v-for="w in currentWeeks" :key="w.id" :value="w.id">{{w.name}} · {{w.startDate}}</option></select></label><label>{{uiText("Data nuovo lunedì")}}<input v-model="duplicateMonday" type="date"/></label><button class="primary wide" :disabled="busy||!canWrite" @click="duplicateCurrentWeek">{{uiText("Duplica settimana")}}</button></div></div>
 <div v-if="importOpen" class="modal-overlay" @click.self="importOpen=false"><div class="dialog" style="max-width:600px">
 <div class="row between"><h2>{{uiText("IMPORTA PROGRAMMA")}}</h2><button class="bare" aria-label="Chiudi importazione" @click="importOpen=false">✕</button></div>
 <p class="small muted">{{uiText("Incolla una tabella o conserva un link Google Drive nel profilo dell'atleta.")}}</p>
 <div class="row"><button :class="importMode==='paste'?'primary':'secondary'" @click="importMode='paste'">{{uiText("Incolla tabella")}}</button><button :class="importMode==='drive'?'primary':'secondary'" @click="importMode='drive'">{{uiText("Link Google Drive")}}</button></div>
 <template v-if="importMode==='paste'"><p class="small muted">Giorno | Attività 1 | Attività 2 · 7 righe separate da TAB o punto e virgola. Le schede collegate non vengono modificate.</p>
 <textarea v-model="importText" rows="7" placeholder="Lunedì&#9;MMA&#9;Boxe&#10;Martedì&#9;Forza&#9;Mobilità" @input="importRows=[]"/>
 <button class="secondary wide" @click="previewImport">{{uiText("Mostra anteprima")}}</button>
 <div v-if="importRows.length" class="stack"><p class="small">{{importRows.length}} {{uiText("giorni riconosciuti:")}}</p><p v-for="r in importRows" :key="r.dayIndex" class="line-card small"><b>{{r.name}}</b> · {{r.activity1||'—'}} | {{r.activity2||'—'}}</p></div>
 <button class="primary wide" :disabled="!week||!importRows.length" @click="applyImport">{{uiText("Inserisci nella settimana aperta (senza salvare)")}}</button>
 </template><template v-else><label>{{uiText("Link Google Drive")}}<input v-model="driveUrl" type="url" placeholder="https://drive.google.com/…"/></label><button class="primary wide" :disabled="!canWrite||busy" @click="saveDriveUrl">{{uiText("Salva link nel profilo atleta")}}</button></template>
 </div></div>
 <div v-if="showDelete" class="modal-overlay" @click.self="showDelete=null"><div class="dialog" style="max-width:520px"><div class="row between"><h2>{{uiText("Cancella collegamenti ·")}} {{showDelete.title}}</h2><button class="bare" @click="showDelete=null">✕</button></div><p class="muted">{{uiText("Rimuovi solo il collegamento dal giorno, senza cancellare l'archivio.")}}</p><article v-for="l in showDelete.links" :key="l.weekId+l.day+l.slot" class="line-card row between"><b>{{l.weekName}} · {{l.dayName}} {{uiText("· Scheda")}} {{l.slot}}</b><button class="danger" @click="unlinkExact(l)">{{uiText("Scollega")}}</button></article></div></div>
 <div v-if="createProgramOpen" class="modal-overlay" @click.self="createProgramOpen=false"><div class="dialog" style="max-width:440px"><div class="row between"><h2>{{uiText("NUOVO PROGRAMMA FIGHTER")}}</h2><button class="bare" @click="createProgramOpen=false">✕</button></div><label>{{uiText("Nome programma")}}<input v-model="programName" maxlength="90" placeholder="Preparazione match"/></label><label class="coach-date-picker-label" @click="openDatePicker">{{uiText("Data inizio (lunedì)")}}<input v-model="monday" type="date" aria-label="Scegli la data di inizio"/></label><label>{{uiText("Numero settimane")}}<input v-model.number="weekCount" type="number" min="1" max="52"/></label><button class="primary wide" :disabled="!canWrite||busy" @click="newProgram">{{uiText("Crea programma")}}</button></div></div>
 <SheetDetail v-if="opened" :sheet="opened" @close="opened=null"/>
</div>
</template>

<style scoped>
/* PATCH 3/7 — ricreazione fedele delle card approvate: sempre due colonne desktop. */
.lf-roster-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:13px 15px;border-radius:13px}
.lf-roster-toolbar .card-heading{font-size:16px;letter-spacing:.03em}
.lf-roster-toolbar .coach-team-title .muted{font-size:10px;font-weight:750}
.lf-roster-toolbar .coach-team-tools{display:flex;align-items:center;gap:9px;flex:1;justify-content:flex-end}
.lf-roster-toolbar .coach-team-tools input{flex:0 1 280px;min-width:170px}
.lf-roster-toolbar .coach-team-tools .primary{font-size:11px;white-space:nowrap}
.lf-roster-summary{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.lf-roster-summary .lf-assign-legacy{min-height:30px;padding:6px 9px;font-size:11px;border-radius:8px}
.lf-roster-help{margin:0}
.lf-roster-filters{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:13px 16px;border:1px solid var(--border);border-radius:13px;background:var(--card)}
.lf-roster-filter-group{min-width:0;display:flex;flex-direction:column;gap:10px}
.lf-roster-filter-group+.lf-roster-filter-group{padding-left:15px;border-left:1px solid var(--border)}
.lf-roster-filter-group>strong{font-size:12px;font-weight:850}
.lf-filter-buttons{display:flex;align-items:center;flex-wrap:wrap;gap:7px}
.lf-filter-buttons button{width:auto;min-height:35px;padding:7px 10px;background:var(--field);color:var(--text);border:1px solid var(--outline);border-radius:9px;font-size:11px;font-weight:750;transition:background-color .17s ease,border-color .17s ease,color .17s ease}
.lf-filter-buttons button.selected{background:var(--green);color:#fff;border-color:var(--mint)}
.lf-filter-buttons button:not(.selected):hover{border-color:var(--mint)}
.lf-roster-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.lf-roster-card{display:flex;align-items:center;gap:10px;min-width:0;min-height:84px;padding:11px 12px;background:var(--card);border:1px solid var(--outline);border-radius:12px;text-align:left;color:var(--text);transition:border-color .2s ease,box-shadow .2s ease}
.lf-roster-card:hover,.lf-roster-card:focus-visible{border-color:var(--mint);box-shadow:0 0 0 1px var(--green-bg)}
.lf-roster-avatar{width:39px;height:39px;display:grid;place-items:center;flex:none;border-radius:50%;background:var(--card2);font-size:12px;font-weight:900}
.lf-roster-details{display:flex;flex:1;flex-direction:column;justify-content:center;gap:7px;min-width:0}
.lf-roster-card-top{display:flex;align-items:center;min-width:0;gap:11px}
.lf-roster-name{flex:0 1 105px;min-width:0;line-height:1.15;font-size:12px;font-weight:900;overflow-wrap:anywhere}
.lf-roster-separator{align-self:stretch;width:1px;min-height:26px;background:var(--border);flex:none}
.lf-roster-program-label{display:flex;flex:1;flex-direction:column;gap:3px;min-width:0;line-height:1.25}
.lf-roster-program-label b{font-size:11px;font-weight:800}
.lf-roster-program-label small{font-size:10px;color:var(--muted)}
.lf-roster-program-label small.lf-roster-positive{color:var(--mint)}
.lf-roster-progress{display:flex;align-items:center;gap:8px;min-width:0}
.lf-roster-track{display:block;flex:1;min-width:20px;height:7px;border-radius:99px;background:var(--field);border:1px solid var(--outline);overflow:hidden}
.lf-roster-fill{height:100%;display:block;border-radius:inherit;transition:width .5s linear,background-color .5s linear}
.lf-roster-time{font-size:9px;color:var(--muted);flex:0 1 134px;line-height:1.15}
.lf-roster-manage{flex:none;display:flex;align-items:center;gap:3px;padding:8px 9px;border:1px solid var(--green);border-radius:10px;color:var(--mint);font-size:10px;font-weight:850;white-space:nowrap}
.lf-roster-loading{margin:0}
@media(max-width:1150px){.lf-roster-card{gap:7px;padding:9px}.lf-roster-name{flex-basis:85px}.lf-roster-manage{padding:7px;font-size:9px}}
@media(max-width:1050px){.lf-roster-grid{grid-template-columns:1fr}.lf-roster-name{flex-basis:140px}.lf-roster-card{min-height:74px}}
@media(max-width:780px){.lf-roster-filters{grid-template-columns:1fr;gap:12px}.lf-roster-filter-group+.lf-roster-filter-group{padding-left:0;padding-top:12px;border-left:0;border-top:1px solid var(--border)}.lf-roster-toolbar{align-items:stretch}.lf-roster-toolbar .coach-team-tools{width:100%;justify-content:flex-start}.lf-roster-toolbar .coach-team-tools input{flex:1;min-width:0}}
@media(max-width:380px){.lf-roster-card-top{gap:6px}.lf-roster-name{flex-basis:70px}.lf-roster-manage{font-size:9px}.lf-roster-time{font-size:8px}}
@media(prefers-reduced-motion:reduce){.lf-roster-fill,.lf-roster-card,.lf-filter-buttons button{transition:none}}
</style>
