<script setup lang="ts">
import {computed,ref,onMounted,onUnmounted,watch} from 'vue'
import {useRouter,useRoute,RouterLink} from 'vue-router'
import {onIdTokenChanged,signOut} from 'firebase/auth'
import type {QueryDocumentSnapshot} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {mayWriteLive,isLiveMode} from '../integrations/firebase/stagingConfig'
import {verifyPlatformAccess} from '../integrations/firebase/platformAccess'
import {listPlatformGyms,platformCounts,listGymCommercialModes,getGymCommercialMode,setBillingExemption} from '../integrations/firestore/platform'
import {commercialLabels,commercialCounts,filterCommercialGyms,commercialChoice,exemptionValue,type CommercialGym,type CommercialFilter,type CommercialChoice,type CommercialMode} from '../features/platform/commercialModel'
import BillingSandbox from '../components/BillingSandbox.vue'
import {billingSandboxEnabled} from '../integrations/firebase/billingSandbox'
import {activatePush,deactivatePush,defaultPushPrefs,connectPushSession,readPushSettings,disconnectPushBeforeLogout,pushFeatureEnabled,pushNotice} from '../integrations/firebase/pushNotifications'
import SupportTickets from '../components/SupportTickets.vue'
import PlatformExecutiveOverview from '../components/PlatformExecutiveOverview.vue'
import PlatformServicesStatus from '../components/PlatformServicesStatus.vue'
import PlatformControlRoadmap from '../components/PlatformControlRoadmap.vue'
type ControlTab='overview'|'gyms'|'subscriptions'|'tickets'|'services'|'usage'|'security'|'config'|'billing'
const router=useRouter(),route=useRoute(),allowed=ref(false),busy=ref(false),error=ref(''),success=ref(''),tab=ref<ControlTab>('overview')
const gyms=ref<CommercialGym[]>([]),counts=ref<{gyms:number;tickets:number}|null>(null),more=ref(false),selected=ref<CommercialGym|null>(null),choice=ref<CommercialChoice|''>(''),ready=ref(false)
const search=ref(''),filter=ref<CommercialFilter>('all'),sandboxGymId=ref('')
const lastPlatformVerifiedAt=ref<number|null>(null),lastAccessVerifiedAt=ref<number|null>(null),lastPlatformError=ref('')
const totals=computed(()=>commercialCounts(gyms.value)),visibleGyms=computed(()=>filterCommercialGyms(gyms.value,filter.value,search.value))
const filters:CommercialFilter[]=['all','exempt','subscription','unconfigured','unavailable']
const controlTabs:{id:ControlTab;label:string}[]=[{id:'overview',label:'Panoramica'},{id:'gyms',label:'Palestre & CRM'},{id:'subscriptions',label:'Abbonamenti'},{id:'tickets',label:'Assistenza'},{id:'services',label:'Stato servizi'},{id:'usage',label:'Utilizzo app'},{id:'security',label:'Sicurezza'},{id:'config',label:'Configurazione'}]
const futureModule=computed<'subscriptions'|'usage'|'security'|'config'>(()=>{const current=tab.value;return current==='subscriptions'||current==='usage'||current==='security'||current==='config'?current:'config'})
const changed=computed(()=>!!selected.value&&!!choice.value&&choice.value!==commercialChoice(selected.value.commercial))
let alive=true,cursor:QueryDocumentSnapshot|undefined,stop:(()=>void)|undefined
const active=()=>alive&&allowed.value
function dismiss(){selected.value=null;choice.value='';ready.value=false}
function setMode(id:string,commercial:CommercialMode){gyms.value=gyms.value.map(g=>g.id===id?{...g,commercial}:g);if(selected.value?.id===id)selected.value={...selected.value,commercial}}
async function load(append=false){
 if(busy.value||!active())return;busy.value=true;error.value='';success.value='';dismiss()
 try{
  const data=await listPlatformGyms(append?cursor:undefined),rows=await listGymCommercialModes(data.rows)
  if(!active())return
  const unique=new Map((append?gyms.value:[]).map(g=>[g.id,g]));rows.forEach(g=>unique.set(g.id,g));gyms.value=[...unique.values()]
  if(data.cursor)cursor=data.cursor;else if(!append)cursor=undefined
  more.value=data.more
  try{const result=await platformCounts();if(active()){counts.value=result;lastPlatformVerifiedAt.value=Date.now();lastPlatformError.value=''}}catch{if(active()){counts.value=null;lastPlatformVerifiedAt.value=null;lastPlatformError.value='La lettura Firestore dei conteggi è fallita.';error.value='Totali globali non disponibili. Le palestre caricate restano consultabili.'}}
 }catch(e){if(active()){error.value=(e as Error).message;lastPlatformError.value='La lettura delle palestre non è riuscita.'}}finally{if(active())busy.value=false}
}
async function pick(g:CommercialGym){
 if(busy.value||!active())return;selected.value={...g};ready.value=false;choice.value='';busy.value=true;error.value='';success.value=''
 try{const mode=await getGymCommercialMode(g.id);if(!active())return;setMode(g.id,mode);choice.value=commercialChoice(mode);ready.value=mode!=='unavailable';if(!ready.value)error.value='Preferenza non interpretabile. Aggiorna prima di modificarla.'}
 catch(e){if(active()){setMode(g.id,'unavailable');error.value=(e as Error).message}}finally{if(active())busy.value=false}
}
async function save(){
 if(!selected.value||!choice.value||!ready.value||!changed.value||busy.value||!active())return
 const gym=selected.value,mode=choice.value
 if(!window.confirm(`Confermi ${gym.name} come ${commercialLabels[mode]}? Questa scelta non attiva addebiti o blocchi.`))return
 busy.value=true;error.value='';success.value=''
 try{
  await setBillingExemption(gym.id,exemptionValue(mode))
  if(!active())return
  const saved=await getGymCommercialMode(gym.id);if(!active())return;setMode(gym.id,saved);choice.value=commercialChoice(saved);ready.value=saved!=='unavailable'
  if(saved===mode)success.value=`${gym.name}: ${commercialLabels[mode]}. Preferenza salvata e verificata.`
  else{error.value='Il valore riletto non coincide con la scelta. Controlla nuovamente la palestra.'}
 }catch(e){if(active()){setMode(gym.id,'unavailable');ready.value=false;error.value=`Salvataggio non verificato. Aggiorna la palestra prima di riprovare. ${(e as Error).message}`}}finally{if(active())busy.value=false}
}
function switchTab(value:ControlTab){if(busy.value)return;tab.value=value;error.value='';success.value='';dismiss()}
const independent=isLiveMode()
const gymNames=computed(()=>Object.fromEntries(gyms.value.map(g=>[g.id,g.name])))
const unreadTickets=ref(0),pushActive=ref(false),pushBusy=ref(false),pushError=ref('')
const supportPushEnabled=import.meta.env.VITE_LIONFIT_SUPPORT_ADVANCED==='true'&&pushFeatureEnabled()
function openSupport(){tab.value='tickets';pushNotice.value=null}
watch(()=>[route.query.open,route.query.notice],v=>{if(v[0]==='support')openSupport()},{immediate:true})
async function toggleSupportPush(){if(pushBusy.value)return;pushBusy.value=true;pushError.value='';try{if(pushActive.value){await deactivatePush();pushActive.value=false}else{await activatePush(defaultPushPrefs());pushActive.value=true;await connectPushSession(getStagingClients().auth.currentUser?.uid||null,openSupport,false,openSupport)}}catch(e){pushError.value=(e as Error).message}finally{pushBusy.value=false}}
async function controlPush(){if(!supportPushEnabled)return;const id=getStagingClients().auth.currentUser?.uid;if(!id)return;await connectPushSession(id,openSupport,true,openSupport);if(alive&&allowed.value)pushActive.value=(await readPushSettings()).active}
function clearControl(){lastPlatformVerifiedAt.value=null;lastAccessVerifiedAt.value=null;lastPlatformError.value='';allowed.value=false;gyms.value=[];dismiss();counts.value=null;busy.value=false;error.value='';success.value='';sandboxGymId.value='';search.value='';filter.value='all';cursor=undefined;more.value=false}
async function leave(){try{if(!await disconnectPushBeforeLogout())return;await signOut(getStagingClients().auth);clearControl();await router.replace('/accesso')}catch(e){error.value=(e as Error).message}}
onMounted(async()=>{if(!await verifyPlatformAccess()){void router.replace('/accesso');return}if(!alive)return;const {auth}=getStagingClients(),id=auth.currentUser?.uid;stop=onIdTokenChanged(auth,async u=>{const ok=u?.uid===id&&await verifyPlatformAccess(false);if(alive&&!ok){clearControl();void router.replace('/accesso')}else if(alive&&ok){lastAccessVerifiedAt.value=Date.now()}});allowed.value=true;lastAccessVerifiedAt.value=Date.now();void load();void controlPush().catch(e=>{if(alive)pushError.value=(e as Error).message})})
onUnmounted(()=>{alive=false;stop?.();if(supportPushEnabled)void connectPushSession(null,()=>{})})
</script>
<template>
 <div v-if="allowed" class="stack lf14-platform lf19c-control" v-lf-entrance="{id:'control-center',premiumOnly:true,rows:[{match:'header'},{within:'.lf19c-kpis',match:'.panel'}]}">
  <header class="panel lf19c-header lfcc-main-header"><div><p class="lfcc-main-eyebrow">LIONFIT · PLATFORM OWNER</p><h1>Control Center <span>3.0</span></h1><p class="muted">La tua centrale operativa SaaS · dati reali, controlli sicuri, visibilità sui servizi.</p></div><button v-if="independent" type="button" class="secondary" @click="leave">Esci dal Control Center</button><RouterLink v-else to="/impostazioni" class="secondary">Torna alle impostazioni</RouterLink></header>
  <nav v-lf-motion-tabs class="lf19c-tabs lfcc-navigation" aria-label="Sezioni Control Center"><button v-for="item in controlTabs" :key="item.id" type="button" :class="tab===item.id?'primary':'secondary'" :aria-pressed="tab===item.id" :disabled="busy" @click="switchTab(item.id)">{{item.label}}<span v-if="item.id==='tickets'&&unreadTickets" class="lf29-tab-count">{{unreadTickets}}</span></button><button v-if="billingSandboxEnabled()" type="button" :class="tab==='billing'?'primary':'secondary'" :aria-pressed="tab==='billing'" :disabled="busy" @click="switchTab('billing')">Sandbox Stripe</button></nav>
  <p v-if="error" class="notice" role="alert">{{error}}</p><p v-if="success" class="lf19c-success" role="status">{{success}}</p>
  <div v-show="tab==='tickets'" class="stack"><div v-if="supportPushEnabled" class="row between"><button type="button" class="secondary" :disabled="pushBusy" @click="toggleSupportPush">{{pushActive?'Disattiva notifiche assistenza':'Attiva notifiche assistenza'}}</button><small v-if="pushError" role="alert">{{pushError}}</small></div><SupportTickets platform :visible="tab==='tickets'" :gym-names="gymNames" @unread="unreadTickets=$event"/></div>
  <section v-if="tab==='billing'&&billingSandboxEnabled()" class="stack"><label>Palestra da verificare (elenco caricato)<select v-model="sandboxGymId"><option value="">Solo catalogo</option><option v-for="g in gyms" :key="g.id" :value="g.id">{{g.name}}</option></select></label><BillingSandbox platform :gym-id="sandboxGymId||undefined"/></section>
  <section v-else-if="tab==='gyms'" class="panel stack">
   <div class="lf19c-header"><div><h2>Gestione commerciale</h2><p class="muted small">In produzione Stripe e sospensioni sono inattivi. Nessun dato privato degli atleti viene aperto da quest'area.</p></div><button type="button" class="secondary" :disabled="busy" @click="load()">Aggiorna</button></div>
   <div class="lf19c-search"><label>Ricerca palestra<input v-model="search" placeholder="Nome o identificativo" type="search"/></label><label>Stato commerciale<select v-model="filter"><option v-for="f in filters" :key="f" :value="f">{{f==='all'?'Tutte':commercialLabels[f]}}</option></select></label></div>
   <p class="muted small">{{visibleGyms.length}} risultati · {{gyms.length}} palestre caricate{{counts?' su '+counts.gyms:''}}. La ricerca e i conteggi commerciali riguardano le palestre caricate.</p>
   <section v-if="selected" class="lf14-ticket-detail lf19c-detail" aria-label="Preferenza commerciale palestra">
    <div class="lf19c-header"><div><h3>{{selected.name}}</h3><small class="muted">{{selected.id}}</small></div><button type="button" class="secondary" :disabled="busy" @click="dismiss">Chiudi</button></div>
    <p>Stato attuale: <strong :class="['lf19c-tag',selected.commercial]">{{commercialLabels[selected.commercial]}}</strong></p>
    <fieldset class="lf19c-choices" :disabled="busy||!ready||!mayWriteLive()"><legend>Regime del futuro abbonamento</legend>
     <label :class="{'is-selected':choice==='exempt'}"><input type="radio" name="lf19c-commercial" value="exempt" v-model="choice"/><span><strong>Esente · non paga</strong><small>Esenzione senza scadenza; revocabile dal Control Center.</small></span></label>
     <label :class="{'is-selected':choice==='subscription'}"><input type="radio" name="lf19c-commercial" value="subscription" v-model="choice"/><span><strong>A pagamento</strong><small>Abbonamento previsto; il pagamento non è ancora attivo.</small></span></label>
    </fieldset>
    <p v-if="!mayWriteLive()" class="muted small">Scritture non abilitate in questo ambiente.</p>
    <button type="button" class="secondary" v-if="!ready&&!busy" @click="pick(selected)">Rileggi preferenza</button>
    <button type="button" class="primary" :disabled="!ready||!changed||busy||!mayWriteLive()" @click="save">Salva preferenza</button>
    <small class="muted">Non vengono effettuati addebiti, fatture, cancellazioni o sospensioni. La preferenza sarà utilizzata dalla futura integrazione Stripe.</small>
   </section>
   <p v-if="!visibleGyms.length" class="muted">{{busy?'Caricamento…':gyms.length?'Nessun risultato tra le palestre caricate.':'Nessuna palestra caricata.'}}</p>
   <div class="lf19c-gyms">
    <button v-for="g in visibleGyms" :key="g.id" type="button" class="secondary lf14-ticket-row lf19c-gym" :class="{'is-selected':selected?.id===g.id}" :disabled="busy" @click="pick(g)"><span><strong>{{g.name}}</strong><small>{{g.id}}</small><small>{{g.createdAt?new Date(g.createdAt).toLocaleDateString('it-IT'):'Data non disponibile'}}</small></span><span :class="['lf19c-tag',g.commercial]">{{commercialLabels[g.commercial]}}</span></button>
   </div>
   <button v-if="more" type="button" class="secondary" :disabled="busy" @click="load(true)">Carica altre palestre</button>
  </section>
  <PlatformExecutiveOverview v-else-if="tab==='overview'" :counts="counts" :totals="totals" :loaded="gyms.length" :more="more" :loading="busy" :last-verified-at="lastPlatformVerifiedAt" @navigate="switchTab"/>
  <PlatformServicesStatus v-else-if="tab==='services'" :access-verified-at="lastAccessVerifiedAt" :firestore-verified-at="lastPlatformVerifiedAt" :firestore-error="lastPlatformError" :loading="busy" :gym-count="counts?.gyms??null" :ticket-count="counts?.tickets??null" @refresh="load()"/>
  <PlatformControlRoadmap v-else-if="tab==='subscriptions'||tab==='usage'||tab==='security'||tab==='config'" :module="futureModule" :access-verified-at="lastAccessVerifiedAt" :loaded-gyms="gyms.length" :subscription-planned="totals.subscription" @open-gyms="switchTab('gyms')" @open-services="switchTab('services')"/>
 </div><p v-else class="panel">Verifica autorizzazione piattaforma…</p>
