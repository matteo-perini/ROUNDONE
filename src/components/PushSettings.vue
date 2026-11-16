<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {activatePush,deactivatePush,readPushSettings,savePushSettings,defaultPushPrefs,reminderChoices,connectPushSession,pushSupported,pushUnavailableMessage,type PushPreferences} from '../integrations/firebase/pushNotifications'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {useRouter} from 'vue-router'
const router=useRouter(),active=ref(false),loaded=ref(false),busy=ref(false),message=ref(''),prefs=ref(defaultPushPrefs()),isError=ref(false),supported=ref(false)
const copy=(v:PushPreferences):PushPreferences=>({...v,leads:[...v.leads]})
let saved=defaultPushPrefs()
function agenda(){void router.push(stagingSession.value?.role==='atleta'?'/prenotazioni':'/coach/prenotazioni')}
function accept(r:{active:boolean;prefs:PushPreferences}){active.value=r.active;prefs.value=copy(r.prefs);saved=copy(r.prefs)}
function error(e:unknown){isError.value=true;message.value=e instanceof Error?e.message:'Operazione non riuscita. Riprova.'}
async function load(){busy.value=true;isError.value=false;message.value='';try{supported.value=await pushSupported();accept(await readPushSettings());loaded.value=true}catch(e){error(e)}finally{busy.value=false}}
onMounted(load)
async function save(){if(busy.value||!loaded.value)return;busy.value=true;isError.value=false;message.value='';try{accept(await savePushSettings(copy(prefs.value)));message.value='Preferenze salvate automaticamente.'}catch(e){prefs.value=copy(saved);error(e)}finally{busy.value=false}}
async function act(which:'enable'|'disable'){if(busy.value||!loaded.value)return;busy.value=true;isError.value=false;message.value='';try{if(which==='enable'){accept(await activatePush(copy(prefs.value)));void connectPushSession(stagingSession.value?.uid||null,agenda,false).catch(()=>{});message.value='Notifiche attive su questo dispositivo.'}else{await deactivatePush();active.value=false;message.value='Notifiche disattivate su questo dispositivo. Le preferenze restano salvate.'}}catch(e){error(e)}finally{busy.value=false}}
</script>
<template>
 <section class="card lf-push-settings" aria-label="Notifiche Agenda">
  <h3>Notifiche Agenda</h3><p class="muted small">Attiva le notifiche sui dispositivi che utilizzi.</p>
  <p v-if="loaded" class="small" role="status">{{active?'Notifiche attive':'Notifiche disattivate'}}</p>
  <template v-if="loaded">
   <div class="lf-push-choices"><label><input v-model="prefs.booked" type="checkbox" :disabled="busy" @change="save"> Nuovo appuntamento</label>
   <label><input v-model="prefs.cancelled" type="checkbox" :disabled="busy" @change="save"> Annullamento o spostamento</label></div>
   <h4>Promemoria prima della lezione</h4><div class="lf-push-choices"><label v-for="choice in reminderChoices" :key="choice.value"><input v-model="prefs.leads" type="checkbox" :value="choice.value" :disabled="busy" @change="save"> {{choice.label}}</label></div>
   <p v-if="!supported" class="small muted">{{pushUnavailableMessage()}}</p>
   <button v-if="supported&&!active" type="button" class="primary wide" :disabled="busy" @click="act('enable')">Attiva notifiche su questo dispositivo</button>
   <button v-else-if="active" type="button" class="secondary wide" :disabled="busy" @click="act('disable')">Disattiva su questo dispositivo</button>
  </template>
  <button v-else-if="!busy" type="button" class="secondary wide" @click="load">Riprova</button>
  <p v-if="busy&&!loaded" v-lf-quiet-loading class="lf-quiet-status" role="status">Caricamento preferenze…</p><p v-else-if="busy" role="status" class="small muted">Salvataggio o verifica…</p>
  <p v-if="message" :role="isError?'alert':'status'" class="notice">{{message}}</p>
 </section>
</template>
<style scoped>
.lf-push-settings{display:grid;gap:12px;padding:14px}.lf-push-settings h3,.lf-push-settings h4,.lf-push-settings p{margin:0}.lf-push-choices{display:grid;gap:6px;grid-template-columns:repeat(2,minmax(0,1fr))}.lf-push-choices label{display:flex;gap:8px;align-items:center;padding:8px 0;min-height:40px;margin:0;cursor:pointer}.lf-push-choices input{flex:0 0 auto;width:20px;height:20px;min-height:0;accent-color:#168b50}@media(max-width:350px){.lf-push-choices{grid-template-columns:1fr}}
</style>
