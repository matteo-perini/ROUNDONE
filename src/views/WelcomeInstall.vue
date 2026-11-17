<script setup lang="ts">
/** PATCH 30 R5: shown automatically ONLY from successful registration completion.
 * Subsequent logins go straight to the ordinary dashboard. Also reopenable
 * from Settings. No new Firestore field, token, cookie or database migration.
 */
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {useRouter} from 'vue-router'
import {doc,getDocFromServer} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingDetails,stagingSession} from '../integrations/firebase/stagingSession'
import {safeImage} from '../features/platform/platformModel'
import {resolveBrandCover,resolveBrandLogo} from '../features/branding/defaultBranding'
import LionIcon from '../components/LionIcon.vue'
import {Capacitor} from '@capacitor/core'

type Device='android'|'ios'|'desktop'
type InstallPrompt=Event & {prompt:()=>Promise<void>;userChoice?:Promise<{outcome:string}>}
const router=useRouter()
const device=ref<Device>('desktop')
const gymName=ref('La tua palestra')
const logo=ref('')
const cover=ref('')
const role=ref<'atleta'|'titolare'|'collaboratore'>(stagingSession.value?.role||'atleta')
const installed=ref(false)
const installPrompt=ref<InstallPrompt|null>(null)
const status=ref('')
const busy=ref(false)
let mounted=true
const apk='https://github.com/matteo-perini/ROUNDONE/releases/latest/download/LionFit.apk'
const publicWeb='https://www.lionfit.it/'
const isNative=Capacitor.isNativePlatform()
const target=computed(()=>role.value==='atleta'?'/home':'/coach')
const chosenLabel=computed(()=>device.value==='android'?'Android':device.value==='ios'?'iPhone / iPad':'PC / Mac')
const effectiveLogo=computed(()=>resolveBrandLogo(logo.value))
const effectiveCover=computed(()=>resolveBrandCover(cover.value))
function detectDevice():Device{
 if(typeof navigator==='undefined')return 'desktop'
 const ua=navigator.userAgent||''
 if(/android/i.test(ua))return 'android'
 if(/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'ios'
 return 'desktop'
}
function onPrompt(event:Event){event.preventDefault();installPrompt.value=event as InstallPrompt}
function onInstalled(){installed.value=true;installPrompt.value=null}
onMounted(async()=>{
 device.value=detectDevice()
 installed.value=isNative||window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone)
 window.addEventListener('beforeinstallprompt',onPrompt)
 window.addEventListener('appinstalled',onInstalled)
 try{
  const {session,gym}=await readStagingDetails()
  if(!mounted)return
  role.value=session.role
  gymName.value=String(gym.data()?.name||gym.data()?.gymName||'La tua palestra').trim().slice(0,90)||'La tua palestra'
  try{
   const {db}=getStagingClients()
   const snap=await getDocFromServer(doc(db,'gyms',session.gymId,'identity','appearance'))
   if(mounted){logo.value=safeImage(snap.data()?.logo,120000);cover.value=safeImage(snap.data()?.cover,420000)}
  }catch{ /* Branding facoltativo: non impedisce l'accesso al gestionale. */ }
 }catch{status.value='Impossibile caricare il nome della palestra. Puoi comunque entrare nel gestionale.'}
})
onUnmounted(()=>{mounted=false;window.removeEventListener('beforeinstallprompt',onPrompt);window.removeEventListener('appinstalled',onInstalled)})
async function installDesktop(){
 const prompt=installPrompt.value
 if(!prompt||busy.value)return
 busy.value=true;status.value=''
 try{await prompt.prompt();await prompt.userChoice;installPrompt.value=null}
 catch{status.value='Installazione non disponibile: usa il menu del browser per installare il sito, se supportato.'}
 finally{busy.value=false}
}
function enterApp(){void router.replace(target.value)}
</script>

