<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {athleteMatches} from '../features/sheets/assignmentPolicy'
const props=withDefaults(defineProps<{athletes:readonly {id:string;name:string}[];modelValue:string;disabled?:boolean;allowEmpty?:boolean}>(),{disabled:false,allowEmpty:false})
const emit=defineEmits<{(e:'update:modelValue',id:string):void}>()
const search=ref('')
const matches=computed(()=>props.athletes.filter(a=>athleteMatches(a.name,search.value)))
const selected=computed(()=>props.athletes.find(a=>a.id===props.modelValue))
// In an assignment modal, typing a different name clears the old target.
// In the progress viewer the already open athlete stays selected until an explicit change.
watch(search,()=>{if(props.allowEmpty&&selected.value&&!matches.value.some(a=>a.id===selected.value?.id))emit('update:modelValue','')})
const outsideSearch=computed(()=>selected.value&&!matches.value.some(a=>a.id===selected.value?.id)?selected.value:null)
function choose(event:Event){
 const id=(event.target as HTMLSelectElement).value
 if((id&&props.athletes.some(a=>a.id===id))||(!id&&props.allowEmpty))emit('update:modelValue',id)
}
</script>
<template>
 <div class="lf-r4-athlete-search">
  <label>Cerca atleta<input v-model="search" type="search" autocomplete="off" placeholder="Nome o cognome…" :disabled="disabled"/></label>
  <label>Atleta<select :value="selected?.id||''" :disabled="disabled||!athletes.length" @change="choose">
   <option value="" :disabled="!allowEmpty">Seleziona atleta…</option>
   <option v-if="outsideSearch" :value="outsideSearch.id">{{outsideSearch.name}} · selezionato</option>
   <option v-for="a in matches" :key="a.id" :value="a.id">{{a.name}}</option>
  </select></label>
  <p v-if="search.trim()&&!matches.length" class="muted small" role="status">Nessun atleta corrisponde alla ricerca.</p>
 </div>
</template>
<style scoped>
.lf-r4-athlete-search{display:grid;gap:8px;min-width:0}.lf-r4-athlete-search label{display:grid;gap:4px;min-width:0}.lf-r4-athlete-search input,.lf-r4-athlete-search select{width:100%;min-width:0;max-width:100%;min-height:43px;background:var(--field);border:1px solid var(--outline);color:var(--text);border-radius:10px;padding:10px;font-size:14px}.lf-r4-athlete-search p{margin:0}
</style>
