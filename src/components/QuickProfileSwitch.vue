<script setup lang="ts">
import {computed,ref} from 'vue'
import LionIcon from './LionIcon.vue'
import {linkedPair,linkedBusy,linkedNotice,requestProfileSwitch} from '../integrations/firebase/linkedProfiles'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {sideOf} from '../features/auth/linkedProfileModel'
defineProps<{compact?:boolean}>()
const side=computed(()=>sideOf(linkedPair.value,stagingSession.value))
const open=ref(false)
function show(){linkedNotice.value='';open.value=true}
async function change(){await requestProfileSwitch()}
</script>
<template>
 <button v-if="side" type="button" :class="compact?'theme-square lf-switch-compact':'ghost wide lf-switch-desktop'" title="Cambia profilo" aria-label="Cambia profilo" :disabled="linkedBusy" @click="show"><LionIcon name="switch" :size="19"/><span v-if="!compact">Cambia profilo</span></button>
 <Teleport to="body"><div v-if="open&&side" class="modal-overlay lf-switch-overlay" @click.self="!linkedBusy&&(open=false)" @keydown.esc="!linkedBusy&&(open=false)"><section class="dialog lf-switch-dialog" role="dialog" aria-modal="true" aria-label="Cambia profilo" :aria-busy="linkedBusy">
  <div class="row between"><h2>Cambia profilo</h2><button class="bare" type="button" aria-label="Chiudi" :disabled="linkedBusy" @click="open=false">✕</button></div>
  <div class="lf-switch-choice active"><LionIcon :name="side==='coach'?'shield':'dumbbell'"/><span><strong>Profilo {{side==='coach'?'Coach':'Atleta'}}</strong><small>Attivo · {{stagingSession?.label}}</small></span><LionIcon name="check"/></div>
  <button class="lf-switch-choice" type="button" :disabled="linkedBusy" @click="change"><LionIcon :name="side==='coach'?'dumbbell':'shield'"/><span><strong>Profilo {{side==='coach'?'Atleta':'Coach'}}</strong><small>{{linkedBusy?'Verifica delle sessioni…':'Passa a questo profilo'}}</small></span><LionIcon name="chevron"/></button>
  <p class="muted small">Salva le modifiche in corso prima di cambiare. Le notifiche seguono il profilo attivo.</p>
  <p v-if="linkedNotice" role="alert" class="notice">{{linkedNotice}}</p>
 </section></div></Teleport>
</template>
<style scoped>
.lf-switch-compact{color:var(--accent,#49d891);flex:none}.lf-switch-desktop{display:flex;align-items:center;justify-content:center;gap:8px}.lf-switch-overlay{z-index:12000}.lf-switch-dialog{max-width:400px;display:grid;gap:12px}.lf-switch-dialog h2,.lf-switch-dialog p{margin:0}.lf-switch-choice{width:100%;display:flex;align-items:center;text-align:left;gap:12px;border:1px solid var(--border,#435165);border-radius:12px;background:transparent;color:inherit;padding:13px}.lf-switch-choice.active{border-color:#41d98e}.lf-switch-choice>span{flex:1;display:grid;gap:4px;min-width:0}.lf-switch-choice small{opacity:.75;overflow-wrap:anywhere}.lf-switch-choice:disabled{opacity:.65}
</style>
