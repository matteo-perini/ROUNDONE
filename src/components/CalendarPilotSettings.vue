<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue'
import {Capacitor} from '@capacitor/core'
import {AppLauncher} from '@capacitor/app-launcher'
import {calendarStatus,calendarStart,calendarConfirm,calendarDisconnect,type CalendarState} from '../integrations/firebase/calendarPilot'
const state=ref<CalendarState>('disconnected'),busy=ref(false),loaded=ref(false),message=ref(''),url=ref(''),code=ref('')
let alive=true
async function act(action:'status'|'start'|'confirm'|'disconnect'){if(busy.value)return;busy.value=true;message.value='';try{if(action==='status'){const r=await calendarStatus();if(alive){state.value=r.state;loaded.value=true}}else if(action==='start'){const r=await calendarStart();const u=new URL(r.url);if(u.origin!=='https://accounts.google.com'||u.pathname!=='/o/oauth2/v2/auth')throw new Error('Indirizzo Google non valido.');if(alive){url.value=u.href;state.value='pending';message.value='Apri Google e completa il consenso, poi torna qui.'}}else if(action==='confirm'){const r=await calendarConfirm(code.value);if(alive){state.value=r.state;code.value='';url.value='';message.value='Calendario LionFit creato. Le nuove prenotazioni potranno essere sincronizzate automaticamente.'}}else{if(!window.confirm('Scollegare Google? Il calendario già creato non verrà cancellato.'))return;const r=await calendarDisconnect();if(alive){state.value=r.state;url.value='';code.value='';message.value=r.revoked?'Collegamento rimosso.':'Collegamento rimosso in LionFit. Controlla anche le autorizzazioni nel tuo Account Google.'}}}catch(e){if(alive){message.value=e instanceof Error?e.message:'Operazione non riuscita.';if(action==='confirm'){try{state.value=(await calendarStatus()).state}catch{/* keep current state */}}}}finally{if(alive)busy.value=false}}
async function openNative(){try{const result=await AppLauncher.openUrl({url:url.value});if(!result.completed)throw new Error('Browser non disponibile.')}catch{message.value='Impossibile aprire Google. Prova dal PC.'}}
const native=Capacitor.isNativePlatform()
onMounted(()=>void act('status'));onUnmounted(()=>{alive=false;code.value='';url.value=''})
</script>
<template>
 <section class="card" style="display:grid;gap:12px;padding:14px">
 <h3>Google Calendar</h3><p class="muted small">Collegamento facoltativo. Crea un calendario LionFit senza leggere gli altri calendari. Sincronizza le nuove prenotazioni e gli annullamenti. Gli appuntamenti precedenti non vengono importati.</p>
 <template v-if="loaded">
 <p role="status">{{state==='connected'?'Collegato':state==='review'?'Verifica necessaria':state==='authorized'?'In attesa di conferma':state==='pending'?'Autorizzazione in corso':'Non collegato'}}</p>
 <button v-if="state==='disconnected'||state==='pending'" class="primary wide" :disabled="busy" @click="act('start')">{{state==='pending'?'Genera un nuovo collegamento':'Collega Google Calendar'}}</button>
 <template v-if="url&&state==='pending'"><button v-if="native" class="secondary wide" :disabled="busy" @click="openNative">Apri Google nel browser</button><a v-else class="secondary wide" :href="url" target="_blank" rel="noopener noreferrer">Apri Google nel browser</a></template>
 <template v-if="state==='pending'||state==='authorized'"><label>Codice di conferma mostrato da Google dopo il consenso<input v-model="code" type="text" maxlength="16" autocomplete="off" spellcheck="false" :disabled="busy"/></label><button class="primary wide" :disabled="busy||code.trim().length!==16" @click="act('confirm')">Conferma collegamento</button></template>
 <button v-if="state!=='disconnected'" class="secondary wide" :disabled="busy" @click="act('disconnect')">{{state==='connected'?'Scollega Google Calendar':'Annulla collegamento'}}</button>
 </template>
 <button class="secondary wide" :disabled="busy" @click="act('status')">Aggiorna stato</button><p v-if="message" role="status" class="notice">{{message}}</p>
 </section>
</template>
