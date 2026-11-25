<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {ProgramFamily} from '../features/sheets/programFamilies'
import type {Personal,ExerciseRecord} from '../features/sheets/domain'
import type {HistoricalArchive} from '../features/athletes/labArchive'
import {weekEnd} from '../features/sheets/assignmentPolicy'
import SheetDetail from './SheetDetail.vue'
const props=defineProps<{programs:ProgramFamily[];personal:Personal[];archive:HistoricalArchive[];ready:boolean;pageActive?:boolean}>()
const selected=ref(''),weekId=ref(''),opened=ref<{title:string;exercises:readonly ExerciseRecord[]}|null>(null)
const program=computed(()=>props.programs.find(p=>p.id===selected.value))
const week=computed(()=>program.value?.weeks.find(w=>w.id===weekId.value))
function choose(id:string){selected.value=id;weekId.value='';opened.value=null}
function sheet(id:string){return props.archive.find(a=>a.id===id)||props.personal.find(p=>p.id===id)}
function prettyDate(input?:string){
 if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(input))return input||'—'
 const date=new Date(input+'T12:00:00Z')
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date):input
}
watch(()=>props.pageActive,active=>{if(active===false)opened.value=null})
watch(()=>props.programs,()=>{if(selected.value&&!program.value)choose('');else if(weekId.value&&!week.value)weekId.value=''})
</script>
<template>
 <section class="panel lf-r3-history lf-r15-history" v-lf-entrance="{id:'athlete-program-history',ready:ready,rows:[{match:'.lf-r15-history-program'}]}">
  <div class="lf-r15-history-head"><div><h2>Programmazioni concluse</h2><p>Consulta le settimane e le schede del tuo storico.</p></div><button v-if="program" type="button" class="secondary lf-r15-history-back" @click="choose('')">‹ Tutti i programmi</button></div>
  <p v-if="!ready" class="muted" role="status">Caricamento…</p>
  <template v-else-if="!program"><button v-for="p in [...programs].reverse()" :key="p.id" class="secondary lf-r3-history-row lf-r15-history-program" type="button" @click="choose(p.id)"><span class="lf-r15-history-symbol" aria-hidden="true">▦</span><b>{{p.title}}</b><small>{{p.weeks.length}} {{p.weeks.length===1?'settimana conclusa':'settimane concluse'}} · {{prettyDate(p.weeks[0]?.startDate)}} – {{prettyDate(weekEnd(p.weeks.at(-1)?.startDate))}}</small><span class="lf-r15-history-arrow" aria-hidden="true">›</span></button><p v-if="!programs.length" class="lf-r15-history-empty muted">Nessuna programmazione conclusa.</p></template>
  <template v-else><h3 class="lf-r15-history-selected">{{program.title}}</h3><div class="lf-r3-history-weeks lf-r15-history-weeks"><button v-for="w in program.weeks" :key="w.id" type="button" :class="weekId===w.id?'primary':'secondary'" :aria-pressed="weekId===w.id" @click="weekId=w.id"><b>Settimana {{w.weekIndex}}</b><small>{{prettyDate(w.startDate)}} – {{prettyDate(weekEnd(w.startDate))}}</small></button></div>
  <div v-if="week" class="lf-r3-history-days lf-r15-history-days"><article v-for="(d,i) in week.days" :key="i" class="line-card"><b>{{d.name}}</b><p v-for="(activity,j) in d.activities" :key="j">{{activity}}</p><template v-for="(id,slot) in [d.templateId,d.templateId2]" :key="slot"><button v-if="id&&sheet(id)" type="button" class="secondary wide" @click="opened=sheet(id)||null">Scheda {{slot+1}} · {{sheet(id)?.title}} ›</button><p v-else-if="id" class="muted">Scheda {{slot+1}} non disponibile</p></template><p v-if="!d.activities.length&&!d.templateId&&!d.templateId2" class="muted">Nessuna attività</p></article></div></template>
 </section>
 <SheetDetail v-if="opened" :sheet="opened" read-only @close="opened=null" @finish="opened=null"/>
</template>
<style scoped>
.lf-r3-history,.lf-r3-history-days{display:grid;gap:9px}.lf-r3-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;text-align:left;white-space:normal;gap:5px;padding:12px}.lf-r3-history-row small{grid-column:1;grid-row:2}.lf-r3-history-row span{grid-column:2;grid-row:1/3;align-self:center}.lf-r3-history-weeks{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px}.lf-r3-history-weeks button{display:grid;gap:4px;white-space:normal;min-width:0}.lf-r3-history-days article{display:grid;gap:7px;padding:12px}.lf-r3-history-days p{margin:0;font-size:12px}.lf-r3-history small{font-size:11px;font-weight:500}
</style>
