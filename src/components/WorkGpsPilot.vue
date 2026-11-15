<script setup lang="ts">
import {ref,computed,onUnmounted} from 'vue'
import {readStagingSession,stagingSession} from '../integrations/firebase/stagingSession'
import {Capacitor} from '@capacitor/core'
import {isLiveMode} from '../integrations/firebase/stagingConfig'
import {pilotAvailable,pilotMobileDevice,validWorkPoint,checkWorkArea,type WorkFix} from '../features/work/gpsPilot'
const props=defineProps<{gymId:string}>()
const lat=ref(''),lng=ref(''),radius=ref(80),busy=ref(false),message=ref('')
const result=ref<ReturnType<typeof checkWorkArea>|null>(null)
const center=computed(()=>({latitude:Number(lat.value.replace(',','.')),longitude:Number(lng.value.replace(',','.'))}))
const validCenter=computed(()=>lat.value.trim()!==''&&lng.value.trim()!==''&&validWorkPoint(center.value))
let alive=true
onUnmounted(()=>{alive=false;result.value=null;lat.value='';lng.value=''})
function getFix():Promise<WorkFix>{return new Promise((resolve,reject)=>{if(!window.isSecureContext||!navigator.geolocation){reject(new Error('GPS non disponibile: apri LionFit in HTTPS sul telefono.'));return}navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),e=>reject(new Error(e.code===1?'Permesso posizione negato.':e.code===3?'Tempo GPS scaduto: riprova.':'Posizione non disponibile.')),{enableHighAccuracy:true,maximumAge:0,timeout:20000})})}
async function measure(setCenter:boolean){if(busy.value||(!setCenter&&!validCenter.value))return;busy.value=true;result.value=null;message.value='Verifica accesso in corso…';try{const s=await readStagingSession();if(!alive||!isLiveMode()||!pilotMobileDevice(navigator.userAgent,navigator.maxTouchPoints,Capacitor.isNativePlatform()&&['android','ios'].includes(Capacitor.getPlatform()))||!pilotAvailable(s)||s.gymId!==props.gymId||stagingSession.value?.uid!==s.uid)throw new Error('Collaudo non autorizzato.');message.value='GPS attivo: acquisizione di una sola posizione…';const fix=await getFix();if(!alive||stagingSession.value?.uid!==s.uid||stagingSession.value?.gymId!==s.gymId||!pilotAvailable(stagingSession.value))return;if(setCenter){if(!validWorkPoint(fix)||!Number.isFinite(fix.accuracy)||fix.accuracy<=0||fix.accuracy>25){message.value='Precisione insufficiente per impostare il centro (serve al massimo 25 m). Riprova all’aperto.';return}lat.value=fix.latitude.toFixed(6);lng.value=fix.longitude.toFixed(6);message.value=`Centro sede di prova impostato in memoria (precisione ±${Math.round(fix.accuracy)} m).`;return}result.value=checkWorkArea(center.value,fix,Number(radius.value));message.value='Misurazione di prova completata. Nessuna timbratura registrata.'}catch(e){if(alive)message.value=e instanceof Error?e.message:'Verifica non riuscita.'}finally{if(alive)busy.value=false}}
</script>
<template>
 <section class="lf-work-pilot" aria-label="LionFit Work collaudo GPS">
  <h3>LionFit Work · Collaudo GPS</h3><p class="muted small">Test non valido come presenza lavorativa. La posizione viene richiesta soltanto al tocco; le coordinate della prova restano in memoria sul dispositivo, non vengono inviate a Firebase e spariscono chiudendo la schermata. Nessun controllo continuo.</p>
  <button type="button" class="secondary wide" :disabled="busy" @click="measure(true)">Usa la posizione attuale come centro sede di prova</button>
  <div class="lf-work-coords"><label>Latitudine sede<input v-model="lat" inputmode="decimal" type="text" :disabled="busy" @input="result=null"/></label><label>Longitudine sede<input v-model="lng" inputmode="decimal" type="text" :disabled="busy" @input="result=null"/></label></div>
  <label>Raggio di prova (m)<input v-model.number="radius" type="number" min="20" max="300" step="10" :disabled="busy" @input="result=null"/></label>
  <button type="button" class="primary wide" :disabled="busy||!validCenter||!Number.isFinite(radius)||radius<20||radius>300" @click="measure(false)">{{busy?'Verifica in corso…':'Prova posizione GPS'}}</button>
  <div v-if="result" class="lf-work-result" role="status"><strong>{{result.status==='inside'?'Dentro la zona':result.status==='outside'?'Fuori dalla zona':'Posizione incerta · riprova'}}</strong><span>Distanza stimata: {{result.distance}} m · precisione: ±{{result.accuracy}} m</span></div><p v-if="message" class="muted small" aria-live="polite">{{message}}</p>
 </section>
</template>
<style scoped>
.lf-work-pilot{display:grid;gap:12px;padding:14px;border-top:1px solid var(--border);min-width:0}.lf-work-pilot h3,.lf-work-pilot p{margin:0}.lf-work-pilot label{display:grid;gap:5px;min-width:0}.lf-work-pilot input{width:100%;min-width:0;box-sizing:border-box}.lf-work-coords{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lf-work-result{border:1px solid var(--border);border-radius:10px;padding:12px;display:grid;gap:5px}.lf-work-result span{font-size:.9em}
</style>
