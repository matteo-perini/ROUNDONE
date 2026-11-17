<script setup lang="ts">
import {computed} from 'vue'
import {shareWhatsappUrl,type ShareInviteKind} from '../features/invites/shareLinks'
const props=defineProps<{link:string;kind:ShareInviteKind;gymName:string;gymId:string;origin:string;email?:string}>()
const emit=defineEmits<{copy:[];close:[]}>()
const whatsapp=computed(()=>shareWhatsappUrl(props.link,props.kind,props.gymName,props.gymId,props.origin))
function selectLink(event:FocusEvent){(event.target as HTMLInputElement|null)?.select()}
</script>
<template>
 <section class="lf-share-panel" aria-label="Condividi invito personale">
  <div class="lf-share-heading"><div><strong>Invito pronto da condividere</strong><p class="muted small">{{kind==='coach'?'Collaboratore':'Atleta'}}{{kind==='coach'&&email?' · '+email:''}} · Valido 7 giorni</p></div><button type="button" class="ghost" aria-label="Chiudi condivisione" @click="emit('close')">Chiudi</button></div>
  <label class="lf-share-link-label">Link personale e monouso
   <input :value="link" type="text" readonly autocomplete="off" spellcheck="false" aria-label="Link personale di invito, selezionabile per copiarlo manualmente" @focus="selectLink"/>
  </label>
  <div class="lf-share-actions">
   <button type="button" class="secondary" @click="emit('copy')">Copia link</button>
   <a v-if="whatsapp" class="secondary lf-share-whatsapp" :href="whatsapp" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Condividi su WhatsApp</a>
  </div>
  <p class="muted small lf-share-note">Il link è personale: condividilo solo con il destinatario. Aprire WhatsApp non invia automaticamente il messaggio. Nessuna email viene spedita da questa azione.</p>
 </section>
</template>
<style scoped>
.lf-share-panel{min-width:0;display:grid;gap:11px;border:1px solid var(--outline,var(--border));background:var(--field,var(--card));border-radius:13px;padding:14px;margin-top:12px}
.lf-share-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.lf-share-heading strong{font-size:14px}.lf-share-heading p{margin:3px 0 0}.lf-share-heading .ghost{min-height:36px;padding:6px 10px;flex:none}
.lf-share-link-label{display:grid;gap:6px;font-size:12px;font-weight:700;min-width:0}.lf-share-link-label input{width:100%;min-width:0;max-width:100%;font-size:14px!important;min-height:42px;padding:9px;direction:ltr;text-align:left;text-overflow:ellipsis}
.lf-share-actions{display:flex;flex-wrap:wrap;gap:9px}.lf-share-actions button,.lf-share-whatsapp{display:inline-flex;justify-content:center;align-items:center;min-height:43px;white-space:normal;flex:1;min-width:145px;font-size:13px;text-align:center;text-decoration:none;padding:9px 13px}
.lf-share-note{margin:0;line-height:1.4}
@media(max-width:420px){.lf-share-panel{padding:11px}.lf-share-actions{display:grid;grid-template-columns:1fr}.lf-share-actions button,.lf-share-whatsapp{width:100%;min-width:0}}
</style>
