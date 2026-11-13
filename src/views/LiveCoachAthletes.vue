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
import {createV1Program,saveV1WeekActivities,duplicateV1Weeks,trashV1Week,restoreV1Week} from '../integrations/firestore/programs'
import {advanceV1Monday} from '../features/sheets/v1WeekCodec'
import {groupActivePrograms,programForWeek,firstVacantMonday} from '../features/sheets/programFamilies'
import {hasUnsavedActivities} from '../features/sheets/weekDraftPolicy'
import {updateV1WeekSlot} from '../integrations/firestore/liveWeekSlots'
import {createCoachModel} from '../integrations/firestore/liveCoachOperations'
import {editorToV1,v1ToEditor} from '../features/sheets/v1ExerciseCodec'
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
const createProgramOpen=ref(false),programName=ref('Preparazione Fighter'),monday=ref(''),weekCount=ref(4),programError=ref('')
watch([monday,programName,weekCount],()=>{programError.value=''})
const showWeek=ref(true),showMaintenance=ref(false),activeDay=ref(-1)
const dayError=ref('')
const pendingDayUnlink=ref<{day:number;slot:1|2}|null>(null)
// PATCH 02: the day dialog uses the same week draft and Firestore field-level CAS as before.
// Selecting or closing a day never implicitly writes or discards existing edits.
function openDay(day:number){
 if(!week.value||day<0||day>=DAY_KEYS.length)return
 activeDay.value=day;dayError.value=''
}
function closeDay(){activeDay.value=-1;dayError.value='';pendingDayUnlink.value=null}
function slotTitle(day:ProgramDay,slot:1|2){
 const id=slot===1?day.templateId:day.templateId2
 return id?(byId(id)?.title||'Scheda collegata · riferimento da verificare'):'Nessuna scheda collegata'
}
function previewActivity(index:number,field:'activity1'|'activity2'){
 const value=activityDraft.value[index]?.[field]
 return value?.trim()||'—'
}
function dayDate(start:string|undefined,index:number){
 if(!start||!/^(\d{4})-(\d{2})-(\d{2})$/.test(start))return ''
 const d=new Date(start+'T12:00:00Z')
 if(Number.isNaN(d.getTime()))return ''
 d.setUTCDate(d.getUTCDate()+index)
 return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(d)
}
const selectedDayLabel=computed(()=>activeDay.value<0?'':DAY_NAMES[activeDay.value])

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
const coachRoster=ref<GymCoach[]>([])
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
    programId:typeof row.programId==='string'?row.programId:undefined,
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
const duplicateOpen=ref(false),duplicateSourceId=ref(''),duplicateTargetMonday=ref(''),duplicateCount=ref(1),duplicateError=ref(''),trashedWeeksOpen=ref(false),selectedWeekTrash=ref<string[]>([])
const weekSelectionMode=ref<'normal'|'duplicate'|'delete'>('normal')
const selectedProgramId=ref('')
const deleteConfirmOpen=ref(false)
function setWeekSelectionMode(mode:'duplicate'|'delete'){
 if(busy.value)return
 if(dirty.value){message.value='Salva prima le attività modificate, poi seleziona le settimane.';return}
 weekSelectionMode.value=weekSelectionMode.value===mode?'normal':mode
 selectedWeekTrash.value=[]
 duplicateSourceId.value=''
 duplicateOpen.value=false
 deleteConfirmOpen.value=false
 closeDay()
}

