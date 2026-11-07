<script setup lang="ts">
/** Registrazione V1 portata in Vue: stessi documenti, ruoli e inviti monouso.
 * La conferma del server e' affidata alle Security Rules pubblicate, mai al solo client. */
import {computed,onMounted,ref,watch} from 'vue'
import {useRouter,useRoute} from 'vue-router'
import {createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,
 browserLocalPersistence,browserSessionPersistence,setPersistence,
 signInWithEmailAndPassword} from 'firebase/auth'
import {doc,getDocFromServer} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,signInStaging} from '../integrations/firebase/stagingSession'
import {isOperationalMode,isTestMode,stagingTestGym,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {finishPendingSignup} from '../integrations/firebase/registrationResume'
import {PENDING_SIGNUP_KEY,validatedPendingSignup,type PendingSignup} from '../features/invites/pendingSignup'
import {inviteFromQuery,validInvitation,validSignupFields,type SignupRole} from '../features/invites/registration'
const router=useRouter(),route=useRoute()
const tab=ref<'login'|'register'|'reset'>('login')
const email=ref(''),password=ref(''),remember=ref(true),showPassword=ref(false)
const regName=ref(''),regEmail=ref(''),regPassword=ref(''),regRole=ref<SignupRole>('athlete')
const gymName=ref(''),regGym=ref(''),regToken=ref(''),manualCodes=ref(false)
const acceptTerms=ref(false),acceptPrivacy=ref(false),regRemember=ref(true)
const busy=ref(false),error=ref(''),info=ref(''),verifyCoach=ref(false),canRecover=ref(false)
const PENDING_KEY='lf24_pending_coach_registration'
type PendingCoach={name:string;email:string;token:string;gymId:string}
function readPending():PendingCoach|null{
 try{const d=JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null') as Partial<PendingCoach>;
  if(d&&typeof d.name==='string'&&typeof d.email==='string'&&typeof d.token==='string'&&typeof d.gymId==='string'){
   validInvitation(d.gymId,d.token);return d as PendingCoach
  }
 }catch{}return null
}
const validLink=computed(()=>inviteFromQuery(route.query as Record<string,unknown>))
watch(validLink,v=>{
 if(v){regRole.value=v.role;regGym.value=v.gymId;regToken.value=v.token;tab.value='register';manualCodes.value=false}
},{immediate:true})
onMounted(()=>{
 try{const d=validatedPendingSignup(JSON.parse(sessionStorage.getItem(PENDING_SIGNUP_KEY)||'null'));
  if(d && (!validLink.value || (validLink.value.role===d.role && validLink.value.token===d.token && validLink.value.gymId===d.gymId))){canRecover.value=true;regRole.value=d.role;regName.value=d.name;regEmail.value=d.email;regGym.value=d.gymId;regToken.value=d.token;gymName.value=d.gymName}
 }catch{}
 const p=readPending();if(p){verifyCoach.value=true;tab.value='register';regRole.value='coach_invited';regName.value=p.name;regEmail.value=p.email;regGym.value=p.gymId;regToken.value=p.token}
})
function switchTab(v:'login'|'register'|'reset'){tab.value=v;error.value='';info.value=''}
// Vecchio collegamento /www/prenotazioni.html: dopo il login la pagina giusta
// dipende dal ruolo verificato dal server. Non apre pagine senza autenticazione.
function signedInDestination(role:'atleta'|'titolare'|'collaboratore'){
 if(isOperationalMode() && route.query.open==='bookings')return role==='atleta'?'/prenotazioni':'/coach/prenotazioni'
 return role==='atleta'?'/home':'/coach'
}
async function login(){if(busy.value)return
 busy.value=true;error.value='';info.value=''
 try{const s=await signInStaging(email.value.trim(),password.value,remember.value);password.value='';await router.replace(signedInDestination(s.role))}
 catch(e){error.value=e instanceof Error?e.message:'Accesso non riuscito.'}finally{busy.value=false}
}
async function reset(){if(!email.value.trim()){error.value='Inserisci la tua email.';return}
 busy.value=true;error.value='';info.value=''
 try{const {auth}=getStagingClients();await sendPasswordResetEmail(auth,email.value.trim());info.value='Se esiste un account associato alla tua email, riceverai il collegamento di recupero.'}
 catch(e){error.value=e instanceof Error?e.message:'Impossibile inviare l’email.'}finally{busy.value=false}
}
function signupIntent(name:string,email:string,gymId:string,token:string,gym:string,role:SignupRole):PendingSignup{
 return {name,email,role,gymId,token,gymName:gym,createdAt:Date.now()}
}
function rememberSignup(intent:PendingSignup){
 sessionStorage.setItem(PENDING_SIGNUP_KEY,JSON.stringify(intent));canRecover.value=true
}
async function afterSignup(){
 sessionStorage.removeItem(PENDING_SIGNUP_KEY);sessionStorage.removeItem(PENDING_KEY)
 canRecover.value=false;verifyCoach.value=false;regPassword.value=''
 const s=await readStagingSession();await router.replace(signedInDestination(s.role))
}
async function completeCoach(){
 if(!mayWriteLive())throw new Error('Registrazione temporaneamente disabilitata: scritture Firebase non autorizzate per questa versione.');
 const p=readPending()??(regRole.value==='coach_invited'&&regName.value.trim()&&regEmail.value.trim()&&regGym.value.trim()&&regToken.value.trim()
  ?{name:regName.value.trim(),email:regEmail.value.trim().toLowerCase(),gymId:regGym.value.trim(),token:regToken.value.trim().toLowerCase()}:null)
 if(!p)throw new Error('Riapri il link dell’invito Coach per riprendere la registrazione.')
 validInvitation(p.gymId,p.token)
 const {auth,db}=getStagingClients();await auth.authStateReady()
 let user=auth.currentUser
 if(!user && regPassword.value && regEmail.value.toLowerCase()===p.email){
  await setPersistence(auth,regRemember.value?browserLocalPersistence:browserSessionPersistence)
  user=(await signInWithEmailAndPassword(auth,p.email,regPassword.value)).user
 }
 if(!user||user.email?.toLowerCase()!==p.email)throw new Error('Accedi con lo stesso account invitato per completare la verifica.')
 const intent=signupIntent(p.name,p.email,p.gymId,p.token,'','coach_invited')
 const result=await finishPendingSignup(db,user,intent)
 if(result==='verify-email')throw new Error('Email non ancora verificata. Apri il link ricevuto e riprova.')
 await afterSignup()
}
async function confirmCoach(){if(busy.value)return;busy.value=true;error.value='';info.value=''
 try{await completeCoach()}catch(e){error.value=e instanceof Error?e.message:'Verifica non completata.'}finally{busy.value=false}}
async function resendVerification(){if(busy.value)return;busy.value=true;error.value='';info.value=''
 try{const {auth}=getStagingClients();if(!auth.currentUser)throw new Error('Accedi con l’account invitato prima di richiedere una nuova email.');await sendEmailVerification(auth.currentUser);info.value='Email di verifica inviata. Controlla anche lo spam.'}
 catch(e){error.value=e instanceof Error?e.message:'Invio non riuscito.'}finally{busy.value=false}}
async function recoverRegistration(){
 if(busy.value)return
 if(!mayWriteLive()){error.value='Registrazione temporaneamente disabilitata: scritture Firebase non autorizzate per questa versione.';return}
 busy.value=true;error.value='';info.value=''
 try{
  const name=regName.value.trim(),address=regEmail.value.trim().toLowerCase(),pass=regPassword.value
  validSignupFields(name,address,pass)
  if(!acceptTerms.value||!acceptPrivacy.value)throw new Error('Conferma Termini e Privacy anche per il recupero.')
  const intent=signupIntent(name,address,regGym.value.trim(),regToken.value.trim().toLowerCase(),gymName.value.trim(),regRole.value)
  if(intent.role==='admin'&&(!intent.gymName||intent.gymName.length>90))throw new Error('Inserisci il nome esatto della palestra precedente.')
  if(intent.role!=='admin')validInvitation(intent.gymId,intent.token)
  if(isTestMode() && (intent.role==='admin'||!stagingTestGym()||intent.gymId!==stagingTestGym()))throw new Error("STAGING: usa solo inviti della palestra fittizia configurata. L'account titolare va preparato nel progetto di prova.")
  rememberSignup(intent)
  const {auth,db}=getStagingClients()
  await setPersistence(auth,regRemember.value?browserLocalPersistence:browserSessionPersistence)
  const user=(await signInWithEmailAndPassword(auth,address,pass)).user
  const result=await finishPendingSignup(db,user,intent)
  if(result==='verify-email'){
   sessionStorage.setItem(PENDING_KEY,JSON.stringify({name,email:address,gymId:intent.gymId,token:intent.token}))
   verifyCoach.value=true;info.value='Account recuperato. Verifica la tua email prima di completare l’invito coach.'
  } else await afterSignup()
 }catch(e){error.value=e instanceof Error?e.message:'Impossibile recuperare la registrazione.'}
 finally{busy.value=false}
}
async function register(){if(busy.value)return;if(!mayWriteLive()){error.value='Registrazione temporaneamente disabilitata: scritture Firebase non autorizzate per questa versione.';return}busy.value=true;error.value='';info.value=''
 try{
  const name=regName.value.trim(),address=regEmail.value.trim().toLowerCase(),pass=regPassword.value
  validSignupFields(name,address,pass)
  if(!acceptTerms.value||!acceptPrivacy.value)throw new Error('Accetta Termini d’uso e Privacy Policy.')
  let gid=regGym.value.trim(),inv=regToken.value.trim().toLowerCase(),gym=gymName.value.trim()
  if(isTestMode() && (regRole.value==='admin'||!stagingTestGym()||gid!==stagingTestGym()))throw new Error('STAGING: registrazione consentita solo tramite invito della palestra fittizia. Il titolare test si prepara separatamente.')
  const {auth,db}=getStagingClients()
  if(regRole.value==='admin'){
   if(!gym||gym.length>90)throw new Error('Inserisci il nome della palestra (massimo 90 caratteri).')
  }else{
   validInvitation(gid,inv)
   if(regRole.value==='athlete'){
    const snap=await getDocFromServer(doc(db,'gyms',gid,'athlete_invites',inv)),d=snap.data()
    if(!d||d.status!=='pending'||d.gymId!==gid||!d.expiresAt||d.expiresAt.toMillis()<=Date.now())throw new Error('Invito atleta scaduto, revocato o già utilizzato.')
    gym=String(d.gymName||'')
   }
  }
  const intent=signupIntent(name,address,gid,inv,gym,regRole.value)
  rememberSignup(intent) // Prima dell'Auth, senza scrivere mai la password.
  await setPersistence(auth,regRemember.value?browserLocalPersistence:browserSessionPersistence)
  let user=auth.currentUser
  if(!user||user.email?.toLowerCase()!==address){
   user=(await createUserWithEmailAndPassword(auth,address,pass)).user
  }
  const result=await finishPendingSignup(db,user,intent)
  if(result==='verify-email'){
   sessionStorage.setItem(PENDING_KEY,JSON.stringify({name,email:address,gymId:gid,token:inv}))
   verifyCoach.value=true
   await sendEmailVerification(user)
   info.value='Controlla la tua email. Apri il link di verifica, poi torna qui e premi «Ho verificato l’email».'
   regPassword.value='';return
  }
  if(regRole.value==='athlete'){
   // Indice Team come nella V1; errore non invalida la registrazione già completata.
   try{const {setDoc}=await import('firebase/firestore');await setDoc(doc(db,'team_public',user.uid),{gymId:gid,role:'athlete',name,surname:'',bio:'',photoURL:''},{merge:true})}
   catch{info.value='Account creato. Il profilo Team sarà sincronizzato successivamente.'}
  }
  await afterSignup()
 }catch(e){
  const code=typeof e==='object'&&e!==null&&'code'in e?String((e as {code:unknown}).code):''
  if(code==='auth/email-already-in-use')canRecover.value=true
  error.value=code==='auth/email-already-in-use'?'Email già registrata. Se una registrazione precedente si era interrotta, usa Recupera registrazione qui sotto; altrimenti Accedi.':
   code==='auth/weak-password'?'Scegli una password di almeno sei caratteri.':
   e instanceof Error?e.message:'Registrazione interrotta. Non creare un secondo account: usa Recupera registrazione.'
 }finally{busy.value=false}
}

</script>
<template>
 <div class="access-wrap v1-login">
  <div class="login-identity"><img src="/v1-preview/LOGO-APP.png" alt="Lion Fit"/><h1>LION <span>FIT</span></h1><h2>GESTIONE &amp; PROGRAMMI</h2><p>Accedi al tuo piano o registrati con la tua palestra</p></div>
  <section class="panel access-card" :aria-label="isTestMode()?'Accesso Lion Fit in ambiente di prova':'Accesso Lion Fit'">
   <div class="login-tabs"><button type="button" :class="{selected:tab==='login'}" @click="switchTab('login')">ACCEDI</button><button type="button" :class="{selected:tab==='register'}" @click="switchTab('register')">REGISTRATI</button></div>
   <form v-if="tab==='login'" class="stack" @submit.prevent="login">
    <label>EMAIL<input v-model="email" type="email" autocomplete="username" placeholder="la-tua-email@esempio.it" maxlength="160" required/></label>
    <label>PASSWORD<span class="password-control"><input v-model="password" :type="showPassword?'text':'password'" autocomplete="current-password" placeholder="••••••••" required/><button type="button" :aria-label="showPassword?'Nascondi password':'Mostra password'" @click="showPassword=!showPassword">{{showPassword?'Nascondi':'Mostra'}}</button></span></label>
    <div class="row between login-recover-row"><button class="bare small" type="button" @click="switchTab('reset')">Password dimenticata?</button></div>
    <label class="checkline login-remember-row"><input v-model="remember" type="checkbox"/><span><strong>Mantieni l'accesso</strong><small>Disattivala per una sessione temporanea.</small></span></label>
    <button type="submit" class="primary wide" :disabled="busy">{{busy?'ACCESSO IN CORSO…':'ACCEDI'}}</button>
   </form>
   <form v-else-if="tab==='reset'" class="stack" @submit.prevent="reset"><h2>RECUPERA LA PASSWORD</h2><p class="muted small">Inserisci la tua email per ricevere un collegamento di recupero.</p><label>EMAIL<input v-model="email" type="email" autocomplete="email" required/></label><button class="primary wide" type="submit" :disabled="busy">INVIA EMAIL DI RECUPERO</button><button class="secondary wide" type="button" @click="switchTab('login')">← Torna all'accesso</button></form>
   <form v-else class="stack register-v1" @submit.prevent="register">
    <div v-if="verifyCoach" class="register-verification"><strong>Verifica l'email per diventare coach</strong><p>Apri il link ricevuto, torna qui e conferma. Non creare un secondo account.</p><button class="primary wide" type="button" :disabled="busy" @click="confirmCoach">Ho verificato l'email · Completa registrazione</button><button class="secondary wide" type="button" :disabled="busy" @click="resendVerification">Invia nuovamente l'email</button></div>
    <label>NOME E COGNOME<input v-model="regName" autocomplete="name" required maxlength="90" placeholder="Es. Mario Rossi"/></label>
    <label>EMAIL<input v-model="regEmail" type="email" autocomplete="email" maxlength="160" required placeholder="la-tua-email@esempio.it"/></label>
    <label>PASSWORD<input v-model="regPassword" type="password" autocomplete="new-password" minlength="6" :required="!verifyCoach" placeholder="••••••••"/></label>
    <label>TIPO DI ACCOUNT<select v-model="regRole" :disabled="!!validLink||verifyCoach"><option value="athlete">Atleta (Iscriviti a una palestra)</option><option v-if="!isTestMode()" value="admin">Coach titolare (Crea palestra)</option><option value="coach_invited">Coach invitato (Palestra esistente)</option></select></label>
    <div v-if="regRole==='athlete'||regRole==='coach_invited'" class="register-invite-group">
     <p v-if="validLink" class="register-link-loaded">✓ Invito personale caricato dal link ricevuto.</p>
     <p v-else>Apri il link personale inviato dalla palestra. Hai solo i codici? Inseriscili qui sotto.</p>
     <details :open="manualCodes||!!validLink" @toggle="manualCodes=($event.target as HTMLDetailsElement).open"><summary>Inserisci codice manualmente</summary>
      <label>{{regRole==='athlete'?'CODICE PERSONALE ATLETA (MONOUSO)':'CODICE SPECIALE COACH'}}<input v-model="regToken" type="text" autocomplete="off" placeholder="Codice lungo ricevuto dalla palestra" maxlength="48"/></label>
      <label>ID PALESTRA (COMPILATO DAL COLLEGAMENTO)<input v-model="regGym" type="text" autocomplete="off" placeholder="gym_..."/></label>
     </details>
    </div>
    <label v-if="regRole==='admin'">NOME DELLA TUA PALESTRA<input v-model="gymName" maxlength="90" placeholder="Es. Leoni di San Marco" :required="regRole==='admin'"/></label>
    <div class="register-consents"><label><input v-model="acceptTerms" type="checkbox" required/><span>Accetto i <a href="/v1-preview/note-legali.html" target="_blank" rel="noopener">Termini d'uso</a>.</span></label><label><input v-model="acceptPrivacy" type="checkbox" required/><span>Acconsento alla <a href="/v1-preview/policy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label></div>
    <label class="checkline login-remember-row"><input v-model="regRemember" type="checkbox"/><span><strong>Mantieni l'accesso</strong><small>Disattivala per una sessione temporanea.</small></span></label>
    <button type="submit" class="primary wide" :disabled="busy||verifyCoach">{{busy?'REGISTRAZIONE IN CORSO…':'CREA ACCOUNT'}}</button>
    <div v-if="canRecover && !verifyCoach" class="register-verification"><p class="muted small">Se l'account Firebase è stato creato ma la registrazione non è terminata, puoi riprenderla usando la stessa email, password e invito. Non sarà creato un secondo UID.</p><button class="secondary wide" type="button" :disabled="busy" @click="recoverRegistration">RECUPERA REGISTRAZIONE INTERROTTA</button></div>
   </form>
   <p v-if="error" class="notice" role="alert">{{error}}</p><p v-if="info" class="notice" role="status">{{info}}</p>
  </section>
 </div>
</template>
