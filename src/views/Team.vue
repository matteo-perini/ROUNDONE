<script setup lang="ts">
import {computed,ref,defineAsyncComponent} from 'vue'
import { useRoute } from 'vue-router'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {useLabStore} from '../stores/lab'
const route=useRoute();const emulator=computed(()=>isStagingMode()||(import.meta.env.DEV&&route.query.source==='emulator'))
const TeamLive=(import.meta.env.DEV||isStagingMode())?defineAsyncComponent(()=>import('./DevTeamWorkspace.vue')):null
const lab=useLabStore();const q=ref('');const athletes=computed(()=>lab.data.athletes.filter(a=>a.name.toLowerCase().includes(q.value.toLowerCase())))
</script>
<template><component v-if="emulator && TeamLive" :is="TeamLive"/><section v-else class="panel athlete-team-screen"><div class="row between"><div><h2 class="card-heading">LION FIT TEAM</h2><p class="muted" style="margin:8px 0 0">ATLETI DELLA TUA PALESTRA</p></div><span class="pill pill-neutral">{{lab.data.athletes.length}} membri · DEMO</span></div><div class="divider"/><input v-model="q" placeholder="Cerca un atleta..."/><div class="stack athlete-team-list"><article v-for="athlete in athletes" :key="athlete.id" class="action-card"><span class="action-icon">🦁</span><div><strong>{{athlete.name.toUpperCase()}}</strong><small>ATLETA DELLA PALESTRA</small></div></article></div></section></template>
