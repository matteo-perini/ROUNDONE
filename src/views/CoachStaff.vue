<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import { ref,defineAsyncComponent } from 'vue'
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
const LiveCoachStaff=isOperationalMode()?defineAsyncComponent(()=>import('./LiveCoachStaff.vue')):null
import { useLabStore } from '../stores/lab'
const lab = useLabStore()
const email = ref('')
const roleEmail = ref('')
const message = ref('')
function mock() { message.value = 'Email e inviti non vengono inviati: Firebase Authentication e token monouso non sono ancora collegati.' }
</script>
<template>
 <component v-if="LiveCoachStaff" :is="LiveCoachStaff"/>
  <div v-else class="stack coach-staff-screen" style="gap:18px">
    <section class="panel"><h2>{{uiText("COACH DELLA PALESTRA")}}</h2><p class="muted">Coach e inviti della tua palestra.</p><div class="notice notice-success">Il tuo account è il coach titolare. Puoi generare inviti per collaboratori nella V1 reale.</div></section>
    <div class="grid2">
      <div class="stack">
        <section class="panel coach-staff-list">
          <h3>{{uiText("COACH PRESENTI NELLA PALESTRA")}}</h3>
          <div class="line-card staff-person"><span class="staff-name">test22</span><span class="pill staff-role">COACH</span></div>
          <div class="line-card staff-person"><span class="staff-name">test11</span><span class="pill staff-role">TITOLARE</span></div>
        </section>
        <section class="panel"><h3>{{uiText("INVITA UN COACH COLLABORATORE")}}</h3><p class="small muted">Link monouso · valido 7 giorni · solo il titolare può invitare.</p><div class="row"><input v-model="roleEmail" placeholder="email del nuovo coach" style="flex:1"/><button class="primary" @click="mock">GENERA INVITO</button></div><b class="muted small">INVITI RECENTI</b><p class="small">Nessun invito da visualizzare nella demo.</p></section>
      </div>
      <section class="panel"><h3>{{uiText("INVITA UN ATLETA")}}</h3><p class="muted small">Inviti monouso · validi 7 giorni</p><label>{{uiText("INVITO VIA EMAIL")}}</label><input v-model="email" placeholder="atleta@esempio.it"/><div class="invite-action-buttons"><button class="secondary" @click="mock">Genera link</button><button class="primary" @click="mock">Invia email</button></div><details class="staff-details"><summary>Impostazioni email avanzate</summary><p class="muted small">La configurazione email della V1 originale sarà migrata dopo la verifica del servizio inviti. Nessuna email viene inviata dalla demo.</p></details><details class="staff-details"><summary>Gestisci inviti email precedenti (0)</summary><p class="muted small">Nessun invito disponibile nei dati locali; le informazioni Firebase della palestra non vengono consultate.</p></details></section>
    </div>
    <div v-if="message" class="notice" role="status">{{message}}</div>
  </div>
</template>
