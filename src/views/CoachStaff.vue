<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import { ref,defineAsyncComponent } from 'vue'
import {isOperationalMode} from '../integrations/firebase/stagingConfig'
const LiveCoachStaff=isOperationalMode()?defineAsyncComponent(()=>import('./LiveCoachStaff.vue')):null
import InviteTeamHub from '../components/InviteTeamHub.vue'
const email = ref('')
const roleEmail = ref('')
const message = ref('')
function mock() { message.value = 'Email e inviti non vengono inviati: Firebase Authentication e token monouso non sono ancora collegati.' }
</script>
<template>
 <component v-if="LiveCoachStaff" :is="LiveCoachStaff"/>
 <InviteTeamHub v-else :owner="true" :busy="false" :pending-count="0" :team-count="2">
  <template #athlete><h3>{{uiText('INVITA UN ATLETA')}}</h3><p class="muted small">{{uiText('Inviti personali · validi 7 giorni.')}}</p><div class="lf-invite-send"><label>{{uiText("EMAIL DELL'ATLETA")}}<input v-model="email" type="email" placeholder="atleta@esempio.it"/></label><button class="primary" type="button" @click="mock">{{uiText('✉ INVIA INVITO ATLETA')}}</button></div><div class="lf-invite-manual"><button class="secondary" type="button" @click="mock">Copia link (demo)</button><button type="button" class="secondary" @click="mock">WhatsApp (demo)</button></div></template>
  <template #coach><h3>{{uiText('INVITA UN COACH COLLABORATORE')}}</h3><p class="muted small">{{uiText('Invito valido 7 giorni. Il coach deve registrarsi con la stessa email.')}}</p><div class="lf-invite-send"><label>{{uiText('Email collaboratore')}}<input v-model="roleEmail" type="email" placeholder="email del nuovo coach"/></label><button class="primary" type="button" @click="mock">{{uiText('✉ INVIA INVITO COACH')}}</button></div><div class="lf-invite-manual"><button type="button" class="secondary" @click="mock">Copia link (demo)</button><button type="button" class="secondary" @click="mock">WhatsApp (demo)</button></div></template>
  <template #share><p class="muted small">Modalità demo: nessun link reale viene creato o condiviso.</p></template>
  <template #status><p class="muted small lf-invite-feedback">{{uiText('Modalità demo: nessun invito reale.')}}</p><div v-if="message" class="notice" role="status">{{message}}</div></template>
  <template #team><div class="line-card staff-person"><span class="staff-name">test22</span><span class="pill staff-role">COACH</span></div><div class="line-card staff-person"><span class="staff-name">test11</span><span class="pill staff-role">TITOLARE</span></div></template>
  <template #pending><p class="muted small">{{uiText('Nessun invito pendente.')}}</p></template>
  <template #studio><p class="muted small">Editor disponibile con account titolare reale. Nessun dato viene salvato in modalità demo.</p></template>
  <template #settings><p class="muted small">{{uiText('Modalità demo: nessun invito reale.')}}</p></template>
 </InviteTeamHub>
</template>
