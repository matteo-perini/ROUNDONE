<script setup lang="ts">
/** R16A: visualizzazione di KPI già disponibili, senza simulare incassi o salute cloud. */
import {computed} from 'vue'
const props=defineProps<{
 counts:{gyms:number;tickets:number}|null
 totals:{exempt:number;subscription:number;unconfigured:number;unavailable:number}
 loaded:number
 more:boolean
 loading:boolean
 lastVerifiedAt:number|null
}>()
const emit=defineEmits<{(e:'navigate',value:'gyms'|'tickets'|'subscriptions'|'services'):void;(e:'refresh'):void}>()
const sourceDate=computed(()=>props.lastVerifiedAt?new Date(props.lastVerifiedAt).toLocaleString('it-IT'):'Lettura non ancora verificata')
const commercialValue=(n:number)=>(props.loaded===0&&props.counts===null?'—':n)
const cards=computed(()=>[
 {label:'Palestre registrate',value:props.counts?.gyms??'—',detail:'Totale server · Firestore',key:'gyms' as const},
 {label:'Ticket aperti / in corso',value:props.counts?.tickets??'—',detail:'Totale server · Firestore',key:'tickets' as const},
 {label:'Palestre esenti',value:commercialValue(props.totals.exempt),detail:`Su ${props.loaded} palestre caricate`,key:'gyms' as const},
 {label:'Destinate ad abbonamento',value:commercialValue(props.totals.subscription),detail:`Preferenza commerciale · ${props.loaded} caricate`,key:'subscriptions' as const},
 {label:'Da configurare',value:commercialValue(props.totals.unconfigured),detail:'Solo tra le palestre caricate',key:'gyms' as const},
 {label:'Letture da verificare',value:commercialValue(props.totals.unavailable),detail:'Stato commerciale non leggibile',key:'gyms' as const}
])
</script>
<template>
 <section class="lfcc-overview" aria-label="Panoramica esecutiva LionFit">
  <div class="lfcc-intro">
   <div><p class="lfcc-eyebrow">DASHBOARD EXECUTIVE</p><h2>La piattaforma sotto controllo.</h2><p>Numeri verificati, priorità operative e strumenti commerciali in un'unica schermata.</p></div>
   <div class="lfcc-source"><strong>Fonte: Firestore</strong><small>{{loading?'Aggiornamento in corso…':sourceDate}}</small><button type="button" class="lfcc-refresh" :disabled="loading" @click="emit('refresh')">{{loading?'Verifica in corso…':'Aggiorna dati'}}</button></div>
  </div>
  <div class="lfcc-metrics">
   <button v-for="card in cards" :key="card.label" class="lfcc-metric" type="button" @click="emit('navigate',card.key)"><span>{{card.label}}</span><strong>{{card.value}}</strong><small>{{card.detail}}</small></button>
  </div>
  <div class="lfcc-insights">
   <article class="lfcc-callout"><div class="lfcc-callout-head"><span>RICAVI E ABBONAMENTI</span><span class="lfcc-unknown">Fonte non collegata</span></div><h3>Incassi reali: —</h3><p>Le palestre segnate «a pagamento» sono una preferenza commerciale, non un pagamento Stripe verificato. MRR, rinnovi e prove scadute compariranno solo dopo l'integrazione billing validata.</p><button type="button" @click="emit('navigate','subscriptions')">Gestione abbonamenti →</button></article>
   <article class="lfcc-callout lfcc-tech"><div class="lfcc-callout-head"><span>AFFIDABILITÀ</span><span class="lfcc-unknown">Copertura parziale</span></div><h3>Stato dei servizi</h3><p>Accesso e letture Firestore si possono verificare ora. Uptime di Functions, Resend, push, webhooks e costi cloud richiedono metriche backend affidabili.</p><button type="button" @click="emit('navigate','services')">Apri Stato servizi →</button></article>
  </div>
  <p class="lfcc-footnote" role="status">Palestre caricate: <strong>{{loaded}}</strong><span v-if="counts"> su {{counts.gyms}} registrate</span><span v-if="more"> · <strong>elenco incompleto:</strong> altre pagine disponibili nel registro</span>. I conteggi commerciali non rappresentano il totale della piattaforma quando la lista è parziale.</p>
 </section>