<template>
 <main class="lf-welcome" v-lf-entrance="{id:'welcome-install',premiumOnly:true,rows:[{match:'.lf-welcome-intro'},{match:'.lf-welcome-devices'},{match:'.lf-welcome-guide'}]}">
  <section class="lf-welcome-panel">
   <header class="lf-welcome-intro">
    <div class="lf-welcome-check" aria-hidden="true"><LionIcon name="check" :size="32"/></div>
    <div class="lf-welcome-brand">
     <img :src="effectiveLogo" :alt="logo?'Logo della palestra':'Logo standard LionFit'" class="lf-welcome-logo"/>
     <span>POWERED BY LIONFIT</span>
    </div>
    <p class="lf-welcome-eyebrow">ACCOUNT PRONTO</p>
    <h1>Benvenuto nel team!</h1>
    <h2>{{gymName}}</h2>
    <p class="lf-welcome-description">Puoi già entrare in LionFit. Se vuoi, scegli il tuo dispositivo e scopri come averlo sempre a portata di mano.</p>
    <figure class="lf-welcome-hero"><img :src="effectiveCover" :alt="cover?'Foto della palestra':'Immagine predefinita della palestra'" class="lf-welcome-cover"/><figcaption>{{logo||cover?'Branding palestra caricato':'Branding standard LionFit attivo finché la palestra non personalizza logo e copertina.'}}</figcaption></figure>
   </header>
   <section class="lf-welcome-device-section" aria-label="Scegli il tuo dispositivo">
    <h3>Come vuoi usare LionFit?</h3>
    <div class="lf-welcome-devices" role="group" aria-label="Dispositivi">
     <button type="button" :aria-pressed="device==='android'" @click="device='android';status=''" class="lf-welcome-device"><LionIcon name="user" :size="23"/><span>Android</span></button>
     <button type="button" :aria-pressed="device==='ios'" @click="device='ios';status=''" class="lf-welcome-device"><LionIcon name="home" :size="23"/><span>iPhone / iPad</span></button>
     <button type="button" :aria-pressed="device==='desktop'" @click="device='desktop';status=''" class="lf-welcome-device"><LionIcon name="globe" :size="23"/><span>PC / Mac</span></button>
    </div>
   </section>
   <section class="lf-welcome-guide" :aria-label="`Istruzioni per ${chosenLabel}`">
    <div class="lf-welcome-guide-heading"><span class="lf-welcome-kicker">{{chosenLabel}}</span><span class="lf-welcome-optional">Installazione facoltativa</span></div>
    <template v-if="installed">
     <h3>LionFit è già aperto come app</h3>
     <p>Non occorre installarlo nuovamente. Puoi continuare subito con il gestionale.</p>
    </template>
    <template v-else-if="device==='android'">
     <h3>Scarica l'app Android</h3>
     <p>Per ora l'APK ufficiale si trova su GitHub Releases. Quando passeremo al Play Store, aggiorneremo qui il collegamento.</p>
     <a class="lf-welcome-primary-link" :href="apk" target="_blank" rel="noopener noreferrer"><LionIcon name="save" :size="18"/> Scarica LionFit per Android</a>
     <p class="lf-welcome-subtle">Apri il download soltanto dalla pagina ufficiale LionFit. Android potrebbe chiederti di autorizzare l'installazione dal browser: conferma solo se riconosci il file.</p>
    </template>
    <template v-else-if="device==='ios'">
     <h3>Aggiungi LionFit alla schermata Home</h3>
     <p>Su iPhone e iPad non serve scaricare un file: LionFit è una web app.</p>
     <ol class="lf-welcome-steps"><li>Apri <a :href="publicWeb" target="_blank" rel="noopener noreferrer">www.lionfit.it</a> con <strong>Safari</strong>.</li><li>Premi il pulsante <strong>Condividi</strong> nella barra di Safari.</li><li>Seleziona <strong>Aggiungi alla schermata Home</strong> e conferma.</li></ol>
     <p class="lf-welcome-subtle">La voce potrebbe trovarsi nel menu Condividi. Non devi creare un nuovo account.</p>
    </template>
    <template v-else>
     <h3>Apri LionFit dal computer</h3>
     <p>Puoi usarlo normalmente dal browser. In Chrome o Edge, se disponibile, scegli <strong>Installa app</strong> dal menu del browser per aprirlo in una finestra dedicata.</p>
     <button v-if="installPrompt" type="button" class="lf-welcome-install" :disabled="busy" @click="installDesktop">{{busy?'Apertura…':'Installa LionFit sul computer'}}</button>
     <p class="lf-welcome-subtle">L'installazione desktop dipende dal browser e dal supporto della web app; non è obbligatoria.</p>
    </template>
   </section>
   <p v-if="status" class="lf-welcome-notice" role="status">{{status}}</p>
   <button type="button" class="lf-welcome-continue" @click="enterApp">Vai alla mia Dashboard <LionIcon name="chevron" :size="18"/></button>
   <p class="lf-welcome-footer">Puoi ritrovare queste istruzioni in <strong>Impostazioni → Installa LionFit</strong> in qualsiasi momento.</p>
  </section>
 </main>
</template>

