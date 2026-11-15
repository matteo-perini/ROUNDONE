<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,stagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {isLiveMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {readWorkConfig,saveWorkConfig,type StoredWorkConfig} from '../integrations/firestore/workConfig'
import {DEFAULT_WORK_RADIUS,validWorkCenter,validWorkConfig,workConfigEditable,workSites,type WorkConfig,type WorkSite,type WorkSiteId} from '../features/work/workConfig'
import {badgeEnabled,setBadgeEnabled} from '../features/work/devicePreference'
import {getWorkFix,checkWorkArea,type WorkFix} from '../features/work/gpsPilot'
const props=defineProps<{gymId:string;uid:string;mobile:boolean}>()
type Draft={name:string;radius:number;center:WorkFix|null;testOk:boolean}
const newDraft=():Draft=>({name:'',radius:DEFAULT_WORK_RADIUS,center:null,testOk:false})
const count=ref<1|2>(1),drafts=ref<[Draft,Draft]>([newDraft(),newDraft()]),busy=ref(false),ready=ref(false),message=ref(''),failure=ref(false)
const confirmStep=ref<0|1|2>(0),accepted=ref(false),stored=ref<StoredWorkConfig|null>(null),results=ref<Partial<Record<WorkSiteId,ReturnType<typeof checkWorkArea>>>>({})
const editable=computed(()=>workConfigEditable(stagingSession.value?.role||'')&&mayWriteLive()&&!stored.value)
const showBadge=ref(badgeEnabled(props.uid,props.gymId))
function toggleBadge(){const next=!showBadge.value;if(setBadgeEnabled(props.uid,props.gymId,next))showBadge.value=next;else{failure.value=true;message.value='Impossibile salvare la preferenza sul dispositivo.'}}
const finalSites=computed(()=>stored.value?workSites(stored.value.config):[])
function toSite(d:Draft):WorkSite|null{return d.center?{name:d.name.trim(),radius:d.radius,latitude:d.center.latitude,longitude:d.center.longitude,centerAccuracy:d.center.accuracy}:null}
const draft=computed<WorkConfig|null>(()=>{const a=toSite(drafts.value[0]),b=count.value===2?toSite(drafts.value[1]):null;return a&&(count.value===1||b)?{enabled:true,site1:a,site2:b}:null})
const canSave=computed(()=>ready.value&&editable.value&&!busy.value&&validWorkConfig(draft.value)&&drafts.value.slice(0,count.value).every(d=>d.testOk))
let alive=true
onUnmounted(()=>{alive=false;drafts.value=[newDraft(),newDraft()];results.value={}})
function resetConfirmation(){confirmStep.value=0;accepted.value=false}
function changeCount(v:1|2){count.value=v;if(v===1)drafts.value[1]=newDraft();resetConfirmation()}
function radiusChanged(i:0|1){drafts.value[i].testOk=false;resetConfirmation()}
function same(s:StagingSession|null){return alive&&!!s&&s.uid===props.uid&&s.gymId===props.gymId&&(s.role==='titolare'||s.role==='collaboratore')&&getStagingClients().auth.currentUser?.uid===props.uid}
async function session(owner=false){const s=await readStagingSession();if(!isLiveMode()||!same(s)||(owner&&(!workConfigEditable(s.role)||!mayWriteLive())))throw new Error('Accesso non autorizzato.');return s}
function error(e:unknown){if(alive){failure.value=true;const code=(e as {code?:string}|null)?.code;message.value=code==='permission-denied'||code==='firestore/permission-denied'? 'Accesso alla configurazione Firebase negato (non è un errore GPS). Verifica l’email dell’account e, per impostare le sedi, accedi come titolare della palestra. Se persiste contatta l’assistenza.':e instanceof Error?e.message:'Operazione non riuscita.'}}
async function load(){if(busy.value)return;busy.value=true;ready.value=false;failure.value=false;message.value='';results.value={};resetConfirmation();try{const s=await session();const v=await readWorkConfig(getStagingClients().db,s);if(!same(stagingSession.value))return;stored.value=v;if(v)drafts.value=[newDraft(),newDraft()];ready.value=true}catch(e){error(e)}finally{if(alive)busy.value=false}}
onMounted(load)
async function measure(i:0|1,mode:'center'|'draftTest'|'storedTest'){
 if(!props.mobile||busy.value||!ready.value||(mode!=='storedTest'&&!editable.value))return
 const id:WorkSiteId=i===0?'site1':'site2';busy.value=true;failure.value=false;message.value='Acquisizione GPS…';delete results.value[id];resetConfirmation()
 try{const s=await session(mode!=='storedTest');if(mode==='center'||mode==='draftTest')drafts.value[i].testOk=false;if(mode==='center')drafts.value[i].center=null;const fix=await getWorkFix();if(!same(stagingSession.value)||s.role!==stagingSession.value?.role)return
 if(mode==='center'){if(!validWorkCenter(fix))throw new Error('Precisione insufficiente per fissare la sede (massimo 25 m). Riprova all’aperto.');drafts.value[i].center=fix;message.value='Posizione acquisita. Prova il GPS prima della conferma definitiva.'}
 else {let site:WorkSite|null;if(mode==='storedTest'){const v=await readWorkConfig(getStagingClients().db,s);if(!same(stagingSession.value))return;site=v?.config[id]??null}else site=toSite(drafts.value[i]);if(!site)throw new Error('Sede non configurata.');const result=checkWorkArea(site,fix,site.radius);results.value[id]=result;if(mode==='draftTest')drafts.value[i].testOk=result.status==='inside';message.value='Prova completata. Nessuna presenza registrata.'}
 }catch(e){error(e)}finally{if(alive)busy.value=false}}
async function save(){if(!canSave.value||!draft.value||confirmStep.value!==2||!accepted.value)return;const config=structuredClone({enabled:true as const,site1:{...draft.value.site1},site2:draft.value.site2?{...draft.value.site2}:null});busy.value=true;failure.value=false;message.value='Salvataggio definitivo…';try{const s=await session(true);await saveWorkConfig(getStagingClients().db,s,config);if(!same(stagingSession.value))return;const v=await readWorkConfig(getStagingClients().db,s);if(!same(stagingSession.value))return;stored.value=v;drafts.value=[newDraft(),newDraft()];results.value={};resetConfirmation();message.value='Sedi configurate e bloccate definitivamente.'}catch(e){ready.value=false;resetConfirmation();error(e)}finally{if(alive)busy.value=false}}
</script>
<template>
 <section class="lf-work-config" aria-label="LionFit Work gestione sedi">
 <h3 v-if="!stored">Gestione sedi</h3>
 <p v-if="!ready&&busy" role="status">Caricamento configurazione…</p>
 <template v-if="ready">
 <template v-if="stored">
 <label v-if="mobile" class="lf-work-badge-pref">
  <span class="lf-work-badge-copy"><strong>Mostra badge nella Home</strong><small>Solo su questo dispositivo mobile</small></span>
  <input type="checkbox" role="switch" aria-label="Mostra badge nella Home su questo dispositivo" :checked="showBadge" @change="toggleBadge"/>
  <span aria-hidden="true" class="lf-work-switch"></span>
 </label>
 <h3>Gestione sedi</h3>
 <p class="muted small">LionFit Work è attivo. Le sedi sono bloccate: nessun admin o collaboratore può modificarle.</p>
 <article v-for="entry in finalSites" :key="entry.id" class="lf-work-site">
 <div class="lf-work-site-head"><strong>{{entry.site.name}}</strong><span>🔒 Definitiva</span></div>
 <p class="muted small">Raggio autorizzato: {{entry.site.radius}} m</p>
 <button v-if="mobile" type="button" class="secondary wide" :disabled="busy" @click="measure(entry.id==='site1'?0:1,'storedTest')">Prova posizione GPS</button>
 <div v-if="results[entry.id]" class="lf-work-result" role="status"><strong>{{results[entry.id]?.status==='inside'?'Dentro la zona':results[entry.id]?.status==='outside'?'Fuori dalla zona':'Posizione incerta · riprova'}}</strong><span>Distanza: {{results[entry.id]?.distance}} m · precisione: ±{{results[entry.id]?.accuracy}} m</span></div>
 </article>
 <p class="muted small">Per trasferimenti o errori nella configurazione, contatta l’assistenza. Nessuna modifica autonoma disponibile.</p>
 </template>
 <template v-else-if="editable">
 <p class="muted small">Configura tutte le sedi prima di bloccarle. In seguito non potrai aggiungerle, cambiarle o cancellarle.</p>
 <p v-if="!mobile" class="muted small">Apri LionFit sul telefono per acquisire e provare il GPS.</p>
 <div class="lf-work-choice"><button type="button" :class="count===1?'primary':'secondary'" :disabled="busy" @click="changeCount(1)">Una sede</button><button type="button" :class="count===2?'primary':'secondary'" :disabled="busy" @click="changeCount(2)">Due sedi</button></div>
 <article v-for="(d,i) in drafts.slice(0,count)" :key="i" class="lf-work-site">
 <strong>Sede {{i+1}}</strong>
 <label>Nome sede<input v-model="d.name" maxlength="60" placeholder="Nome della sede" :disabled="busy" @input="resetConfirmation"/></label>
 <button v-if="mobile" type="button" class="secondary wide" :disabled="busy" @click="measure(i===0?0:1,'center')">Utilizza posizione attuale</button>
 <p v-if="d.center" class="muted small">Posizione acquisita · ±{{Math.round(d.center.accuracy)}} m</p>
 <label>Raggio autorizzato (m)<input v-model.number="d.radius" type="number" min="20" max="300" step="1" :disabled="busy" @input="radiusChanged(i===0?0:1)"/></label>
 <button v-if="mobile&&d.center" type="button" class="secondary wide" :disabled="busy" @click="measure(i===0?0:1,'draftTest')">Prova GPS prima del blocco</button>
 <p v-if="d.testOk" role="status" class="lf-work-success">Prova GPS superata</p>
 <div v-if="results[i===0?'site1':'site2']" class="lf-work-result" role="status"><strong>{{results[i===0?'site1':'site2']?.status==='inside'?'Dentro la zona':results[i===0?'site1':'site2']?.status==='outside'?'Fuori dalla zona':'Posizione incerta · riprova'}}</strong><span>Distanza: {{results[i===0?'site1':'site2']?.distance}} m · precisione: ±{{results[i===0?'site1':'site2']?.accuracy}} m</span></div>
 </article>
 <button v-if="confirmStep===0" type="button" class="primary wide" :disabled="!canSave" @click="confirmStep=1">Imposta definitivamente</button>
 <div v-else class="lf-work-result" role="group" aria-label="Conferma definitiva">
 <strong>{{confirmStep===1?'Prima conferma':'Seconda conferma · irrevocabile'}}</strong>
 <p v-for="(d,i) in drafts.slice(0,count)" :key="i">{{d.name}} · {{d.radius}} m</p>
 <p>Confermi le sedi? Dopo il salvataggio non saranno modificabili, nemmeno dall’admin.</p>
 <button v-if="confirmStep===1" type="button" class="secondary wide" :disabled="!canSave" @click="confirmStep=2">Sì, continua</button>
 <template v-else><label class="lf-work-toggle"><input v-model="accepted" type="checkbox" :disabled="busy"/> Ho verificato tutte le sedi e accetto il blocco definitivo.</label><button type="button" class="primary wide" :disabled="!canSave||!accepted" @click="save">Confermo e blocco le sedi</button></template>
 <button type="button" class="secondary wide" :disabled="busy" @click="resetConfirmation">Annulla</button>
 </div>
 </template>
 <p v-else class="muted small">La sede non è ancora configurata. Solo il titolare può impostarla una volta.</p>
 </template>
 <p v-if="message" :role="failure?'alert':'status'" class="muted small">{{message}}</p>
 <button v-if="!ready||stored" type="button" class="secondary wide" :disabled="busy" @click="load">Ricarica configurazione</button>
 <p class="muted small">Qui non vengono registrate presenze. La posizione è richiesta solo quando premi un pulsante.</p>
 </section>
</template>
<style scoped>
.lf-work-config{display:grid;gap:12px;padding:14px;border-top:1px solid var(--border);min-width:0}.lf-work-config h3,.lf-work-config p{margin:0}.lf-work-config label{display:grid;gap:5px}.lf-work-config input:not([type=checkbox]){width:100%;box-sizing:border-box}.lf-work-config .lf-work-toggle{display:flex;gap:10px;align-items:center}.lf-work-toggle input{width:20px;height:20px;flex:none}.lf-work-result,.lf-work-site{display:grid;gap:8px;border:1px solid var(--border);border-radius:10px;padding:12px;min-width:0}.lf-work-result span{font-size:.9em}.lf-work-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lf-work-site-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.lf-work-site-head span,.lf-work-success{color:#55dca0}

.lf-work-config .lf-work-badge-pref{position:relative;display:flex;gap:12px;align-items:center;justify-content:space-between;min-height:48px;padding:9px 0 12px;border-bottom:1px solid var(--border);cursor:pointer}
.lf-work-badge-copy{display:grid;gap:4px;min-width:0;flex:1}.lf-work-badge-copy small{color:var(--muted);font-size:.8em}.lf-work-badge-pref input{position:absolute;right:0;width:48px;height:32px;opacity:0;margin:0;cursor:pointer}.lf-work-switch{width:46px;height:26px;border-radius:20px;background:#596575;flex:none;position:relative;pointer-events:none}.lf-work-switch::after{content:'';position:absolute;width:20px;height:20px;top:3px;left:3px;border-radius:50%;background:white;transition:transform .15s ease}.lf-work-badge-pref input:checked+.lf-work-switch{background:#16834c}.lf-work-badge-pref input:checked+.lf-work-switch::after{transform:translateX(20px)}.lf-work-badge-pref input:focus-visible+.lf-work-switch{outline:2px solid var(--mint);outline-offset:3px}@media(prefers-reduced-motion:reduce){.lf-work-switch::after{transition:none}}
</style>
