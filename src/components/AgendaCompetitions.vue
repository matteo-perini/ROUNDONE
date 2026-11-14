<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import CompetitionCover from './CompetitionCover.vue'
import {competitionCoversEnabled,replaceCompetitionCover} from '../integrations/firestore/competitionCovers'
import {doc,getDocFromServer,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import type {StagingSession} from '../integrations/firebase/stagingSession'
import {romeParts} from '../features/bookings/bookingPolicy'
import {competitionCategories,competitionCategoryLabels,entryLabel,type CompetitionDraft,type CompetitionEvent,type CompetitionEntry,type CompetitionCategory} from '../features/bookings/competitionModel'
import {saveCompetition,cancelCompetition,requestCompetition,changeCompetitionEntry,saveCompetitionResult,watchCompetitionEntries} from '../integrations/firestore/competitions'
const props=defineProps<{session:StagingSession;events:CompetitionEvent[];entries:CompetitionEntry[];mode:'events'|'results';now:number;loading:boolean;initialEventId?:string}>()
const emit=defineEmits<{back:[]}>()
const isCoach=computed(()=>props.session.role!=='atleta')
const category=ref<'all'|CompetitionCategory>('all'),showPast=ref(false),selected=ref(''),expanded=ref(false),formOpen=ref(false),editing=ref<CompetitionEvent|undefined>(),busy=ref(false),feedback=ref('')
const fresh=():CompetitionDraft=>({title:'',category:'combattimento',discipline:'',location:'',notes:'',date:'',time:'09:00'})
const form=ref<CompetitionDraft>(fresh()),participants=ref<CompetitionEntry[]>([]),participantNames=ref<Record<string,string>>({}),resultDraft=ref<Record<string,string>>({}),participantsLoading=ref(false)
const chosen=computed(()=>props.events.find(e=>e.id===selected.value))
const shown=computed(()=>props.events.filter(e=>(category.value==='all'||e.category===category.value)&&(showPast.value?e.startMs<props.now||e.status==='cancelled':e.startMs>=props.now&&e.status==='published')).sort((a,b)=>showPast.value?b.startMs-a.startMs:a.startMs-b.startMs))
const results=computed(()=>props.entries.filter(r=>r.status==='approved'&&props.events.some(e=>e.id===r.eventId&&e.status==='published'&&e.startMs<=props.now)))
const myEntry=(eventId:string)=>props.entries.find(e=>e.eventId===eventId)
const eventName=(eventId:string)=>props.events.find(e=>e.id===eventId)?.title||'Evento storico'
const formatDate=(ms:number)=>new Date(ms).toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Rome'})
let stop:Unsubscribe|undefined, generation=0
watch(selected,(id)=>{stop?.();stop=undefined;participants.value=[];participantNames.value={};resultDraft.value={};const token=++generation;participantsLoading.value=false;if(!isCoach.value||!id)return
 participantsLoading.value=true
 const {db}=getStagingClients();stop=watchCompetitionEntries(db,props.session.gymId,{event:id},rows=>{if(token!==generation)return;participantsLoading.value=false;participants.value=rows;for(const r of rows){if(!(r.id in resultDraft.value))resultDraft.value[r.id]=r.result;if(!participantNames.value[r.athleteId])void getDocFromServer(doc(db,'users',r.athleteId)).then(snap=>{if(token===generation&&snap.exists()&&snap.data().gymId===props.session.gymId)participantNames.value[r.athleteId]=String(snap.data().name||'Atleta')}).catch(()=>{})}},e=>{if(token===generation){participantsLoading.value=false;feedback.value='Richieste non disponibili: '+e.message}})
})
onUnmounted(()=>{generation++;stop?.()})
function selectEvent(e:CompetitionEvent){selected.value=e.id;expanded.value=true;formOpen.value=false;feedback.value=''}
watch(()=>[props.initialEventId,props.events] as const,([id,events])=>{if(id&&!expanded.value){const e=events.find(x=>x.id===id);if(e){showPast.value=e.startMs<props.now||e.status==='cancelled';selectEvent(e)}}},{immediate:true})
function openForm(e?:CompetitionEvent){editing.value=e;form.value=e?{title:e.title,category:e.category,discipline:e.discipline,location:e.location,notes:e.notes,date:romeParts(e.startMs).date,time:romeParts(e.startMs).time}:fresh();formOpen.value=true;feedback.value=''}
async function run(fn:()=>Promise<unknown>,ok:string){if(busy.value)return;if(!mayWriteLive()){feedback.value='Scritture non abilitate in questa build.';return}busy.value=true;feedback.value='';try{await fn();feedback.value=ok}catch(e){feedback.value='Operazione non riuscita: '+(e instanceof Error?e.message:String(e))}finally{busy.value=false}}
function publish(){void run(async()=>{await saveCompetition(getStagingClients().db,props.session,form.value,editing.value);formOpen.value=false;selected.value='';expanded.value=false},'Evento salvato.')}
function cancel(e:CompetitionEvent){if(window.confirm('Annullare l’evento? Le richieste e i risultati rimarranno nello storico.'))void run(()=>cancelCompetition(getStagingClients().db,props.session,e.id),'Evento annullato.')}
function join(e:CompetitionEvent){void run(()=>requestCompetition(getStagingClients().db,props.session,e.id),'Richiesta inviata al Coach.')}
function change(r:CompetitionEntry,status:'approved'|'rejected'|'withdrawn'){void run(()=>changeCompetitionEntry(getStagingClients().db,props.session,r,status),'Partecipazione aggiornata.')}
function chooseCover(e:CompetitionEvent,evt:Event){const target=evt.target as HTMLInputElement;const file=target.files?.[0];target.value='';if(file)void run(()=>replaceCompetitionCover(getStagingClients().db,props.session,e,file),'Locandina aggiornata.')}
function removeCover(e:CompetitionEvent){if(window.confirm('Rimuovere la locandina personalizzata?'))void run(()=>replaceCompetitionCover(getStagingClients().db,props.session,e),'Locandina rimossa.')}
function saveResult(r:CompetitionEntry){void run(()=>saveCompetitionResult(getStagingClients().db,props.session,r,resultDraft.value[r.id]||''),'Risultato salvato.')}
</script>
<template>
 <section class="lf-comp-workspace">
  <button type="button" class="ghost" @click="emit('back')">‹ Agenda</button>
  <div class="row between"><h2>{{mode==='results'?'I miei risultati':'Competizioni e gare'}}</h2><button v-if="isCoach&&mode==='events'" class="primary" :disabled="busy" @click="openForm()">+ Evento</button></div>
  <p v-if="feedback" class="notice" role="status">{{feedback}}</p>
  <p v-if="loading" class="muted" role="status">Caricamento competizioni…</p>
  <template v-else-if="mode==='results'">
   <p v-if="!results.length" class="panel muted">Nessun risultato disponibile.</p>
   <article v-for="r in results" :key="r.id" class="panel"><h3>{{eventName(r.eventId)}}</h3><p>{{r.result||'Risultato non ancora registrato dal Coach.'}}</p></article>
  </template>
  <template v-else-if="formOpen&&isCoach">
   <form class="panel lf-comp-form" @submit.prevent="publish"><h3>{{editing?'Modifica evento':'Nuova competizione'}}</h3><label>Titolo<input v-model="form.title" required maxlength="100"/></label><label>Categoria<select v-model="form.category"><option v-for="c in competitionCategories" :key="c" :value="c">{{competitionCategoryLabels[c]}}</option></select></label><label>Disciplina<input v-model="form.discipline" required maxlength="60" placeholder="Es. Boxe"/></label><label>Luogo<input v-model="form.location" required maxlength="160"/></label><div class="grid2"><label>Data<input v-model="form.date" type="date" required/></label><label>Ora (Italia)<input v-model="form.time" type="time" required/></label></div><label>Informazioni<textarea v-model="form.notes" maxlength="1500" rows="4"/></label><button class="primary wide" :disabled="busy" type="submit">Salva evento</button><button class="secondary wide" type="button" :disabled="busy" @click="formOpen=false">Annulla</button></form>
  </template>
  <template v-else-if="expanded&&chosen">
   <button class="secondary" @click="selected='';expanded=false">‹ Torna agli eventi</button>
   <article class="panel lf-comp-detail"><div class="lf-comp-cover"><CompetitionCover :gym="session.gymId" :event-id="chosen.id" :cover-id="chosen.coverId"/></div><span class="eyebrow">{{competitionCategoryLabels[chosen.category]}}</span><h3>{{chosen.title}}</h3><p>{{formatDate(chosen.startMs)}} · {{chosen.location}}</p><p class="muted">{{chosen.discipline}} · {{chosen.status==='cancelled'?'Annullato':'Pubblicato'}}</p><p class="lf-comp-notes">{{chosen.notes}}</p>
    <div v-if="isCoach&&chosen.status==='published'&&chosen.startMs>now" class="row"><button class="secondary" :disabled="busy" @click="openForm(chosen)">Modifica</button><button class="danger" :disabled="busy" @click="cancel(chosen)">Annulla evento</button></div><div v-if="isCoach&&chosen.status==='published'&&chosen.startMs>now&&competitionCoversEnabled()"><label>Carica locandina<input type="file" accept="image/*,.heic,.heif" :disabled="busy" @change="chooseCover(chosen,$event)"/></label><button v-if="chosen.coverId" class="secondary" :disabled="busy" @click="removeCover(chosen)">Rimuovi locandina</button></div>
    <template v-if="!isCoach"><strong v-if="myEntry(chosen.id)">{{entryLabel(myEntry(chosen.id)!.status)}}</strong><template v-if="chosen.status==='published'&&chosen.startMs>now"><button v-if="!myEntry(chosen.id)||myEntry(chosen.id)?.status==='withdrawn'" class="primary wide" :disabled="busy" @click="join(chosen)">Voglio partecipare</button><button v-else-if="['pending','approved'].includes(myEntry(chosen.id)!.status)" class="secondary" :disabled="busy" @click="change(myEntry(chosen.id)!,'withdrawn')">Ritira partecipazione</button></template></template>
   </article>
   <section v-if="isCoach" class="panel"><h3>Partecipazioni</h3><p v-if="participantsLoading" class="muted">Caricamento richieste…</p><p v-else-if="!participants.length" class="muted">Nessuna richiesta.</p><div v-for="r in participants" :key="r.id" class="lf-comp-entry"><strong>{{participantNames[r.athleteId]||'Atleta'}}</strong><small class="muted">{{entryLabel(r.status)}}</small><div v-if="chosen.status==='published'&&chosen.startMs>now&&r.status==='pending'" class="row"><button class="primary" :disabled="busy" @click="change(r,'approved')">Approva</button><button class="secondary" :disabled="busy" @click="change(r,'rejected')">Non approvare</button></div><div v-if="chosen.status==='published'&&chosen.startMs<=now&&r.status==='approved'"><label>Risultato<textarea v-model="resultDraft[r.id]" rows="2" maxlength="1000"/></label><button class="secondary" :disabled="busy" @click="saveResult(r)">Salva risultato</button></div></div></section>
  </template>
  <template v-else><div class="grid2"><label>Disciplina<select v-model="category"><option value="all">Tutte</option><option v-for="c in competitionCategories" :key="c" :value="c">{{competitionCategoryLabels[c]}}</option></select></label><label>Periodo<select v-model="showPast"><option :value="false">Prossime</option><option :value="true">Storico / annullate</option></select></label></div><p v-if="!shown.length" class="panel muted">Nessun evento in questa sezione.</p><button v-for="e in shown" :key="e.id" class="lf-comp-event" @click="selectEvent(e)"><span class="eyebrow">{{competitionCategoryLabels[e.category]}}</span><strong>{{e.title}}</strong><small>{{formatDate(e.startMs)}} · {{e.location}}</small><small>{{e.discipline}}<template v-if="myEntry(e.id)"> · {{entryLabel(myEntry(e.id)!.status)}}</template><template v-if="e.status==='cancelled'"> · Annullato</template></small></button><p class="small muted">Sono mostrati fino a 200 eventi della palestra.</p></template>
 </section>
</template>
<style scoped>
.lf-comp-workspace,.lf-comp-form,.lf-comp-detail{display:grid;gap:10px;min-width:0}.lf-comp-workspace h2{margin:0;font-size:21px}.lf-comp-workspace h3{margin:0 0 7px}.lf-comp-workspace .ghost{justify-self:start}.lf-comp-event{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:13px;text-align:left;padding:14px;display:grid;gap:7px;overflow-wrap:anywhere}.lf-comp-event strong{font-size:17px}.lf-comp-event small{color:var(--muted)}.lf-comp-cover{height:180px;overflow:hidden;border-radius:12px}.lf-comp-notes{white-space:pre-wrap;overflow-wrap:anywhere}.lf-comp-entry{display:grid;gap:6px;border-top:1px solid var(--border);padding:11px 0}.lf-comp-workspace select,.lf-comp-workspace input,.lf-comp-workspace textarea{min-width:0;width:100%}.lf-comp-workspace .row{flex-wrap:wrap}.lf-comp-workspace label{font-size:13px}.lf-comp-workspace .grid2>*{min-width:0}
</style>