</template>
<style scoped>
.lfcc-overview{display:grid;gap:18px;min-width:0}.lfcc-intro{padding:21px 22px;display:flex;gap:15px;justify-content:space-between;align-items:center;flex-wrap:wrap;border:1px solid rgba(50,209,143,.4);border-radius:18px;background:linear-gradient(110deg,rgba(12,74,54,.4),rgba(18,27,43,.28)),var(--card);min-width:0}.lfcc-eyebrow{color:#57de9f;letter-spacing:.13em;font-size:10px;font-weight:900;margin:0 0 8px}.lfcc-intro h2{font-size:clamp(20px,3vw,31px);line-height:1.2;margin:0 0 6px;overflow-wrap:anywhere}.lfcc-intro p:not(.lfcc-eyebrow){font-size:12px;line-height:1.5;color:var(--muted);margin:0;max-width:500px}.lfcc-source{display:grid;gap:4px;border:1px solid var(--border);background:var(--card2);padding:11px 14px;border-radius:12px;font-size:11px}.lfcc-source small{color:var(--muted)}.lfcc-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.lfcc-metric{min-width:0;border:1px solid var(--border);background:var(--card);border-radius:14px;padding:18px 15px;display:grid;gap:9px;text-align:left;color:var(--text);font:inherit;cursor:pointer;transition:border-color .3s ease,transform .3s ease}.lfcc-metric>span{font-size:11px;font-weight:800;line-height:1.3}.lfcc-metric strong{font-size:clamp(26px,3vw,36px);font-weight:900;line-height:1.05;color:var(--text)}.lfcc-metric small{color:var(--muted);font-size:10px;line-height:1.4}.lfcc-metric:hover,.lfcc-metric:focus-visible{border-color:#3bd895}.lfcc-insights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.lfcc-callout{min-width:0;border:1px solid var(--border);border-radius:15px;padding:17px;background:var(--card);display:grid;gap:10px}.lfcc-callout-head{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center}.lfcc-callout-head>span:first-child{font-size:10px;font-weight:850;color:var(--mint);letter-spacing:.07em}.lfcc-unknown{font-size:10px;color:var(--muted);border:1px solid var(--border);border-radius:25px;padding:4px 7px}.lfcc-callout h3{margin:2px 0 0;font-size:18px}.lfcc-callout p{color:var(--muted);font-size:12px;line-height:1.5;margin:0}.lfcc-callout button{justify-self:start;border:0;background:none;padding:6px 0;color:var(--mint);font-weight:850;cursor:pointer}.lfcc-footnote{color:var(--muted);font-size:11px;line-height:1.5;margin:0}.lfcc-footnote strong{color:var(--text)}
@media(max-width:720px){.lfcc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.lfcc-insights{grid-template-columns:1fr}.lfcc-intro{padding:17px}.lfcc-metric{padding:14px 12px}.lfcc-metric strong{font-size:27px}}
@media(max-width:370px){.lfcc-metrics{grid-template-columns:1fr 1fr}.lfcc-metric>span{font-size:10px}.lfcc-source{width:100%}}
@media(prefers-reduced-motion:reduce){.lfcc-metric{transition:none}}
.lfcc-refresh{padding:8px 10px;margin-top:3px;background:transparent;border:1px solid var(--border);border-radius:7px;color:var(--text);font-size:11px;font-weight:700;cursor:pointer}
.lfcc-refresh:hover,.lfcc-refresh:focus-visible{border-color:var(--mint)}
.lfcc-refresh:disabled{cursor:wait;opacity:.65}
</style>
