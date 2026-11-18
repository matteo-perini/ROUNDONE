<script setup lang="ts">
/** R16A: NON confondere la risposta di una query con la disponibilità globale di un servizio. */
import {computed} from 'vue'
type State='verified'|'failed'|'unknown'
const props=defineProps<{
 accessVerifiedAt:number|null
 firestoreVerifiedAt:number|null
 firestoreError:string
 loading:boolean
 gymCount:number|null
 ticketCount:number|null
}>()
const emit=defineEmits<{(e:'refresh'):void}>()
const time=(v:number|null)=>v?new Date(v).toLocaleString('it-IT'):'Mai verificato'
const checks=computed<{name:string;state:State;source:string;explanation:string;stamp?:number|null}[]>(()=>[
 {name:'Accesso Super Admin',state:props.accessVerifiedAt?'verified':'unknown',source:'verifyPlatformAccess',explanation:'Autorizzazione all’area controllata per questa sessione; non prova uptime di Firebase Auth.',stamp:props.accessVerifiedAt},
 {name:'Firestore · lettura piattaforma',state:props.firestoreError?'failed':props.firestoreVerifiedAt?'verified':'unknown',source:'platformCounts · getCountFromServer',explanation:props.firestoreError?'La lettura più recente non è riuscita. Verifica i permessi o la connettività.':props.firestoreVerifiedAt?`Query server riuscita: ${props.gymCount??'—'} palestre, ${props.ticketCount??'—'} ticket aperti/in lavorazione. Non misura la salute globale di Firestore.`:'Non è ancora disponibile una risposta server verificata.',stamp:props.firestoreVerifiedAt},
 {name:'Cloud Functions e scheduler',state:'unknown',source:'Cloud Monitoring / backend da integrare',explanation:'Non sono disponibili qui metriche affidabili di invocazioni, errori, latenza o job pianificati.'},
 {name:'Email Resend / inviti',state:'unknown',source:'Resend webhook e log server da integrare',explanation:'Invio e consegna, rimbalzi, limiti e code non sono monitorati da questa schermata.'},
 {name:'Notifiche push',state:'unknown',source:'FCM / eventi server da integrare',explanation:'Una preferenza push attiva non dimostra che la notifica sia stata consegnata.'},
 {name:'Stripe e webhook di fatturazione',state:'unknown',source:'Stripe LIVE non collegato',explanation:'Solo il sandbox è eventualmente disponibile: non è una conferma di pagamenti reali.'},
 {name:'Storage e sincronizzazioni',state:'unknown',source:'Metriche backend da integrare',explanation:'Errori upload e sincronizzazione calendari non sono ancora aggregati.'},
 {name:'Costi e budget cloud',state:'unknown',source:'Cloud Billing / report Resend da integrare',explanation:'Nessun totale di spesa o consumo viene stimato senza una fonte autorizzata.'}
])
const verified=computed(()=>checks.value.filter(x=>x.state==='verified').length)
const failed=computed(()=>checks.value.filter(x=>x.state==='failed').length)
</script>
<template>
 <section class="lfcc-services" aria-label="Stato dei servizi della piattaforma">
  <div class="lfcc-service-hero"><div><p class="lfcc-overline">OPERATIONS · SERVIZI</p><h2>Stato servizi</h2><p>Controlli verificati, fonti mancanti e prossimi strumenti di monitoraggio. Un indicatore verde significa soltanto che <strong>quella verifica</strong> ha risposto, non che tutto il servizio sia online.</p></div><button type="button" class="secondary" :disabled="loading" @click="emit('refresh')">{{loading?'Verifica in corso…':'Aggiorna letture'}}</button></div>
  <div class="lfcc-stats"><div><strong>{{verified}}</strong><small>Verifiche riuscite</small></div><div><strong>{{failed}}</strong><small>Verifiche fallite</small></div><div><strong>{{checks.length-verified-failed}}</strong><small>Non monitorati</small></div></div>
  <div class="lfcc-service-list">
   <article v-for="item in checks" :key="item.name" class="lfcc-service-row"><div class="lfcc-service-main"><span class="lfcc-dot" :class="item.state" aria-hidden="true"></span><div><h3>{{item.name}}</h3><p>{{item.explanation}}</p><small>Fonte: {{item.source}}<template v-if="item.stamp"> · Ultimo esito: {{time(item.stamp)}}</template></small></div></div><span class="lfcc-state" :class="item.state">{{item.state==='verified'?'Verifica riuscita':item.state==='failed'?'Lettura fallita':'Non monitorato'}}</span></article>
  </div>
  <div class="lfcc-service-note"><strong>Prossima fase R16C</strong><p>Per avere stato reale di Cloud Functions, Resend, Stripe, push, costi e uptime serviranno monitoraggi backend autenticati, log aggregati, soglie e avvisi. Non useremo richieste client con chiavi segrete né risultati simulati.</p></div>
 </section>
</template>
<style scoped>
.lfcc-services{min-width:0;display:grid;gap:14px}.lfcc-service-hero{padding:20px;border:1px solid rgba(65,221,151,.42);background:linear-gradient(100deg,rgba(19,89,67,.3),transparent),var(--card);border-radius:17px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.lfcc-overline{font-size:10px;letter-spacing:.12em;font-weight:900;color:var(--mint);margin:0 0 8px}.lfcc-service-hero h2{font-size:clamp(21px,3vw,30px);margin:0 0 8px}.lfcc-service-hero p:not(.lfcc-overline){max-width:650px;margin:0;color:var(--muted);font-size:12px;line-height:1.5}.lfcc-service-hero p strong{color:var(--text)}.lfcc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.lfcc-stats>div{border:1px solid var(--border);background:var(--card);padding:15px;border-radius:13px;display:grid;gap:5px}.lfcc-stats strong{font-size:27px;line-height:1.1}.lfcc-stats small{font-size:10px;color:var(--muted)}.lfcc-service-list{display:grid;gap:8px}.lfcc-service-row{padding:15px 16px;display:flex;justify-content:space-between;align-items:start;gap:14px;border:1px solid var(--border);background:var(--card);border-radius:13px;min-width:0}.lfcc-service-main{display:flex;align-items:start;gap:11px;min-width:0;flex:1}.lfcc-service-main>div{min-width:0}.lfcc-service-main h3{font-size:14px;margin:0 0 7px}.lfcc-service-main p{margin:0 0 8px;color:var(--muted);font-size:11px;line-height:1.45}.lfcc-service-main small{color:var(--muted);font-size:10px;line-height:1.4}.lfcc-dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:4px;background:#8b929e}.lfcc-dot.verified{background:#48de92}.lfcc-dot.failed{background:#ee786c}.lfcc-state{flex:none;white-space:nowrap;border-radius:8px;padding:6px 8px;border:1px solid var(--border);font-size:10px;font-weight:750;color:var(--muted)}.lfcc-state.verified{color:#55d9a0;border-color:rgba(52,175,112,.5)}.lfcc-state.failed{color:#f58c85;border-color:rgba(210,71,71,.5)}.lfcc-service-note{border:1px solid var(--border);border-radius:14px;background:var(--card2);padding:16px}.lfcc-service-note strong{font-size:13px}.lfcc-service-note p{color:var(--muted);font-size:12px;line-height:1.5;margin:8px 0 0}
@media(max-width:640px){.lfcc-service-row{flex-wrap:wrap;padding:12px}.lfcc-state{margin-left:21px}.lfcc-stats>div{padding:11px}.lfcc-stats strong{font-size:22px}}
</style>
