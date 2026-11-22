<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue'
import {listCommercialAudit,type CommercialAuditEntry} from '../integrations/firebase/platformAudit'
const props=defineProps<{gymNames?:Record<string,string>}>()
const rows=ref<CommercialAuditEntry[]>([]),busy=ref(false),error=ref(''),cursor=ref<string|null>(null),more=ref(false)
let live=true,seq=0
const fmt=(ms:number|null)=>ms===null?'Data non disponibile':new Date(ms).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})
const status=(v:boolean|null)=>v===null?'Non impostato':v?'Esente':'A pagamento (previsto)'
async function load(append=false){
 if(busy.value)return
 const id=++seq
 busy.value=true;error.value=''
 try{
  const result=await listCommercialAudit(append?cursor.value:null)
  if(!live||id!==seq)return
  const next=append?[...rows.value,...result.rows]:result.rows
  rows.value=Array.from(new Map(next.map(x=>[x.id,x])).values())
  cursor.value=result.cursor;more.value=result.more
 }catch(e){if(live&&id===seq)error.value=(e as Error).message||'Registro temporaneamente non disponibile.'}
 finally{if(live&&id===seq)busy.value=false}
}
onMounted(()=>{void load()})
onUnmounted(()=>{live=false;seq++})
</script>
<template>
 <section class="panel lfcc-audit" aria-label="Registro audit commerciale">
  <header class="lfcc-audit-head"><div><p class="lfcc-audit-eyebrow">SECURITY · AUDIT COMMERCIALE</p><h2>Registro delle modifiche</h2><p class="muted small">Eventi confermati dal server per le esenzioni delle palestre. Non contiene dati degli atleti.</p></div><button type="button" class="secondary" :disabled="busy" @click="load(false)">{{busy?'Verifica in corso…':'Aggiorna registro'}}</button></header>
  <p class="lfcc-audit-note">Le operazioni precedenti all'attivazione non sono ricostruibili da questo registro. I cambi di stato dei ticket e altre azioni non sono ancora inclusi.</p>
  <p v-if="error" role="alert" class="notice">{{error}}</p>
  <p v-if="!rows.length&&!busy&&!error" class="muted small">Nessuna modifica commerciale registrata dall'attivazione dell'audit.</p>
  <div class="lfcc-audit-list">
   <article v-for="e in rows" :key="e.id" class="lfcc-audit-event">
    <div><strong>{{props.gymNames?.[e.gymId]||e.gymId}}</strong><small v-if="props.gymNames?.[e.gymId]">{{e.gymId}}</small><small>{{fmt(e.atMillis)}}</small></div>
    <div class="lfcc-audit-change"><span>{{status(e.beforeExempt)}}</span><span aria-hidden="true">→</span><strong>{{status(e.afterExempt)}}</strong></div>
    <small class="muted">Operazione confermata · {{e.id}}</small>
   </article>
  </div>
  <button v-if="more" class="secondary" type="button" :disabled="busy" @click="load(true)">{{busy?'Caricamento…':'Mostra eventi precedenti'}}</button>
  <p v-if="busy" role="status" class="muted small">Lettura server del registro in corso…</p>
 </section>
</template>
<style scoped>
.lfcc-audit{display:grid;gap:14px;max-width:100%;min-width:0;border-radius:10px}
.lfcc-audit-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
.lfcc-audit-head>div{flex:1 1 300px;min-width:0}.lfcc-audit-head h2{margin:4px 0 6px;font-size:clamp(20px,2.6vw,27px)}.lfcc-audit-head p{margin:0}
.lfcc-audit-eyebrow{font-size:10px!important;font-weight:850;letter-spacing:.11em;color:var(--mint)!important}
.lfcc-audit-note{margin:0;padding:11px 12px;border-left:3px solid var(--mint);background:var(--card2);border-radius:7px;font-size:12px;line-height:1.5;color:var(--muted)}
.lfcc-audit-list{display:grid;gap:8px}
.lfcc-audit-event{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:5px 12px;padding:12px 14px;background:var(--card2);border:1px solid var(--border);border-radius:8px;min-width:0}
.lfcc-audit-event>div:first-child{display:grid;gap:5px;min-width:0}
.lfcc-audit-event strong{overflow-wrap:anywhere;font-size:13px}.lfcc-audit-event small{font-size:11px;color:var(--muted)}
.lfcc-audit-event>small{grid-column:1/-1;overflow-wrap:anywhere}
.lfcc-audit-change{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:7px;text-align:right;font-size:11px}
.lfcc-audit-change strong{font-size:11px;color:var(--mint)}
@media(max-width:680px){.lfcc-audit-event{grid-template-columns:1fr}.lfcc-audit-change{justify-content:flex-start}.lfcc-audit-head>button{width:100%}}
</style>
