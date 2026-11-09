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
const todayIndex=computed(()=>romeDayIndex(clock.value))
const todayDay=computed(()=>currentWeek.value?.days[todayIndex.value])
const todaySheets=computed(()=>data.value&&currentWeek.value?linkedSheetsForDay(data.value.groups,currentWeek.value.id,todayIndex.value):[])
const mergedArchive=computed(()=>joinArchivesWithLegacy(archive.value,data.value?.personal||[]))
const shownArchive=computed(()=>mergedArchive.value.filter(a=>!hiddenArchiveIds.value.has(a.id)))
const counts=computed(()=>archiveCounts(shownArchive.value,data.value?.personal||[]))
const archiveGroups=computed(()=>groupSemanticCopies(visibleArchives(shownArchive.value,data.value?.personal||[],archiveView.value,search.value)))
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
    <AthleteHomeContent :name="session?.label||'Atleta'" :today-name="todayDay?.name||''" :week-name="currentWeek?.name||''" :calendar-day="romeWeekDayNumber(clock)" :activities="todayDay?.activities||[]" :sheets="todaySheets" :days="currentWeek?.days||[]" :plan-link="livePath('/piano')" :archive-link="livePath('/archivio')" :progress-link="livePath('/progressi')" :booking-link="livePath('/prenotazioni')" :avatar-url="avatarUrl" :profile-link="livePath('/profilo')" :day-link="dayLink"/>
   </template>
   <template v-else-if="props.screen==='archive'">
    <section class="panel athlete-archive-hero"><div class="row between"><h2 class="card-heading">{{uiText("ARCHIVIO")}}</h2><span class="pill pill-neutral">{{counts.all}} {{uiText("SCHEDE E COPIE")}}</span></div><p class="muted" style="margin:20px 0 0">{{uiText("Qui ritrovi tutte le schede di allenamento ricevute dal coach, già assegnate, ritirate, protette o archiviate.")}}</p></section>
    <section class="panel athlete-archive-list"><div class="row between"><h3>{{uiText("Le mie schede di allenamento")}}</h3><span class="muted">{{archiveGroups.length}} {{uiText("schede visualizzate")}}</span></div>
     <div class="grid2"><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca nell'Archivio..."/>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="active">{{uiText("Schede attive (")}}{{counts.active}})</option><option value="trashed">{{uiText("Schede cestinate (")}}{{counts.trashed}})</option><option value="historical">{{uiText("Solo storico (")}}{{counts.historical}})</option><option value="all">{{uiText("Tutte le copie (")}}{{counts.all}})</option></select>
     </div>
     <p v-if="!archiveReady" class="muted">{{uiText("Caricamento archivio storico…")}}</p>
     <p v-else-if="!archiveGroups.length" class="notice">{{uiText("Nessuna scheda corrisponde al filtro selezionato. Le copie protette non vengono eliminate.")}}</p>
     <div v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item"><button class="wide athlete-archive-open" @click="opened=g.sheet"><b>{{g.sheet.title}}</b><p class="athlete-archive-meta">{{g.sheet.legacy?'Scheda originale legacy · copia protetta da allineare':'Copia protetta · consultabile'}}</p></button><details class="athlete-archive-copies"><summary class="muted small">{{uiText("Gestisci le copie di questa scheda")}}</summary><div v-for="copy in g.copies" :key="copy.id" class="row between" style="margin-top:8px;gap:8px"><span class="muted small">{{uiText("Copia")}} {{g.copies.indexOf(copy)+1}}</span><button class="ghost" type="button" :disabled="!mayWriteLive()||hideBusy||copy.legacy||isArchiveCopyLinkedOrEquivalent(copy.id,mergedArchive,data?.weeks||[],session?.uid||'')" @click="hideCopy(copy.id)">{{uiText("ELIMINA DALLA VISTA")}}</button></div></details></div>
     <p v-if="hideMessage" class="muted" role="status">{{hideMessage}}</p>
     <p v-if="!mayWriteLive()" class="muted small">{{uiText("Le modifiche all’archivio sono disabilitate in questa build.")}}</p>
     <p class="muted small">{{uiText("Nascondere non elimina la copia protetta né modifica le schede assegnate.")}}</p>
    </section>
   </template>
  </template>
  <SheetDetail v-if="opened" :sheet="opened" @close="opened=null" @finish="opened=null"/>
 </div>
</template>