</template>
<style scoped>
.lf19c-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}.lf19c-header>div{min-width:0;overflow-wrap:anywhere}.lf19c-header h1,.lf19c-header h2,.lf19c-header h3{margin:4px 0}.lf19c-header p{margin:5px 0}.lf19c-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.lf19c-kpis section{min-width:0;padding:14px}.lf19c-kpis h2{font-size:clamp(23px,3vw,32px);margin:8px 0}.lf19c-kpis small{display:block;overflow-wrap:anywhere}.lf19c-kpis small:last-child{color:var(--muted)}.lf19c-green{color:#45be75}.lf19c-tabs{display:flex;gap:8px;flex-wrap:wrap}.lf19c-tabs button{flex:1 1 auto}.lf19c-search{display:grid;grid-template-columns:2fr 1fr;gap:10px}.lf19c-search label{min-width:0;display:grid;gap:5px}.lf19c-search input,.lf19c-search select{width:100%;min-width:0}.lf19c-gyms{display:grid;gap:8px}.lf19c-gym{min-height:76px}.lf19c-tag{display:inline-flex;width:fit-content;max-width:48%;border-radius:8px;padding:5px 8px;font-size:12px;font-weight:700;white-space:normal;text-align:left;border:1px solid var(--border);overflow-wrap:anywhere}.lf19c-tag.exempt,.lf19c-success{color:#45be75;background:rgba(35,170,90,.09)}.lf19c-tag.subscription{color:var(--text);background:rgba(130,140,150,.1)}.lf19c-tag.unconfigured,.lf19c-tag.unavailable{color:var(--muted)}.lf19c-success{padding:12px;border:1px solid #337448;border-radius:10px}.lf19c-detail .lf19c-tag{max-width:100%}.lf19c-choices{display:grid;gap:8px;border:0;margin:0;padding:0;min-width:0}.lf19c-choices legend{margin-bottom:8px}.lf19c-choices label{border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer}.lf19c-choices label span{min-width:0;display:grid;gap:5px}.lf19c-choices small{color:var(--muted);white-space:normal}.lf19c-choices input{flex:none;width:18px!important;height:18px!important;min-height:0;accent-color:#29a95b}.lf19c-choices .is-selected,.lf19c-gym.is-selected{border-color:#29a95b}.lf19c-choices:disabled{opacity:.7}
@media(max-width:650px){.lf19c-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.lf19c-kpis section{padding:12px}.lf19c-search{grid-template-columns:1fr}.lf19c-gym{gap:6px}.lf19c-tag{font-size:11px}.lf19c-header>button{min-height:40px}}

.lfcc-main-header{padding:19px 22px!important;border:1px solid rgba(60,210,142,.33);background:linear-gradient(115deg,rgba(12,83,52,.24),transparent),var(--card)}.lfcc-main-eyebrow{color:var(--mint);font-size:10px;letter-spacing:.14em;font-weight:900;margin:0 0 5px!important}.lfcc-main-header h1{font-size:clamp(24px,3.5vw,36px);line-height:1.16}.lfcc-main-header h1 span{color:var(--mint);font-size:.65em}.lfcc-main-header>div{max-width:730px}.lfcc-navigation{overflow-x:auto;overflow-y:hidden;flex-wrap:nowrap;scrollbar-width:thin;gap:6px!important;max-width:100%;padding:2px 2px 9px}.lfcc-navigation button{flex:0 0 auto!important;min-width:fit-content;white-space:nowrap;font-size:11px;font-weight:800;border-radius:10px;padding:10px 13px}.lf19c-control{max-width:1240px;margin-inline:auto;min-width:0}.lf19c-control>.panel.stack{min-width:0}
@media(max-width:650px){.lfcc-main-header{padding:14px!important}.lfcc-navigation button{padding:9px 10px}.lf19c-control{gap:12px}}
</style>