const deletedWeeks=computed(()=>data.value?.weeks.filter(w=>!!w.deletedAt)??[])
const athlete=computed(()=>roster.value.find(a=>a.id===currentId.value))
const allActiveWeeks=computed(()=>data.value?.weeks.filter(w=>!w.deletedAt)??[])
const programs=computed(()=>groupActivePrograms(allActiveWeeks.value))
const selectedProgram=computed(()=>programs.value.find(p=>p.id===selectedProgramId.value)||programForWeek(programs.value,selectedWeek.value)||programs.value.at(-1))
const currentWeeks=computed(()=>selectedProgram.value?.weeks??[])
const week=computed(()=>currentWeeks.value.find(w=>w.id===selectedWeek.value)??currentWeeks.value.at(-1)??null)
function selectProgram(id:string){
 const p=programs.value.find(p=>p.id===id)
 if(!p||selectedProgram.value?.id===id||!discardIfDirty('Cambiare programma'))return
 selectedProgramId.value=id;selectedWeek.value=p.weeks[0]?.id||'';showWeek.value=true
 weekSelectionMode.value='normal';selectedWeekTrash.value=[];duplicateSourceId.value='';closeDay()
}
function selectedWeekLabel(){const p=selectedProgram.value,w=week.value
 return p&&w?`${p.title} · Settimana ${p.weeks.findIndex(x=>x.id===w.id)+1}`:'Nessuna settimana'
}
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
function stopSelected(){stopSheets?.();stopSheets=null;selectedProgramId.value='';data.value=null;opened.value=null;pick.value=null;selectedWeek.value='';selectedWeekTrash.value=[];weekSelectionMode.value='normal';deleteConfirmOpen.value=false;closeDay();syncActivityDraft(null)}
function choose(id:string){if(!roster.value.some(a=>a.id===id)||id===currentId.value||!discardIfDirty('Cambiare atleta'))return;currentId.value=id;showWeek.value=true
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
 const belonging=programForWeek(programs.value,id)
 if(!belonging)return
 if(weekSelectionMode.value!=='normal'&&belonging.id!==selectedProgram.value?.id){message.value='Seleziona prima il programma sul quale vuoi operare.';return}
 if(weekSelectionMode.value==='delete'){
  selectedWeekTrash.value=selectedWeekTrash.value.includes(id)?selectedWeekTrash.value.filter(x=>x!==id):[...selectedWeekTrash.value,id]
  return
 }
 if(weekSelectionMode.value==='duplicate'){
  // In this mode the selected number is the SOURCE, never the destination.
  openDuplicate(id);return
 }
 if(id===week.value?.id){showWeek.value=!showWeek.value;closeDay();return}
 if(dirty.value){message.value='Salva le attività modificate prima di cambiare settimana.';return}
 selectedProgramId.value=belonging.id;selectedWeek.value=id;showWeek.value=true;closeDay();pick.value=null;syncActivityDraft(belonging.weeks.find(w=>w.id===id)||null)
}
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
function openAthleteProgress(){
 const a=athlete.value,s=session.value
 if(!a||!s||a.gymId!==s.gymId)return
 if(dirty.value){message.value='Salva prima le attività modificate, poi apri i Progressi dell’Atleta.';return}
 void router.push({path:'/coach/progressi',query:{athleteId:a.id}})
}
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
async function saveActivities(closeAfter=false){
 const s=session.value,w=week.value,a=athlete.value
 if(!s||!w||!a||busy.value)return
 dayError.value=''
 if(!dirty.value){message.value='Nessuna attività modificata.';if(closeAfter)closeDay();return}
 if(!canWrite.value){dayError.value='Non disponi dei permessi per salvare il programma.';return}
 const next=copy(activityDraft.value),baseline=copy(draftBaseline.value),originalWeekId=w.id,originalAthlete=a.id
 busy.value=true
 try{
  const {db}=getStagingClients()
  await saveV1WeekActivities(db,s.gymId,a.id,w.id,next,baseline,s.uid)
  if(currentId.value===originalAthlete&&week.value?.id===originalWeekId){draftBaseline.value=copy(next);pendingRemote.value=false}
  message.value='Attività della settimana salvate correttamente.'
  if(closeAfter)closeDay()
 }catch(e){dayError.value=e instanceof Error?e.message:String(e);message.value='Salva attività: '+dayError.value}
 finally{busy.value=false}
}
function openDatePicker(event:MouseEvent){
 const wrapper=event.currentTarget as HTMLElement
 const input=wrapper.querySelector('input[type="date"]') as HTMLInputElement|null
 if(!input || event.target===input)return
 try{input.showPicker()}catch{input.focus()}
}
function validProgramMonday(date:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false
 const value=new Date(date+'T12:00:00Z')
 return !Number.isNaN(value.getTime())&&value.toISOString().slice(0,10)===date&&value.getUTCDay()===1
}
async function newProgram(){
 const s=session.value,a=athlete.value
 if(!s||!a||busy.value)return
 programError.value=''
 if(!programName.value.trim()||programName.value.trim().length>90){programError.value='Inserisci un nome programma valido (massimo 90 caratteri).';return}
 if(!validProgramMonday(monday.value)){
  programError.value='La programmazione deve iniziare di lunedì. Seleziona il lunedì della settimana da cui desideri avviare il programma.'
  return
 }
 if(!Number.isInteger(weekCount.value)||weekCount.value<1||weekCount.value>52){programError.value='Seleziona una durata compresa tra 1 e 52 settimane.';return}
 if(!discardIfDirty('Creare un nuovo programma'))return
 if(!canWrite.value){programError.value='Operazione non disponibile: verificare accesso e configurazione della palestra.';return}
 busy.value=true
 try{
  const {db}=getStagingClients()
  const ids=await createV1Program(db,s.gymId,a.id,programName.value,monday.value,weekCount.value,s.uid)
  // La finestra viene chiusa soltanto dopo il commit Firestore.
  createProgramOpen.value=false
  programError.value=''
  selectedProgramId.value=''
  selectedWeek.value=ids[0]||''
  showWeek.value=true
  message.value=`Programma creato: ${ids.length} ${ids.length===1?'settimana':'settimane'}.`
 }catch(e){programError.value=e instanceof Error?e.message:String(e)}
 finally{busy.value=false}
}
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
 if(busy.value||!canWrite.value||!week.value)return
 const value=slot===1?week.value.days[day]?.templateId:week.value.days[day]?.templateId2
 if(!value)return
 pendingDayUnlink.value={day,slot}
 dayError.value=''
}
async function confirmDayUnlink(){
 const p=pendingDayUnlink.value,s=session.value,a=athlete.value,w=week.value
 if(!p||!s||!a||!w||busy.value||!canWrite.value)return
 const expected=p.slot===1?w.days[p.day]?.templateId:w.days[p.day]?.templateId2
 if(!expected){pendingDayUnlink.value=null;return}
 busy.value=true;dayError.value=''
 try{
  const {db}=getStagingClients()
  await updateV1WeekSlot(db,s.gymId,a.id,w.id,p.day,p.slot,expected,'',s.uid)
  message.value=`Scheda ${p.slot} scollegata da ${DAY_NAMES[p.day]}. Non apparirà tra le schede senza programma; lo storico rimane in Archivio.`
  pendingDayUnlink.value=null
 }catch(e){dayError.value=e instanceof Error?e.message:String(e)}
 finally{busy.value=false}
}
function unlinkExact(l:Link){
 const s=session.value,a=athlete.value
 if(!s||!a)return
 if(!window.confirm('Scollegare questa scheda dal giorno? Se non è collegata altrove sparirà dal Piano; lo storico rimarrà nell’Archivio.'))return
 void withWrite('Scollega uno slot',async()=>{
  const{db}=getStagingClients()
  await updateV1WeekSlot(db,s.gymId,a.id,l.weekId,l.dayIndex,l.slot,l.templateId,'',s.uid)
  showDelete.value=null
  if(!dirty.value)selectedWeek.value=l.weekId
 })
}

