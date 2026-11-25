<script setup lang="ts">
import {accountKey} from '../features/platform/platformModel'
import LocalLoadingSkeleton from '../components/LocalLoadingSkeleton.vue'
/** Profilo V1, utente Auth verificato, lettura realtime. Scritture live protette. */
import {ref,onMounted,onUnmounted,computed,watch} from 'vue'
import {doc,getDocFromServer,onSnapshot,updateDoc,setDoc,type Unsubscribe} from 'firebase/firestore'
import {readVerifiedDevSession,type VerifiedDevSession} from '../integrations/firebase/devSession'
import {isStagingMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {readStagingDetails,stagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {getLocalEmulatorClients} from '../integrations/firebase/emulatorClient'
import {RouterLink,useRoute,useRouter} from 'vue-router'
import {compressedAvatar,photoFileSupported} from '../features/profile/imageProcessing'
import LionIcon from '../components/LionIcon.vue'
import ProfileOverview from '../components/ProfileOverview.vue'
import {readCoachMetrics,type CoachMetrics} from '../features/profile/coachMetrics'
import {normalizeMeasurement,validMeasurement} from '../features/profile/profileMeasurements'
const props=withDefaults(defineProps<{embedded?:boolean;pageActive?:boolean}>(),{embedded:false,pageActive:true})
const route=useRoute(),router=useRouter()
const activePage=computed(()=>!props.embedded||props.pageActive&&route.path==='/profilo')
const session=ref<VerifiedDevSession|null>(null),busy=ref(false),notice=ref('Caricamento profilo…')
const embeddedScope=accountKey(stagingSession.value)
if(props.embedded){const unregister=router.beforeEach((to,from)=>!embeddedScope||accountKey(stagingSession.value)!==embeddedScope?true:from.path==='/profilo'&&to.path!=='/profilo'&&busy.value?false:true);onUnmounted(unregister)}
const editing=ref(false),photo=ref(''),newPhoto=ref(''),fileInput=ref<HTMLInputElement|null>(null)
const gymName=ref('Lion Fit')
const metrics=ref<CoachMetrics>({})
const first=ref(''),surname=ref(''),gender=ref('Non specificare'),location=ref('Italia'),bio=ref(''),height=ref(''),weight=ref(''),email=ref('')
const fullName=computed(()=>[first.value,surname.value].filter(Boolean).join(' ').trim()||'Atleta')
const displayLocation=computed(()=>{
 const value=location.value.trim().replace(/^IT(?=[\s·,/-]|$)[\s·,/-]*/i,'').trim()
 return /^italia$/i.test(value)||!value?'Italia':value
})
const canSave=computed(()=>activePage.value&&(!isStagingMode()||mayWriteLive()))
const profileLoaded=ref(false)
let alive=true,stop:Unsubscribe|null=null
const safePhoto=(value:unknown)=>typeof value==='string' && value.length<870000 && (/^data:image\/(jpeg|png|webp);base64,/.test(value)||/^https:\/\//.test(value))?value:''
function readProfile(p:Record<string,unknown>){
 first.value=String(p.name||'');surname.value=String(p.surname||'');gender.value=String(p.gender||'Non specificare')
 location.value=String(p.location||'Italia');bio.value=String(p.bio||'');height.value=String(p.height||'');weight.value=String(p.weight||'');
 photo.value=safePhoto(p.photoURL||p.photoUrl);newPhoto.value=''
}
onMounted(async()=>{try{
 const details=isStagingMode()?await readStagingDetails():null
 const s=details?.session??await readVerifiedDevSession()
 if(!alive)return
 if(props.embedded&&s.role!=='atleta')throw new Error('Sessione Atleta non valida.')
 if(!isStagingMode()&&s.gymId!=='gym_lab2c_a')throw new Error('Palestra non autorizzata')
 session.value=s;email.value=s.email||''
 try{const gym=details?.gym??await getDocFromServer(doc((isStagingMode()?getStagingClients():getLocalEmulatorClients()).db,'gyms',s.gymId));if(gym.exists())gymName.value=String(gym.data().name||gym.data().gymName||'Lion Fit')}catch{}
 if(!alive)return
 const {db,auth}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
 if(auth.currentUser?.uid!==s.uid)throw new Error('Account cambiato durante il caricamento.')
 // Reuse the server-verified document already returned by the identity check.
 if(details?.profile.exists()){readProfile(details.profile.data());profileLoaded.value=true;notice.value=''}
 if(s.role!=='atleta')void readCoachMetrics(db,s.gymId,s.uid,s.role==='titolare').then(values=>{if(alive)metrics.value=values}).catch(()=>{})
 stop=onSnapshot(doc(db,'users',s.uid),{includeMetadataChanges:true},snap=>{
  if(!alive||auth.currentUser?.uid!==s.uid)return
  if(details&&snap.metadata.fromCache)return // never replace the verified initial document with an older cache
  if(!snap.exists()||snap.data().gymId!==s.gymId){profileLoaded.value=false;notice.value='Profilo non verificato';return}
  // First snapshot hydrates the form even when /profilo?edit=1 opened directly.
  if(!profileLoaded.value||!editing.value)readProfile(snap.data());profileLoaded.value=true;notice.value=''
 },e=>{if(alive){profileLoaded.value=false;notice.value=e.message}})
 if(activePage.value&&route.query.edit==='1')editing.value=true
 }catch(e){profileLoaded.value=false;notice.value=e instanceof Error?e.message:String(e)}
})
watch([()=>route.query.edit,activePage],([val,active])=>{if(active&&val==='1')editing.value=true})
onUnmounted(()=>{alive=false;stop?.()})
async function choosePhoto(ev:Event){const input=ev.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return
 if(!photoFileSupported(file)){notice.value='Foto non supportata o oltre 40 MB prima della compressione.';return}
 busy.value=true;try{newPhoto.value=await compressedAvatar(file);notice.value='Foto compressa. Premi Salva per confermare.'}
 catch(e){notice.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}
}

async function save(){const s=session.value;if(!s||busy.value)return
 if(!canSave.value){notice.value='Salvataggio profilo non disponibile.';return}
 if(!first.value.trim()||first.value.trim().length>80||surname.value.length>80||bio.value.length>160||!validMeasurement(height.value,280)||!validMeasurement(weight.value,500)){
  notice.value='Controlla nome, bio (160 caratteri), altezza e peso.';return
 }
 if(!window.confirm('Salvare le modifiche del profilo?'))return
 busy.value=true;try{
  const {db}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
  const payload={name:first.value.trim(),surname:surname.value.trim(),gender:gender.value,location:location.value.trim().slice(0,80)||'Italia',bio:bio.value.trim(),height:normalizeMeasurement(height.value),weight:normalizeMeasurement(weight.value),...(newPhoto.value?{photoURL:newPhoto.value}:{})}
  await updateDoc(doc(db,'users',s.uid),payload)
  height.value=payload.height;weight.value=payload.weight;photo.value=newPhoto.value||photo.value;newPhoto.value='';editing.value=false;notice.value='Profilo aggiornato.'
  // Team pubblico ha regole indipendenti: l'errore qui non invalida il salvataggio del profilo.
  if(s.role==='atleta')try{await setDoc(doc(db,'team_public',s.uid),{gymId:s.gymId,role:'athlete',name:payload.name,surname:payload.surname,bio:payload.bio,...(payload.photoURL?{photoURL:payload.photoURL}:{})},{merge:true})}
   catch{notice.value+=' L’aggiornamento foto nel Team richiede permessi team_public.'}
 }catch(e){notice.value='Modifica rifiutata: '+(e instanceof Error?e.message:String(e))}finally{busy.value=false}
}
function link(route:string){return isStagingMode()?route:route+'?source=emulator'}
</script>
<template>
<div class="lfp-container" :class="session?.role==='atleta'?'athlete-profile':'coach-profile'">
 <LocalLoadingSkeleton v-if="!profileLoaded&&notice==='Caricamento profilo…'" variant="profile" label="Caricamento profilo…"/>
 <p v-else-if="!profileLoaded" class="notice" role="alert">{{notice}}</p>
 <ProfileOverview v-else-if="!editing" :role="session?.role||'atleta'" :name="fullName" :gym-name="gymName" :email="email" :photo="photo" :bio="bio" :location="displayLocation" :height="height" :weight="weight" :settings-to="link('/impostazioni')" :athlete-to="link('/coach/atleti')" :coach-staff-to="link('/coach/staff')" :staff-enabled="isStagingMode()" :workouts-enabled="isStagingMode()" :bookings-to="link('/coach/prenotazioni')" :coach-metrics="metrics" @edit="editing=true" @photo="editing=true"/>
 <section v-else class="panel profile-edit-screen lfp-form-wrap"><header class="row between"><button class="bare" type="button" aria-label="Chiudi modifica profilo" @click="editing=false">✕</button><h2>MODIFICA PROFILO</h2></header>
  <button class="profile-photo-editor" type="button" @click="fileInput?.click()" :disabled="busy" aria-label="Carica o modifica foto"><img v-if="newPhoto||photo" :src="newPhoto||photo" alt="Anteprima foto"/><span v-else>🦁</span><small>CAMBIA FOTO</small></button>
  <input ref="fileInput" type="file" accept="image/*,.heic,.heif" class="visually-hidden" @change="choosePhoto"/>
  <div class="grid2 profile-edit-fields"><label>NOME<input v-model="first" maxlength="80" autocomplete="given-name"/></label><label>COGNOME<input v-model="surname" maxlength="80" autocomplete="family-name"/></label>
   <label>SESSO<select v-model="gender"><option>Non specificare</option><option>Uomo</option><option>Donna</option><option>Altro</option></select></label>
   <label>EMAIL <input :value="email" type="email" readonly aria-label="Email account Firebase"/><small class="muted">Email non modificabile da qui.</small></label>
   <label>POSIZIONE<input v-model="location" maxlength="80"/></label><label>BIO / DISCIPLINA<input v-model="bio" maxlength="160"/></label>
   <label>ALTEZZA (CM)<input v-model="height" inputmode="decimal" type="text" autocomplete="off" placeholder="Es. 175,5" aria-label="Altezza in centimetri"/></label>
   <label>PESO (KG)<input v-model="weight" inputmode="decimal" type="text" autocomplete="off" placeholder="Es. 70,5" aria-label="Peso in chilogrammi"/></label>
  </div><button class="primary wide" :disabled="busy||!canSave" @click="save">{{busy?'SALVATAGGIO…':'SALVA PROFILO'}}</button><p class="small muted">Formati: JPG, PNG, WebP, HEIC/HEIF.</p>
 </section>
 <p v-if="profileLoaded&&notice" class="small muted lfp-notice" role="status">{{notice}}</p>
</div>
</template>
