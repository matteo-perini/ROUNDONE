<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
import {ref,computed,onMounted,defineAsyncComponent} from 'vue'
import {useRoute,useRouter,RouterLink} from 'vue-router'
import {useLabStore} from '../stores/lab'
import SheetDetail from '../components/SheetDetail.vue'
import LionIcon from '../components/LionIcon.vue'
import type {Sheet,Exercise} from '../model'
import {newId} from '../model'
import {loadCatalog,rankedExercises,searchKey} from '../features/exercises/catalog'
import {editorToV1,v1ToEditor} from '../features/sheets/v1ExerciseCodec'
import type {CatalogExercise} from '../features/exercises/catalog'
const lab=useLabStore();const route=useRoute();const router=useRouter();
const firebaseEditor = computed(() => isOperationalMode() || (import.meta.env.DEV && route.query.source === 'emulator'))
const DevCoachEditor = isOperationalMode() ? defineAsyncComponent(() => import('./LiveCoachTemplates.vue')) : import.meta.env.DEV ? defineAsyncComponent(() => import('./DevCoachTemplates.vue')) : null;const q=ref(''),sort=ref('recent'),preview=ref<Sheet|null>(null),editing=ref(false),personal=ref(false),notice=ref(''),title=ref(''),exercises=ref<Exercise[]>([]),targets=ref<string[]>([]),alsoArchive=ref(false)
const assigning=ref<Sheet|null>(null),assignTarget=ref(''),assignSearch=ref('')
const searchedAthletes=computed(()=>lab.data.athletes.filter(a=>a.name.toLocaleLowerCase('it').includes(assignSearch.value.trim().toLocaleLowerCase('it'))))
const choices=computed(()=>lab.data.templates.filter(s=>!s.deletedAt&&s.title.toLowerCase().includes(q.value.toLowerCase())).slice().sort((a,b)=>sort.value==='az'?a.title.localeCompare(b.title):sort.value==='za'?b.title.localeCompare(a.title):sort.value==='more'?b.exercises.length-a.exercises.length:0))
const editingId=ref<string|null>(null)
const draftName=ref(''),draftSets=ref(4),draftReps=ref('10'),draftLoad=ref(''),draftRest=ref('90 sec'),draftMode=ref('normale')
const defaultNames=['Distensioni su panca piana con bilanciere a presa larga','Squat con bilanciere','Rematore con manubrio','YTWL','Mobilità anche','Copenhagen plank']
const catalog=ref<CatalogExercise[]>([])
const suggested=computed(()=>draftName.value.trim()?rankedExercises(catalog.value,draftName.value,'',14):catalog.value.slice(0,12))
const suggestedNames=computed(()=>suggested.value.length?suggested.value.map(e=>({id:e.id,label:e.name_it||e.name,english:e.name})):defaultNames.map((label,i)=>({id:'sample-'+i,label,english:label})))
function create(mode:'archive'|'personal'){editingId.value=null;personal.value=mode==='personal';alsoArchive.value=false;editing.value=true;title.value='';exercises.value=[];targets.value=personal.value?[lab.athleteId]:[];notice.value=''}
function edit(s:Sheet){editingId.value=s.id;editing.value=true;personal.value=false;title.value=s.title;exercises.value=(s.exercises.some(e=>!e.id)?v1ToEditor(s.exercises):JSON.parse(JSON.stringify(s.exercises)) as Exercise[]).map(e=>({...e,load:e.load||'',notes:e.notes??e.rest,supersetWithPrevious:e.supersetWithPrevious??e.executionMode==='superset',supersetRest:e.supersetRest??''}));targets.value=[];notice.value=''}
function add(){
 const entry=catalog.value.find(e=>searchKey(e.name)===searchKey(draftName.value)||searchKey(e.name_it)===searchKey(draftName.value));
 if(!draftName.value.trim()){notice.value='Inserisci il nome dell’esercizio.';return}
 const superserie=draftMode.value==='superset'
 if(superserie&&(!exercises.value.length||exercises.value.at(-1)?.supersetWithPrevious||exercises.value.at(-1)?.executionMode==='superset')){notice.value='Superset: il secondo esercizio deve seguire un esercizio normale, senza sovrapposizioni.';return}
 exercises.value.push({id:newId(),catalogId:entry?.id,exerciseId:entry?.id||'',name:entry?.name_it||draftName.value.trim(),sets:Math.max(1,draftSets.value),reps:draftReps.value,rest:draftRest.value,notes:draftRest.value,load:draftLoad.value,supersetWithPrevious:superserie,supersetRest:superserie?draftRest.value:'',executionMode:draftMode.value as 'normale'|'superset'});draftName.value='';notice.value=''
 }
