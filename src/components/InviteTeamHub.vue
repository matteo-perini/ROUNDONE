<script setup lang="ts">
import {computed,ref} from 'vue'
import {RouterLink} from 'vue-router'
import LionIcon from './LionIcon.vue'
import {uiText} from '../features/i18n/interfaceLanguage'
const props=defineProps<{owner:boolean;busy:boolean;pendingCount?:number;expiringCount?:number;teamCount?:number;centralized?:boolean}>()
const choice=ref<'atleta'|'coach'>('atleta')
const selected=computed(()=>props.owner&&choice.value==='coach'?'coach':'atleta')
function select(kind:'atleta'|'coach'){
 if(props.busy||(kind==='coach'&&!props.owner))return
 choice.value=kind
}
</script>
<template>
 <div class="stack coach-staff-screen staff-v1 lf-invite-hub">
  <header class="lf-invite-heading"><h1>{{uiText('Inviti e Team')}}</h1><p class="muted">{{uiText('Invita nuovi atleti e gestisci il team della tua palestra.')}}</p><div class="lf-invite-summary-counts" aria-label="Situazione inviti"><span v-if="pendingCount!==undefined"><strong>{{pendingCount}}</strong> in attesa</span><span v-if="expiringCount" class="lf-invite-expiring"><strong>{{expiringCount}}</strong> in scadenza</span></div></header>
  <div class="lf-invite-choices" :class="{'lf-invite-one':!owner}" role="group" :aria-label="uiText('Tipo di invito')">
   <button type="button" class="lf-invite-choice" :aria-pressed="selected==='atleta'" :disabled="busy" @click="select('atleta')"><LionIcon name="user" :size="24"/><strong>{{uiText('Invita atleta')}}</strong><span>{{uiText('Nuovo atleta')}}</span></button>
   <button v-if="owner" type="button" class="lf-invite-choice" :aria-pressed="selected==='coach'" :disabled="busy" @click="select('coach')"><LionIcon name="users" :size="24"/><strong>{{uiText('Invita collaboratore')}}</strong><span>{{uiText('Nuovo Coach')}}</span></button>
  </div>
  <section class="panel lf-invite-form" :aria-label="uiText('Nuovo invito')">
   <div v-if="selected==='atleta'"><slot name="athlete"/></div><div v-else-if="owner"><slot name="coach"/></div>
   <slot name="status"/>
   <slot name="share"/>
  </section>
  <div class="lf-invite-sections">
   <details class="staff-details lf-invite-detail">
    <summary><LionIcon name="clock" :size="21"/><span class="lf-invite-summary"><strong>{{uiText('Inviti in attesa')}}</strong><small>{{uiText('Gestisci gli inviti ancora validi')}}</small></span><span v-if="pendingCount!==undefined" class="pill">{{pendingCount}}</span><LionIcon name="chevron" :size="16" class="lf-invite-chevron"/></summary>
    <div class="lf-invite-detail-body"><slot name="pending"/></div>
   </details>
   <details class="staff-details lf-invite-detail">
    <summary><LionIcon name="users" :size="21"/><span class="lf-invite-summary"><strong>{{uiText('Il tuo team')}}</strong><small>{{uiText('Coach e collaboratori')}}</small></span><span v-if="teamCount!==undefined" class="pill">{{teamCount}}</span><LionIcon name="chevron" :size="16" class="lf-invite-chevron"/></summary>
    <div class="lf-invite-detail-body"><slot name="team"/></div>
   </details>
   <details class="staff-details lf-invite-detail">
    <summary><LionIcon name="settings" :size="21"/><span class="lf-invite-summary"><strong>{{uiText('Impostazioni email (avanzate)')}}</strong><small>{{centralized?'LionFit Mail · Resend':'EmailJS'}}</small></span><LionIcon name="chevron" :size="16" class="lf-invite-chevron"/></summary>
    <div class="lf-invite-detail-body"><slot name="settings"/></div>
   </details>
  </div>
   <details v-if="owner" class="staff-details lf-invite-detail lf-email-studio-detail">
    <summary><LionIcon name="palette" :size="21"/><span class="lf-invite-summary"><strong>Personalizza inviti</strong><small>Testi, colori, logo e anteprima</small></span><LionIcon name="chevron" :size="16" class="lf-invite-chevron"/></summary>
    <div class="lf-invite-detail-body"><slot name="studio"/></div>
   </details>
  <RouterLink to="/coach" class="secondary lf-invite-back">{{uiText('← TORNA ALLA DASHBOARD')}}</RouterLink>
 </div>
