<script setup lang="ts">
/** Atleta operativo 2M/K: Home/Piano/Archivio originali, SOLO emulator e sola lettura.
 * Il catalogo esercizi e la modale SheetDetail sono gli stessi della versione demo.
 */
import { computed,ref,watch } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import AthletePlanContent from '../components/AthletePlanContent.vue'
import SheetDetail from '../components/SheetDetail.vue'
import AthleteHomeContent from '../components/AthleteHomeContent.vue'
import { useAthleteLive } from '../features/athletes/useAthleteLive'
import {isStagingMode,isLiveMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import { linkedSheetsForDay,liveWeekForDate } from '../features/athletes/athleteOperationalPolicy'
import { romeParts } from '../features/bookings/bookingPolicy'
import { archiveCounts,visibleArchives,type ArchiveView } from '../features/athletes/archiveVisibility'
import { groupSemanticCopies } from '../features/sheets/semanticDedup'
import {joinArchivesWithLegacy,isArchiveCopyLinkedOrEquivalent} from '../features/athletes/legacyArchiveProjection'
import type { ExerciseRecord } from '../features/sheets/domain'
const props=defineProps<{screen:'home'|'plan'|'archive'}>()
const route=useRoute()
const {status,message,session,data,archive,archiveReady,hiddenArchiveIds,snapshots,updatedAt,hideArchiveCopy}=useAthleteLive()
const selectedWeek=ref(typeof route.query.week==='string'?route.query.week:'')
const requestedDay=computed(()=>typeof route.query.day==='string'&&/^[0-6]$/.test(route.query.day)?Number(route.query.day):undefined)
watch(()=>route.query.week,next=>{selectedWeek.value=typeof next==='string'?next:''})
const opened=ref<{title:string;exercises:readonly ExerciseRecord[]}|null>(null)
const search=ref(''), archiveView=ref<ArchiveView>('all')
const hideApproved=ref(false),hideBusy=ref(false),hideMessage=ref('')
async function hideCopy(id:string){
 if(!hideApproved.value||hideBusy.value||!session.value)return
 if(isArchiveCopyLinkedOrEquivalent(id,mergedArchive.value,data.value?.weeks||[],session.value.uid)){hideMessage.value='Questa scheda (o una sua copia equivalente) è ancora collegata a un giorno: non può essere nascosta.';return}
 if(!window.confirm('Nascondere questa copia dal tuo Archivio personale? Il documento storico non verra eliminato.'))return
 hideBusy.value=true
 try{await hideArchiveCopy(id);hideMessage.value='Copia nascosta soltanto nella visualizzazione personale.'}
 catch(e){hideMessage.value=e instanceof Error?e.message:String(e)}
 finally{hideBusy.value=false;hideApproved.value=false}
}
const currentWeek=computed(()=>data.value?liveWeekForDate(data.value.weeks):null)
const todayIndex=computed(()=>{const day=new Date(`${romeParts(Date.now()).date}T12:00:00Z`).getUTCDay();return(day+6)%7})
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
  <div v-if="status==='loading'" class="panel" role="status">Caricamento schede e settimane…</div>
  <div v-else-if="status==='error'" class="notice" role="alert">{{message}} <RouterLink :to="isStagingMode()?'/accesso':'/dev/accesso'">Torna all'accesso</RouterLink></div>
  <template v-else-if="data">
   <template v-if="props.screen==='plan'">
    <AthletePlanContent :athlete-key="session?.uid||''" :personal="data.personal" :weeks="data.weeks" :groups="data.groups" :week-id="selectedWeek||currentWeek?.id||''" :initial-day="requestedDay" @update:week-id="id => { selectedWeek=id }" />
    <div class="panel"><RouterLink :to="livePath('/archivio')" class="ghost">CONSULTA IL MIO ARCHIVIO STORICO →</RouterLink></div>
   </template>
   <template v-else-if="props.screen==='home'">
    <AthleteHomeContent :name="session?.label||'Atleta'" :today-name="todayDay?.name||''" :week-name="currentWeek?.name||''" :activities="todayDay?.activities||[]" :sheets="todaySheets" :days="currentWeek?.days||[]" :plan-link="livePath('/piano')" :archive-link="livePath('/archivio')" :team-link="livePath('/team')" :profile-link="livePath('/profilo')" :day-link="dayLink"/>
   </template>
   <template v-else-if="props.screen==='archive'">
    <section class="panel athlete-archive-hero"><div class="row between"><h2 class="card-heading">ARCHIVIO</h2><span class="pill pill-neutral">{{counts.all}} SCHEDE E COPIE</span></div><p class="muted" style="margin:20px 0 0">Qui ritrovi tutte le schede di allenamento ricevute dal coach, già assegnate, ritirate, protette o archiviate.</p></section>
    <section class="panel athlete-archive-list"><div class="row between"><h3>Le mie schede di allenamento</h3><span class="muted">{{archiveGroups.length}} schede visualizzate</span></div>
     <div class="grid2"><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca nell'Archivio..."/>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="active">Schede attive ({{counts.active}})</option><option value="trashed">Schede cestinate ({{counts.trashed}})</option><option value="historical">Solo storico ({{counts.historical}})</option><option value="all">Tutte le copie ({{counts.all}})</option></select>
     </div>
     <p v-if="!archiveReady" class="muted">Caricamento archivio storico…</p>
     <p v-else-if="!archiveGroups.length" class="notice">Nessuna scheda corrisponde al filtro selezionato. Le copie protette non vengono eliminate.</p>
     <div v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item"><button class="wide athlete-archive-open" @click="opened=g.sheet"><b>{{g.sheet.title}}</b><p class="athlete-archive-meta">{{g.sheet.legacy?'Scheda originale legacy · copia protetta da allineare':'Copia protetta · consultabile'}}</p></button><details class="athlete-archive-copies"><summary class="muted small">Gestisci le copie di questa scheda</summary><div v-for="copy in g.copies" :key="copy.id" class="row between" style="margin-top:8px;gap:8px"><span class="muted small">Copia {{g.copies.indexOf(copy)+1}}</span><button class="ghost" type="button" :disabled="isStagingMode()||!hideApproved||hideBusy||copy.legacy||isArchiveCopyLinkedOrEquivalent(copy.id,mergedArchive,data?.weeks||[],session?.uid||'')" @click="hideCopy(copy.id)">ELIMINA DALLA VISTA</button></div></details></div>
     <p v-if="hideMessage" class="muted" role="status">{{hideMessage}}</p>
     <label v-if="!isStagingMode()" class="muted small"><input v-model="hideApproved" type="checkbox"/> Autorizzo a nascondere questa copia dal mio archivio personale</label><p v-else class="muted small">Le copie storiche sono in sola lettura per questa build.</p>
     <p class="muted small">Nascondere non elimina la copia protetta né modifica le schede assegnate.</p>
    </section>
   </template>
  </template>
  <SheetDetail v-if="opened" :sheet="opened" @close="opened=null" @finish="opened=null"/>
 </div>
</template>
