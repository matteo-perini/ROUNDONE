<script setup lang="ts">
/** The EXACT original Coach archive screen remains available in DEMO mode.
 * This component is mounted ONLY at /coach/archivio?source=emulator in Vite DEV,
 * behind verified Firebase Auth and the local emulator client; it never runs on production.
 */
import {computed,onMounted,onUnmounted,ref,shallowRef,watch} from 'vue'
import {useRoute,useRouter,RouterLink} from 'vue-router'
import {onAuthStateChanged} from 'firebase/auth'
import {collection,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore'
import {readVerifiedDevSession,type VerifiedDevSession} from '../integrations/firebase/devSession'
import {getLocalEmulatorClients} from '../integrations/firebase/emulatorClient'
import {labCoachRoster,maySelectLabAthlete,type RosterAthlete} from '../features/athletes/coachRoster'
import {verifyCoachEditor,editableModel} from '../features/coach/coachOperationalPolicy'
import {createCoachModel,createCoachPersonal,duplicateCoachModel,updateCoachModel} from '../integrations/firestore/coachOperations'
import {assignShared,restoreFromTrash,trashShared,watchAthleteSheets} from '../integrations/firestore/sheets'
import {editorToV1,v1ToEditor} from '../features/sheets/v1ExerciseCodec'
import {supersetView} from '../features/sheets/supersetView'
import {loadCatalog,rankedExercises,searchKey,type CatalogExercise} from '../features/exercises/catalog'
import type {Exercise,Sheet} from '../model'
import {newId} from '../model'
import type {Personal} from '../features/sheets/domain'
import SheetDetail from '../components/SheetDetail.vue'

type Model = Sheet & {createdBy:string;revision:number}
const route=useRoute(),router=useRouter()
const session=shallowRef<VerifiedDevSession|null>(null)
const models=ref<Model[]>([]),roster=ref<RosterAthlete[]>([]),athleteId=ref(''),athleteSearch=ref('')
const searchedRoster=computed(()=>roster.value.filter(a=>a.name.toLocaleLowerCase('it').includes(athleteSearch.value.trim().toLocaleLowerCase('it'))))
const personal=ref<Personal[]>([]),error=ref(''),notice=ref(''),loading=ref(true),busy=ref(false),consent=ref(false)
const editing=ref(false),editingId=ref(''),revision=ref(0),isPersonal=ref(false)
const title=ref(''),category=ref('Allenamento'),exercises=ref<Exercise[]>([])
const search=ref(''),sort=ref('recent'),filter=ref<'active'|'trash'|'all'>('active'),preview=shallowRef<Model|null>(null)
const draftName=ref(''),draftSets=ref('4'),draftReps=ref('10'),draftLoad=ref(''),draftRest=ref('90 sec'),draftMode=ref<'normale'|'superset'>('normale')
const catalog=ref<CatalogExercise[]>([])
const supersetBadges=computed(()=>supersetView(exercises.value))
const supersetCount=computed(()=>supersetBadges.value.filter(x=>x?.position==='second').length)
const suggest=computed(()=>draftName.value.trim()?rankedExercises(catalog.value,draftName.value,'',14):catalog.value.slice(0,12))
const currentAthlete=computed(()=>roster.value.find(a=>a.id===athleteId.value)??null)
const writable=computed(()=>session.value?.gymId==='gym_lab2c_a' && !!currentAthlete.value?.email.toLowerCase().endsWith('@lionfit.invalid'))
const activeCount=computed(()=>models.value.filter(s=>!s.deletedAt).length)
const choice=computed(()=>models.value.filter(s=>(filter.value==='all'||(filter.value==='trash'?!!s.deletedAt:!s.deletedAt)) &&
 `${s.title} ${s.category} ${s.exercises.map(e=>e.name).join(' ')}`.toLowerCase().includes(search.value.toLowerCase()))
 .slice().sort((a,b)=>sort.value==='az'?a.title.localeCompare(b.title,'it'):sort.value==='za'?b.title.localeCompare(a.title,'it'):sort.value==='more'?b.exercises.length-a.exercises.length:0))
const lastOwnEditable=computed(()=>editingId.value && models.value.find(x=>x.id===editingId.value))
let live=true,stopModels:Unsubscribe|null=null,stopUsers:Unsubscribe|null=null,stopPersonal:Unsubscribe|null=null,stopAuth:Unsubscribe|null=null
const closeListeners=()=>{stopModels?.();stopModels=null;stopUsers?.();stopUsers=null;stopPersonal?.();stopPersonal=null;stopAuth?.();stopAuth=null}
function resetConsent(){consent.value=false}
watch(athleteId,()=>{resetConsent();stopPersonal?.();stopPersonal=null;personal.value=[]
 if(!session.value||!maySelectLabAthlete(roster.value,session.value.gymId,athleteId.value))return
 const {db}=getLocalEmulatorClients(),s=session.value,id=athleteId.value
 stopPersonal=watchAthleteSheets(db,s.gymId,id,sheets=>{if(live && athleteId.value===id)personal.value=sheets.personal},e=>{if(live)error.value=`Schede personali non leggibili: ${e.message}`})
})
function beginPersonal(){isPersonal.value=true;editing.value=true;editingId.value='';revision.value=0;title.value='';category.value='Personalizzata';exercises.value=[];notice.value='';resetConsent()}
function beginModel(){isPersonal.value=false;editing.value=true;editingId.value='';revision.value=0;title.value='';category.value='Allenamento';exercises.value=[];notice.value='';resetConsent()}
function edit(s:Model){
 if(!session.value||!editableModel(s.id,s.createdBy,session.value.uid)||s.deletedAt){notice.value='Modifica protetta: solo i nuovi modelli di questo Coach creati nella 2M/J.';return}
 isPersonal.value=false;editing.value=true;editingId.value=s.id;revision.value=s.revision;title.value=s.title;category.value=s.category
 exercises.value=v1ToEditor(s.exercises).map(e=>({...e,rest:e.rest||e.notes||'',executionMode:e.supersetWithPrevious?'superset':'normale'}))
 notice.value='';resetConsent()
}
function add():boolean{
 const name=draftName.value.trim();if(!name){notice.value='Inserisci il nome dell’esercizio.';return false}
 if(draftMode.value==='superset'&&(!exercises.value.length||exercises.value.at(-1)?.supersetWithPrevious)){notice.value='Il secondo esercizio del superset deve seguire un esercizio normale.';return false}
 const c=catalog.value.find(x=>searchKey(x.name)===searchKey(name)||searchKey(x.name_it)===searchKey(name))
 exercises.value.push({id:newId(),name:c?.name_it||name,sets:draftSets.value,reps:draftReps.value,rest:draftRest.value,notes:draftRest.value,
  load:draftLoad.value,exerciseId:c?.id||'',catalogId:c?.id||'',supersetWithPrevious:draftMode.value==='superset',
  supersetRest:draftMode.value==='superset'?draftRest.value:'',executionMode:draftMode.value})
 draftName.value='';draftMode.value='normale';notice.value='';return true
}
async function runWrite(label:string,fn:(ctx:{gym:string;uid:string;athlete:string})=>Promise<void>){
 if(busy.value)return
 busy.value=true;notice.value=''
 const selected=currentAthlete.value,s=session.value
 try{
  verifyCoachEditor(s,selected,consent.value)
  const ctx={gym:s.gymId,uid:s.uid,athlete:selected!.id}
  await fn(ctx)
  if(live)notice.value=`${label}: salvato su Firebase Emulator. ID e copie storiche preservati.`
 }catch(e){if(live)notice.value=`${label}: ${e instanceof Error?e.message:String(e)}`}
 finally{consent.value=false;busy.value=false}
}
async function save(){
 if(!editing.value)return
 // Do not silently discard a pending second exercise when saving a superset.
 if(draftName.value.trim()){if(!add())return}
 else if(draftMode.value==='superset'){notice.value='Nuovo esercizio in superset senza nome: inserisci il nome e aggiungilo prima di salvare.';return}
 let rows
 try{rows=editorToV1(exercises.value)}catch(e){notice.value=e instanceof Error?e.message:String(e);return}
 const wasPersonal=isPersonal.value,wasId=editingId.value,rev=revision.value,name=title.value,cat=category.value
 await runWrite(wasPersonal?'Crea scheda personale':wasId?'Modifica modello':'Crea modello',async({gym,uid,athlete})=>{
  const{db}=getLocalEmulatorClients()
  if(wasPersonal) await createCoachPersonal(db,gym,athlete,uid,name,cat,rows)
  else if(wasId)await updateCoachModel(db,gym,uid,wasId,rev,name,cat,rows)
  else await createCoachModel(db,gym,uid,name,cat,rows)
  editing.value=false;editingId.value='';exercises.value=[];title.value=''
 })
}
async function assign(s:Model){
 if(s.deletedAt){notice.value='Modello nel cestino: prima ripristina.';return}
 if(personal.value.some(p=>p.id===s.id)) {notice.value='Scheda già presente o nel cestino personale: non creare duplicati.';return}
 await runWrite('Assegna modello',async({gym,uid,athlete})=>{
  const{db}=getLocalEmulatorClients();const status=await assignShared(db,gym,athlete,s.id,uid)
  if(status==='existing')notice.value='Scheda già assegnata con lo stesso ID.'
 })
}
async function duplicate(s:Model){
 if(s.deletedAt){notice.value='Non si duplica un modello cestinato.';return}
 await runWrite('Duplica modello',async({gym,uid})=>{const{db}=getLocalEmulatorClients();await duplicateCoachModel(db,gym,uid,s.id)})
}
async function trash(s:Model){
 if(!session.value || !editableModel(s.id,s.createdBy,session.value.uid)){notice.value='Cestino protetto: solo modelli di prova 2M/J creati da questo Coach.';return}
 if(!window.confirm(`Spostare nel cestino il modello «${s.title}»? Le schede assegnate e gli archivi degli atleti restano intatti.`))return
 await runWrite('Cestina modello',async({gym,uid})=>{const{db}=getLocalEmulatorClients();await trashShared(db,gym,s.id,uid)})
}
async function restore(s:Model){
 if(!session.value||!editableModel(s.id,s.createdBy,session.value.uid)){notice.value='Ripristino protetto: solo modelli 2M/J del Coach.';return}
 await runWrite('Ripristina modello',async({gym,uid})=>{const{db}=getLocalEmulatorClients();await restoreFromTrash(db,gym,'shared',s.id,uid)})
}
onMounted(async()=>{
 try{
  const verified=await readVerifiedDevSession();if(!live)return
  if(!['titolare','collaboratore'].includes(verified.role)||!/^gym_lab2c_[ab]$/.test(verified.gymId))throw new Error('Accesso riservato al Coach fittizio.')
  session.value=verified
  const {db,auth}=getLocalEmulatorClients()
  stopModels=onSnapshot(collection(db,'gyms',verified.gymId,'templates'),snap=>{
   if(!live)return
   models.value=snap.docs.map(d=>{const x=d.data();return {id:d.id,title:String(x.title||''),category:String(x.category||'Allenamento'),exercises:Array.isArray(x.exercises)?x.exercises:[],createdBy:String(x.createdBy||''),revision:Number(x.revision||0),...(x.deletedAt?{deletedAt:String(x.deletedAt)}:{})} as Model})
  },e=>{if(live)error.value=`Archivio Coach non leggibile: ${e.message}`})
  stopUsers=onSnapshot(query(collection(db,'users'),where('gymId','==',verified.gymId)),snap=>{
   if(!live)return
   roster.value=labCoachRoster(snap.docs.map(d=>({id:d.id,data:d.data()})),verified.gymId)
   if(!maySelectLabAthlete(roster.value,verified.gymId,athleteId.value)){
    const requested=typeof route.query.athleteId==='string'?route.query.athleteId:''
    athleteId.value=roster.value.find(a=>a.id===requested)?.id||roster.value.find(a=>a.email.toLowerCase()==='athlete2h@lionfit.invalid')?.id||roster.value[0]?.id||''
   }
   loading.value=false
  },e=>{if(live){loading.value=false;error.value=`Elenco atleti non leggibile: ${e.message}`}})
  stopAuth=onAuthStateChanged(auth,u=>{if(!live)return;if(!u||u.uid!==verified.uid){closeListeners();void router.replace('/dev/accesso')}})
  void loadCatalog().then(data=>{if(live)catalog.value=data}).catch(()=>{})
  if(route.query.mode==='personal')beginPersonal()
 }catch(e){if(live){error.value=e instanceof Error?e.message:String(e);loading.value=false}}
})
onUnmounted(()=>{live=false;closeListeners()})
</script>
<template>
<div class="stack" style="gap:20px">
 <div class="notice" role="status"><strong>COACH OPERATIVO · FIREBASE EMULATOR · 2M/J</strong> — Grafica originale; nessuna scrittura nella produzione. Ogni operazione richiede il consenso. <RouterLink to="/coach/atleti?source=emulator">← Gestione atleti</RouterLink></div>
 <section class="panel"><div class="row between"><div><h2 class="card-heading">ARCHIVIO SCHEDE</h2><p class="muted" style="margin:7px 0 0">CREA SCHEDE RIUTILIZZABILI E ASSEGNALE AI TUOI ATLETI</p></div><button v-if="!editing" class="primary" :disabled="!writable||busy" @click="beginModel">＋ Crea nuova scheda dell'archivio</button></div></section>
 <p v-if="error" class="notice" role="alert">{{error}}</p>
 <p v-if="loading" class="muted">Verifica del Coach e lettura degli archivi…</p>
 <section v-if="!loading && session" class="panel">
  <div class="row between"><strong>ATLETA DESTINATARIO · FIREBASE</strong><label class="lfp-search-standalone"><input class="lfp-inline-lookup" v-model="athleteSearch" type="search" placeholder="Cerca nome atleta…" aria-label="Cerca atleta per nome"/></label><select v-model="athleteId" :disabled="busy" style="max-width:330px"><option v-for="a in searchedRoster" :key="a.id" :value="a.id">{{a.name}} · {{a.email}}</option></select></div>
  <label v-if="writable" class="checkline" style="margin-top:12px"><input v-model="consent" type="checkbox" :disabled="busy"/> Autorizzo la prossima operazione SOLO sul Firebase Emulator fittizio</label>
  <p v-else class="notice">Scrittura disabilitata: seleziona un atleta fittizio della palestra A.</p>
  <p v-if="notice" class="notice" role="status">{{notice}}</p>
 </section>
 <section v-if="editing && !loading && session" class="panel">
  <div class="row between"><h2>{{isPersonal?'CREA SCHEDA PERSONALE':editingId?'MODIFICA SCHEDA DELL’ARCHIVIO':'CREA NUOVA SCHEDA DELL’ARCHIVIO'}}</h2><button class="secondary" @click="editing=false;resetConsent()">← Torna all'archivio</button></div><div class="divider"/>
  <label>NOME SCHEDA</label><input v-model="title" maxlength="200" placeholder="Es. Potenza Esplosiva 1, Ipertrofia A"/>
  <label>CATEGORIA</label><input v-model="category" maxlength="100" placeholder="Allenamento"/>
  <div class="row between" style="margin:20px 0"><strong>ESERCIZI</strong><button class="ghost" @click="add">+ AGGIUNGI ESERCIZIO</button></div>
  <p class="muted small" role="note"><strong>Privacy delle note:</strong> nelle schede condivise scrivi soltanto indicazioni tecniche sull’esercizio. Non inserire diagnosi, infortuni o altri dati sanitari: occorre un trattamento riservato e autorizzato, non il modello condiviso.</p>
  <p class="muted small">Superset: aggiungi due esercizi consecutivi, marcando il secondo «In superset con il precedente». Nel dettaglio compariranno entrambi.</p>
  <p class="notice" role="status"><strong>ANTEPRIMA COMPOSIZIONE:</strong> {{exercises.length}} esercizi · {{supersetCount}} superset. Una coppia deve contenere due esercizi distinti.</p>
  <div v-for="(e,i) in exercises" :key="e.id" class="line-card" style="margin:12px 0">
   <div class="row between"><b>ESERCIZIO {{String(i+1).padStart(2,'0')}} <span v-if="supersetBadges[i]" class="pill">SUPERSET {{supersetBadges[i]?.pair}} · {{supersetBadges[i]?.position==='first'?'1 di 2':'2 di 2'}}</span></b><button class="bare" @click="exercises.splice(i,1)">✕</button></div>
   <label>Nome esercizio</label><input v-model="e.name"/>
   <div class="grid2"><div><label>Serie</label><input v-model="e.sets"/></div><div><label>Ripetizioni</label><input v-model="e.reps"/></div><div><label>Carico / intensità</label><input v-model="e.load"/></div><div><label>Recupero / note</label><input v-model="e.rest"/></div></div>
   <label>Modalità di esecuzione</label><select v-model="e.supersetWithPrevious"><option :value="false">Esercizio normale</option><option :value="true">In superset con il precedente</option></select>
   <div v-if="e.supersetWithPrevious"><label>Recupero dopo il superset</label><input v-model="e.supersetRest" placeholder="90 sec"/></div>
  </div>
  <div class="panel"><h3>NUOVO ESERCIZIO</h3><label>Nome esercizio</label><input v-model="draftName" list="lab-2mj-exercise-suggestions" placeholder="Cerca in italiano o inglese"/>
   <datalist id="lab-2mj-exercise-suggestions"><option v-for="s in suggest" :key="s.id" :value="s.name_it||s.name">{{s.name}}</option></datalist>
   <div class="grid2"><div><label>Serie</label><input v-model="draftSets"/></div><div><label>Ripetizioni</label><input v-model="draftReps"/></div><div><label>Carico / intensità</label><input v-model="draftLoad"/></div><div><label>Recupero / note</label><input v-model="draftRest"/></div></div>
   <label>Modalità di esecuzione</label><select v-model="draftMode"><option value="normale">Esercizio normale</option><option value="superset">In superset con il precedente</option></select><button class="secondary" style="margin-top:12px" @click="add">+ AGGIUNGI ESERCIZIO</button>
  </div>
  <p v-if="draftName.trim()" class="notice" role="status">L'esercizio «{{draftName}}» è ancora nel modulo NUOVO ESERCIZIO: verrà aggiunto automaticamente quando premi SALVA, conservando la modalità selezionata.</p>
  <p v-if="notice" class="notice" role="alert">{{notice}}</p>
  <p class="muted small" v-if="isPersonal">La scheda personale viene creata con una copia storica protetta immutabile. Nessun modello condiviso viene creato implicitamente.</p>
  <button class="primary wide" :disabled="!consent||busy||!writable||!title.trim()||!exercises.length" @click="save">{{isPersonal?'SALVA SCHEDA PERSONALE':editingId?'SALVA MODIFICHE':'SALVA NELL’ARCHIVIO SCHEDE'}}</button>
 </section>
 <section v-else-if="!loading && session" class="panel">
  <div class="row between"><div><h2 class="card-heading">ARCHIVIO · SCHEDE</h2><span class="muted small">{{choice.length}} di {{activeCount}} schede attive nell'archivio</span></div><button class="secondary" :disabled="!writable||busy" @click="beginPersonal">+ Crea scheda personale</button></div>
  <div class="grid2" style="margin-top:16px"><input v-model="search" type="search" placeholder="Cerca una scheda..."/><select v-model="sort"><option value="recent">Più recenti</option><option value="az">A–Z</option><option value="za">Z–A</option><option value="more">Più esercizi</option></select></div>
  <div class="row" style="justify-content:flex-end;margin:13px 0"><select v-model="filter" style="width:auto"><option value="active">Modelli attivi</option><option value="trash">Nel cestino</option><option value="all">Tutti</option></select></div>
  <div class="grid2"><div v-for="s in choice" :key="s.id" class="archive-card">
   <h3 style="margin:0">{{s.title}}</h3><p class="muted small">{{s.category}} · {{s.exercises.length}} esercizi · {{s.deletedAt?'Nel cestino':'Attivo'}}</p><p class="small">{{s.exercises.slice(0,2).map(x=>x.name).join(' · ')}}</p><div class="divider"/>
   <p v-if="personal.some(p=>p.id===s.id)" class="muted small">{{personal.find(p=>p.id===s.id)?.deletedAt?'Scheda personale nel cestino':'Già assegnato a questo atleta'}}</p>
   <div class="archive-actions"><button class="secondary" @click="preview=s">Visualizza</button>
    <button v-if="!s.deletedAt" class="secondary" :disabled="!session||!editableModel(s.id,s.createdBy,session.uid)" @click="edit(s)">Modifica</button>
    <button v-if="!s.deletedAt" class="secondary" :disabled="busy||!consent||!writable" @click="duplicate(s)">Duplica</button>
    <button v-if="!s.deletedAt" class="primary" :disabled="busy||!consent||!writable||personal.some(p=>p.id===s.id)" @click="assign(s)">Assegna</button>
    <button v-if="!s.deletedAt" class="danger" :disabled="busy||!consent||!writable||!session||!editableModel(s.id,s.createdBy,session.uid)" @click="trash(s)">Nel Cestino</button>
    <button v-if="s.deletedAt" class="secondary" :disabled="busy||!consent||!writable||!session||!editableModel(s.id,s.createdBy,session.uid)" @click="restore(s)">Ripristina</button>
   </div>
  </div></div>
  <p v-if="!choice.length" class="muted">Nessuna scheda corrisponde ai filtri.</p>
  <p class="notice">Modelli creati prima della fase 2M/J: consultabili e assegnabili, ma modifica/cestino bloccati in questo laboratorio. I modelli 2M/J creati da questo Coach sono modificabili e recuperabili. Gli archivi degli atleti non vengono mai cancellati.</p>
 </section>
 <SheetDetail v-if="preview" :sheet="preview" @close="preview=null"/>
</div>
</template>
