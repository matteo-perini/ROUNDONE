<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref,computed} from 'vue'
import {browserLocalPersistence,browserSessionPersistence,setPersistence,signInWithCustomToken,signOut} from 'firebase/auth'
import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,stagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {isLiveMode} from '../integrations/firebase/stagingConfig'

const props=defineProps<{remember:boolean}>()
const emit=defineEmits<{(e:'authenticated',role:StagingSession['role']):void;(e:'error',message:string):void}>()
const target=ref<HTMLElement|null>(null)
const busy=ref(false),message=ref('')
const clientId=String(import.meta.env.VITE_LIONFIT_GOOGLE_WEB_CLIENT_ID||'').trim()
const active=computed(()=>isLiveMode()&&import.meta.env.VITE_LIONFIT_GOOGLE_LOGIN==='ENABLED_AFTER_BACKEND'&&/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId))
type CredentialResponse={credential?:string}
type GoogleAPI={accounts:{id:{initialize:(config:{client_id:string;callback:(r:CredentialResponse)=>void;auto_select?:boolean;ux_mode?:'popup'})=>void;renderButton:(target:HTMLElement,options:Record<string,string|number>)=>void}}}
declare global{interface Window{google?:GoogleAPI}}
let gisPromise:Promise<void>|null=null
function loadGoogle():Promise<void>{
 if(window.google?.accounts?.id)return Promise.resolve()
 if(gisPromise)return gisPromise
 const pending=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script')
  script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true
  script.onload=()=>window.google?.accounts?.id?resolve():reject(new Error('Servizio Google non disponibile.'))
  script.onerror=()=>reject(new Error('Impossibile caricare il pulsante Google. Controlla la connessione.'))
  document.head.appendChild(script)
 }).catch(e=>{gisPromise=null;throw e})
 gisPromise=pending
 return pending
}
let alive=true
async function onCredential(response:CredentialResponse){
 if(!alive||busy.value)return
 if(!response.credential){emit('error','Google non ha restituito una credenziale.');return}
 busy.value=true;message.value='Accesso Google in corso…'
 const {auth}=getStagingClients()
 let newSession=false
 try{
  if(!isLiveMode())throw new Error('Questo accesso è disponibile solo nella versione web LionFit.')
  await auth.authStateReady()
  if(auth.currentUser)throw new Error('Sei già connesso: esci dall’account corrente prima di cambiare accesso.')
  const fn=httpsCallable<{googleIdToken:string},{customToken:string}>(getFunctions(auth.app,'europe-west1'),'lfGoogleSignInExisting',{timeout:30000})
  const result=await fn({googleIdToken:response.credential})
  if(typeof result.data?.customToken!=='string'||result.data.customToken.length<100)throw new Error('Risposta server non valida.')
  await setPersistence(auth,props.remember?browserLocalPersistence:browserSessionPersistence)
  if(isLiveMode()){
   const {clearLinkedProfiles}=await import('../integrations/firebase/linkedProfiles')
   await clearLinkedProfiles()
  }
  await signInWithCustomToken(auth,result.data.customToken)
  newSession=true
  const s=await readStagingSession()
  if(!alive)throw new Error('Finestra chiusa durante l’accesso.')
  message.value=''
  emit('authenticated',s.role)
 }catch(e){
  if(newSession){try{await signOut(auth)}catch{}stagingSession.value=null}
  message.value=''
  const code=typeof e==='object'&&e!==null&&'code'in e?String((e as {code?:unknown}).code):''
  const known:Record<string,string>={
   'functions/permission-denied':'Account Google non collegato: accedi con la password LionFit e collegalo dalle Impostazioni.',
   'functions/unauthenticated':'Verifica Google non riuscita. Riprova.',
   'functions/unavailable':'Servizio Google momentaneamente non disponibile.',
   'functions/failed-precondition':'Accesso Google non ancora configurato.'
  }
  emit('error',known[code]||(e instanceof Error?e.message:'Accesso Google non riuscito.'))
 }finally{busy.value=false}
}
onMounted(async()=>{
 if(!active.value)return
 try{
  await loadGoogle()
  if(!alive||!target.value||!window.google?.accounts?.id)return
  window.google.accounts.id.initialize({client_id:clientId,callback:onCredential,auto_select:false,ux_mode:'popup'})
  window.google.accounts.id.renderButton(target.value,{theme:'outline',size:'large',text:'signin_with',shape:'rectangular',width:310,locale:'it'})
 }catch(e){message.value=e instanceof Error?e.message:'Google non disponibile.'}
})
onBeforeUnmount(()=>{alive=false})
</script>
<template>
 <section v-if="active" class="lf-google-login-cta" aria-label="Accesso con Google">
  <p class="muted small">Oppure accedi con Google, se l'hai già collegato al tuo account LionFit.</p>
  <div ref="target" class="lf-google-render" :aria-busy="busy"></div>
  <p v-if="message" class="muted small" role="status">{{message}}</p>
 </section>
</template>
<style scoped>
.lf-google-login-cta{display:grid;justify-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.lf-google-login-cta>p{margin:0;text-align:center}.lf-google-render{min-height:40px;max-width:100%;overflow:hidden}
</style>
