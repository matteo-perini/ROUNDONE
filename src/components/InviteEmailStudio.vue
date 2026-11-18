<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {cleanStudio,draftKey,studioDefaults,type InviteEmailStudioSettings} from '../features/invites/emailStudio'
import {inviteStudioCloudEnabled,loadGymInviteStudio,saveGymInviteStudio,saveGymInviteStudioEditors} from '../integrations/firebase/inviteStudio'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {resolveBrandCover,resolveBrandLogo} from '../features/branding/defaultBranding'
const props=defineProps<{gymId:string;uid:string;gymName:string;logo:string;cover:string;owner:boolean;coaches:{id:string;name:string;role:string;membershipStatus?:string}[];busy?:boolean}>()
const data=ref<InviteEmailStudioSettings>(studioDefaults(props.gymName))
const inviteKind=ref<'athlete'|'coach'>('athlete')
const feedback=ref(''),loading=ref(false),saving=ref(false),hasSavedCloud=ref(false)
const canEdit=ref(false),editorUids=ref<string[]>([]),savingEditors=ref(false)
const selectableCoaches=computed(()=>props.coaches.filter(c=>c.role!=='TITOLARE'&&c.membershipStatus!=='revoked'&&c.id!==props.uid))
const activeKey=computed(()=>props.gymId&&props.uid?`${draftKey(props.gymId,props.uid)}:${inviteKind.value}`:'')
const cloud=inviteStudioCloudEnabled()
const preview=computed(()=>cleanStudio(data.value,props.gymName))
const dark=computed(()=>preview.value.theme==='dark')
const imageOK=(value:string)=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
const customLogo=computed(()=>imageOK(props.logo))
const customCover=computed(()=>imageOK(props.cover))
const resolvedLogo=computed(()=>resolveBrandLogo(customLogo.value?props.logo:''))
const resolvedCover=computed(()=>resolveBrandCover(customCover.value?props.cover:''))
const showLogo=computed(()=>preview.value.showLogo)
const showCover=computed(()=>preview.value.showCover)
watch(activeKey,async (key,_,onCleanup)=>{
 let cancelled=false;onCleanup(()=>{cancelled=true})
 if(!key)return
 feedback.value='';hasSavedCloud.value=false;canEdit.value=false;editorUids.value=[]
 data.value=studioDefaults(props.gymName)
 try{const raw=localStorage.getItem(key)||(inviteKind.value==='athlete'?localStorage.getItem(draftKey(props.gymId,props.uid)):null);if(raw)data.value=cleanStudio(JSON.parse(raw),props.gymName)}catch{}
 if(!cloud)return
 loading.value=true
 try{
  const remote=await loadGymInviteStudio(props.gymId,props.uid,inviteKind.value)
  if(cancelled)return
  canEdit.value=remote.canEdit===true;editorUids.value=props.owner?remote.editorUids||[]:[]
  if(remote.settings){data.value=cleanStudio(remote.settings,props.gymName);hasSavedCloud.value=true}
  else feedback.value='La palestra non ha ancora un modello salvato sul server.'
 }catch(e){if(!cancelled)feedback.value='Modello cloud non disponibile. Puoi comunque preparare una bozza locale.'}
 finally{if(!cancelled)loading.value=false}
},{immediate:true})
function saveDraft(){
 if(!activeKey.value)return
 try{localStorage.setItem(activeKey.value,JSON.stringify(preview.value));data.value={...preview.value};feedback.value='Bozza salvata solo su questo dispositivo: non cambia le email inviate.'}
 catch{feedback.value='Non è stato possibile salvare la bozza sul dispositivo.'}
}
async function saveCloud(){
 if(!activeKey.value||!cloud||!canEdit.value||!mayWriteLive()||saving.value)return
 saving.value=true;feedback.value=''
 try{
  const setting=preview.value
  await saveGymInviteStudio(props.gymId,props.uid,setting,inviteKind.value)
  data.value={...setting};hasSavedCloud.value=true
  try{localStorage.removeItem(activeKey.value)}catch{}
  feedback.value='Modello salvato per questa palestra. Resend lo userà per i prossimi inviti.'
 }catch(e){feedback.value=e instanceof Error?e.message:'Salvataggio server non riuscito. Nessuna configurazione applicata.'}
 finally{saving.value=false}
}
async function saveEditors(){
 if(!props.owner||!cloud||!mayWriteLive()||savingEditors.value)return
 savingEditors.value=true;feedback.value=''
 try{
  const approved=editorUids.value.filter(id=>selectableCoaches.value.some(c=>c.id===id))
  const out=await saveGymInviteStudioEditors(props.gymId,props.uid,approved)
  editorUids.value=out.editorUids
  feedback.value='Permessi Coach salvati per questa palestra.'
 }catch(e){feedback.value=e instanceof Error?e.message:'Autorizzazioni non salvate.'}
 finally{savingEditors.value=false}
}
function reset(){data.value=studioDefaults(props.gymName);feedback.value='Modello predefinito caricato nell’anteprima. Per applicarlo devi salvarlo.'}
</script>
<template>
 <div class="lf-email-studio">
  <header class="lf-studio-intro"><h3>LionFit Email Studio</h3><p class="muted small">Personalizza l’identità dell’invito. L’anteprima non invia alcuna email.</p></header>
  <div class="lf-studio-kinds" role="group" aria-label="Tipo di invito">
   <button type="button" :aria-pressed="inviteKind==='athlete'" :disabled="busy||saving||loading" @click="inviteKind='athlete'">Invito Atleta</button>
   <button type="button" :aria-pressed="inviteKind==='coach'" :disabled="busy||saving||loading" @click="inviteKind='coach'">Invito Coach</button>
  </div>
  <p class="lf-studio-mode" role="status">{{cloud?(hasSavedCloud?'Modello palestra caricato dal server':'Modello in preparazione'):'Anteprima locale · il modello salvato su Firebase resta invariato'}}</p>
  <div class="lf-studio-columns">
   <div class="lf-studio-fields">
    <label>Nome mittente <input v-model="data.senderName" :disabled="busy||saving||loading" maxlength="70" autocomplete="off" placeholder="Nome palestra"/></label>
    <label>Oggetto email <input v-model="data.subject" :disabled="busy||saving||loading" maxlength="110" autocomplete="off" placeholder="Benvenuto nel team"/></label>
    <label>Messaggio di benvenuto <textarea v-model="data.message" :disabled="busy||saving||loading" maxlength="600" rows="4" placeholder="Un messaggio per il nuovo atleta o Coach"/></label>
    <label>Colore invito</label>
    <div class="lf-studio-swatches" role="group" aria-label="Colore invito">
     <button v-for="c in ['#24E58C','#D6B56B','#2E8BCE','#B74F67','#9065C9','#7A848D']" :key="c" type="button" class="lf-studio-swatch" :class="{'is-selected':preview.accent===c}" :style="{'--swatch':c}" :aria-label="`Scegli colore ${c}`" :aria-pressed="preview.accent===c" :disabled="busy||saving||loading" @click="data.accent=c" />
     <input v-model="data.accent" :disabled="busy||saving||loading" type="text" maxlength="7" aria-label="Colore esadecimale" class="lf-studio-hex" placeholder="#D6B56B"/>
    </div>
    <label>Tema <select v-model="data.theme" :disabled="busy||saving||loading"><option value="dark">Scuro</option><option value="light">Chiaro</option></select></label>
    <label class="lf-studio-toggle"><input v-model="data.showLogo" type="checkbox" :disabled="busy||saving||loading"/> Mostra il logo della palestra</label>
    <label class="lf-studio-toggle"><input v-model="data.showCover" type="checkbox" :disabled="busy||saving||loading"/> Mostra la foto della struttura</label>
    <p class="muted small">Logo e foto provengono da «Profilo &amp; Palestra». Se mancano, LionFit usa automaticamente il logo standard e una hero di palestra predefinita.</p>
   </div>
   <div class="lf-studio-preview-container">
    <p class="lf-studio-preview-label">ANTEPRIMA DEL MESSAGGIO</p>
    <div class="lf-studio-preview" :class="{'is-light':!dark}">
     <img v-if="showLogo" class="lf-studio-logo" :src="resolvedLogo" :alt="customLogo?'Logo della palestra':'Logo standard LionFit'"/>
     <strong class="lf-studio-brand" :style="{color:preview.accent}">{{preview.senderName}}</strong>
     <img v-if="showCover" class="lf-studio-cover" :src="resolvedCover" :alt="customCover?'Fotografia della palestra':'Immagine predefinita della palestra'"/>
     <p class="lf-studio-subject">Oggetto: {{preview.subject}}</p>
     <p class="lf-studio-tag" :style="{color:preview.accent}">{{inviteKind==='coach'?'INVITO COLLABORATORE':'INVITO ATLETA'}} · LIONFIT</p>
     <h4>Benvenuto nel team!</h4>
     <p class="lf-studio-message">{{preview.message}}</p>
     <span class="lf-studio-cta" :style="{background:preview.accent}">Registrati su LionFit</span>
     <p class="lf-studio-note">Invito personale · valido 7 giorni</p>
     <div class="lf-studio-links"><span>Scarica per Android</span><span>Guida iPhone / iPad</span></div>
     <small>Powered by LionFit</small>
    </div>
    <p class="muted small">Nell'email effettiva saranno inclusi i link personali sicuri. Questa anteprima non contiene token.</p>
   </div>
  </div>
  <section v-if="cloud && owner" class="lf-studio-editor-perms" aria-label="Permessi Email Studio">
   <strong>Coach autorizzati a modificare le email</strong>
   <p class="muted small">Solo il titolare assegna questi permessi. Ogni autorizzazione riguarda esclusivamente la propria palestra.</p>
   <label v-for="c in selectableCoaches" :key="c.id" class="lf-studio-toggle"><input v-model="editorUids" type="checkbox" :value="c.id" :disabled="loading||savingEditors||busy"/> {{c.name}}</label>
   <p v-if="!selectableCoaches.length" class="muted small">Nessun Coach attivo da autorizzare.</p>
   <button type="button" class="secondary" :disabled="busy||loading||savingEditors||!mayWriteLive()" @click="saveEditors">{{savingEditors?'Salvataggio permessi…':'Salva permessi Coach'}}</button>
  </section>
  <p v-if="cloud && !canEdit && !loading" class="muted small">Puoi consultare il modello; per modificarlo chiedi l'autorizzazione al titolare.</p>
  <div class="lf-studio-actions">
   <button type="button" class="secondary" :disabled="busy||loading||saving" @click="reset">Ripristina anteprima</button>
   <button type="button" class="secondary" :disabled="busy||loading||saving" @click="saveDraft">Salva bozza locale</button>
   <button v-if="cloud && canEdit" type="button" class="primary" :disabled="busy||loading||saving||!mayWriteLive()" @click="saveCloud">{{saving?'Salvataggio…':'Salva per la palestra'}}</button>
  </div>
  <p v-if="feedback" class="muted small" role="status">{{feedback}}</p>
  <p class="muted small lf-studio-disclaimer">{{cloud?'Il modello salvato su Firebase sarà utilizzato da Resend per questa palestra.':'L’invio Resend è attivo; la bozza locale non cambia il modello email sul server. Il logo e la foto della palestra provengono già dal suo profilo.'}}</p>
 </div>