</template>
<style scoped>
.lf-invite-hub{width:100%;max-width:860px;margin:0 auto;min-width:0}
.lf-invite-heading{padding:2px 2px 0}.lf-invite-summary-counts{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.lf-invite-summary-counts span{display:flex;gap:6px;align-items:center;border:1px solid var(--border);border-radius:20px;padding:6px 10px;background:var(--card);font-size:11px;color:var(--muted)}.lf-invite-summary-counts strong{font-size:13px;color:var(--text)}.lf-invite-summary-counts .lf-invite-expiring{border-color:#a07c3a;color:#e6ac55}.lf-invite-heading h1{font-size:clamp(23px,4vw,32px);line-height:1.15;margin:0 0 5px}.lf-invite-heading p{margin:0;font-size:13px;line-height:1.45}
.lf-invite-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.lf-invite-choices.lf-invite-one{grid-template-columns:1fr}
.lf-invite-choice{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:6px;min-width:0;min-height:105px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--card);color:var(--text);box-shadow:none;white-space:normal}
.lf-invite-choice strong{font-size:14px;line-height:1.25;overflow-wrap:anywhere}.lf-invite-choice span{font-size:11px;color:var(--muted);line-height:1.3}.lf-invite-choice svg{color:var(--mint)}.lf-invite-choice[aria-pressed=true]{border-color:var(--mint);background:var(--green-bg)}
.lf-invite-form{min-width:0;margin:0}.lf-invite-form :deep(h3){margin:0 0 6px}.lf-invite-form :deep(p){line-height:1.45}.lf-invite-form :deep(label){font-size:12px;line-height:1.4}.lf-invite-form :deep(input){width:100%;min-width:0;min-height:44px;font-size:16px}.lf-invite-form :deep(.lf-invite-send){display:grid;gap:10px}.lf-invite-form :deep(.lf-invite-send button){min-height:44px;font-size:12px;white-space:normal}.lf-invite-form :deep(.lf-invite-feedback){margin:12px 0 0;overflow-wrap:anywhere;line-height:1.45}
.lf-invite-sections{display:grid;gap:8px;min-width:0}.lf-invite-hub .lf-invite-detail{margin:0;padding:0;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}.lf-invite-hub .lf-invite-detail>summary{display:flex;align-items:center;gap:10px;padding:13px;min-height:58px;margin:0;list-style:none;cursor:pointer}.lf-invite-detail>summary::-webkit-details-marker{display:none}.lf-invite-detail>summary>svg:first-child{color:var(--mint);flex:none}.lf-invite-summary{flex:1;display:grid;gap:3px;min-width:0}.lf-invite-summary strong{font-size:13px}.lf-invite-summary small{font-size:11px;font-weight:500;color:var(--muted);line-height:1.35}.lf-invite-chevron{flex:none;color:var(--muted)}.lf-invite-detail[open] .lf-invite-chevron{transform:rotate(90deg)}.lf-invite-detail-body{padding:0 12px 12px;min-width:0}.lf-invite-detail-body :deep(.line-card){margin:5px 0;min-width:0;flex-wrap:wrap}.lf-invite-detail-body :deep(.line-card span){min-width:0;overflow-wrap:anywhere}.lf-invite-detail-body :deep(.line-card button){min-height:40px}.lf-invite-detail-body :deep(input){min-width:0;width:100%;font-size:16px}.lf-invite-back{align-self:center;min-height:42px;display:grid;place-items:center;text-align:center}
@media(min-width:901px){.lf-invite-back{display:none}}
.lf-invite-choice:focus-visible,.lf-invite-detail>summary:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
@media(min-width:700px){.lf-invite-choice{min-height:116px;padding:17px}.lf-invite-heading p{font-size:14px}.lf-invite-form :deep(.lf-invite-send){grid-template-columns:minmax(0,1fr) auto;align-items:end}.lf-invite-form :deep(.lf-invite-send button){min-width:180px}}
@media(max-width:340px){.lf-invite-choice{padding:10px;gap:5px}.lf-invite-choice strong{font-size:12px}.lf-invite-choice span{font-size:10px}}

/* PATCH 30 R2.1 — rifinitura esclusivamente desktop. L'ordine DOM e le azioni
   rimangono identici anche quando le due colonne vengono affiancate. */
@media (min-width: 1240px) {
 .lf-invite-hub {
  display:grid;
  width:100%;
  max-width:1120px;
  margin-inline:auto;
  grid-template-columns:minmax(0,1.55fr) minmax(310px,1fr);
  grid-template-areas:
   "heading heading"
   "choices sections"
   "form sections"
   "studio studio";
  grid-template-rows:auto auto auto auto;
  column-gap:20px;
  row-gap:14px;
  align-items:start;
  align-content:start;
 }
 .lf-invite-heading{grid-area:heading;padding:2px 2px 7px}
 .lf-invite-heading h1{font-size:32px}
 .lf-invite-choices{grid-area:choices;gap:12px}
 .lf-invite-choice{min-height:115px;padding:18px;border-radius:15px}
 .lf-invite-form{grid-area:form}
 .lf-invite-sections{grid-area:sections;gap:12px}
 .lf-email-studio-detail{grid-area:studio;margin:0}
 .lf-invite-hub .lf-invite-detail>summary{min-height:76px;padding:17px 16px}
 .lf-invite-summary strong{font-size:14px}
 .lf-invite-summary small{font-size:12px}
 .lf-invite-detail-body{padding:0 15px 16px}
 .lf-invite-back{grid-area:back;justify-self:start;align-self:start}
}
</style>