<style scoped>
.lf-welcome{width:100%;min-height:calc(100dvh - 110px);display:grid;place-items:start center;padding:14px max(12px,env(safe-area-inset-right)) 32px;box-sizing:border-box}
.lf-welcome-panel{width:min(100%,760px);min-width:0;display:grid;gap:19px;padding:clamp(18px,4vw,34px);border:1px solid var(--border);border-radius:22px;background:var(--card);box-shadow:0 8px 28px rgb(0 0 0 / .08)}
.lf-welcome-intro{display:grid;justify-items:center;text-align:center;gap:9px}
.lf-welcome-check{width:64px;height:64px;border:2px solid var(--mint);border-radius:50%;display:grid;place-items:center;color:var(--mint);background:var(--green-bg)}
.lf-welcome-brand{display:grid;justify-items:center;gap:4px}.lf-welcome-logo{width:48px;height:48px;object-fit:contain;border-radius:12px}.lf-welcome-brand span{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--muted)}
.lf-welcome-eyebrow{font-size:11px;font-weight:750;letter-spacing:.14em;color:var(--mint);margin:0}
.lf-welcome-intro h1{font-size:clamp(25px,4.1vw,35px);line-height:1.1;margin:0}.lf-welcome-intro h2{font-size:clamp(16px,3.1vw,21px);line-height:1.3;color:var(--mint);margin:0;overflow-wrap:anywhere}.lf-welcome-description{font-size:14px;color:var(--muted);line-height:1.55;max-width:540px;margin:0}.lf-welcome-hero{width:100%;margin:4px 0 0;display:grid;gap:8px}.lf-welcome-cover{width:100%;display:block;max-height:220px;object-fit:cover;border-radius:16px;border:1px solid var(--border);background:#0f1621}.lf-welcome-hero figcaption{font-size:11px;color:var(--muted);margin:0}
.lf-welcome-device-section{display:grid;gap:11px}.lf-welcome-device-section h3{font-size:15px;margin:0}
.lf-welcome-devices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.lf-welcome-device{display:grid;justify-items:center;align-content:center;gap:7px;padding:12px 5px;min-height:78px;border:1px solid var(--border);border-radius:13px;background:var(--field,var(--card));color:var(--text);font:inherit;font-size:12px;font-weight:700;white-space:normal}.lf-welcome-device[aria-pressed=true]{border-color:var(--mint);background:var(--green-bg);color:var(--mint)}.lf-welcome-device:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.lf-welcome-guide{min-width:0;display:grid;gap:11px;padding:17px;border:1px solid var(--border);border-radius:14px;background:var(--field,var(--card))}.lf-welcome-guide-heading{display:flex;align-items:center;flex-wrap:wrap;gap:8px;justify-content:space-between}.lf-welcome-kicker{font-size:12px;color:var(--mint);font-weight:800}.lf-welcome-optional{font-size:11px;color:var(--muted)}.lf-welcome-guide h3{font-size:19px;margin:0}.lf-welcome-guide p{font-size:13px;line-height:1.55;color:var(--muted);margin:0}.lf-welcome-guide .lf-welcome-subtle{font-size:11px}.lf-welcome-steps{margin:0;padding-left:21px;display:grid;gap:8px;font-size:13px;line-height:1.55}.lf-welcome-steps a{color:var(--mint);overflow-wrap:anywhere}
.lf-welcome-primary-link,.lf-welcome-install{width:100%;box-sizing:border-box;display:flex;justify-content:center;align-items:center;gap:9px;border-radius:12px;padding:13px 15px;min-height:47px;font:inherit;font-size:14px;font-weight:700;color:#fff;text-decoration:none;background:#168754;border:1px solid #168754}.lf-welcome-continue{min-height:49px;display:flex;justify-content:center;align-items:center;gap:8px;width:100%;border-radius:12px;background:var(--mint);border:1px solid var(--mint);color:#07150f;font:inherit;font-weight:800;font-size:14px;white-space:normal}.lf-welcome-footer{text-align:center;font-size:11px;line-height:1.5;color:var(--muted);margin:0}.lf-welcome-notice{font-size:13px;line-height:1.4;margin:0;color:var(--muted)}
@media(max-width:430px){.lf-welcome{padding:8px 8px 22px}.lf-welcome-panel{padding:17px 13px;gap:15px;border-radius:15px}.lf-welcome-guide{padding:13px}.lf-welcome-device{font-size:11px;min-height:73px}}
@media(prefers-reduced-motion:reduce){.lf-welcome *{animation:none!important;transition:none!important}}
</style>
