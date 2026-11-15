<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {workStatus,workPunch,type WorkStatus} from '../integrations/firebase/workAttendance'
import {getWorkFix} from '../features/work/gpsPilot'
import type {WorkSiteId} from '../features/work/workConfig'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
const props=defineProps<{uid:string;gymId:string}>()
const data=ref<WorkStatus|null>(null),expanded=ref(true),busy=ref(false),message=ref(''),error=ref(false),choices=ref<WorkSiteId[]>([]),received=ref(0),clock=ref(0)
let alive=true,interval:ReturnType<typeof setInterval>|undefined
const same=()=>alive&&stagingSession.value?.uid===props.uid&&stagingSession.value?.gymId===props.gymId&&getStagingClients().auth.currentUser?.uid===props.uid
const active=computed(()=>data.value?.enabled?data.value:null)
const open=computed(()=>active.value?.open||null)
const siteName=(id:WorkSiteId)=>active.value?.sites.find(s=>s.id===id)?.name||id
const total=computed(()=>{const v=active.value;if(!v)return 0;return v.closedMs.site1+v.closedMs.site2+v.openTodayMs+(v.open?Math.max(0,clock.value-received.value):0)})
const format=(n:number)=>{const sec=Math.max(0,Math.floor(n/1000));return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(v=>String(v).padStart(2,'0')).join(':')}
const rome=(n:number)=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',year:'numeric'}).format(n)
async function read(){const v=await workStatus(props.uid);if(!same())return;data.value=v;received.value=clock.value=performance.now()}
function err(e:unknown){if(same()){error.value=true;message.value=e instanceof Error?e.message:'Operazione non riuscita.'}}
async function refresh(){if(busy.value)return;busy.value=true;choices.value=[];message.value='';error.value=false;try{await read()}catch(e){data.value=null;err(e)}finally{if(alive)busy.value=false}}
async function punch(action:'in'|'out',selected:WorkSiteId|null=null){if(busy.value||!active.value||!same()||(action==='in'&&open.value)||(action==='out'&&!open.value))return;const revision=active.value.revision;busy.value=true;error.value=false;message.value='Verifica GPS in corso…';choices.value=[];try{const fix=await getWorkFix();if(!same())return;const result=await workPunch(props.uid,action,revision,fix,selected);if(!same())return;if(result.status==='choice'){choices.value=result.ids;message.value='Due sedi rilevate. Seleziona quella corretta.';return}if(result.status==='ok'){message.value=action==='in'?'Entrata registrata.':'Uscita registrata.';try{await read()}catch{data.value=null;error.value=true;message.value+=' Aggiorna per vedere lo stato.'}}else{error.value=true;message.value=result.status==='outside'?'Fuori dalla zona autorizzata.':result.status==='wrong-site'?'Non sei nella sede richiesta.':'Posizione GPS incerta. Riprova.'}}catch(e){err(e);data.value=null;if(same())message.value+=' Aggiorna lo stato prima di riprovare.'}finally{if(alive)busy.value=false}}
function tick(){clock.value=performance.now();const v=active.value;if(v&&!busy.value&&rome(v.now)!==rome(v.now+Math.max(0,clock.value-received.value)))void refresh()}
function resume(){if(document.visibilityState==='visible'&&!busy.value)void refresh()}
onMounted(()=>{void refresh();interval=setInterval(tick,1000);document.addEventListener('visibilitychange',resume)})
onUnmounted(()=>{alive=false;if(interval)clearInterval(interval);document.removeEventListener('visibilitychange',resume)})
</script>
<template>
 <section v-if="data?.enabled!==false" class="lf-work-badge" aria-label="LionFit Work">
  <button type="button" class="lf-work-head" :aria-expanded="expanded" @click="expanded=!expanded"><span><strong>LionFit Work</strong><small>{{open?'In servizio · '+siteName(open.siteId):active?'Non in servizio':'Timbratura GPS'}}</small></span><span aria-hidden="true">{{expanded?'⌃':'⌄'}}</span></button>
  <div v-if="expanded" class="lf-work-body">
   <template v-if="active"><div class="lf-work-total"><small>{{open?'Ore lavorate oggi · turno in corso':'Ore lavorate oggi'}}</small><strong>{{format(total)}}</strong></div><div class="lf-work-buttons"><button type="button" class="lf-work-in" :disabled="busy||!!open||choices.length>0" @click="punch('in')">Timbra entrata</button><button type="button" class="lf-work-out" :disabled="busy||!open" @click="punch('out')">Timbra uscita</button></div><p v-if="open&&active.now-open.startMs>16*3600000" class="lf-work-msg">Turno aperto da oltre 16 ore. Verifica eventuale uscita dimenticata.</p></template>
   <div v-if="choices.length" class="lf-work-choice"><button v-for="id in choices" :key="id" type="button" :disabled="busy" @click="punch('in',id)">{{siteName(id)}}</button><button type="button" @click="choices=[];message=''">Annulla</button></div>
   <p v-if="message" :role="error?'alert':'status'" class="lf-work-msg" :class="{'lf-work-error':error}">{{message}}</p><p v-if="!data&&busy" role="status">Caricamento…</p><button v-if="!data&&!busy" type="button" class="lf-work-reload" @click="refresh">Aggiorna stato</button>
  </div>
 </section>
</template>
<style scoped>
.lf-work-badge{width:100%;border:1px solid #315344;border-radius:16px;background:#111d1a;color:#e7f8ee;overflow:hidden;margin-bottom:12px}.lf-work-head{display:flex;width:100%;justify-content:space-between;align-items:center;text-align:left;padding:13px 15px;background:transparent;color:inherit;border:0;cursor:pointer}.lf-work-head span:first-child{display:grid;gap:3px}.lf-work-head small,.lf-work-total small{font-size:.78rem;color:#a4bbaf}.lf-work-body{display:grid;gap:12px;padding:0 14px 14px}.lf-work-total{display:grid;gap:3px;text-align:center}.lf-work-total strong{font-size:1.9rem;font-variant-numeric:tabular-nums;letter-spacing:.04em}.lf-work-buttons,.lf-work-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lf-work-buttons button,.lf-work-choice button,.lf-work-reload{min-height:48px;border:1px solid #3a6b52;border-radius:10px;color:#f2fff7;background:#177947;font-weight:700;padding:8px}.lf-work-buttons .lf-work-out,.lf-work-choice button,.lf-work-reload{background:#26343c;border-color:#53616c}.lf-work-buttons button:disabled{opacity:.42;cursor:not-allowed}.lf-work-msg{margin:0;font-size:.85rem;color:#bddec9}.lf-work-error{color:#ffb8b8}
</style>
