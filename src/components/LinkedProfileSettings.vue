<script setup lang="ts">
import {computed,ref,onUnmounted} from 'vue'
import { linkedPair, linkedBusy, linkAthleteAccount,clearLinkedProfiles,requestProfileSwitch,linkedNotice,linkedDeviceSupported } from '../integrations/firebase/linkedProfiles'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {sideOf} from '../features/auth/linkedProfileModel'
const side=computed(()=>sideOf(linkedPair.value,stagingSession.value))
const email=ref(''),pass=ref(''),consent=ref(false),error=ref(''),confirmRemove=ref(false)
async function connect(){if(!consent.value||linkedBusy.value)return;error.value='';try{await linkAthleteAccount(email.value,pass.value);email.value='';consent.value=false}catch(e){error.value=e instanceof Error?e.message:'Collegamento non riuscito.'}finally{pass.value=''}}
async function remove(){error.value='';try{await clearLinkedProfiles();confirmRemove.value=false}catch(e){error.value=e instanceof Error?e.message:'Scollegamento non riuscito.'}}
onUnmounted(()=>{pass.value='';email.value=''})
</script>
<template>
 <div class="lf-linked-settings" :aria-busy="linkedBusy">
  <p v-if="!linkedDeviceSupported()" class="notice">Il cambio rapido richiede un browser aggiornato. Puoi comunque scollegare i profili.</p>
  <template v-if="side">
   <p><strong>Due profili collegati</strong> · Attivo: {{side==='coach'?'Coach':'Atleta'}}</p>
   <button type="button" class="primary wide" :disabled="linkedBusy||!linkedDeviceSupported()" @click="requestProfileSwitch">Passa al profilo {{side==='coach'?'Atleta':'Coach'}}</button>
   <button v-if="!confirmRemove" type="button" class="secondary wide" :disabled="linkedBusy" @click="confirmRemove=true">Disattiva e scollega profili</button>
   <template v-else><p>Rimuovere le sessioni collegate da questo dispositivo? Gli account e i dati online non saranno cancellati.</p><button type="button" class="secondary wide" :disabled="linkedBusy" @click="remove">Conferma scollegamento</button><button type="button" class="bare" :disabled="linkedBusy" @click="confirmRemove=false">Annulla</button></template>
  </template>
  <form v-else-if="stagingSession?.role==='titolare'||stagingSession?.role==='collaboratore'" class="lf-linked-form" @submit.prevent="connect">
   <p class="muted small">Collega il tuo account atleta già esistente nella stessa palestra. Fallo solo su un tuo dispositivo personale protetto.</p>
   <label>Email profilo atleta<input v-model.trim="email" type="email" autocomplete="username" required :disabled="linkedBusy"/></label>
   <label>Password profilo atleta<input v-model="pass" type="password" autocomplete="current-password" required :disabled="linkedBusy"/></label>
   <label class="lf-linked-consent"><input v-model="consent" type="checkbox" :disabled="linkedBusy"/> Ricorda entrambi gli accessi su questo dispositivo.</label>
   <button class="primary wide" type="submit" :disabled="!consent||linkedBusy||!linkedDeviceSupported()">{{linkedBusy?'Collegamento…':'Attiva cambio rapido'}}</button>
  </form>
  <p v-if="error||linkedNotice" class="notice" role="alert">{{error||linkedNotice}}</p>
 </div>
</template>
<style scoped>
.lf-linked-settings{padding:14px;display:grid;gap:10px;border:1px solid var(--border,#344151);border-radius:12px;margin:8px 0;min-width:0}.lf-linked-settings p{margin:0;line-height:1.5}.lf-linked-form{display:grid;gap:12px}.lf-linked-form label{display:grid;gap:5px}.lf-linked-form input:not([type=checkbox]){width:100%;min-width:0;box-sizing:border-box}.lf-linked-form .lf-linked-consent{display:flex;align-items:flex-start;gap:9px;line-height:1.45}.lf-linked-consent input{width:18px;height:18px;flex:none}
</style>
