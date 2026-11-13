<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Atleta operativo 2M/K: Home/Piano/Archivio originali, SOLO emulator e sola lettura.
 * Il catalogo esercizi e la modale SheetDetail sono gli stessi della versione demo.
 */
import { computed,ref,watch,onMounted,onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import AthletePlanContent from '../components/AthletePlanContent.vue'
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
const {status,message,session,data,avatarUrl,archive,archiveReady,hiddenArchiveIds,snapshots,updatedAt,hideArchiveCopy}=useAthleteLive()
const selectedWeek=ref(typeof route.query.week==='string'?route.query.week:'')
const requestedDay=computed(()=>typeof route.query.day==='string'&&/^[0-6]$/.test(route.query.day)?Number(route.query.day):undefined)
watch(()=>route.query.week,next=>{selectedWeek.value=typeof next==='string'?next:''})
const opened=ref<{title:string;exercises:readonly ExerciseRecord[]}|null>(null)
const search=ref(''), archiveView=ref<ArchiveView>('all')
const hideBusy=ref(false),hideMessage=ref('')
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
 return p?`${p.title} · Settimana ${p.weeks.findIndex(x=>x.id===w.id)+1}`:w.name
})
const todayIndex=computed(()=>romeDayIndex(clock.value))
const todayDay=computed(()=>currentWeek.value?.days[todayIndex.value])
const todaySheets=computed(()=>data.value&&currentWeek.value?linkedSheetsForDay(data.value.groups,currentWeek.value.id,todayIndex.value):[])
const mergedArchive=computed(()=>joinArchivesWithLegacy(archive.value,data.value?.personal||[]))
const shownArchive=computed(()=>mergedArchive.value.filter(a=>!hiddenArchiveIds.value.has(a.id)))
const counts=computed(()=>archiveCounts(shownArchive.value,data.value?.personal||[]))
const archiveGroups=computed(()=>groupSemanticCopies(visibleArchives(shownArchive.value,data.value?.personal||[],archiveView.value,search.value)))
const archiveDistinctCount=computed(()=>groupSemanticCopies(shownArchive.value).length)
const livePath=(path:string)=>isStagingMode()?path:`${path}?source=emulator`
const dayLink=computed(()=>currentWeek.value?(isStagingMode()?`/piano?week=${encodeURIComponent(currentWeek.value.id)}&day=${todayIndex.value}`:`/piano?source=emulator&week=${encodeURIComponent(currentWeek.value.id)}&day=${todayIndex.value}`):livePath('/piano'))
</script>
<template>
 <div class="stack athlete-live-screen" :aria-label="'Area Atleta'">
  <div v-if="status==='loading'" class="panel" role="status">{{uiText("Caricamento schede e settimane…")}}</div>
  <div v-else-if="status==='error'" class="notice" role="alert">{{message}} <RouterLink :to="isStagingMode()?'/accesso':'/dev/accesso'">{{uiText("Torna all'accesso")}}</RouterLink></div>
  <template v-else-if="data">
   <template v-if="props.screen==='plan'">
    <AthletePlanContent :athlete-key="session?.uid||''" :personal="data.personal" :weeks="data.weeks" :groups="data.groups" :week-id="selectedWeek||currentWeek?.id||''" :initial-day="requestedDay" @update:week-id="id => { selectedWeek=id }" />
    <div class="panel"><RouterLink :to="livePath('/archivio')" class="ghost">{{uiText("CONSULTA IL MIO ARCHIVIO STORICO →")}}</RouterLink></div>
   </template>
   <template v-else-if="props.screen==='home'">
    <AthleteHomeContent :name="session?.label||'Atleta'" :today-name="todayDay?.name||''" :week-name="currentWeekLabel" :calendar-day="romeWeekDayNumber(clock)" :activities="todayDay?.activities||[]" :sheets="todaySheets" :days="currentWeek?.days||[]" :plan-link="livePath('/piano')" :archive-link="livePath('/archivio')" :progress-link="livePath('/progressi')" :booking-link="livePath('/prenotazioni')" :avatar-url="avatarUrl" :profile-link="livePath('/profilo')" :day-link="dayLink"/>
   </template>
   <template v-else-if="props.screen==='archive'">
    <section class="panel athlete-archive-hero"><div class="row between"><h2 class="card-heading">{{uiText("ARCHIVIO")}}</h2><span class="pill pill-neutral">{{archiveDistinctCount}} {{uiText("SCHEDE")}}</span></div><p class="muted" style="margin:20px 0 0">{{uiText("Ritrova le schede che hai ricevuto dai Coach, comprese quelle dei programmi precedenti.")}}</p></section>
    <section class="panel athlete-archive-list"><div class="row between"><h3>{{uiText("Le mie schede di allenamento")}}</h3><span class="muted">{{archiveGroups.length}} {{uiText("schede visualizzate")}}</span></div>
     <div class="grid2"><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca nell'Archivio..."/>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="all">Tutte le schede</option><option value="active">Schede assegnate</option><option value="historical">Schede storiche</option><option value="trashed">Schede ritirate</option></select>
     </div>
     <p v-if="!archiveReady" class="muted">{{uiText("Caricamento archivio storico…")}}</p>
     <p v-else-if="!archiveGroups.length" class="notice">{{uiText("Nessuna scheda corrisponde al filtro selezionato. Le copie protette non vengono eliminate.")}}</p>
     <div v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item lf-archive-v4-item"><button class="wide athlete-archive-open" type="button" @click="opened=g.sheet"><span class="lf-archive-v4-icon" aria-hidden="true">▣</span><b>{{g.sheet.title}}</b><span class="lf-archive-v4-action">Apri scheda ›</span></button></div>
     <p class="muted small lf-archive-v4-note">Le schede storiche rimangono conservate. Le versioni con esercizi o contenuti differenti restano separate.</p>
    </section>
   </template>
  </template>
  <SheetDetail v-if="opened" :sheet="opened" @close="opened=null" @finish="opened=null"/>
 </div>
</template>
