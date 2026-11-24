<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Atleta operativo 2M/K: Home/Piano/Archivio originali, SOLO emulator e sola lettura.
 * Il catalogo esercizi e la modale SheetDetail sono gli stessi della versione demo.
 */
import { computed,ref,watch } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import AthletePlanContent from '../components/AthletePlanContent.vue'
import ProgramHistory from '../components/ProgramHistory.vue'
import {activeAssignmentGroups,partitionPrograms,romeDate,weekOrdinal,weekExpired} from '../features/sheets/assignmentPolicy'
import SheetDetail from '../components/SheetDetail.vue'
import AthleteHomeContent from '../components/AthleteHomeContent.vue'
import { useAthleteLive } from '../features/athletes/useAthleteLive'
import {useRomeDayClock} from '../features/performance/useRomeDayClock'
import type {MotionSummary} from '../features/navigation/universalMotion'
import {accountKey} from '../features/platform/platformModel'
import { sectionTransition } from '../features/navigation/sectionSwipe'
import {prepareSectionMotion,releaseSectionMotion,prepareSectionLeave,finishSectionLeave} from '../features/navigation/continuousMotion'
import {isStagingMode,isLiveMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import { linkedSheetsForDay,liveWeekForDate } from '../features/athletes/athleteOperationalPolicy'
import { romeDayIndex,romeWeekDayNumber } from '../features/athletes/romeWeekProgress'
import { archiveCounts,visibleArchives,type ArchiveView } from '../features/athletes/archiveVisibility'
import { groupSemanticCopies } from '../features/sheets/semanticDedup'
import {groupActivePrograms,programForWeek} from '../features/sheets/programFamilies'
import {joinArchivesWithLegacy,isArchiveCopyLinkedOrEquivalent} from '../features/athletes/legacyArchiveProjection'
import type { ExerciseRecord } from '../features/sheets/domain'
const props=defineProps<{screen:'home'|'plan'|'archive'}>()
const route=useRoute()
// R22B.5: Vue Router intentionally reuses this component for Home/Piano/Archivio.
// Animate only the screen content; keep the parent instance and Firebase listeners alive.
const workspaceMotion=ref('')
const workspaceRoot=ref<HTMLElement|null>(null)
const screenOrder=['home','plan','archive'] as const
watch(()=>props.screen,(next,previous)=>{
 workspaceMotion.value=window.innerWidth<800?sectionTransition(previous,next,screenOrder):''
},{flush:'sync'})
function beforeWorkspaceEnter(el:Element){if(workspaceMotion.value&&window.innerWidth<800)prepareSectionMotion(el,workspaceRoot.value?.closest<HTMLElement>('.main-layout')||null)}
function finishWorkspaceMotion(el:Element){releaseSectionMotion(el);if(el.getAttribute('data-lf-screen')===props.screen)workspaceMotion.value=''}
function beforeWorkspaceLeave(el:Element){prepareSectionLeave(el,workspaceMotion.value,window.innerWidth<800)}
const programArchiveOpen=ref(route.query.view==='programmi')
watch(()=>route.query.view,v=>{programArchiveOpen.value=v==='programmi'})
const {status,message,session,data,avatarUrl,archive,archiveReady,hiddenArchiveIds,snapshots,updatedAt,hideArchiveCopy}=useAthleteLive(()=>props.screen==='archive')
const clock=useRomeDayClock()
const selectedWeek=ref(typeof route.query.week==='string'?route.query.week:'')
const requestedDay=computed(()=>typeof route.query.day==='string'&&/^[0-6]$/.test(route.query.day)&&(!selectedWeek.value||data.value?.weeks.some(w=>w.id===selectedWeek.value&&!w.deletedAt&&!weekExpired(w,romeDate(clock.value))))?Number(route.query.day):undefined)
watch(()=>route.query.week,next=>{selectedWeek.value=typeof next==='string'?next:''})
const opened=ref<{title:string;exercises:readonly ExerciseRecord[]}|null>(null)
const search=ref(''), archiveView=ref<ArchiveView>('all')
const hideBusy=ref(false),hideMessage=ref('')
// Reuse the live subscriptions, not local dialogs or selection between pages.
watch(()=>props.screen,()=>{opened.value=null;search.value='';archiveView.value='all';hideMessage.value='';selectedWeek.value=typeof route.query.week==='string'?route.query.week:''},{flush:'sync'})
async function hideCopy(id:string){
 if(!mayWriteLive()||hideBusy.value||!session.value)return
 if(isArchiveCopyLinkedOrEquivalent(id,mergedArchive.value,data.value?.weeks||[],session.value.uid)){hideMessage.value='Questa scheda (o una sua copia equivalente) è ancora collegata a un giorno: non può essere nascosta.';return}
 if(!window.confirm('Nascondere questa copia dal tuo Archivio personale? Il documento storico non verra eliminato.'))return
 hideBusy.value=true
 try{await hideArchiveCopy(id);hideMessage.value='Copia nascosta soltanto nella visualizzazione personale.'}
 catch(e){hideMessage.value=e instanceof Error?e.message:String(e)}
 finally{hideBusy.value=false}
}
const currentWeek=computed(()=>data.value?liveWeekForDate(data.value.weeks,new Date(clock.value)):null)
const currentWeekLabel=computed(()=>{
 const w=currentWeek.value
 if(!w)return ''
 const p=programForWeek(groupActivePrograms(data.value?.weeks||[]),w.id)
 return p?`${p.title} · Settimana ${weekOrdinal(w,p.weeks)}`:w.name
})
const todayIndex=computed(()=>romeDayIndex(clock.value))
const todayDay=computed(()=>currentWeek.value?.days[todayIndex.value])
const todaySheets=computed(()=>data.value&&currentWeek.value?linkedSheetsForDay(data.value.groups,currentWeek.value.id,todayIndex.value):[])
// Schede libere con assegnazione reale e non storica, come nella pagina Piano.
const homeFreeSheets=computed(()=>{
 const d=data.value,uid=session.value?.uid
 return d&&uid?activeAssignmentGroups(d.personal,d.weeks,uid,romeDate(clock.value)).unprogrammed.map(g=>g.sheet):[]
})
const pastPrograms=computed(()=>partitionPrograms(data.value?.weeks||[],romeDate(clock.value),true))
const mergedArchive=computed(()=>joinArchivesWithLegacy(archive.value,data.value?.personal||[]))
const shownArchive=computed(()=>mergedArchive.value.filter(a=>!hiddenArchiveIds.value.has(a.id)))
const archivePersonal=computed(()=>{
 const row=data.value;if(!row||!session.value)return []
 const g=activeAssignmentGroups(row.personal,row.weeks,session.value.uid,romeDate(clock.value))
 const ids=new Set([...g.programmed,...g.unprogrammed].map(x=>x.sheet.id))
 return row.personal.filter(p=>p.deletedAt||ids.has(p.id))
})
const counts=computed(()=>archiveCounts(shownArchive.value,archivePersonal.value))
const archiveGroups=computed(()=>groupSemanticCopies(visibleArchives(shownArchive.value,archivePersonal.value,archiveView.value,search.value)))
const archiveDistinctCount=computed(()=>groupSemanticCopies(shownArchive.value).length)
// Read-only visual projection from the already authorized workspace. No retained
// snapshot, extra listener, private messages or new route instance.
function motionSummary(path:string,scope:string):MotionSummary|null{
 if(status.value!=='ready'||!data.value||!scope||accountKey(session.value)!==scope)return null
 if(path==='/piano')return {heading:currentWeekLabel.value||'Il mio piano',lines:currentWeek.value?['La tua programmazione',`${currentWeek.value.days.length} giorni nel calendario`]:['Le tue schede personali'],sections:currentWeek.value?[{heading:'Programma e settimane',lines:[currentWeekLabel.value||currentWeek.value.name]},{heading:'La tua settimana',lines:currentWeek.value.days.slice(0,4).map(d=>d.name)}]:[{heading:'Schede personali',lines:[`${homeFreeSheets.value.length} schede disponibili`]}]}
 if(path==='/home')return {heading:'Allenamento di oggi',lines:[...(todayDay.value?.activities||[]).slice(0,2),`${todaySheets.value.length} schede collegate`],sections:[{heading:'La tua settimana',lines:currentWeekLabel.value?[currentWeekLabel.value]:[]},{heading:'Schede personali',lines:[`${homeFreeSheets.value.length} schede disponibili`]}]}
 if(path==='/archivio'&&archiveReady.value)return {heading:'Le mie schede',lines:[`${archiveDistinctCount.value} schede nello storico`],sections:[{heading:'Schede personali',lines:[`${archivePersonal.value.length} schede`]},{heading:'Archivio programmazioni',lines:[]}]}
 return null
}
defineExpose({motionSummary})
watch([status,()=>accountKey(session.value)],([next,key],[previous,oldKey])=>{if((previous==='ready'&&next!=='ready')||(oldKey&&key!==oldKey))window.dispatchEvent(new Event('lionfit:motion-scope-invalidated'))},{flush:'sync'})
const retryWorkspace=()=>window.location.reload()
const livePath=(path:string)=>isStagingMode()?path:`${path}?source=emulator`
const dayLink=computed(()=>currentWeek.value?(isStagingMode()?`/piano?week=${encodeURIComponent(currentWeek.value.id)}&day=${todayIndex.value}`:`/piano?source=emulator&week=${encodeURIComponent(currentWeek.value.id)}&day=${todayIndex.value}`):livePath('/piano'))
</script>
<template>
 <div ref="workspaceRoot" class="stack athlete-live-screen" :aria-label="'Area Atleta'">
  <div v-lf-quiet-loading v-if="status==='loading'" class="panel lf-quiet-status" role="status">{{uiText("Caricamento schede e settimane…")}}</div>
  <div v-else-if="status==='error'" class="notice" role="alert">{{message}} <button type="button" class="secondary" @click="retryWorkspace">{{uiText("Riprova")}}</button> <RouterLink :to="isStagingMode()?'/accesso':'/dev/accesso'">{{uiText("Torna all'accesso")}}</RouterLink></div>
  <template v-else-if="data">
   <Transition :name="workspaceMotion" @before-enter="beforeWorkspaceEnter" @after-enter="finishWorkspaceMotion" @enter-cancelled="releaseSectionMotion" @before-leave="beforeWorkspaceLeave" @after-leave="finishSectionLeave" @leave-cancelled="finishSectionLeave">
    <div :key="props.screen" class="lf-r22b5-page" :data-lf-screen="props.screen">
   <template v-if="props.screen==='plan'">
    <AthletePlanContent archive-expired :athlete-key="session?.uid||''" :personal="data.personal" :weeks="data.weeks" :groups="data.groups" :week-id="selectedWeek||currentWeek?.id||''" :initial-day="requestedDay" @update:week-id="id => { selectedWeek=id }" />
    <nav class="lf-r13-plan-archives" aria-label="Archivi del piano"><span>CONSULTA LO STORICO</span><div class="lf-r13-plan-archive-links"><RouterLink :to="livePath('/archivio')" class="secondary">Archivio schede <span aria-hidden="true">›</span></RouterLink><RouterLink :to="{path:'/archivio',query:{...(isStagingMode()?{}:{source:'emulator'}),view:'programmi'}}" class="secondary">Archivio programmazioni <span aria-hidden="true">›</span></RouterLink></div></nav>
   </template>
   <template v-else-if="props.screen==='home'">
    <AthleteHomeContent :name="session?.label||'Atleta'" :today-name="todayDay?.name||''" :week-name="currentWeekLabel" :calendar-day="romeWeekDayNumber(clock)" :now-ms="clock" :activities="todayDay?.activities||[]" :sheets="todaySheets" :free-sheets="homeFreeSheets" :has-current-week="!!currentWeek" :gym-id="session?.gymId||''" :uid="session?.uid||''" :days="currentWeek?.days||[]" :plan-link="livePath('/piano')" :archive-link="livePath('/archivio')" :progress-link="livePath('/progressi')" :training-link="livePath('/progressi')" :booking-link="livePath('/prenotazioni')" :avatar-url="avatarUrl" :profile-link="livePath('/profilo')" :day-link="dayLink"/>
   </template>
   <template v-else-if="props.screen==='archive'">
    <header class="lf-r15-archive-header"><div><span class="lf-r15-eyebrow">IL TUO STORICO</span><h1>Archivio</h1><p>Ritrova le tue schede e le programmazioni concluse.</p></div><span class="lf-r15-count">{{programArchiveOpen?pastPrograms.length:(archiveReady?archiveDistinctCount:'—')}} {{programArchiveOpen?'programmi':'schede'}}</span></header>
    <div class="lf-r15-archive-tabs" role="group" aria-label="Seleziona sezione archivio"><button type="button" :class="!programArchiveOpen?'is-active':''" :aria-pressed="!programArchiveOpen" @click="programArchiveOpen=false">Schede</button><button type="button" :class="programArchiveOpen?'is-active':''" :aria-pressed="programArchiveOpen" @click="programArchiveOpen=true">Programmazioni</button></div>
    <ProgramHistory v-if="programArchiveOpen" :key="session?.uid" :programs="pastPrograms" :personal="data.personal" :archive="archive" :ready="archiveReady"/>
    <section v-else v-lf-entrance="{id:'athlete-archive',ready:archiveReady,rows:[{match:'.lf-archive-v4-item'}]}" class="panel athlete-archive-list lf-r15-archive-list"><div class="lf-r15-archive-list-head"><h2>Le mie schede</h2><span>{{archiveReady?archiveGroups.length:'—'}} visualizzate</span></div>
     <div class="lf-r15-archive-tools"><label class="lf-r15-search"><span class="lf-r15-glass" aria-hidden="true">⌕</span><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca una scheda..."/></label>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="all">Tutte le schede</option><option value="active">Schede assegnate</option><option value="historical">Schede storiche</option><option value="trashed">Schede ritirate</option></select>
     </div><button v-if="search.trim()||archiveView!=='all'" type="button" class="lf-r15-clear" @click="search='';archiveView='all'">Azzera filtri</button>
     <p v-lf-quiet-loading v-if="!archiveReady" class="muted lf-quiet-status" role="status">{{uiText("Caricamento archivio storico…")}}</p>
     <p v-else-if="!archiveGroups.length" class="notice lf-r15-empty" role="status">{{uiText("Nessuna scheda corrisponde al filtro selezionato.")}}</p>
     <div v-if="archiveReady" class="lf-r15-archive-rows"><article v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item lf-archive-v4-item lf-r15-archive-item"><button class="wide athlete-archive-open" type="button" @click="opened=g.sheet" :aria-label="'Apri scheda '+g.sheet.title"><span class="lf-archive-v4-icon" aria-hidden="true">▤</span><span class="lf-r15-archive-item-main"><b>{{g.sheet.title}}</b><small>{{g.sheet.exercises.length}} {{g.sheet.exercises.length===1?'esercizio':'esercizi'}}</small></span><span class="lf-archive-v4-action" aria-hidden="true">Apri <span>›</span></span></button></article></div>
     
    </section>
   </template>
    </div>
   </Transition>
  </template>
  <SheetDetail v-if="opened" :sheet="opened" @close="opened=null" @finish="opened=null"/>
 </div>
</template>

<style scoped>
/* R22B.5: retain a single Firebase-connected workspace while the visible
   Home/Plan/Archive content slides. The wrapper replaces only the screen subtree. */
.athlete-live-screen{position:relative}
.lf-r22b5-page{display:flex;flex:1 0 auto;flex-direction:column;gap:13px;min-width:0;width:100%;min-height:0}
@media(max-width:799px) and (prefers-reduced-motion:no-preference){
 .lf-section-next-enter-active,.lf-section-next-leave-active,.lf-section-prev-enter-active,.lf-section-prev-leave-active{transition:transform 340ms cubic-bezier(.22,1,.36,1);will-change:transform;transition-duration:var(--lf-swipe-commit-duration,340ms)}
 .lf-section-next-enter-from,.lf-section-prev-leave-to{transform:translate3d(var(--lf-motion-span,100%),0,0)}
 .lf-section-next-leave-to,.lf-section-prev-enter-from{transform:translate3d(calc(-1 * var(--lf-motion-span,100%)),0,0)}
 .lf-section-next-leave-from,.lf-section-prev-leave-from{transform:translate3d(var(--lf-swipe-commit-offset,0px),0,0)}
 .lf-section-next-enter-from{transform:translate3d(calc(var(--lf-motion-span,100%) + var(--lf-swipe-commit-offset,0px)),0,0)}
 .lf-section-prev-enter-from{transform:translate3d(calc(-1 * var(--lf-motion-span,100%) + var(--lf-swipe-commit-offset,0px)),0,0)}
 .lf-section-next-leave-active,.lf-section-prev-leave-active{position:absolute;top:var(--lf-leave-top,0px);left:var(--lf-leave-left,0px);width:var(--lf-leave-width,100%);pointer-events:none}
}
@media(prefers-reduced-motion:reduce){
 .lf-section-next-enter-active,.lf-section-next-leave-active,.lf-section-prev-enter-active,.lf-section-prev-leave-active{transition:none!important;animation:none!important}
}
/* R13: Secondary history navigation only on the athlete plan. */
.lf-r13-plan-archives{width:100%;max-width:100%;padding:4px 2px 10px;display:grid;gap:10px}
.lf-r13-plan-archives>span{font-size:10px;letter-spacing:.1em;font-weight:850;color:var(--muted)}
.lf-r13-plan-archive-links{display:flex;align-items:center;flex-wrap:wrap;gap:9px}
.lf-r13-plan-archive-links a{min-height:38px;padding:9px 12px;font-size:11px;font-weight:800;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:15px;text-decoration:none;background:var(--card2);border:1px solid var(--outline);color:var(--text)}
.lf-r13-plan-archive-links a span{color:var(--mint);font-size:18px;line-height:1}
.lf-r13-plan-archive-links a:hover,.lf-r13-plan-archive-links a:focus-visible{border-color:var(--mint)}
@media(max-width:600px){.lf-r13-plan-archive-links a{font-size:10px;gap:7px;flex:1;min-width:135px}}
</style>
