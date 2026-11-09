<script setup lang="ts">
import {computed,defineAsyncComponent} from 'vue'
import {useRoute} from 'vue-router'
import {useLabStore} from '../stores/lab'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {uniqueSemanticSheets} from '../features/sheets/semanticDedup'
import {romeParts} from '../features/bookings/bookingPolicy'
import AthleteHomeContent from '../components/AthleteHomeContent.vue'
const lab=useLabStore(),route=useRoute()
const live=computed(()=>isStagingMode()||(import.meta.env.DEV&&route.query.source==='emulator'))
const LiveAthlete=(import.meta.env.DEV||isStagingMode())?defineAsyncComponent(()=>import('./AthleteLiveWorkspace.vue')):null
const todayIndex=computed(()=>((new Date(`${romeParts(Date.now()).date}T12:00:00Z`).getUTCDay()+6)%7))
const actualDay=computed(()=>lab.week?.days[todayIndex.value])
const todaysSheets=computed(()=>uniqueSemanticSheets(lab.grouped.programmed.filter(g=>g.links.some(link=>link.weekId===lab.week?.id&&link.dayIndex===todayIndex.value)).map(g=>g.sheet)))
const dayLink=computed(()=>lab.week?`/piano?week=${encodeURIComponent(lab.week.id)}&day=${todayIndex.value}`:'/piano')
</script>
<template>
 <component v-if="live&&LiveAthlete" :is="LiveAthlete" screen="home"/>
 <AthleteHomeContent v-else :name="lab.athlete?.name||'Atleta'" :today-name="actualDay?.name||''" :week-name="lab.week?.name||''" :calendar-day="todayIndex+1" :activities="actualDay?.activities||[]" :sheets="todaysSheets" :days="lab.week?.days||[]" plan-link="/piano" archive-link="/archivio" progress-link="/progressi" booking-link="/prenotazioni" profile-link="/profilo" :day-link="dayLink"/>
</template>
