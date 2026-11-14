<script setup lang="ts">
import {onUnmounted,ref,watch} from 'vue'
import {competitionCoversEnabled,readCompetitionCover} from '../integrations/firestore/competitionCovers'
const props=defineProps<{gym:string;eventId?:string;coverId?:string}>()
const url=ref('');const fallback=import.meta.env.BASE_URL+'lionfit-redesign/mma-gym-banner.jpg'
let serial=0
function clear(){if(url.value)URL.revokeObjectURL(url.value);url.value=''}
watch(()=>[props.gym,props.eventId,props.coverId] as const,async([gym,id,cover])=>{const current=++serial;clear();if(!gym||!id||!cover||!competitionCoversEnabled())return;try{const next=await readCompetitionCover(gym,id,cover);if(current===serial)url.value=next;else URL.revokeObjectURL(next)}catch{/* Default art instead of a broken image. */}},{immediate:true})
onUnmounted(()=>{serial++;clear()})
</script>
<template><img :src="url||fallback" alt="" class="lf-competition-cover" @error="clear"/></template>
<style scoped>.lf-competition-cover{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit}</style>
