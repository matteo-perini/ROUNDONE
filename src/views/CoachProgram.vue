<script setup lang="ts">
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
import {ref,computed,watch} from 'vue'
import {useLabStore} from '../stores/lab'
import {useRouter} from 'vue-router'
import type {Sheet} from '../model'

defineProps<{ embedded?: boolean }>()
const lab=useLabStore(),router=useRouter()
const opened=ref(true), notice=ref(''), picker=ref<{day:number;slot:1|2}|null>(null),picked=ref(''),deleteMode=ref(false),selectedWeeks=ref<string[]>([])
const selectedAthlete=computed(()=>lab.athlete)
const days=computed(()=>lab.week?.days??[])
// Le copie personali servono solo a mostrare la scheda gia' collegata.
const available=computed(()=>lab.mySheets)
// Il selettore Collega pesca i MODELLI dell'Archivio Coach, non le assegnazioni dell'atleta.
const archiveChoices=computed(()=>lab.data.templates.filter(s=>!s.deletedAt).slice().sort((a,b)=>a.title.localeCompare(b.title,'it')))
function sheet(day:number,slot:1|2):Sheet|undefined {
 const id=slot===1?days.value[day]?.templateId:days.value[day]?.templateId2
 return available.value.find(s=>s.id===id) // Mai associare per titolo o con fallback ambiguo
}
function unlink(day:number,slot:1|2){try{const id=slot===1?days.value[day]?.templateId:days.value[day]?.templateId2;if(!id||!lab.week)return;lab.unlinkPersonal(lab.week.id,day,slot,id);notice.value='Scollegata solo questa giornata: scheda personale e archivio conservati.'}catch(e){notice.value=(e as Error).message}}
function link(day:number,slot:1|2){picker.value={day,slot};picked.value=''}
function commit(){if(!picker.value||!picked.value||!lab.week)return;try{
 const {day,slot}=picker.value, [kind,id]=picked.value.split(':',2)
 if(kind!=='shared'||!id)throw new Error('Seleziona un modello valido dall Archivio Coach.')
 // Rifiuta valori falsificati e modelli nel Cestino. Il controllo e' ripetuto dallo store.
 if(!archiveChoices.value.some(s=>s.id===id))throw new Error('Modello non presente nell Archivio Coach attivo.')
 const current=slot===1?days.value[day]?.templateId:days.value[day]?.templateId2
 const assigned=lab.assignTemplate(id,[lab.athleteId])
 const personalId=assigned[0]?.id
 if(!personalId)throw new Error('Impossibile assegnare il modello all atleta.')
 lab.linkPersonal(lab.week.id,day,slot,personalId,current||'');notice.value='Scheda dell Archivio Coach assegnata e collegata alla settimana.';picker.value=null
 }catch(e){notice.value=(e as Error).message}}
