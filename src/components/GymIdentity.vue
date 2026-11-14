<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {isStagingMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {watchGymIdentity,saveGymIdentity,emptyIdentity,emptyIdentityRead,type IdentityField} from '../integrations/firestore/platform'
import {accountKey} from '../features/platform/platformModel'
import {compressIdentity} from '../features/platform/identityImage'
const p=defineProps<{edit?:boolean;compact?:boolean}>()
const read=ref(emptyIdentityRead()),draft=ref(emptyIdentity()),changed=ref<IdentityField[]>([]),busy=ref(false),message=ref(''),slow=ref(false)
const identity=computed(()=>read.value.identity)
const nameReady=computed(()=>read.value.gym.state==='ready')
const brandReady=computed(()=>nameReady.value&&read.value.appearance.state==='ready')
const pending=computed(()=>read.value.gym.state==='loading'||read.value.appearance.state==='loading')
const canSave=computed(()=>!busy.value&&mayWriteLive()&&changed.value.length>0&&(!changed.value.includes('name')||nameReady.value)&&(!changed.value.some(f=>f!=='name')||brandReady.value))
let stop:(()=>void)|undefined,epoch=0,timer:ReturnType<typeof setTimeout>|undefined
function mark(f:IdentityField){if(!changed.value.includes(f))changed.value=[...changed.value,f]}
function start(reset=false){
 const s=stagingSession.value;stop?.();clearTimeout(timer);const n=++epoch;read.value=emptyIdentityRead();slow.value=false
 if(reset){draft.value=emptyIdentity();changed.value=[];busy.value=false;message.value=''}
 if(!isStagingMode()||!s||(p.edit&&s.role!=='titolare'))return
 timer=setTimeout(()=>{if(n===epoch)slow.value=true},12000)
 try{stop=watchGymIdentity(s,v=>{if(n!==epoch)return;read.value=v;for(const f of ['name','logo','cover'] as const){if(!changed.value.includes(f))draft.value[f]=v.identity[f]}if(!pending.value)clearTimeout(timer)})}
 catch{read.value={...emptyIdentityRead(),gym:{state:'error',message:'configurazione'},appearance:{state:'error',message:'configurazione'}};clearTimeout(timer)}
}
watch(()=>accountKey(stagingSession.value),()=>start(true),{immediate:true})
onUnmounted(()=>{epoch++;stop?.();clearTimeout(timer)})
async function pick(e:Event,kind:'logo'|'cover'){const el=e.target as HTMLInputElement,file=el.files?.[0];el.value='';if(!file||busy.value||!brandReady.value)return;const n=epoch;busy.value=true;message.value='';try{const data=await compressIdentity(file,kind);if(n===epoch){draft.value={...draft.value,[kind]:data};mark(kind)}}catch(e){if(n===epoch)message.value=(e as Error).message}finally{if(n===epoch)busy.value=false}}
function remove(f:'logo'|'cover'){if(!brandReady.value||busy.value)return;draft.value[f]='';mark(f)}
async function save(){if(!canSave.value)return;const n=epoch;busy.value=true;message.value='';try{await saveGymIdentity({...draft.value},accountKey(stagingSession.value),[...changed.value]);if(n===epoch){changed.value=[];message.value='Personalizzazione salvata.';busy.value=false;start()}}catch(e){if(n===epoch)message.value='Salvataggio non riuscito: '+(e as Error).message}finally{if(n===epoch)busy.value=false}}
</script>
<template>
 <section v-if="edit&&stagingSession?.role==='titolare'" class="panel lf14-identity-editor">
  <h2>Personalizza palestra</h2><p class="muted small">Nome, logo e foto di copertina visibili solo agli utenti della tua palestra.</p>
  <p v-if="pending&&!slow" class="muted">Caricamento personalizzazione…</p>
  <p v-if="pending&&slow" class="notice" role="status">Connessione lenta. Puoi riprovare senza perdere le modifiche.</p>
  <p v-if="read.gym.state==='error'" class="notice" role="status">Nome palestra non disponibile ({{read.gym.message}}). Verifica connessione e accesso.</p>
  <p v-if="read.appearance.state==='error'" class="notice" role="status">Logo e copertina non disponibili ({{read.appearance.message}}). Verifica le regole Firestore e riprova.</p>
  <button v-if="slow||read.gym.state==='error'||read.appearance.state==='error'" class="secondary" type="button" :disabled="busy" @click="start()">Riprova caricamento</button>
  <label v-if="nameReady">Nome palestra<input v-model="draft.name" maxlength="100" @input="mark('name')" :disabled="busy"/></label>
  <div v-if="brandReady" class="lf14-brand-fields">
   <label>Logo palestra<img v-if="draft.logo" :src="draft.logo" alt="Anteprima logo" class="lf14-logo"/><input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="pick($event,'logo')"/><button v-if="draft.logo" class="secondary" type="button" :disabled="busy" @click="remove('logo')">Rimuovi logo</button></label>
   <label>Foto di copertina<img v-if="draft.cover" :src="draft.cover" alt="Anteprima copertina" class="lf14-cover-preview"/><input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="pick($event,'cover')"/><button v-if="draft.cover" class="secondary" type="button" :disabled="busy" @click="remove('cover')">Rimuovi foto</button></label>
  </div>
  <section v-if="nameReady" class="lf14-gym-identity" :class="{'lf14-with-cover':brandReady&&!!draft.cover}"><img v-if="brandReady&&draft.cover" :src="draft.cover" alt="" class="lf14-bg-cover"/><div class="lf14-gym-label"><img :src="(brandReady&&draft.logo)||'/v1-preview/LOGO-APP.png'" class="lf14-logo" alt="Logo palestra"/><div><small>ANTEPRIMA</small><strong>{{draft.name||'Palestra'}}</strong></div></div></section>
  <button v-if="nameReady" class="primary wide" :disabled="!canSave" @click="save">{{busy?'Attendi…':'Salva personalizzazione'}}</button>
  <p v-if="message" class="notice" role="status">{{message}}</p>
 </section>
 <section v-else-if="!edit&&(identity.name||compact)" class="lf14-gym-identity" :class="{'lf14-with-cover':!!identity.cover,'lf14-compact':compact}"><img v-if="identity.cover" :src="identity.cover" alt="" class="lf14-bg-cover"/><div class="lf14-gym-label"><img :src="identity.logo||'/v1-preview/LOGO-APP.png'" class="lf14-logo" alt="Logo palestra"/><div><small>{{identity.name?'PALESTRA':'PANNELLO COACH'}}</small><strong>{{identity.name||'LionFit'}}</strong></div></div></section>
</template>
