<script setup lang="ts">
/** Archivio modelli Coach condiviso della V1: filtro/ricerca solo UI.
 * SOLO le azioni esplicite sulla singola fixture 2M/H emettono eventi di prova.
 */
import {computed,ref} from 'vue'
import {countModels,categoriesFor,modelResults,mayOperateLabCoachModel,type CoachModel,type ModelFilter,type ModelOrder} from '../features/athletes/coachTemplateArchive'
import {modelAssignmentStatus,mayStageModel,type AssignmentPersonal} from '../features/athletes/coachAssignmentFlow'
const props=withDefaults(defineProps<{
  models:readonly CoachModel[]
  personal?: readonly AssignmentPersonal[]
  selectedTemplateId?: string
  coachUid?:string
  canTestWrite?:boolean
  consent?:boolean
  busy?:boolean
}>(),{coachUid:'',canTestWrite:false,consent:false,busy:false,personal:()=>[],selectedTemplateId:''})
const emit=defineEmits<{(e:'create-fixture'):void;(e:'trash-fixture',id:string):void;(e:'restore-fixture',id:string):void;(e:'stage-assignment',id:string):void}>()
const query=ref('')
const filter=ref<ModelFilter>('active')
const category=ref('')
const order=ref<ModelOrder>('title')
const counts=computed(()=>countModels(props.models))
const categories=computed(()=>categoriesFor(props.models))
const visible=computed(()=>modelResults(props.models,filter.value,query.value,category.value,order.value))
const hasOwnFixture=computed(()=>props.models.some(m=>mayOperateLabCoachModel(props.coachUid,m.id)))
function ownFixture(m:CoachModel):boolean{return mayOperateLabCoachModel(props.coachUid,m.id) && m.createdBy===props.coachUid}
</script>
<template>
  <section class="panel" aria-label="Archivio modelli Coach condiviso">
    <h3>ARCHIVIO MODELLI COACH · {{counts.all}}</h3>
    <p class="muted small">Archivio condiviso della palestra (V1): non è ancora separato tra Marco e Riccardo. La scelta prepara soltanto l’assegnazione: NON scrive su Firebase. Filtri e ricerca non modificano Firebase. Le copie storiche degli atleti sono un archivio diverso.</p>
    <div class="grid2">
      <div class="stack">
        <label for="coach-model-search" class="muted small">Cerca modello</label>
        <input id="coach-model-search" v-model="query" type="search" placeholder="Titolo, categoria, esercizio o ID..." />
        <label for="coach-model-filter" class="muted small">Stato</label>
        <select id="coach-model-filter" v-model="filter">
          <option value="active">Attivi ({{counts.active}})</option>
          <option value="trashed">Nel cestino ({{counts.trashed}})</option>
          <option value="all">Tutti ({{counts.all}})</option>
        </select>
      </div>
      <div class="stack">
        <label for="coach-model-category" class="muted small">Categoria</label>
        <select id="coach-model-category" v-model="category"><option value="">Tutte le categorie</option><option v-for="c in categories" :key="c" :value="c">{{c}}</option></select>
        <label for="coach-model-order" class="muted small">Ordina per</label>
        <select id="coach-model-order" v-model="order"><option value="title">Nome</option><option value="category">Categoria</option></select>
      </div>
    </div>
    <p class="muted small" role="status">{{visible.length}} modelli visualizzati su {{counts.all}} ({{counts.active}} attivi, {{counts.trashed}} cestinati).</p>
    <p v-if="!counts.all" class="notice">Non sono presenti modelli.</p>
    <p v-else-if="!visible.length" class="notice">Nessun modello corrisponde ai filtri selezionati.</p>
    <div v-else class="grid2">
      <details v-for="m in visible" :key="m.id" class="line-card">
        <summary><strong>{{m.title}}</strong> <span class="muted small">· {{m.trashed?'Cestinato':'Attivo'}}</span></summary>
        <p class="muted small">Categoria: {{m.category||'Senza categoria'}} · {{m.exercises.length}} esercizi</p>
        <p class="muted small">ID modello: <code>{{m.id}}</code></p>
        <p v-if="m.trashed" class="muted small">Non assegnabile: modello nel cestino.</p>
        <p v-else-if="modelAssignmentStatus(m,personal)==='already-assigned'" class="muted small">Già assegnato a questo atleta (stesso ID).</p>
        <p v-else-if="modelAssignmentStatus(m,personal)==='personal-in-trash'" class="muted small">La scheda personale è nel cestino: va ripristinata, non duplicata.</p>
        <p v-else class="muted small">Disponibile per questo atleta.</p>
        <p v-if="m.createdBy" class="muted small">Creato da UID: <code>{{m.createdBy}}</code> (informazione, non permesso per-Coach)</p>
        <ol><li v-for="(exercise,i) in m.exercises" :key="i">{{exercise}}</li></ol>
        <button v-if="mayStageModel(m,personal)" type="button" class="secondary"
          :disabled="!canTestWrite||busy||selectedTemplateId===m.id"
          @click="emit('stage-assignment',m.id)">{{selectedTemplateId===m.id?'Modello selezionato':'Scegli per assegnazione guidata'}}</button>
        <button v-if="ownFixture(m) && !m.trashed" type="button" class="secondary" :disabled="!canTestWrite||!consent||busy" @click="emit('trash-fixture',m.id)">Cestina SOLO il mio modello 2M/H</button>
        <button v-if="ownFixture(m) && m.trashed" type="button" class="secondary" :disabled="!canTestWrite||!consent||busy" @click="emit('restore-fixture',m.id)">Ripristina SOLO il mio modello 2M/H</button>
      </details>
    </div>
    <div class="line-card stack" style="margin-top:12px" v-if="canTestWrite">
      <strong>PROVA CONTROLLATA · UN SOLO MODELLO PER COACH</strong>
      <p class="muted small">Nessun modello esistente viene eliminato. La creazione non genera duplicati: se hai già un modello fittizio 2M/H, puoi soltanto cestinarlo o ripristinarlo. Utilizza il consenso nella sezione Operazioni guidate.</p>
      <button type="button" class="secondary" :disabled="busy||!consent||hasOwnFixture" @click="emit('create-fixture')">Crea un modello Coach fittizio 2M/H</button>
    </div>
  </section>
</template>