function manageDays(links:Link[]){const l=links[0];if(!l)return;selectedWeek.value=l.weekId;showWeek.value=true;activeDay.value=l.dayIndex;dayError.value=''
 void nextTick(()=>document.getElementById('live-week-'+l.dayIndex)?.scrollIntoView({behavior:'smooth',block:'center'}))}
function openDuplicate(sourceId:string){
 const selected=currentWeeks.value.find(w=>w.id===sourceId)
 if(!selected)return
 if(dirty.value){message.value='Salva prima le attività modificate, poi duplica la settimana.';return}
 if(!selected.startDate){message.value='La settimana selezionata non ha una data valida.';return}
 const last=currentWeeks.value.filter(w=>!!w.startDate).at(-1)
 if(!last?.startDate){message.value='Impossibile calcolare il lunedì successivo: manca la data dell’ultima settimana.';return}
 duplicateSourceId.value=selected.id
 try{duplicateTargetMonday.value=firstVacantMonday(allActiveWeeks.value,last.startDate,advanceV1Monday)}
 catch{message.value='La data finale del programma non è valida.';return}
 duplicateError.value=''
 duplicateCount.value=1
 duplicateOpen.value=true
}
async function duplicateCurrentWeek(){
 const s=session.value,a=athlete.value,w=currentWeeks.value.find(x=>x.id===duplicateSourceId.value)
 if(!s||!a||!w||busy.value)return
 duplicateError.value=''
 if(!canWrite.value){duplicateError.value='Non hai i permessi per duplicare la settimana.';return}
 if(!Number.isInteger(duplicateCount.value)||duplicateCount.value<1||duplicateCount.value>12){duplicateError.value='Inserisci un numero di copie da 1 a 12.';return}
 if(currentWeeks.value.length+duplicateCount.value>52){duplicateError.value='Ogni programma può contenere al massimo 52 settimane attive.';return}
 // La data è scelta dal Coach, anche se lascia volontariamente settimane libere.
 const target=duplicateTargetMonday.value
 if(!validProgramMonday(target)){duplicateError.value='Scegli un lunedì valido come data di destinazione.';return}
 let copyDates:string[]=[]
 try{copyDates=Array.from({length:duplicateCount.value},(_,i)=>advanceV1Monday(target,i))}
 catch{duplicateError.value='La data selezionata non è valida.';return}
 const occupied=new Set(allActiveWeeks.value.map(x=>x.startDate))
 if(copyDates.some(date=>occupied.has(date))){duplicateError.value='Una delle date è già occupata. Scegli un lunedì libero: nessuna copia è stata creata.';return}
 busy.value=true
 try{
  const {db}=getStagingClients()
  const ids=await duplicateV1Weeks(db,s.gymId,a.id,w.id,target,duplicateCount.value,s.uid)
  duplicateOpen.value=false
  weekSelectionMode.value='normal'
  selectedProgramId.value=selectedProgram.value?.id||''
  selectedWeek.value=ids[ids.length-1]||''
  showWeek.value=true
  message.value=`${ids.length} ${ids.length===1?'settimana duplicata':'settimane duplicate'} a partire dal lunedì ${target}. Tutte le copie sono state salvate in un'unica operazione.`
 }catch(e){duplicateError.value=e instanceof Error?e.message:String(e)}
 finally{busy.value=false}
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
 if(!s||!a||!ids.length)return
 if(!canWrite.value){message.value='Non hai i permessi per spostare settimane nel Cestino.';return}
 // Week IDs are checked again against the current active weeks before the first write.
 if(ids.some(id=>!currentWeeks.value.some(w=>w.id===id))){message.value='La selezione è cambiata. Riapri la modalità eliminazione.';return}
 void withWrite(`Cestina ${ids.length} settimane`,async()=>{
  const {db}=getStagingClients()
  for(const id of ids)await trashV1Week(db,s.gymId,a.id,id,s.uid)
  selectedWeekTrash.value=[];selectedWeek.value='';weekSelectionMode.value='normal';deleteConfirmOpen.value=false;closeDay()
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
 <p v-if="!athlete" class="small muted lf-roster-help">{{uiText("Tutti i Coach autorizzati possono gestire gli Atleti della stessa palestra. L’associazione al Coach serve soltanto per organizzare i filtri.")}}</p>
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
 <section class="panel coach-selected-athlete"><div class="row between coach-selected-head"><div><span class="eyebrow">{{uiText("GESTIONE ATLETA")}}</span><h2>{{athlete.name.toUpperCase()}}</h2></div><button class="secondary" @click="close">{{uiText("CHIUDI ✕")}}</button></div><div class="divider"/>
  <div class="grid2 coach-athlete-quick-actions">
   <button class="action-card" @click="programError='';createProgramOpen=true"><LionIcon name="calendar"/><div><strong>{{uiText("Nuovo programma")}}</strong><small>{{uiText("Giorni e settimane")}}</small></div></button>
   <button class="action-card" @click="linkToEditor('personal')"><LionIcon name="plus"/><div><strong>{{uiText("Crea scheda personale")}}</strong><small>{{uiText("Parti da zero · senza programma")}}</small></div></button>
   <button class="action-card" @click="linkToEditor('shared')"><LionIcon name="book"/><div><strong>{{uiText("Assegna scheda dall'archivio")}}</strong><small>{{uiText("Scegli dall'archivio Coach")}}</small></div></button>
   <button class="action-card" type="button" @click="openAthleteProgress"><LionIcon name="progress"/><div><strong>Progressi</strong><small>Storico, carichi, check e obiettivi</small></div></button>
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
 <section class="panel coach-program-compact lf-program-v2" aria-label="Programmazione settimanale Atleta">
  <div class="row between lf-program-v2-heading"><div><h2>PROGRAMMI DELL’ATLETA</h2><p class="small muted">{{programs.length}} programmi · {{allActiveWeeks.length}} settimane · Seleziona un programma e la sua settimana</p></div><span class="pill pill-neutral">{{currentWeeks.length}} SETTIMANE SELEZIONATE</span></div>
  <div class="lf-week-planner">
   <div class="lf-week-left">
    <div v-for="(program,programIndex) in programs" :key="program.id" class="lf-p11-program-row" :class="{'lf-p11-program-active':selectedProgram?.id===program.id}">
      <button type="button" class="lf-p11-program-header" :aria-pressed="selectedProgram?.id===program.id" @click="selectProgram(program.id)"><strong>Programma {{programIndex+1}} · {{program.title}}</strong><small>{{program.startDate}} → {{program.endDate}} · {{program.weeks.length}} settimane</small></button>
      <div class="lf-week-numbers" :aria-label="`Seleziona settimana di ${program.title}`">
       <button v-for="(w,i) in program.weeks" :key="w.id" type="button" class="lf-week-number" :class="{'is-current':weekSelectionMode==='normal'&&w.id===week?.id&&showWeek,'is-delete-mode':weekSelectionMode==='delete'&&selectedProgram?.id===program.id,'is-duplicate-mode':weekSelectionMode==='duplicate'&&selectedProgram?.id===program.id,'is-marked-delete':weekSelectionMode==='delete'&&selectedWeekTrash.includes(w.id),'is-marked-duplicate':weekSelectionMode==='duplicate'&&duplicateSourceId===w.id}"
       :aria-label="`${program.title}, settimana ${i+1}, ${w.startDate}`"
       :aria-pressed="weekSelectionMode==='delete'?selectedWeekTrash.includes(w.id):weekSelectionMode==='duplicate'?duplicateSourceId===w.id:w.id===week?.id&&showWeek"
       @click="chooseWeek(w.id)" :title="`Dal ${w.startDate}`">{{i+1}}<span v-if="weekSelectionMode==='delete'&&selectedWeekTrash.includes(w.id)" aria-hidden="true">✓</span><span v-else-if="weekSelectionMode==='duplicate'&&duplicateSourceId===w.id" aria-hidden="true">⧉</span></button>
      </div>
    </div>
    <div v-if="weekSelectionMode!=='normal'" class="lf-mode-notice" :class="weekSelectionMode==='delete'?'lf-mode-notice-delete':'lf-mode-notice-duplicate'" role="status">
      <strong>{{weekSelectionMode==='duplicate'?'Modalità duplicazione':'Modalità eliminazione'}}</strong>
      <span>{{weekSelectionMode==='duplicate'?'Seleziona il numero della settimana da copiare. Potrai scegliere il lunedì di destinazione.':'Seleziona uno o più numeri. Le settimane scelte saranno evidenziate in rosso.'}}</span>
      <div class="lf-mode-actions"><button v-if="weekSelectionMode==='delete'" type="button" class="danger" :disabled="!selectedWeekTrash.length||busy||!canWrite" @click="deleteConfirmOpen=true">Nel Cestino ({{selectedWeekTrash.length}})</button><button type="button" class="secondary" @click="weekSelectionMode='normal';selectedWeekTrash=[];duplicateSourceId='';deleteConfirmOpen=false">Annulla selezione</button></div>
    </div>
    <p v-if="message&&weekSelectionMode!=='normal'" class="small muted lf-week-selection-message" role="status">{{message}}</p>
    <div v-if="trashedWeeksOpen" class="lf-weeks-trash-list stack"><p v-if="!deletedWeeks.length" class="muted small">Nessuna settimana nel Cestino.</p><article v-for="w in deletedWeeks" :key="w.id" class="line-card row between"><span><b>{{w.name}}</b> · {{w.startDate}}</span><button class="secondary" :disabled="busy" @click="restoreWeek(w.id)">Ripristina</button></article></div>
    <p v-if="pendingRemote" class="notice" role="alert">Un altro Coach ha aggiornato la settimana. La bozza è conservata; verifica il salvataggio.</p>
    <div v-if="week" class="lf-week-workspace">
     <div class="row between lf-week-title"><h3>{{selectedWeekLabel()}} · {{week.startDate}}</h3><span v-if="dirty" class="lf-unsaved-label" role="status">● Attività non salvate</span></div>
     <p v-if="!canWrite && showWeek" class="small muted">Le modifiche non possono essere salvate finché la configurazione della palestra non consente le scritture.</p>
     <div v-if="showWeek" class="lf-compact-week-days" aria-label="Sette giorni della settimana">
      <button v-for="(d,i) in week.days" :id="'live-week-'+i" :key="week.id+'-'+i" class="lf-compact-day" type="button" :disabled="weekSelectionMode!=='normal'" :aria-label="`Modifica ${DAY_NAMES[i]}`" @click="openDay(i)">
       <span class="lf-compact-day-header"><strong>{{DAY_NAMES[i]}}</strong><small>{{dayDate(week.startDate,i)}}</small><span aria-hidden="true">›</span></span>
       <span class="lf-compact-day-data"><small>Attività 1</small><b :title="previewActivity(i,'activity1')">{{previewActivity(i,'activity1')}}</b></span>
       <span class="lf-compact-day-data"><small>Attività 2</small><b :title="previewActivity(i,'activity2')">{{previewActivity(i,'activity2')}}</b></span>
       <span class="lf-compact-day-data lf-compact-day-sheet"><small>Scheda 1</small><b :title="slotTitle(d,1)">{{slotTitle(d,1)}}</b></span>
       <span class="lf-compact-day-data lf-compact-day-sheet"><small>Scheda 2</small><b :title="slotTitle(d,2)">{{slotTitle(d,2)}}</b></span>
      </button>
     </div>
     <div v-if="dirty&&showWeek" class="lf-draft-actions row"><span class="small muted">Bozza non salvata: puoi aprire un giorno per completarla.</span><button class="primary" :disabled="busy||!canWrite" @click="saveActivities()">{{busy?'Salvataggio…':'Salva attività'}}</button></div>
    </div><p v-else class="muted small">Nessuna settimana attiva. Crea un programma per iniziare.</p>
   </div>
   <aside class="lf-week-actions" aria-label="Azioni settimane">
    <button type="button" class="secondary lf-week-action" :class="{'lf-is-duplicate':weekSelectionMode==='duplicate'}" :aria-pressed="weekSelectionMode==='duplicate'" :disabled="!currentWeeks.length||busy" @click="setWeekSelectionMode('duplicate')"><span aria-hidden="true">⧉</span> {{weekSelectionMode==='duplicate'?'Annulla duplicazione':'Seleziona settimana da duplicare'}}</button>
    <button type="button" class="secondary lf-week-action" :class="{'lf-is-delete':weekSelectionMode==='delete'}" :aria-pressed="weekSelectionMode==='delete'" :disabled="!currentWeeks.length||busy" @click="setWeekSelectionMode('delete')"><span aria-hidden="true">▤</span> {{weekSelectionMode==='delete'?'Annulla eliminazione':'Seleziona settimane da eliminare'}}</button>
    <button type="button" class="secondary lf-week-action" :aria-expanded="trashedWeeksOpen" @click="trashedWeeksOpen=!trashedWeeksOpen"><span aria-hidden="true">♻</span> {{trashedWeeksOpen?'Chiudi cestino':'Cestino settimane'}} ({{deletedWeeks.length}})</button>
    <button type="button" class="secondary lf-week-action" :disabled="!week||weekSelectionMode!=='normal'" :aria-expanded="showWeek" @click="showWeek=!showWeek;closeDay()"><span aria-hidden="true">⌃</span> {{showWeek?'Chiudi settimana':'Apri settimana'}}</button>
   </aside>
  </div>
 </section>
 </template>
 <div v-if="activeDay>=0&&week&&showWeek&&!pick" class="modal-overlay" @click.self="closeDay">
  <div class="dialog lf-day-dialog" role="dialog" aria-modal="true" :aria-label="`Modifica ${selectedDayLabel}`">
   <div class="row between lf-day-dialog-head"><div><h2>Modifica giorno · {{selectedDayLabel}}</h2><p class="small muted">{{dayDate(week.startDate,activeDay)}} · {{week.name}}</p></div><button type="button" class="bare" aria-label="Chiudi modifica giorno" @click="closeDay">✕</button></div>
   <div v-if="activityDraft[activeDay]" class="lf-day-dialog-body">
    <div class="lf-day-activity-fields"><label>Attività 1<input v-model="activityDraft[activeDay].activity1" maxlength="200" placeholder="Scrivi attività 1…" /></label><label>Attività 2<input v-model="activityDraft[activeDay].activity2" maxlength="200" placeholder="Scrivi attività 2…" /></label></div>
    <div class="lf-day-sheet-grid"><div v-for="slot in ([1,2] as const)" :key="slot" class="lf-day-sheet-slot"><strong>Scheda {{slot}}</strong><p class="small">{{slotTitle(week.days[activeDay],slot)}}</p><div class="lf-day-sheet-buttons"><button type="button" class="secondary" :disabled="busy||!canWrite" @click="openPick(activeDay,slot)">Collega</button><button type="button" class="secondary" :disabled="busy||!canWrite" @click="linkToEditor('personal',activeDay,slot)">Crea nuova</button><button type="button" class="danger" :disabled="busy||!canWrite||!(slot===1?week.days[activeDay].templateId:week.days[activeDay].templateId2)" @click="unlink(activeDay,slot)">Scollega</button></div></div></div>
    <div v-if="pendingDayUnlink&&pendingDayUnlink.day===activeDay" class="lf-day-unlink-confirm" role="alertdialog" aria-label="Conferma scollegamento scheda">
      <div><strong>Scollegare Scheda {{pendingDayUnlink.slot}}?</strong><p class="small muted">La scheda sarà rimossa dal Piano se non è collegata altrove. La copia storica rimane nell’Archivio Atleta.</p></div>
      <div class="row"><button type="button" class="secondary" :disabled="busy" @click="pendingDayUnlink=null">Annulla</button><button type="button" class="danger" :disabled="busy" @click="confirmDayUnlink">Conferma scollegamento</button></div>
    </div>
    <p v-if="dirty" class="small muted" role="status">Le attività modificate sono in bozza fino al salvataggio. I collegamenti alle schede vengono gestiti separatamente.</p>
    <p v-if="dayError" class="notice" role="alert">{{dayError}}</p>
    <p v-if="message&&message.includes('non salvate')" class="notice" role="alert">{{message}}</p>
    <div class="lf-day-dialog-foot"><button type="button" class="secondary" :disabled="busy" @click="closeDay">Chiudi</button><button type="button" class="primary" :disabled="busy||!canWrite||!!pendingDayUnlink" @click="saveActivities(true)">{{busy?'Salvataggio…':'Salva modifiche'}}</button></div>
   </div>
  </div>
 </div>
 <div v-if="pick&&week" class="modal-overlay" @click.self="pick=null"><div class="dialog coach-picker-dialog" role="dialog" aria-modal="true" :aria-label="`Collega scheda ${pick.slot} · ${DAY_NAMES[pick.day]}`" style="max-width:540px"><div class="row between"><h2>{{uiText("COLLEGA SCHEDA")}} {{pick.slot}} · {{DAY_NAMES[pick.day].toUpperCase()}}</h2><button class="bare" :aria-label="uiText('Chiudi')" @click="pick=null">✕</button></div>
  <input v-model="pickSearch" type="search" placeholder="Cerca scheda…" aria-label="Cerca nell’Archivio Coach"/><button class="secondary wide" @click="linkToEditor('shared',pick.day,pick.slot);pick=null">{{uiText("Apri Archivio Coach · Visualizza / Assegna")}}</button>
  <div class="row between"><strong>{{uiText("ARCHIVIO COACH ·")}} {{visibleShared.length}} {{uiText("schede")}}</strong><button class="secondary" :disabled="sharedLoading" @click="refreshSharedChoices(true)">{{sharedLoading?'Caricamento…':'Aggiorna'}}</button></div>
  <p v-if="sharedError" class="notice" role="alert">{{uiText("Archivio non leggibile:")}} {{sharedError}}</p>
  <div class="coach-v1-pick-list"><article v-for="s in visibleShared" :key="s.id" class="line-card coach-pick-row"><div class="coach-pick-row-info"><b>{{s.title}}</b><p class="muted small">{{s.category}} · {{s.exercises.length}} {{uiText("esercizi")}}</p></div><div class="row coach-pick-row-actions"><button class="secondary" @click="openSharedPreview(s)">{{uiText("Visualizza")}}</button><button class="primary" :disabled="busy||!canWrite" @click="assignFromShared(s)">{{uiText("Assegna")}}</button></div></article><p v-if="!sharedLoading&&!visibleShared.length" class="muted">{{uiText("Nessuna scheda nell’Archivio Coach corrisponde alla ricerca.")}}</p></div>
  <p class="small muted">{{uiText("Per una nuova scheda usa «Crea nuova» nel giorno. Le schede personali già assegnate e quelle storiche restano conservate ma non compaiono in questa scelta.")}}</p>
 </div></div>
 <div v-if="deleteConfirmOpen" class="modal-overlay" @click.self="deleteConfirmOpen=false"><div class="dialog lf-weeks-confirm" role="dialog" aria-modal="true" aria-label="Conferma spostamento settimane nel Cestino"><div class="row between"><h2>Conferma eliminazione</h2><button class="bare" :disabled="busy" aria-label="Chiudi conferma" @click="deleteConfirmOpen=false">✕</button></div><p>Vuoi spostare <strong>{{selectedWeekTrash.length}} {{selectedWeekTrash.length===1?'settimana':'settimane'}}</strong> nel Cestino?</p><p class="small muted">I programmi e le schede collegate non vengono eliminati definitivamente. Potrai ripristinare le settimane.</p><div class="row lf-confirm-actions"><button class="secondary" :disabled="busy" @click="deleteConfirmOpen=false">Annulla</button><button class="danger" :disabled="busy||!canWrite" @click="trashMultipleWeeks">{{busy?'Eliminazione…':'Sposta nel Cestino'}}</button></div></div></div>
 <div v-if="duplicateOpen" class="modal-overlay" @click.self="duplicateOpen=false"><div class="dialog" style="max-width:420px" role="dialog" aria-modal="true" aria-label="Conferma duplicazione settimana"><div class="row between"><h2>{{uiText("DUPLICA SETTIMANA")}}</h2><button class="bare" aria-label="Chiudi duplicazione" :disabled="busy" @click="duplicateOpen=false">✕</button></div>
  <p>Quante volte vuoi duplicare la <strong>{{currentWeeks.findIndex(w=>w.id===duplicateSourceId)+1}}ª settimana</strong> di <strong>{{selectedProgram?.title}}</strong>?</p><label class="lf-duplicate-number">Numero copie consecutive <input v-model.number="duplicateCount" type="number" min="1" :max="Math.min(12,52-currentWeeks.length)" step="1" aria-label="Numero duplicazioni settimana" /></label><label class="lf-p11-date-label" @click="openDatePicker">Lunedì di destinazione<input v-model="duplicateTargetMonday" type="date" required aria-label="Lunedì da cui duplicare la settimana"/></label><p class="muted small">Le copie saranno inserite nello stesso programma, nei lunedì consecutivi scelti. Le date già occupate non possono essere utilizzate. Nessuna copia sarà chiamata «(Copia)».</p>
  <p v-if="duplicateError" class="notice" role="alert">{{duplicateError}}</p>
  <div class="row"><button class="secondary" :disabled="busy" @click="duplicateOpen=false">Annulla</button><button class="primary" :disabled="busy||!canWrite" @click="duplicateCurrentWeek">{{busy?'Duplicazione…':'Conferma'}}</button></div>
 </div></div>
 <div v-if="showDelete" class="modal-overlay" @click.self="showDelete=null"><div class="dialog" style="max-width:520px"><div class="row between"><h2>{{uiText("Cancella collegamenti ·")}} {{showDelete.title}}</h2><button class="bare" @click="showDelete=null">✕</button></div><p class="muted">{{uiText("Rimuovi il collegamento dal giorno. Senza altri collegamenti, la scheda sparirà dal Piano ma resterà nell'Archivio.")}}</p><article v-for="l in showDelete.links" :key="l.weekId+l.day+l.slot" class="line-card row between"><b>{{l.weekName}} · {{l.dayName}} {{uiText("· Scheda")}} {{l.slot}}</b><button class="danger" @click="unlinkExact(l)">{{uiText("Scollega")}}</button></article></div></div>
 <div v-if="createProgramOpen" class="modal-overlay" @click.self="createProgramOpen=false"><div class="dialog" style="max-width:440px"><div class="row between"><h2>{{uiText("NUOVO PROGRAMMA FIGHTER")}}</h2><button class="bare" @click="createProgramOpen=false">✕</button></div><label>{{uiText("Nome programma")}}<input v-model="programName" maxlength="90" placeholder="Preparazione match"/></label><label class="coach-date-picker-label lf-p11-date-label" @click="openDatePicker">{{uiText("Data inizio (lunedì)")}}<input v-model="monday" type="date" required aria-label="Scegli la data di inizio"/></label><label>{{uiText("Numero settimane")}}<input v-model.number="weekCount" type="number" min="1" max="52"/></label><p v-if="programError" class="notice lf-program-form-error" role="alert">{{programError}}</p><button class="primary wide" :disabled="!canWrite||busy" @click="newProgram">{{busy?uiText("Salvataggio…"):uiText("Crea programma")}}</button></div></div>
 <SheetDetail v-if="opened" :sheet="opened" @close="opened=null"/>
</div>
</template>

<style scoped>
.lf-duplicate-number{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;font-weight:850;margin:14px 0}.lf-duplicate-number input{max-width:88px;min-width:72px;text-align:center;font-size:17px;font-weight:900}
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

/* PATCH 02 — Solo Gestione Atleti: mantiene palette, componenti e barra laterale LionFit. */
.lf-program-v2{min-width:0}
.lf-program-v2-heading{gap:12px;align-items:center;margin-bottom:10px}
.lf-program-v2-heading h2{font-size:14px;margin:0 0 3px}
.lf-program-v2-heading p{margin:0}
.lf-week-planner{display:grid;grid-template-columns:minmax(0,1fr) 186px;align-items:start;gap:12px}
.lf-week-left{min-width:0}
.lf-week-numbers{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 9px}
.lf-week-number{width:37px;height:34px;min-width:37px;position:relative;padding:3px;border:1px solid var(--outline);border-radius:9px;background:var(--field);color:var(--text);font-size:12px;font-weight:900;transition:background-color .16s ease,border-color .16s ease}
.lf-week-number.is-current{background:var(--green);border-color:var(--mint);color:#fff}
.lf-week-number.is-delete-mode{border-color:#ae6773;box-shadow:0 0 0 1px rgba(207,71,94,.12)}
.lf-week-number.is-duplicate-mode{border-color:#65a7d2;box-shadow:0 0 0 1px rgba(65,153,211,.12)}
.lf-week-number.is-marked-delete{background:#a62f46!important;color:#fff!important;border:2px solid #f795a4!important}
.lf-week-number.is-marked-duplicate{background:#236ca5!important;color:#fff!important;border:2px solid #81d2ff!important}
.lf-week-number span{font-size:9px;position:absolute;right:2px;top:0}
.lf-week-number:focus-visible,.lf-compact-day:focus-visible,.lf-week-action:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.lf-week-title{align-items:center;gap:10px;margin-bottom:7px;flex-wrap:wrap}
.lf-week-title h3{font-size:12px;margin:0}
.lf-unsaved-label{font-size:10px;color:#f5bb6b;font-weight:800}
.lf-compact-week-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;align-items:stretch;min-width:0}
.lf-compact-day{min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:8px 7px 9px;border-radius:10px;border:1px solid var(--outline);background:var(--field);color:var(--text);text-align:left;transition:border-color .18s ease,background-color .18s ease}
.lf-compact-day:hover{border-color:var(--mint);background:var(--card2)}
.lf-compact-day:disabled{opacity:.58}
.lf-compact-day-header{display:flex;align-items:center;gap:3px;padding-bottom:5px;border-bottom:1px solid var(--border);min-width:0}
.lf-compact-day-header strong{color:var(--mint);text-transform:uppercase;font-size:10px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lf-compact-day-header small{margin-left:auto;font-size:9px;color:var(--muted);white-space:nowrap}
.lf-compact-day-header>span{font-size:14px;margin-left:2px;color:var(--mint)}
.lf-compact-day-data{display:flex;flex-direction:column;gap:2px;min-width:0;border-radius:6px;background:var(--card);padding:5px 6px;min-height:34px}
.lf-compact-day-data small{color:var(--muted);font-size:9px;font-weight:750;white-space:nowrap}
.lf-compact-day-data b{font-size:10px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
.lf-compact-day-sheet{background:var(--green-bg)}
.lf-compact-day-sheet small{color:var(--mint)}
.lf-week-actions{display:grid;grid-template-columns:minmax(0,1fr);gap:7px}
.lf-week-action{width:100%;min-height:39px;padding:7px 9px;display:flex;align-items:center;justify-content:flex-start;gap:8px;border-radius:9px;text-align:left;font-size:10px;font-weight:800;line-height:1.25;white-space:normal}
.lf-week-action span{font-size:16px;flex:0 0 20px;text-align:center}
.lf-week-action.lf-is-delete{border-color:#e67285;color:#ffc1c9;background:rgba(144,44,66,.28)}
.lf-week-action.lf-is-duplicate{border-color:#75b9e3;color:#c7ebff;background:rgba(32,91,140,.28)}
.lf-week-workspace{margin-top:5px}
.lf-week-selection-message{margin:6px 0}
.lf-mode-notice{padding:10px;margin:5px 0 11px;border-radius:10px;display:flex;flex-direction:column;gap:6px;font-size:11px;line-height:1.35}
.lf-mode-notice strong{font-size:12px}
.lf-mode-notice-delete{border:1px solid #a65463;background:rgba(131,42,62,.15)}
.lf-mode-notice-duplicate{border:1px solid #3e8bb9;background:rgba(30,97,144,.15)}
.lf-mode-actions{display:flex;gap:7px;flex-wrap:wrap}.lf-mode-actions button{font-size:10px;min-height:31px;padding:6px 9px}
.lf-draft-actions{gap:10px;align-items:center;justify-content:flex-end;margin-top:8px}.lf-draft-actions .primary{font-size:11px}
.lf-day-dialog{width:min(760px,calc(100vw - 30px));max-width:760px!important;max-height:calc(100dvh - 30px);overflow-y:auto;padding:19px!important}
.lf-day-dialog-head{align-items:flex-start;margin-bottom:12px}.lf-day-dialog-head h2{font-size:19px;margin:0 0 4px}.lf-day-dialog-head p{margin:0}
.lf-day-dialog-body{display:grid;gap:14px}
.lf-day-activity-fields,.lf-day-sheet-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.lf-day-activity-fields label{font-size:12px;font-weight:850;min-width:0}.lf-day-activity-fields input{width:100%;margin-top:6px;min-width:0}
.lf-day-sheet-slot{padding:12px;border:1px solid var(--outline);background:var(--green-bg);border-radius:11px;min-width:0;display:flex;flex-direction:column;gap:6px}
.lf-day-sheet-slot>strong{font-size:13px}.lf-day-sheet-slot p{font-size:11px;color:var(--text);margin:0 0 2px;min-height:16px;overflow-wrap:anywhere}
.lf-day-sheet-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.lf-day-sheet-buttons button{width:100%;min-width:0;min-height:32px!important;border-radius:7px;font-size:10px!important;padding:5px 3px!important;line-height:1.15;white-space:normal}
.lf-day-unlink-confirm{padding:11px;border:1px solid #a15d69;border-radius:9px;background:rgba(140,48,68,.13);display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.lf-day-unlink-confirm strong{font-size:12px}.lf-day-unlink-confirm p{margin:4px 0 0}.lf-day-unlink-confirm .row{gap:7px}.lf-day-unlink-confirm button{font-size:11px;padding:8px}
.lf-day-dialog-foot{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border);padding-top:12px}.lf-day-dialog-foot button{font-size:11px;min-height:34px}
.lf-weeks-confirm{max-width:440px!important}.lf-confirm-actions{justify-content:flex-end}
.lf-weeks-trash-list{margin:8px 0 12px}
@media(max-width:1300px){.lf-week-planner{grid-template-columns:minmax(0,1fr) 155px}.lf-compact-week-days{gap:4px}.lf-compact-day{padding:7px 5px}.lf-compact-day-data{padding:4px}.lf-compact-day-header small{display:none}}
@media(max-width:1080px){.lf-week-planner{grid-template-columns:minmax(0,1fr)}.lf-week-actions{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.lf-week-action{min-height:46px;font-size:9px;padding:7px 5px}.lf-compact-week-days{overflow-x:auto;grid-template-columns:repeat(7,minmax(112px,1fr));padding-bottom:5px}.lf-week-left{min-width:0}}
@media(max-width:600px){.lf-day-activity-fields,.lf-day-sheet-grid{grid-template-columns:1fr}.lf-day-dialog{padding:13px!important}.lf-week-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.lf-compact-week-days{grid-template-columns:repeat(7,118px)}.lf-week-number{width:34px;min-width:34px}.lf-draft-actions{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.lf-compact-day,.lf-week-number{transition:none}}
</style>

<style scoped>
.lf-p11-program-row{border:1px solid var(--outline);border-radius:12px;padding:9px;margin-bottom:9px;background:var(--field);min-width:0}
.lf-p11-program-active{border-color:var(--mint);box-shadow:inset 0 0 0 1px var(--mint)}
.lf-p11-program-header{width:100%;display:flex;align-items:flex-start;flex-direction:column;gap:4px;padding:6px 7px 11px;background:transparent;color:var(--text);border:0;text-align:left;cursor:pointer}
.lf-p11-program-header strong{font-size:12px;overflow-wrap:anywhere}
.lf-p11-program-header small{font-size:10px;color:var(--muted)}
.lf-p11-program-row .lf-week-numbers{display:flex;flex-wrap:wrap;gap:7px}
.lf-p11-date-label{display:flex!important;flex-direction:column;gap:7px;margin:11px 0;font-size:12px;font-weight:800;color:var(--text)}
.lf-p11-date-label input[type=date]{box-sizing:border-box;width:100%;min-height:45px;padding:10px 12px;border:1.5px solid var(--outline);border-radius:9px;background:var(--field);color:var(--text);font-size:15px;font-weight:700;color-scheme:dark;cursor:pointer}
:global(.theme-light) .lf-p11-date-label input[type=date]{color-scheme:light;background:#fff;border-color:#7c9287;color:#183b29}
.lf-p11-date-label input[type=date]::-webkit-calendar-picker-indicator{opacity:1;cursor:pointer;width:22px;height:22px;filter:brightness(0) invert(1)}
:global(.theme-light) .lf-p11-date-label input[type=date]::-webkit-calendar-picker-indicator{filter:brightness(0);opacity:1}
.lf-p11-date-label input[type=date]:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
@media(max-width:550px){.lf-p11-program-row{padding:7px}.lf-p11-program-header strong{font-size:11px}}
</style>
