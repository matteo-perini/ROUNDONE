<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {activatePush,deactivatePush,readPushSettings,savePushSettings,testPush,defaultPushPrefs,reminderChoices,connectPushSession} from '../integrations/firebase/pushNotifications'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {useRouter} from 'vue-router'
const router=useRouter(),active=ref(false),loaded=ref(false),busy=ref(false),message=ref(''),prefs=ref(defaultPushPrefs())
function agenda(){void router.push(stagingSession.value?.role==='atleta'?'/prenotazioni':'/coach/prenotazioni')}
onMounted(async()=>{busy.value=true;try{const r=await readPushSettings();active.value=r.active;prefs.value=r.prefs;loaded.value=true}catch{message.value='Impossibile verificare le notifiche. Riprova quando il servizio è configurato.'}finally{busy.value=false}})
async function act(which:'enable'|'save'|'disable'|'test'){if(busy.value||!loaded.value)return;busy.value=true;message.value='';try{if(which==='enable'){const r=await activatePush(prefs.value);active.value=r.active;prefs.value=r.prefs;void connectPushSession(stagingSession.value?.uid||null,agenda).catch(()=>{});message.value='Dispositivo registrato. Invia una notifica di prova.'}else if(which==='save'){const r=await savePushSettings(prefs.value);prefs.value=r.prefs;message.value='Preferenze salvate.'}else if(which==='disable'){await deactivatePush();active.value=false;message.value='Notifiche disattivate.'}else{await testPush();message.value='Notifica accettata da Firebase; controlla se arriva sul dispositivo.'}}catch(e){message.value=e instanceof Error?e.message:'Operazione non riuscita.'}finally{busy.value=false}}
</script>
<template>
 <section class="card" style="display:grid;gap:12px;padding:14px">
  <h3>Notifiche Agenda</h3><p class="muted small">Preferenze di questo dispositivo. Gli avvisi non mostrano nomi o informazioni personali sullo schermo bloccato.</p>
  <p class="small" role="status">{{active?'Registrato':'Non attivo'}}</p>
  <template v-if="loaded">
   <label><input v-model="prefs.booked" type="checkbox" :disabled="busy"> Nuovo appuntamento</label>
   <label><input v-model="prefs.cancelled" type="checkbox" :disabled="busy"> Annullamento o spostamento</label>
   <h4>Promemoria prima della lezione</h4><label v-for="choice in reminderChoices" :key="choice.value"><input v-model="prefs.leads" type="checkbox" :value="choice.value" :disabled="busy"> {{choice.label}}</label>
   <button v-if="!active" class="primary wide" :disabled="busy" @click="act('enable')">Attiva notifiche su questo dispositivo</button>
   <template v-else><button class="primary wide" :disabled="busy" @click="act('save')">Salva preferenze</button><button class="secondary wide" :disabled="busy" @click="act('enable')">Aggiorna registrazione dispositivo</button><button class="secondary wide" :disabled="busy" @click="act('test')">Invia notifica di prova</button><button class="secondary wide" :disabled="busy" @click="act('disable')">Disattiva su questo dispositivo</button></template>
  </template>
  <p v-if="message" role="status" class="notice">{{message}}</p>
 </section>
</template>