function save(){if(!title.value.trim()||!exercises.value.length)return
 try{editorToV1(exercises.value)}catch(err){notice.value=(err as Error).message;return}
 const name=title.value.trim()
 try {
  if(personal.value){
   const created=targets.value.map(id=>lab.createForAthlete(id,name,'Personalizzata',exercises.value,false));if(alsoArchive.value)lab.createTemplate(name,'Personalizzata',exercises.value)
   const day=route.query.day,slot=route.query.slot,wid=route.query.weekId
   if(typeof day==='string' && typeof slot==='string' && typeof wid==='string'){
    const d=Number(day),sl=Number(slot)
    const owned=created.find(s=>s.athleteId===lab.athleteId)
    if(!owned || !Number.isInteger(d)||d<0||d>6||(sl!==1&&sl!==2))throw new Error('Giorno o atleta non valido: la scheda è stata creata ma non collegata. Apri Programmazione per collegarla.')
    // Crea e collega alla giornata specifica, senza cercare il nome della scheda.
    const w=lab.data.weeks.find(w=>w.id===wid&&w.athleteId===lab.athleteId&&!w.deletedAt)
    if(!w)throw new Error('Settimana cambiata: la scheda è stata creata, ma non collegata.')
    const expected=sl===1?w.days[d]?.templateId:w.days[d]?.templateId2
    lab.linkPersonal(wid,d,sl,owned.id,expected||'')
    notice.value='Scheda creata, protetta e collegata al giorno selezionato.'
    editing.value=false;title.value='';exercises.value=[];void router.push('/coach/programmi');return
   }
   notice.value=alsoArchive.value?'Scheda personale assegnata e modello indipendente nell’Archivio (demo).':'Scheda assegnata con copia storica protetta, senza modello condiviso.'
  }else if(editingId.value){const t=lab.data.templates.find(x=>x.id===editingId.value&&!x.deletedAt);if(t){t.title=name;t.exercises=JSON.parse(JSON.stringify(exercises.value)) as Exercise[]}notice.value='Modello aggiornato nell’archivio locale.'
  }else{const t=lab.createTemplate(name,'Allenamento',exercises.value);if(targets.value.length)lab.assignTemplate(t.id,targets.value);notice.value='Nuovo modello salvato nell’archivio (demo).'}
  editingId.value=null;editing.value=false;title.value='';exercises.value=[]
 }catch(e){notice.value=(e as Error).message}
}
function openAssign(s:Sheet){assigning.value=s;assignSearch.value='';assignTarget.value=lab.data.athletes.some(a=>a.id===lab.athleteId)?lab.athleteId:''}
function assign(id:string){
 try{
  if(!assignTarget.value||!lab.data.athletes.some(a=>a.id===assignTarget.value))throw new Error('Scegli prima un atleta valido.')
  lab.assignTemplate(id,[assignTarget.value]);notice.value='Scheda assegnata; copia storica protetta.';assigning.value=null
 }catch(e){notice.value=(e as Error).message}
}
function duplicate(s:Sheet){lab.createTemplate(s.title+' (copia)',s.category,s.exercises);notice.value='Modello duplicato nel laboratorio.'}
function remove(s:Sheet){try{lab.toTrash(s.id);notice.value='Modello spostato nel Cestino; copie personali intatte.'}catch(e){notice.value=(e as Error).message}}
onMounted(()=>{if(!firebaseEditor.value && route.query.mode==='personal')create('personal');void loadCatalog().then(items=>catalog.value=items).catch(()=>{})})
</script>
<template><component v-if="firebaseEditor && DevCoachEditor" :is="DevCoachEditor" />
<div v-else class="stack" style="gap:20px"><section class="panel"><div class="row between"><div><h2 class="card-heading">{{uiText("ARCHIVIO SCHEDE")}}</h2><p class="muted" style="margin:7px 0 0">{{uiText("CREA SCHEDE RIUTILIZZABILI E ASSEGNALE AI TUOI ATLETI")}}</p></div><button v-if="!editing" class="primary" @click="create('archive')">{{uiText("＋ Crea nuova scheda dell'archivio")}}</button></div></section>
 <section v-if="editing" class="panel"><div class="row between"><h2>＋ {{personal?'CREA SCHEDA PERSONALE':editingId?'MODIFICA SCHEDA DELL’ARCHIVIO':'CREA NUOVA SCHEDA DELL’ARCHIVIO'}}</h2><button class="secondary" @click="editing=false">{{uiText("← Torna all'archivio")}}</button></div><div class="divider"/><label>NOME SCHEDA {{personal?'(PERSONALE)':'(ARCHIVIO SCHEDE)'}}</label><input v-model="title" placeholder="Es. Potenza Esplosiva 1, Ipertrofia A"/>
 <div class="row between" style="margin:20px 0"><strong>{{uiText("ESERCIZI")}}</strong><button class="ghost" @click="add">+ AGGIUNGI ESERCIZIO</button></div><div class="notice" style="background:#eff8f1;color:#6d8297">Cerca un esercizio in italiano o inglese. Per creare un <b>SUPERSET</b>, aggiungi due esercizi uno dopo l'altro e nel secondo scegli «In superset con il precedente».</div>
 <p class="muted small" role="note"><strong>Privacy delle note:</strong> nelle schede condivise scrivi soltanto indicazioni tecniche sull’esercizio. Non inserire diagnosi, infortuni o altri dati sanitari: occorre un trattamento riservato e autorizzato, non il modello condiviso.</p>
 <div v-for="(e,i) in exercises" :key="e.id" class="line-card" style="margin:12px 0"><div class="row between"><b>{{uiText("ESERCIZIO")}} {{String(i+1).padStart(2,'0')}}</b><button class="bare" @click="exercises.splice(i,1)">✕</button></div><label>Nome esercizio</label><input v-model="e.name" list="exercise-suggestions"/><div class="grid2"><div><label>{{uiText("Serie")}}</label><input v-model="e.sets" inputmode="text"/></div><div><label>{{uiText("Ripetizioni")}}</label><input v-model="e.reps"/></div></div><div class="grid2"><div><label>{{uiText("Carico / intensità")}}</label><input v-model="e.load" placeholder="60 kg o 75%"/></div><div><label>{{uiText("Recupero / note")}}</label><input v-model="e.rest"/></div></div><label>Modalità di esecuzione</label><select v-model="e.supersetWithPrevious"><option :value="false">Esercizio normale</option><option :value="true">In superset con il precedente</option></select><div v-if="e.supersetWithPrevious"><label>Recupero dopo il superset</label><input v-model="e.supersetRest" placeholder="90 sec"/></div></div>
 <div class="panel" style="margin-top:12px"><h3>NUOVO ESERCIZIO</h3><label>Nome esercizio</label><input v-model="draftName" list="example-exercises" autocomplete="off" placeholder="Cerca in italiano o inglese"/><p class="muted small">Suggerimenti per pertinenza IT/EN · catalogo originale di 1.324 esercizi.</p><datalist id="example-exercises"><option v-for="s in suggestedNames" :key="s.id" :value="s.label">{{s.english}}</option></datalist><datalist id="exercise-suggestions"><option v-for="s in suggestedNames" :key="s.id" :value="s.label">{{s.english}}</option></datalist><div class="grid2"><div><label>{{uiText("Serie")}}</label><input v-model.number="draftSets" type="number" min="1"/></div><div><label>{{uiText("Ripetizioni")}}</label><input v-model="draftReps"/></div><div><label>{{uiText("Carico / intensità")}}</label><input v-model="draftLoad" placeholder="60 kg o 75%"/></div><div><label>{{uiText("Recupero / note")}}</label><input v-model="draftRest" placeholder="90 sec · tecnica"/></div></div><label>Modalità di esecuzione</label><select v-model="draftMode"><option value="normale">Esercizio normale</option><option value="superset">In superset con il precedente</option></select><button class="secondary" style="margin-top:12px" @click="add">+ AGGIUNGI ESERCIZIO</button></div>
 <label v-if="personal">Seleziona atleta per la scheda personale</label><div v-if="personal" class="row"><label v-for="a in lab.data.athletes" :key="a.id" class="checkline"><input v-model="targets" type="checkbox" :value="a.id"/>{{a.name}}</label></div><label v-if="personal" class="checkline" style="margin:20px 0"><input v-model="alsoArchive" type="checkbox"/>Salva anche nell'archivio schede</label>
 <button class="primary wide" :disabled="!title.trim()||!exercises.length||(personal&&!targets.length)" @click="save">{{personal?'SALVA SCHEDA PERSONALE':editingId?'SALVA MODIFICHE':'SALVA NELL’ARCHIVIO SCHEDE'}}</button></section>
 <section v-else class="panel"><div class="row between"><div><h2 class="card-heading">{{uiText("ARCHIVIO · SCHEDE")}}</h2><span class="muted small">{{choices.length}} {{uiText("di")}} {{lab.data.templates.filter(s=>!s.deletedAt).length}} schede nell'archivio</span></div><button class="secondary" @click="create('personal')">{{uiText("+ Crea scheda personale")}}</button></div><div class="coach-archive-toolbar"><input v-model="q" type="search" placeholder="Cerca una scheda…" aria-label="Cerca una scheda"/><RouterLink to="/coach/cestino" class="secondary">Apri cestino</RouterLink><select v-model="sort" aria-label="Ordina schede"><option value="recent">{{uiText("Più recenti")}}</option><option value="az">{{uiText("Nome A–Z")}}</option><option value="more">{{uiText("Più esercizi")}}</option></select></div>
 <div class="grid2"><div v-for="s in choices" :key="s.id" class="archive-card"><h3 style="margin:0">{{s.title}}</h3><p class="muted small">{{s.exercises.length}} {{uiText("esercizi")}}</p><p class="small">{{s.exercises.slice(0,2).map(x=>x.name).join(' · ')}}</p><div class="divider"/><div class="archive-actions"><button class="secondary" @click="preview=s">{{uiText("Visualizza")}}</button><button class="secondary" @click="edit(s)">{{uiText("Modifica")}}</button><button class="secondary" @click="duplicate(s)">{{uiText("Duplica")}}</button><button class="primary" @click="openAssign(s)">{{uiText("Assegna")}}</button><button class="danger" @click="remove(s)">{{uiText("Nel Cestino")}}</button></div></div></div>
 </section><p v-if="notice" class="notice notice-success">{{notice}}</p></div>
 <div v-if="assigning" class="modal-overlay" @click.self="assigning=null"><div class="dialog coach-assign-dialog"><div class="row between"><h2>{{uiText("Assegna ·")}} {{assigning.title}}</h2><button class="bare" @click="assigning=null" :aria-label="uiText('Chiudi')">✕</button></div><label class="lfp-search-label"><span>Ricerca atleta</span><span class="lfp-search-box"><LionIcon name="search" :size="18"/><input v-model="assignSearch" type="search" placeholder="Scrivi nome o cognome…" autocomplete="off" aria-label="Cerca atleta per nome"/></span></label><label>{{uiText("Atleta")}}<select v-model="assignTarget"><option value="">{{uiText("Seleziona atleta…")}}</option><option v-for="a in searchedAthletes" :key="a.id" :value="a.id">{{a.name}}</option></select></label><p v-if="!searchedAthletes.length" class="muted small">Nessun atleta corrisponde alla ricerca.</p><button class="primary wide" :disabled="!assignTarget" @click="assign(assigning.id)">{{uiText("Assegna scheda")}}</button></div></div>
 <SheetDetail v-if="preview" :sheet="preview" @close="preview=null" @finish="preview=null"/>
</template>
