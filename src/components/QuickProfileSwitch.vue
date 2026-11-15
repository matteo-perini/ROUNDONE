<script setup lang="ts">
import {computed,ref,watch,nextTick} from 'vue'
import {useRoute} from 'vue-router'
import {useLabStore} from '../stores/lab'
import LionIcon from './LionIcon.vue'
import {linkedPair,linkedBusy,linkedNotice,requestProfileSwitch} from '../integrations/firebase/linkedProfiles'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {sideOf} from '../features/auth/linkedProfileModel'
defineProps<{compact?:boolean}>()
const side=computed(()=>sideOf(linkedPair.value,stagingSession.value))
const open=ref(false), lab=useLabStore(), route=useRoute()
const cancel=ref<HTMLButtonElement|null>(null), trigger=ref<HTMLButtonElement|null>(null)
function show(){linkedNotice.value='';open.value=true;void nextTick(()=>cancel.value?.focus())}
function close(){if(linkedBusy.value)return;open.value=false;void nextTick(()=>trigger.value?.focus())}
watch(()=>route.fullPath,()=>{if(!linkedBusy.value)open.value=false})
watch(side,()=>{open.value=false})
async function change(){await requestProfileSwitch()}
function trap(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();close();return}if(e.key!=='Tab')return;const items=Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const first=items[0],last=items.at(-1);if(!first||!last)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
</script>
<template>
 <button v-if="side" ref="trigger" type="button" :class="compact?'theme-square lf-switch-compact':'ghost wide lf-switch-desktop'" title="Cambia profilo" aria-label="Cambia profilo" aria-haspopup="dialog" :aria-expanded="open" :disabled="linkedBusy" @click="show"><LionIcon name="switch" :size="19"/><span v-if="!compact">Cambia profilo</span></button>
 <Teleport to="body"><div v-if="open&&side" class="modal-overlay lf-switch-overlay" :class="{'lf-switch-light':lab.theme==='light'}" @click.self="close"><section class="lf-switch-dialog" role="dialog" aria-modal="true" aria-label="Cambia profilo" :aria-busy="linkedBusy" @keydown="trap">
  <div class="lf-switch-heading"><h2>Cambia profilo</h2><button type="button" class="lf-switch-close" aria-label="Chiudi" :disabled="linkedBusy" @click="close">✕</button></div>
  <div class="lf-switch-choice active"><LionIcon :name="side==='coach'?'shield':'dumbbell'" :size="24"/><span><small>Profilo attivo</small><strong>{{side==='coach'?'Coach':'Atleta'}} · {{stagingSession?.label}}</strong></span><LionIcon name="check"/></div>
  <div class="lf-switch-choice"><LionIcon :name="side==='coach'?'dumbbell':'shield'" :size="24"/><span><small>Passa al profilo</small><strong>{{side==='coach'?'Atleta':'Coach'}}</strong></span><LionIcon name="chevron"/></div>
  <p class="lf-switch-hint">Salva eventuali modifiche prima di cambiare. Le notifiche seguono il profilo attivo.</p>
  <p v-if="linkedNotice" role="alert" class="lf-switch-error">{{linkedNotice}}</p>
  <button type="button" class="lf-switch-confirm" :disabled="linkedBusy" @click="change">{{linkedBusy?'Sincronizzazione profilo…':'Conferma cambio profilo'}}</button>
  <button ref="cancel" type="button" class="lf-switch-cancel" :disabled="linkedBusy" @click="close">Annulla</button>
 </section></div></Teleport>
</template>
<style scoped>
.lf-switch-compact{color:var(--accent,#49d891);flex:none}.lf-switch-desktop{display:flex;align-items:center;justify-content:center;gap:8px}
/* Teleport lives under body, OUTSIDE .app: supply a complete independent palette. */
.lf-switch-overlay{--switch-bg:#17212e;--switch-text:#f2f6fb;--switch-muted:#aebdcc;--switch-border:#46596b;--switch-accent:#65e5aa;--switch-active:#153b2e;--switch-choice:#101923;--switch-error:#ffadb6;position:fixed;inset:0;display:grid;place-items:center;z-index:12000;padding:max(14px,env(safe-area-inset-top,0px)) max(14px,env(safe-area-inset-right,0px)) max(14px,env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px));background:rgba(3,7,13,.74);color:var(--switch-text);box-sizing:border-box}
.lf-switch-overlay.lf-switch-light{--switch-bg:#fff;--switch-text:#172922;--switch-muted:#51655b;--switch-border:#b4c9bc;--switch-accent:#087b45;--switch-active:#e1f6e9;--switch-choice:#f4f8f5;--switch-error:#ab2941}
.lf-switch-dialog{box-sizing:border-box;width:min(100%,410px);max-height:100%;overflow-y:auto;overscroll-behavior:contain;background:var(--switch-bg);color:var(--switch-text);border:1px solid var(--switch-border);padding:18px;border-radius:20px;box-shadow:0 18px 60px #0007;display:grid;gap:12px}
.lf-switch-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.lf-switch-dialog h2{font-size:21px;margin:0;color:var(--switch-text)}.lf-switch-dialog p{margin:0;line-height:1.45}.lf-switch-close{width:44px;height:44px;flex:none;border:0;border-radius:10px;background:var(--switch-choice);color:var(--switch-text)}
.lf-switch-choice{width:100%;display:flex;align-items:center;gap:12px;border:1px solid var(--switch-border);border-radius:12px;background:var(--switch-choice);color:var(--switch-text);padding:13px;min-height:64px}.lf-switch-choice.active{border-color:var(--switch-accent);background:var(--switch-active)}.lf-switch-choice>svg{color:var(--switch-accent);flex:none}.lf-switch-choice>span{flex:1;display:grid;gap:4px;min-width:0;overflow-wrap:anywhere}.lf-switch-choice small,.lf-switch-hint{color:var(--switch-muted);font-size:13px}.lf-switch-error{color:var(--switch-error);font-size:14px}
.lf-switch-confirm,.lf-switch-cancel{min-height:46px;border-radius:11px;font-size:15px;font-weight:750;padding:10px}.lf-switch-confirm{background:#16854f;color:#fff;border:1px solid #16854f}.lf-switch-cancel{background:var(--switch-choice);color:var(--switch-text);border:1px solid var(--switch-border)}.lf-switch-dialog button:focus-visible{outline:2px solid var(--switch-accent);outline-offset:2px}.lf-switch-dialog button:disabled{opacity:.65}
</style>
