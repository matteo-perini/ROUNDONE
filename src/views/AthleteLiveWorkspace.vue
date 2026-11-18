<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Atleta operativo 2M/K: Home/Piano/Archivio originali, SOLO emulator e sola lettura.
 * Il catalogo esercizi e la modale SheetDetail sono gli stessi della versione demo.
 */
import { computed,ref,watch,onMounted,onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import AthletePlanContent from '../components/AthletePlanContent.vue'
import ProgramHistory from '../components/ProgramHistory.vue'
import {activeAssignmentGroups,partitionPrograms,romeDate,weekOrdinal,weekExpired} from '../features/sheets/assignmentPolicy'
import SheetDetail from '../components/SheetDetail.vue'
import AthleteHomeContent from '../components/AthleteHomeContent.vue'
import { useAthleteLive } from '../features/athletes/useAthleteLive'
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
const programArchiveOpen=ref(route.query.view==='programmi')
watch(()=>route.query.view,v=>{programArchiveOpen.value=v==='programmi'})
const {status,message,session,data,avatarUrl,archive,archiveReady,hiddenArchiveIds,snapshots,updatedAt,hideArchiveCopy}=useAthleteLive(()=>props.screen==='archive')
const selectedWeek=ref(typeof route.query.week==='string'?route.query.week:'')
const requestedDay=computed(()=>typeof route.query.day==='string'&&/^[0-6]$/.test(route.query.day)&&(!selectedWeek.value||data.value?.weeks.some(w=>w.id===selectedWeek.value&&!w.deletedAt&&!weekExpired(w,romeDate())))?Number(route.query.day):undefined)
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
const clock=ref(Date.now())
let clockTimer:ReturnType<typeof setInterval>|null=null
const refreshClock=()=>{clock.value=Date.now()}
onMounted(()=>{
 clockTimer=setInterval(refreshClock,30_000)
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',refreshClock)
 if(typeof window!=='undefined')window.addEventListener('focus',refreshClock)
})
onUnmounted(()=>{
 if(clockTimer!==null)clearInterval(clockTimer)
 if(typeof document!=='undefined')document.removeEventListener('visibilitychange',refreshClock)
 if(typeof window!=='undefined')window.removeEventListener('focus',refreshClock)
})
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
const retryWorkspace=()=>window.location.reload()
const livePath=(path:string)=>isStagingMode()?path:`${path}?source=emulator`
const dayLink=computed(()=>currentWeek.value?(isStagingMode()?`/piano?week=${encodeURIComponent(currentWeek.value.id)}&day=${todayIndex.value}`:`/piano?source=emulator&week=${encodeURIComponent(currentWeek.value.id)}&day=${todayIndex.value}`):livePath('/piano'))
</script>
<template>
 <div class="stack athlete-live-screen" :aria-label="'Area Atleta'">
  <div v-lf-quiet-loading v-if="status==='loading'" class="panel lf-quiet-status" role="status">{{uiText("Caricamento schede e settimane…")}}</div>
  <div v-else-if="status==='error'" class="notice" role="alert">{{message}} <button type="button" class="secondary" @click="retryWorkspace">{{uiText("Riprova")}}</button> <RouterLink :to="isStagingMode()?'/accesso':'/dev/accesso'">{{uiText("Torna all'accesso")}}</RouterLink></div>
  <template v-else-if="data">
   <template v-if="props.screen==='plan'">
    <AthletePlanContent archive-expired :athlete-key="session?.uid||''" :personal="data.personal" :weeks="data.weeks" :groups="data.groups" :week-id="selectedWeek||currentWeek?.id||''" :initial-day="requestedDay" @update:week-id="id => { selectedWeek=id }" />
    <nav class="lf-r13-plan-archives" aria-label="Archivi del piano"><span>CONSULTA LO STORICO</span><div class="lf-r13-plan-archive-links"><RouterLink :to="livePath('/archivio')" class="secondary">Archivio schede <span aria-hidden="true">›</span></RouterLink><RouterLink :to="{path:'/archivio',query:{...(isStagingMode()?{}:{source:'emulator'}),view:'programmi'}}" class="secondary">Archivio programmazioni <span aria-hidden="true">›</span></RouterLink></div></nav>
   </template>
   <template v-else-if="props.screen==='home'">
    <AthleteHomeContent :name="session?.label||'Atleta'" :today-name="todayDay?.name||''" :week-name="currentWeekLabel" :calendar-day="romeWeekDayNumber(clock)" :now-ms="clock" :activities="todayDay?.activities||[]" :sheets="todaySheets" :free-sheets="homeFreeSheets" :has-current-week="!!currentWeek" :gym-id="session?.gymId||''" :uid="session?.uid||''" :days="currentWeek?.days||[]" :plan-link="livePath('/piano')" :archive-link="livePath('/archivio')" :progress-link="livePath('/progressi')" :training-link="livePath('/progressi')" :booking-link="livePath('/prenotazioni')" :avatar-url="avatarUrl" :profile-link="livePath('/profilo')" :day-link="dayLink"/>
   </template>
   <template v-else-if="props.screen==='archive'">
    <section class="panel athlete-archive-hero"><div class="row between"><h2 class="card-heading">{{uiText("ARCHIVIO")}}</h2><span class="pill pill-neutral">{{archiveReady?archiveDistinctCount:'—'}} {{uiText("SCHEDE")}}</span></div></section>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" :class="!programArchiveOpen?'primary':'secondary'" @click="programArchiveOpen=false">Schede</button><button type="button" :class="programArchiveOpen?'primary':'secondary'" @click="programArchiveOpen=true">Programmazioni</button></div>
    <ProgramHistory v-if="programArchiveOpen" :key="session?.uid" :programs="pastPrograms" :personal="data.personal" :archive="archive" :ready="archiveReady"/>
    <section v-else v-lf-entrance="{id:'athlete-archive',ready:archiveReady,rows:[{match:'.lf-archive-v4-item'}]}" class="panel athlete-archive-list"><div class="row between"><h3>{{uiText("Le mie schede di allenamento")}}</h3><span class="muted">{{archiveReady?archiveGroups.length:'—'}} {{uiText("schede visualizzate")}}</span></div>
     <div class="grid2"><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca nell'Archivio..."/>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="all">Tutte le schede</option><option value="active">Schede assegnate</option><option value="historical">Schede storiche</option><option value="trashed">Schede ritirate</option></select>
     </div>
     <p v-lf-quiet-loading v-if="!archiveReady" class="muted lf-quiet-status" role="status">{{uiText("Caricamento archivio storico…")}}</p>
     <p v-else-if="!archiveGroups.length" class="notice">{{uiText("Nessuna scheda corrisponde al filtro selezionato.")}}</p>
     <template v-if="archiveReady"><div v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item lf-archive-v4-item"><button class="wide athlete-archive-open" type="button" @click="opened=g.sheet"><span class="lf-archive-v4-icon" aria-hidden="true">▣</span><b>{{g.sheet.title}}</b><span class="lf-archive-v4-action">Apri scheda ›</span></button></div></template>
     
    </section>
   </template>
  </template>
  <SheetDetail v-if="opened" :sheet="opened" @close="opened=null" @finish="opened=null"/>
 </div>
</template>

<style scoped>
/* R13: Secondary history navigation only on the athlete plan. */
.lf-r13-plan-archives{width:100%;max-width:100%;padding:4px 2px 10px;display:grid;gap:10px}
.lf-r13-plan-archives>span{font-size:10px;letter-spacing:.1em;font-weight:850;color:var(--muted)}
.lf-r13-plan-archive-links{display:flex;align-items:center;flex-wrap:wrap;gap:9px}
.lf-r13-plan-archive-links a{min-height:38px;padding:9px 12px;font-size:11px;font-weight:800;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:15px;text-decoration:none;background:var(--card2);border:1px solid var(--outline);color:var(--text)}
.lf-r13-plan-archive-links a span{color:var(--mint);font-size:18px;line-height:1}
.lf-r13-plan-archive-links a:hover,.lf-r13-plan-archive-links a:focus-visible{border-color:var(--mint)}
@media(max-width:600px){.lf-r13-plan-archive-links a{font-size:10px;gap:7px;flex:1;min-width:135px}}
</style>
