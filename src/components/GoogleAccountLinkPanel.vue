<script setup lang="ts">
import {computed,ref,onMounted} from 'vue'
import {GoogleAuthProvider,linkWithPopup,unlink,reload,sendEmailVerification} from 'firebase/auth'
import {Capacitor} from '@capacitor/core'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {isLiveMode} from '../integrations/firebase/stagingConfig'
const enabled=computed(()=>isLiveMode()&&import.meta.env.VITE_LIONFIT_GOOGLE_LINK==='ENABLED_AFTER_PROVIDER_REVIEW'&&!Capacitor.isNativePlatform()&&!!stagingSession.value)
const busy=ref(false),status=ref(''),verified=ref(false),connected=ref<string|null>(null)
const current=()=>getStagingClients().auth.currentUser
function googleAddress(){return current()?.providerData.find(x=>x.providerId==='google.com')?.email||null}
function refresh(){connected.value=googleAddress();verified.value=current()?.emailVerified===true}
onMounted(async()=>{await getStagingClients().auth.authStateReady();refresh()})
function checkAccount(){
 const u=current(),s=stagingSession.value
 if(!enabled.value||!u?.email||!s||s.uid!==u.uid||u.email.trim().toLowerCase()!==s.email.trim().toLowerCase())throw new Error('Sessione non coerente: esci e accedi nuovamente.')
 return u
}
async function refreshEmail(){busy.value=true;status.value='';try{await reload(checkAccount());refresh();status.value='Verifica aggiornata.'}catch(e){status.value=e instanceof Error?e.message:'Errore di verifica.'}finally{busy.value=false}}
async function sendVerification(){busy.value=true;status.value='';try{await sendEmailVerification(checkAccount());status.value='Email inviata. Apri il collegamento, poi premi Aggiorna verifica.'}catch(e){status.value=e instanceof Error?e.message:'Impossibile inviare.'}finally{busy.value=false}}
async function linkGoogle(){
 if(busy.value)return
 let user
 try{user=checkAccount()}catch(e){status.value=e instanceof Error?e.message:'Accesso richiesto.';return}
 if(!user.emailVerified){status.value='Verifica prima la tua email LionFit.';return}
 if(googleAddress()){refresh();status.value='Google è già collegato.';return}
 const recent=Date.parse(user.metadata.lastSignInTime||'')
 if(!Number.isFinite(recent)||Date.now()-recent>10*60*1000){status.value='Esci e accedi di nuovo con la password prima di collegare Google.';return}
 if(!window.confirm('Vuoi collegare Google all’account LionFit '+user.email+'? I tuoi dati resteranno invariati.'))return
 busy.value=true;status.value=''
 const originalUid=user.uid,expected=(user.email||'').trim().toLowerCase()
 const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'})
 try{
  // Begin popup before any await to preserve direct user interaction on browsers.
  const result=await linkWithPopup(user,provider)
  if(result.user.uid!==originalUid||current()?.uid!==originalUid)throw new Error('Account cambiato: verifica il tuo accesso.')
  const selected=result.user.providerData.find(x=>x.providerId==='google.com')?.email?.trim().toLowerCase()
  if(!selected||selected!==expected){
   try{await unlink(result.user,'google.com')}
   catch{throw new Error('Google associato con email diversa. NON uscire dall’account: contatta l’assistenza per scollegarlo.')}
   throw new Error('Devi scegliere Google con la stessa email. Il collegamento è stato annullato.')
  }
  refresh();status.value='Google collegato senza cambiare UID o dati. Ora puoi usare il pulsante Google per accedere.'
 }catch(e){
  const code=typeof e==='object'&&e!==null&&'code'in e?String((e as {code?:unknown}).code):''
  const known:Record<string,string>={
   'auth/credential-already-in-use':'Google già associato a un altro utente Firebase. Non è stato creato alcun collegamento.',
   'auth/email-already-in-use':'Email già associata a un altro utente. Contatta l’assistenza.',
   'auth/popup-closed-by-user':'Operazione annullata.',
   'auth/popup-blocked':'Permetti i popup di LionFit sul browser e riprova.',
   'auth/operation-not-allowed':'Abilita Google in Firebase Authentication.',
   'auth/requires-recent-login':'Esci, riaccedi con password e riprova subito.'
  }
  status.value=known[code]||(e instanceof Error?e.message:'Collegamento fallito.')
 }finally{busy.value=false}
}
</script>
<template>
 <section v-if="enabled" class="lf-google-link-section" aria-label="Account Google">
  <h3>Account Google</h3>
  <p class="muted small">Collega Google all'account esistente. Non crea un nuovo profilo e non modifica gli allenamenti.</p>
  <p class="small"><strong>Stato:</strong> {{connected?'Collegato: '+connected:'Non collegato'}}</p>
  <template v-if="!connected">
   <button v-if="!verified" type="button" class="secondary wide" :disabled="busy" @click="sendVerification">Invia email di verifica</button>
   <button v-if="!verified" type="button" class="secondary wide" :disabled="busy" @click="refreshEmail">Aggiorna verifica</button>
   <button v-if="verified" type="button" class="secondary wide" :disabled="busy" @click="linkGoogle">{{busy?'Collegamento…':'Collega account Google'}}</button>
  </template>
  <p v-if="status" class="notice" role="status">{{status}}</p>
 </section>
</template>
<style scoped>
.lf-google-link-section{display:grid;gap:9px;border-top:1px solid var(--border);padding-top:14px;margin-top:14px}
.lf-google-link-section h3{margin:0;font-size:16px}.lf-google-link-section p{margin:0}
</style>