function saveActivity(e:Event,day:number,slot:1|2){if(!lab.week)return;try{lab.updateActivity(lab.week.id,day,slot,(e.target as HTMLInputElement).value)}catch(err){notice.value=(err as Error).message}}
function jumpToCreate(day:number,slot:1|2){void router.push({path:'/coach/archivio',query:{mode:'personal',day:String(day),slot:String(slot),weekId:lab.week?.id}})}
function selectWeek(id:string){
 if(deleteMode.value){selectedWeeks.value=selectedWeeks.value.includes(id)?selectedWeeks.value.filter(x=>x!==id):[...selectedWeeks.value,id];return}
 if(lab.weekId===id)opened.value=!opened.value
 else {lab.weekId=id;opened.value=true}
}
function toggleDeleteMode(){deleteMode.value=!deleteMode.value;selectedWeeks.value=[]}
function deleteSelectedWeeks(){
 const ids=lab.weeks.filter(w=>selectedWeeks.value.includes(w.id)).map(w=>w.id)
 if(!ids.length)return
 if(!confirm('Spostare nel Cestino '+ids.length+' settimane?\n'+lab.weeks.filter(w=>ids.includes(w.id)).map(w=>w.name).join(', ')+'\nNessuna scheda sarà cancellata fisicamente.'))return
 try{for(const id of ids)lab.deleteWeek(id);notice.value=ids.length+' settimane spostate nel Cestino.';opened.value=false;deleteMode.value=false;selectedWeeks.value=[]}catch(e){notice.value=(e as Error).message}
}
function doDeleteWeek(){if(!lab.week)return;if(!confirm('Spostare la settimana selezionata nel Cestino? Le schede personali non saranno cancellate.'))return;try{lab.deleteWeek(lab.week.id);notice.value='Settimana spostata nel Cestino. Le schede personali sono conservate.';opened.value=false;deleteMode.value=false;selectedWeeks.value=[]}catch(e){notice.value=(e as Error).message}}
function doDuplicate(){if(!lab.week)return;try{const copy=lab.duplicateWeek(lab.week.id);lab.weekId=copy.id;opened.value=true;notice.value='Settimana duplicata con collegamenti agli stessi ID.'}catch(e){notice.value=(e as Error).message}}
watch(()=>lab.athleteId,()=>{picker.value=null;notice.value='';opened.value=true;deleteMode.value=false;selectedWeeks.value=[]})
watch(()=>lab.weekId,()=>{picker.value=null;notice.value=''}, {flush:'post'})
</script>
<template>
<section v-if="isOperationalMode()" class="panel"><h2>PROGRAMMAZIONE FIREBASE</h2><p class="muted">Le settimane e le schede sono disponibili nella Gestione Atleti, per mantenere lo stesso ID in tutte le schermate.</p><RouterLink to="/coach/atleti" class="primary">Apri Gestione Atleti →</RouterLink></section>
<template v-else>
<section class="panel coach-program-compact">
 <div class="row between coach-program-overview">
  <div><h2 class="card-heading">PROGRAMMA ATTUALE</h2><span class="muted small">{{selectedAthlete?.name}} · {{lab.weeks.length}} {{lab.weeks.length===1?'SETTIMANA':'SETTIMANE'}}</span></div>
  <select v-if="!embedded" v-model="lab.athleteId" class="coach-program-athlete-select" aria-label="Seleziona atleta"><option v-for="a in lab.data.athletes" :key="a.id" :value="a.id">{{a.name}}</option></select>
 </div>
 <div class="coach-week-bar">
  <div class="week-pills"><button v-for="(w,i) in lab.weeks" :key="w.id" type="button" class="week-pill" :class="{selected:!deleteMode&&lab.week?.id===w.id, 'week-delete-target':deleteMode, 'week-selected-for-trash':deleteMode&&selectedWeeks.includes(w.id)}" :aria-pressed="deleteMode?selectedWeeks.includes(w.id):lab.week?.id===w.id&&opened" :title="w.name" @click="selectWeek(w.id)">{{i+1}}</button></div>
  <button class="secondary coach-week-delete-select" :class="{'week-delete-target':deleteMode}" :disabled="!lab.weeks.length" @click="toggleDeleteMode">{{deleteMode?'Annulla selezione':'Seleziona settimane da eliminare'}}</button>
  <button v-if="deleteMode" type="button" class="danger coach-week-multi-delete" :disabled="!selectedWeeks.length" @click="deleteSelectedWeeks">Sposta nel Cestino ({{selectedWeeks.length}})</button>
 </div>
 <div class="row between coach-week-instructions"><p class="muted small">Tocca un numero per aprire la settimana completa. Salva le modifiche prima di cambiare settimana.</p><button class="secondary coach-week-close" :disabled="!lab.week" @click="opened=!opened">{{opened?'Chiudi settimana ↑':'Apri settimana ↓'}}</button></div>
 <p v-if="notice" class="notice coach-program-notice">{{notice}}</p>
 <div v-if="opened&&lab.week" class="line-card coach-week-body">
  <div class="row between coach-week-heading"><b class="green">{{lab.week.name.toUpperCase()}} {{lab.week.startDate?'('+lab.week.startDate+')':''}}</b><div class="row coach-week-actions"><button class="primary" @click="notice='Modifiche salvate nel laboratorio locale.'">SALVA</button><button class="secondary" @click="doDuplicate">DUPLICA</button><button class="danger" @click="doDeleteWeek">ELIMINA</button></div></div>
  <div class="program-days"><div v-for="(d,i) in days" :key="d.name" class="program-day"><h3>{{d.name}}</h3>
   <div class="program-slot"><label>ATTIVITÀ 1</label><input :value="d.activity1" placeholder="Scrivi l'attività..." @change="saveActivity($event,i,1)"/></div>
   <div class="program-slot"><label>ATTIVITÀ 2</label><input :value="d.activity2" placeholder="Scrivi l'attività..." @change="saveActivity($event,i,2)"/></div>
   <div class="divider"/>
   <div v-for="j in 2" :key="'s'+j" class="program-sheet"><div class="row between"><div><span class="small green">SCHEDA {{j}}</span><br/><strong>{{sheet(i,j===1?1:2)?.title??(j===1?'Nessuna scheda':'Nessuna seconda scheda')}}</strong></div></div><button type="button" class="primary coach-v1-slot-link" :aria-label="'Collega scheda '+j+' a '+d.name" @click="link(i,j===1?1:2)">Collega</button><div class="grid2 coach-v1-slot-actions"><button class="primary" @click="jumpToCreate(i,j===1?1:2)">Crea nuova</button><button class="danger" :disabled="!sheet(i,j===1?1:2)" @click="unlink(i,j===1?1:2)">Scollega</button></div></div>
  </div></div>
 </div>
 <div v-else class="notice">{{lab.weeks.length?'Settimana chiusa. Tocca un numero per riaprirla.':'Nessun programma per questo atleta. Premi “Nuovo programma” per crearlo.'}}</div>
</section>
<div v-if="picker" class="modal-overlay" @click.self="picker=null"><div class="dialog"><h2>Collega dall’Archivio Coach</h2><p class="muted">{{days[picker.day]?.name}} · Scheda {{picker.slot}} · {{selectedAthlete?.name}}</p><label for="coach-archive-picker">Scegli fra tutti i modelli creati dal Coach</label><select id="coach-archive-picker" v-model="picked"><option value="" disabled>Seleziona una scheda dell’archivio…</option><optgroup label="Archivio Coach · assegna e collega"><option v-for="s in archiveChoices" :key="s.id" :value="'shared:'+s.id">{{s.title}}</option></optgroup></select><p v-if="!archiveChoices.length" class="muted">Archivio Coach vuoto: crea prima una scheda nell’archivio.</p><div class="row"><button class="primary" :disabled="!picked" @click="commit">Assegna e collega</button><button class="secondary" @click="picker=null">Annulla</button></div></div></div>
</template>

</template>
