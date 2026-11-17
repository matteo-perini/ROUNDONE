<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import CompetitionCover from './CompetitionCover.vue'
import {competitionCoversEnabled,replaceCompetitionCover} from '../integrations/firestore/competitionCovers'
import {doc,getDocFromServer,getDocs,collection,query,where,limit,type Unsubscribe} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import type {StagingSession} from '../integrations/firebase/stagingSession'
import {romeParts} from '../features/bookings/bookingPolicy'
import {competitionCategories,competitionCategoryLabels,isPendingCoachInvite,invitationCounts,participantEntryLabel,type CompetitionDraft,type CompetitionEvent,type CompetitionEntry,type CompetitionCategory} from '../features/bookings/competitionModel'
import {saveCompetition,cancelCompetition,requestCompetition,changeCompetitionEntry,saveCompetitionResult,watchCompetitionEntries} from '../integrations/firestore/competitions'
import {competitionInvitesEnabled,sendCompetitionInvites,respondToCompetitionInvite} from '../integrations/firebase/competitionInvites'
const props=defineProps<{session:StagingSession;events:CompetitionEvent[];entries:CompetitionEntry[];mode:'events'|'results';now:number;loading:boolean;initialEventId?:string}>()
const emit=defineEmits<{back:[];'mode-change':[mode:'events'|'results']}>()
function switchCompetitionMode(mode:'events'|'results'){if(props.mode===mode)return;selected.value='';expanded.value=false;emit('mode-change',mode)}
const isCoach=computed(()=>props.session.role!=='atleta')
const category=ref<'all'|CompetitionCategory>('all'),showPast=ref(false),selected=ref(''),expanded=ref(false),formOpen=ref(false),editing=ref<CompetitionEvent|undefined>(),busy=ref(false),feedback=ref('')
const fresh=():CompetitionDraft=>({title:'',category:'combattimento',discipline:'',location:'',notes:'',date:'',time:'09:00'})
const form=ref<CompetitionDraft>(fresh()),participants=ref<CompetitionEntry[]>([]),participantNames=ref<Record<string,string>>({}),resultDraft=ref<Record<string,string>>({}),participantsLoading=ref(false)
const chosen=computed(()=>props.events.find(e=>e.id===selected.value))
const inviteRoster=ref<{id:string;name:string}[]>([]),inviteSelected=ref<string[]>([]),inviteSearch=ref(''),inviteOpen=ref(false),inviteLoading=ref(false)
const invitedCounts=computed(()=>invitationCounts(participants.value))
const visibleInviteRoster=computed(()=>inviteRoster.value.filter(r=>(r.name+' '+r.id).toLocaleLowerCase('it').includes(inviteSearch.value.toLocaleLowerCase('it'))))
const existingEntryIds=computed(()=>new Set(participants.value.map(r=>r.athleteId)))
async function showInviteRoster(){
 if(!chosen.value||!isCoach.value)return
 inviteOpen.value=!inviteOpen.value
 if(!inviteOpen.value)return
 inviteSelected.value=[];inviteSearch.value=''
 if(!competitionInvitesEnabled()){feedback.value='Inviti personalizzati non ancora attivi. Devono essere collaudate e distribuite le Cloud Functions R8B.';return}
 inviteLoading.value=true
 try{
  const {db}=getStagingClients()
  const snap=await getDocs(query(collection(db,'users'),where('gymId','==',props.session.gymId),where('role','==','athlete'),limit(100)))
  if(!inviteOpen.value)return
  inviteRoster.value=snap.docs.map(d=>({id:d.id,name:[d.data().name,d.data().surname].filter(Boolean).join(' ').trim()||'Atleta'})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
 }catch(e){feedback.value='Impossibile caricare gli atleti: '+(e instanceof Error?e.message:String(e))}
 finally{inviteLoading.value=false}
}
function toggleInvite(id:string,checked:boolean){inviteSelected.value=checked?[...inviteSelected.value,id]:inviteSelected.value.filter(x=>x!==id)}
function inviteAthletes(){const event=chosen.value,ids=[...inviteSelected.value];if(!event||!ids.length)return;void run(async()=>{
 const result=await sendCompetitionInvites(event.id,ids)
 inviteSelected.value=[];inviteOpen.value=false
 return result
 },'Inviti creati. Le notifiche push sono inviate soltanto ai dispositivi abilitati, senza garanzia di consegna.')}
function answerInvite(e:CompetitionEvent,response:'yes'|'no'){void run(()=>respondToCompetitionInvite(e.id,response),response==='yes'?'Partecipazione confermata. Il Coach riceverà la risposta.':'Hai scelto di non partecipare. Il Coach riceverà la risposta.')}

const shown=computed(()=>props.events.filter(e=>(category.value==='all'||e.category===category.value)&&(showPast.value?e.startMs<props.now||e.status==='cancelled':e.startMs>=props.now&&e.status==='published')).sort((a,b)=>showPast.value?b.startMs-a.startMs:a.startMs-b.startMs))
const results=computed(()=>props.entries.filter(r=>r.status==='approved'&&props.events.some(e=>e.id===r.eventId&&e.status==='published'&&e.startMs<=props.now)))
const myEntry=(eventId:string)=>props.entries.find(e=>e.eventId===eventId)
const eventName=(eventId:string)=>props.events.find(e=>e.id===eventId)?.title||'Evento storico'
const formatDate=(ms:number)=>new Date(ms).toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Rome'})
let stop:Unsubscribe|undefined, generation=0
watch(selected,(id)=>{stop?.();stop=undefined;inviteOpen.value=false;inviteSelected.value=[];inviteRoster.value=[];participants.value=[];participantNames.value={};resultDraft.value={};const token=++generation;participantsLoading.value=false;if(!isCoach.value||!id)return
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
  <button v-if="!expanded" type="button" class="ghost lf-r9-comp-back" @click="emit('back')">‹ Agenda</button>
  <div class="row between"><h2>{{isCoach?'Competizioni e gare':'Gare e risultati'}}</h2><button v-if="isCoach&&mode==='events'" class="primary" :disabled="busy" @click="openForm()">+ Evento</button></div>
  <div v-if="!isCoach" class="lf-r9-comp-tabs" role="group" aria-label="Sezioni gare e risultati"><button type="button" :aria-pressed="mode==='events'" @click="switchCompetitionMode('events')">Competizioni</button><button type="button" :aria-pressed="mode==='results'" @click="switchCompetitionMode('results')">I miei risultati</button></div>
  <p v-if="feedback" class="notice" role="status">{{feedback}}</p>
  <p v-lf-quiet-loading v-if="loading" class="muted lf-quiet-status" role="status">Caricamento competizioni…</p>
  <template v-else-if="mode==='results'">
   <div v-if="!results.length" class="lf-r9-comp-empty"><span aria-hidden="true">🏆</span><strong>Nessun risultato registrato</strong><small>I risultati delle gare verranno mostrati qui dopo la registrazione da parte del Coach.</small></div>
   <article v-for="r in results" :key="r.id" class="panel"><h3>{{eventName(r.eventId)}}</h3><p>{{r.result||'Risultato non ancora registrato dal Coach.'}}</p></article>
  </template>
  <template v-else-if="formOpen&&isCoach">
   <form class="panel lf-comp-form" @submit.prevent="publish"><h3>{{editing?'Modifica evento':'Nuova competizione'}}</h3><label>Titolo<input v-model="form.title" required maxlength="100"/></label><label>Categoria<select v-model="form.category"><option v-for="c in competitionCategories" :key="c" :value="c">{{competitionCategoryLabels[c]}}</option></select></label><label>Disciplina<input v-model="form.discipline" required maxlength="60" placeholder="Es. Boxe"/></label><label>Luogo<input v-model="form.location" required maxlength="160"/></label><div class="grid2"><label>Data<input v-model="form.date" type="date" required/></label><label>Ora (Italia)<input v-model="form.time" type="time" required/></label></div><label>Informazioni<textarea v-model="form.notes" maxlength="1500" rows="4"/></label><button class="primary wide" :disabled="busy" type="submit">Salva evento</button><button class="secondary wide" type="button" :disabled="busy" @click="formOpen=false">Annulla</button></form>
  </template>
  <template v-else-if="expanded&&chosen">
   <button class="secondary" @click="selected='';expanded=false">‹ Torna agli eventi</button>
   <article class="panel lf-comp-detail"><div class="lf-comp-cover"><CompetitionCover :gym="session.gymId" :event-id="chosen.id" :cover-id="chosen.coverId"/></div><span class="eyebrow">{{competitionCategoryLabels[chosen.category]}}</span><h3>{{chosen.title}}</h3><p>{{formatDate(chosen.startMs)}} · {{chosen.location}}</p><p class="muted">{{chosen.discipline}} · {{chosen.status==='cancelled'?'Annullato':'Pubblicato'}}</p><p class="lf-comp-notes">{{chosen.notes}}</p>
    <div v-if="isCoach&&chosen.status==='published'&&chosen.startMs>now" class="row"><button class="secondary" :disabled="busy" @click="openForm(chosen)">Modifica</button><button class="danger" :disabled="busy" @click="cancel(chosen)">Annulla evento</button></div><div v-if="isCoach&&chosen.status==='published'&&chosen.startMs>now&&competitionCoversEnabled()"><label>Carica locandina<input type="file" accept="image/*,.heic,.heif" :disabled="busy" @change="chooseCover(chosen,$event)"/></label><button v-if="chosen.coverId" class="secondary" :disabled="busy" @click="removeCover(chosen)">Rimuovi locandina</button></div>
    <template v-if="!isCoach"><strong v-if="myEntry(chosen.id)">{{participantEntryLabel(myEntry(chosen.id)!)}}</strong><template v-if="chosen.status==='published'&&chosen.startMs>now"><div v-if="isPendingCoachInvite(myEntry(chosen.id))" class="lf-r8b-invite-respond"><p><strong>Il tuo Coach ti ha invitato a questa gara.</strong> Confermi la partecipazione?</p><div class="row"><button type="button" class="primary" :disabled="busy||!competitionInvitesEnabled()" @click="answerInvite(chosen,'yes')">Partecipo</button><button type="button" class="secondary" :disabled="busy||!competitionInvitesEnabled()" @click="answerInvite(chosen,'no')">Non partecipo</button></div></div><button v-else-if="!myEntry(chosen.id)||myEntry(chosen.id)?.status==='withdrawn'" class="primary wide" :disabled="busy" @click="join(chosen)">Voglio partecipare</button><button v-else-if="['pending','approved'].includes(myEntry(chosen.id)!.status)" class="secondary" :disabled="busy" @click="change(myEntry(chosen.id)!,'withdrawn')">Ritira partecipazione</button></template></template>
   </article>
   <section v-if="isCoach" class="panel lf-r8b-participation-panel"><div class="row between"><h3>Partecipazioni</h3><button v-if="chosen.status==='published'&&chosen.startMs>now" type="button" class="secondary" :aria-expanded="inviteOpen" :disabled="busy" @click="showInviteRoster">Invita atleti</button></div><div class="lf-r8b-invite-stats" aria-label="Riepilogo inviti"><span><b>{{invitedCounts.invited}}</b><small>Invitati</small></span><span><b>{{invitedCounts.accepted}}</b><small>Confermati</small></span><span><b>{{invitedCounts.declined}}</b><small>Rifiutati</small></span><span><b>{{invitedCounts.waiting}}</b><small>In attesa</small></span></div><div v-if="inviteOpen" class="lf-r8b-roster"><p class="muted small">Seleziona gli atleti della tua palestra. Una gara pubblicata da sola non invia notifiche.</p><p v-if="!competitionInvitesEnabled()" class="muted small">Gli inviti saranno disponibili dopo l'attivazione sicura del backend R8B.</p><template v-else><label>Cerca atleta<input v-model="inviteSearch" placeholder="Nome o cognome"/></label><p v-if="inviteLoading" class="muted small">Caricamento atleti…</p><div v-else class="lf-r8b-invite-roster-list"><label v-for="a in visibleInviteRoster" :key="a.id" class="lf-r8b-roster-row"><input type="checkbox" :checked="inviteSelected.includes(a.id)" :disabled="existingEntryIds.has(a.id)||busy" @change="toggleInvite(a.id,($event.target as HTMLInputElement).checked)"/><span>{{a.name}}</span><small v-if="existingEntryIds.has(a.id)" class="muted">Già presente</small></label></div><button class="primary wide" type="button" :disabled="busy||inviteLoading||!inviteSelected.length" @click="inviteAthletes">Invita {{inviteSelected.length}} {{inviteSelected.length===1?'atleta':'atleti'}}</button></template></div><p v-lf-quiet-loading v-if="participantsLoading" class="muted lf-quiet-status">Caricamento richieste…</p><p v-else-if="!participants.length" class="muted">Nessuna richiesta.</p><div v-for="r in participants" :key="r.id" class="lf-comp-entry"><strong>{{participantNames[r.athleteId]||'Atleta'}}</strong><small class="muted">{{participantEntryLabel(r)}}</small><div v-if="chosen.status==='published'&&chosen.startMs>now&&r.status==='pending'&&!isPendingCoachInvite(r)" class="row"><button class="primary" :disabled="busy" @click="change(r,'approved')">Approva</button><button class="secondary" :disabled="busy" @click="change(r,'rejected')">Non approvare</button></div><div v-if="chosen.status==='published'&&chosen.startMs<=now&&r.status==='approved'"><label>Risultato<textarea v-model="resultDraft[r.id]" rows="2" maxlength="1000"/></label><button class="secondary" :disabled="busy" @click="saveResult(r)">Salva risultato</button></div></div></section>
  </template>
  <template v-else><div class="grid2"><label>Disciplina<select v-model="category"><option value="all">Tutte</option><option v-for="c in competitionCategories" :key="c" :value="c">{{competitionCategoryLabels[c]}}</option></select></label><label>Periodo<select v-model="showPast"><option :value="false">Prossime</option><option :value="true">Storico / annullate</option></select></label></div><div v-if="!shown.length" class="lf-r9-comp-empty"><span aria-hidden="true">🏆</span><strong>Nessuna gara in questa sezione</strong><small>Quando saranno pubblicati nuovi eventi li troverai qui.</small></div><button v-for="e in shown" :key="e.id" class="lf-comp-event" @click="selectEvent(e)"><span class="eyebrow">{{competitionCategoryLabels[e.category]}}</span><strong>{{e.title}}</strong><small>{{formatDate(e.startMs)}} · {{e.location}}</small><small>{{e.discipline}}<template v-if="myEntry(e.id)"> · {{participantEntryLabel(myEntry(e.id)!)}}</template><template v-if="e.status==='cancelled'"> · Annullato</template></small></button><p class="small muted">Sono mostrati fino a 200 eventi della palestra.</p></template>
 </section>
</template>
<style scoped>
.lf-comp-workspace,.lf-comp-form,.lf-comp-detail{display:grid;gap:10px;min-width:0}.lf-comp-workspace h2{margin:0;font-size:21px}.lf-comp-workspace h3{margin:0 0 7px}.lf-comp-workspace .ghost{justify-self:start}.lf-comp-event{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:13px;text-align:left;padding:14px;display:grid;gap:7px;overflow-wrap:anywhere}.lf-comp-event strong{font-size:17px}.lf-comp-event small{color:var(--muted)}.lf-comp-cover{height:180px;overflow:hidden;border-radius:12px}.lf-comp-notes{white-space:pre-wrap;overflow-wrap:anywhere}.lf-comp-entry{display:grid;gap:6px;border-top:1px solid var(--border);padding:11px 0}.lf-comp-workspace select,.lf-comp-workspace input,.lf-comp-workspace textarea{min-width:0;width:100%}.lf-comp-workspace .row{flex-wrap:wrap}.lf-comp-workspace label{font-size:13px}.lf-comp-workspace .grid2>*{min-width:0}

/* R8B Coach-issued competition invitations — retains voluntary requests and photos. */
.lf-r8b-invite-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.lf-r8b-invite-stats span{min-width:0;display:grid;justify-items:center;gap:3px;border:1px solid var(--border);background:var(--card2);border-radius:10px;padding:10px 3px}.lf-r8b-invite-stats b{font-size:20px;color:var(--mint)}.lf-r8b-invite-stats small{font-size:10px;color:var(--muted);text-align:center}.lf-r8b-roster{display:grid;gap:10px;padding:12px;border-radius:12px;background:var(--card2);border:1px solid var(--border)}.lf-r8b-roster label{display:grid;gap:5px}.lf-r8b-invite-roster-list{display:grid;gap:4px;max-height:290px;overflow-y:auto}.lf-r8b-roster .lf-r8b-roster-row{display:flex;align-items:center;gap:9px;min-height:40px;padding:6px 10px;border:1px solid var(--border);border-radius:9px;background:var(--card)}.lf-r8b-roster-row input{width:18px;flex:0 0 18px;accent-color:var(--mint)}.lf-r8b-roster-row span{flex:1}.lf-r8b-invite-respond{padding:13px;border:1px solid var(--mint);border-radius:12px;background:var(--green-bg)}.lf-r8b-invite-respond p{margin:0 0 12px}.lf-r8b-invite-respond button{flex:1;min-height:44px}

/* PATCH 30 R9: athlete competition/result tabs and empty states. */
.lf-r9-comp-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;min-width:0;padding:4px;border:1px solid var(--border);border-radius:13px;background:var(--card2)}
.lf-r9-comp-tabs button{border:1px solid transparent;background:transparent;color:var(--muted);font-size:12px;font-weight:850;line-height:1.25;min-height:41px;padding:8px 6px;border-radius:10px}
.lf-r9-comp-tabs button[aria-pressed=true]{background:var(--green-bg);border-color:var(--mint);color:var(--text)}
.lf-r9-comp-tabs button:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.lf-r9-comp-back{min-height:38px;font-size:12px;justify-self:start}
.lf-r9-comp-empty{display:grid;justify-items:center;gap:6px;text-align:center;padding:20px 14px;border:1px dashed var(--border);background:var(--card);border-radius:14px}
.lf-r9-comp-empty span{font-size:24px}.lf-r9-comp-empty strong{font-size:14px}.lf-r9-comp-empty small{font-size:12px;color:var(--muted);max-width:310px;line-height:1.45}
.lf-comp-detail .lf-comp-cover{height:clamp(155px,29vw,240px)}
</style>
