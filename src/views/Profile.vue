<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent } from 'vue'
import {useRoute} from 'vue-router'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {useLabStore} from '../stores/lab'
import {demoProfiles,saveDemoProfile,type DemoRole} from '../features/profile/localProfile'
import ProfileOverview from '../components/ProfileOverview.vue'

const lab=useLabStore(),route=useRoute()
const emulator=computed(()=>isStagingMode()||(import.meta.env.DEV&&route.query.source==='emulator'))
const ProfileLive=(import.meta.env.DEV||isStagingMode())?defineAsyncComponent(()=>import('./DevProfileWorkspace.vue')):null
const currentRole=computed<DemoRole>(()=>lab.role==='coach'?'coach':'atleta')
const profile=computed(()=>demoProfiles[currentRole.value])
const editing=ref(false),uploading=ref(false),feedback=ref('')
const draftName=ref(''),draftBio=ref(''),draftLocation=ref(''),draftHeight=ref(''),draftWeight=ref('')
const fileInput=ref<HTMLInputElement|null>(null)
const isCoach=computed(()=>currentRole.value==='coach')
const settingsPath='/impostazioni'
function beginEdit(){draftName.value=profile.value.name;draftBio.value=profile.value.bio;draftLocation.value=profile.value.location;draftHeight.value=profile.value.height;draftWeight.value=profile.value.weight;editing.value=true;feedback.value=''}
watch(()=>route.query.edit,val=>{if(val==='1')beginEdit()},{immediate:true})
function valid(value:string,max:number){return !value.trim()||(Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=max)}
function save(){const name=draftName.value.trim()
 if(!name||name.length>80||!valid(draftHeight.value,280)||!valid(draftWeight.value,500)){feedback.value='Controlla nome, altezza e peso.';return}
 const ok=saveDemoProfile(currentRole.value,{name,bio:draftBio.value.trim().slice(0,160),location:draftLocation.value.trim().slice(0,80)||'Italia',height:draftHeight.value.trim(),weight:draftWeight.value.trim()})
 if(ok){editing.value=false;feedback.value='Profilo salvato nel browser di prova. Nessuna scrittura Firebase.'}
 else feedback.value='Impossibile salvare nello spazio locale del browser.'
}
async function onPhotoChange(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return
 if(!file.type.startsWith('image/')||file.size>10*1024*1024){feedback.value='Seleziona un’immagine JPG, PNG o WebP entro 10 MB.';return}
 uploading.value=true;const url=URL.createObjectURL(file)
 try{const img=new Image();await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=()=>fail(new Error('Immagine non leggibile'));img.src=url})
  const size=Math.min(img.naturalWidth,img.naturalHeight),canvas=document.createElement('canvas');canvas.width=canvas.height=360
  const ctx=canvas.getContext('2d');if(!ctx||!size)throw new Error('Impossibile elaborare la foto')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,360,360);ctx.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,360,360)
  feedback.value=saveDemoProfile(currentRole.value,{photo:canvas.toDataURL('image/jpeg',.77)})?'Foto salvata nel browser di prova.':'Spazio locale insufficiente per la foto.'
 }catch{feedback.value='Foto non leggibile. Riprova con JPG, PNG o WebP.'}finally{URL.revokeObjectURL(url);uploading.value=false}
}
</script>
<template>
 <component v-if="emulator && ProfileLive" :is="ProfileLive"/>
 <div v-else class="lfp-container">
  <ProfileOverview v-if="!editing" :role="isCoach?'coach-demo':'atleta'" :name="profile.name" :photo="profile.photo" :bio="profile.bio" :location="profile.location" :height="profile.height" :weight="profile.weight" :settings-to="settingsPath" @edit="beginEdit" @photo="fileInput?.click()"/>
  <section v-else class="lfp-form-wrap"><div class="lfp-form-heading"><button class="secondary" type="button" @click="editing=false">← Indietro</button><h1>Modifica profilo</h1></div><button class="lfp-avatar lfp-edit-avatar" type="button" :disabled="uploading" @click="fileInput?.click()"><img v-if="profile.photo" :src="profile.photo" alt="Foto profilo"/><img v-else src="/v1-preview/LOGO-APP.png" alt="Logo Lion Fit"/><span class="lfp-camera">✎</span></button><p class="muted small">Tocca la foto per cambiarla.</p>
   <div class="lfp-edit-grid"><label>Nome visualizzato<input v-model="draftName" autocomplete="name" maxlength="80"/></label><label>Paese<input v-model="draftLocation" maxlength="80"/></label><label>Sport / descrizione<input v-model="draftBio" maxlength="160" placeholder="Es. MMA, Grappling"/></label><label>Altezza (cm)<input v-model="draftHeight" type="number" inputmode="decimal" min="1" max="280"/></label><label>Peso (kg)<input v-model="draftWeight" type="number" inputmode="decimal" min="1" max="500"/></label></div>
   <button type="button" class="primary wide" @click="save">Salva modifiche</button><p class="muted small">Anteprima locale: questi dati non vengono sincronizzati con Firebase.</p>
  </section>
  <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="onPhotoChange"/>
  <p v-if="feedback" class="notice" role="status">{{feedback}}</p>
 </div>
</template>