</template>
<style scoped>
.lf-email-studio{display:grid;gap:12px;min-width:0;container-type:inline-size}.lf-studio-intro h3{margin:0 0 5px;font-size:17px}.lf-studio-intro p{margin:0}.lf-studio-mode{margin:0;padding:9px 12px;border:1px solid var(--outline);border-radius:10px;font-size:12px;color:var(--muted);background:var(--field)}
.lf-studio-columns{display:grid;gap:15px;min-width:0}.lf-studio-fields{display:grid;gap:11px;min-width:0}.lf-studio-fields label:not(.lf-studio-toggle){display:grid;gap:5px;font-size:12px;font-weight:750}.lf-studio-fields input:not([type=checkbox]),.lf-studio-fields textarea,.lf-studio-fields select{width:100%;min-width:0;padding:10px;background:var(--field);color:var(--text);border:1px solid var(--outline);border-radius:9px;font-size:16px}.lf-studio-fields textarea{resize:vertical;min-height:96px}.lf-studio-toggle{display:flex;align-items:center;gap:10px;font-size:12px}.lf-studio-toggle input{width:17px;height:17px;accent-color:var(--mint)}
.lf-studio-swatches{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.lf-studio-swatch{width:29px;height:29px;border:2px solid transparent;border-radius:50%;background:var(--swatch)}.lf-studio-swatch.is-selected{outline:2px solid var(--text);outline-offset:2px}.lf-studio-swatches .lf-studio-hex{flex:1;max-width:110px;min-width:90px;font-size:13px}.lf-studio-preview-label{font-size:10px;color:var(--muted);letter-spacing:.07em;font-weight:850;margin:0 0 8px}.lf-studio-preview{display:flex;flex-direction:column;align-items:center;text-align:center;gap:13px;border-radius:14px;padding:18px;background:#10141b;color:#f6f6f6;min-height:340px;overflow:hidden;overflow-wrap:anywhere}.lf-studio-preview.is-light{background:#f4f5f7;color:#17231d}.lf-studio-logo{max-width:90px;max-height:68px;object-fit:contain}.lf-studio-brand{font-size:18px;font-weight:900}.lf-studio-cover{width:100%;max-height:170px;object-fit:cover;border-radius:10px}.lf-studio-subject{margin:0;font-size:11px;opacity:.74}.lf-studio-preview h4{font-size:19px;margin:0}.lf-studio-message{font-size:13px;white-space:pre-line;line-height:1.5;margin:0;max-width:100%}.lf-studio-cta{padding:12px 22px;border-radius:10px;font-weight:900;color:#141414;font-size:14px}.lf-studio-tag{margin:0;color:#24E58C;font-size:11px;letter-spacing:.14em;font-weight:850}.lf-studio-note{color:#a8afb7;font-size:11px;margin:0}.is-light .lf-studio-tag{margin:0;color:#24E58C;font-size:11px;letter-spacing:.14em;font-weight:850}.lf-studio-note{color:#526071}.lf-studio-links{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;font-size:11px;text-decoration:underline}.lf-studio-preview small{font-size:10px;color:#9ca3af}.lf-studio-preview-container>p:last-child{margin:8px 0 0}.lf-studio-actions{display:flex;gap:9px;flex-wrap:wrap}.lf-studio-actions button{min-height:42px}.lf-studio-kinds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.lf-studio-kinds button{background:var(--field);border:1px solid var(--outline);border-radius:9px;min-height:44px;color:var(--text)}.lf-studio-kinds button[aria-pressed=true]{border-color:var(--mint);background:var(--green-bg);color:var(--mint)}.lf-studio-disclaimer{margin:0}.lf-studio-editor-perms{display:grid;gap:9px;padding:13px;border:1px solid var(--outline);border-radius:12px;background:var(--field)}.lf-studio-editor-perms>p{margin:0}.lf-studio-editor-perms button{justify-self:start;min-height:42px}
@container (min-width:700px){.lf-studio-columns{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}.lf-studio-preview{padding:20px}.lf-studio-brand{font-size:20px}}
</style>
