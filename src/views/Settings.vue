<script setup lang="ts">
import {computed,ref,onMounted} from 'vue'
import {Capacitor} from '@capacitor/core'
import type {NativeUpdateStatus} from '../features/release/nativeUpdates'
import {sendPasswordResetEmail} from 'firebase/auth'
import appMeta from '../../package.json'
import {addDoc,collection,serverTimestamp} from 'firebase/firestore'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import {isStagingMode,isLiveMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession} from '../integrations/firebase/stagingSession'
import {signOutStaging,stagingSession} from '../integrations/firebase/stagingSession'
import { useLabStore } from '../stores/lab'
import LionIcon from '../components/LionIcon.vue'
import {interfaceLanguage,setInterfaceLanguage,uiText} from '../features/i18n/interfaceLanguage'
const router = useRouter()
const route=useRoute()
const emulator=computed(()=>import.meta.env.DEV&&route.query.source==='emulator')
const lab = useLabStore()
const supportOpen=ref(false),supportText=ref(''),supportSubject=ref(''),supportType=ref('problema'),supportStatus=ref(''),supportBusy=ref(false)
const verifiedCoach=ref(false),future=ref('')
const infoOpen=ref(false),securityOpen=ref(false),securityStatus=ref(''),securityBusy=ref(false)
const appVersion=appMeta.version
const nativeAndroid=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'
const updateBusy=ref(false),downloadBusy=ref(false),updateMessage=ref(''),installedAndroidVersion=ref('')
const latestUpdate=ref<Extract<NativeUpdateStatus,{kind:'available'}>|null>(null)
async function checkForUpdatesManually(){
 if(!nativeAndroid||updateBusy.value)return
 updateBusy.value=true;latestUpdate.value=null;updateMessage.value='Controllo GitHub in corso…'
 try{
  const {checkNativeUpdateNow}=await import('../features/release/nativeUpdates')
  const result=await checkNativeUpdateNow()
  if('installed' in result)installedAndroidVersion.value=result.installed
  if(result.kind==='available'){
   latestUpdate.value=result
   updateMessage.value=`Nuova versione ${result.tag} disponibile (installata: ${result.installed}).`
  }else if(result.kind==='current')updateMessage.value=`LionFit ${result.installed} è già aggiornato.`
  else if(result.kind==='error')updateMessage.value=result.message
  else updateMessage.value='Disponibile solo nell’APK Android.'
 }catch{updateMessage.value='Verifica non riuscita. Riprova più tardi.'}
 finally{updateBusy.value=false}
}
async function downloadLatestUpdate(){
 const current=latestUpdate.value
 if(!current||downloadBusy.value)return
 downloadBusy.value=true
 try{
  const {openAndroidApkDownload}=await import('../features/release/nativeUpdates')
  await openAndroidApkDownload(current.url)
 }catch{updateMessage.value='Impossibile aprire il download esterno. Usa il collegamento a GitHub Releases.'}
 finally{downloadBusy.value=false}
}
async function openLatestReleases(){
 try{
  const {openAndroidReleases}=await import('../features/release/nativeUpdates')
  await openAndroidReleases()
 }catch{updateMessage.value='Apri GitHub Releases dal browser del telefono.'}
}
// Anche in DEV usa soltanto i documenti legali pubblicabili; nessuna bozza raggiungibile.
const privacyHref='/legal/policy.html'
const termsHref='/legal/note-legali.html'
const cookiesHref='/legal/policy.html'
onMounted(async()=>{if(!emulator.value)return;try{const {readVerifiedDevSession}=await import('../integrations/firebase/devSession');verifiedCoach.value=(await readVerifiedDevSession()).role!=='atleta'}catch{/* Nessuna escalation autorizzazioni tramite UI. */}})
async function sendSupport(){
 const message=supportText.value.trim()
 const subject=supportSubject.value.trim().slice(0,100)
 if(!subject){supportStatus.value='Inserisci un oggetto per la richiesta.';return}
 if(message.length<2||message.length>1800){supportStatus.value='Scrivi un messaggio da 2 a 1800 caratteri.';return}
 const messageWithContext=`Tipo richiesta: ${supportType.value}\nOggetto: ${subject}\n\n${message}`
 if(!mayWriteLive()){supportStatus.value='L’invio del feedback è protetto finché la versione Live non è abilitata. Nessun messaggio è stato spedito.';return}
 supportBusy.value=true;supportStatus.value=''
 try{
  const session=await readStagingSession(),{db}=getStagingClients()
  const payload=session.role==='atleta'
   ? {athleteId:session.uid,athleteName:session.label,message:messageWithContext,createdAt:serverTimestamp()}
   : {athleteName:session.label+' (Coach)',message:messageWithContext,createdAt:serverTimestamp()}
  await addDoc(collection(db,'gyms',session.gymId,'support_feedback'),payload)
  supportStatus.value='Richiesta registrata. Le email automatiche al creatore saranno attivate dopo la configurazione del servizio di notifica.';supportText.value='';supportSubject.value=''
 }catch(e){supportStatus.value='Invio non riuscito: '+(e instanceof Error?e.message:String(e))}
 finally{supportBusy.value=false}
}
async function resetPasswordViaEmail(){
 if(securityBusy.value)return
 securityStatus.value=''
 if(!isStagingMode()||!isLiveMode()) {securityStatus.value='La modifica della password è disponibile soltanto dopo il login nella versione Live. Non verrà inviata alcuna email di prova.';return}
 const {auth}=getStagingClients()
 const user=auth.currentUser
 if(!user?.email){securityStatus.value='Account senza email verificabile: utilizza il tuo metodo di accesso o contatta l’assistenza.';return}
 if(!user.providerData.some(p=>p.providerId==='password')){securityStatus.value='Questo account non usa una password email: gestisci l’accesso dal provider esterno.';return}
 if(!window.confirm('Inviare a '+user.email+' un collegamento Firebase per cambiare la password?'))return
 securityBusy.value=true
 try{await sendPasswordResetEmail(auth,user.email);securityStatus.value='Se l’account è abilitato, riceverai un’email con le istruzioni. Controlla anche la posta indesiderata.'}
 catch(e){securityStatus.value='Impossibile inviare la richiesta: '+(e instanceof Error?e.message:String(e))}
 finally{securityBusy.value=false}
}
function backFromSettings(){
 const hasPrevious=Boolean(window.history.state?.back)
 if(hasPrevious)router.back()
 else void router.replace(profilePath.value)
}
const profilePath = computed(() => { const coach=isStagingMode()?stagingSession.value?.role!=='atleta':emulator.value?verifiedCoach.value:lab.role==='coach';return (coach?'/coach/profilo':'/profilo')+(emulator.value?'?source=emulator&edit=1':'?edit=1') })
async function exit() { if(isStagingMode()){await signOutStaging();await router.replace('/accesso');return}if(emulator.value){const {leaveDevSession}=await import('../integrations/firebase/devSession');await leaveDevSession();await router.push('/dev/accesso')}else{lab.logout();await router.push('/accesso')} }
</script>
<template>
 <div class="lfsettings">
  <header class="lfsettings-header"><button type="button" class="settings-back" aria-label="Indietro" @click="backFromSettings"><LionIcon name="back" :size="22"/></button><div><span class="eyebrow">{{uiText("LION FIT · ACCOUNT")}}</span><h1>{{uiText("Impostazioni")}}</h1></div></header>
  <div class="lfsettings-categories">
   <section class="lfsettings-group"><h2>{{uiText("Generali")}}</h2>
    <button class="lfsettings-entry" type="button" @click="lab.toggleTheme()"><LionIcon name="sun"/><span><b>{{uiText("Tema")}}</b><small>{{uiText("Personalizza l’aspetto dell’app")}}</small></span><strong>{{uiText(lab.theme==='dark'?'Scuro':'Chiaro')}}</strong><LionIcon name="chevron" :size="17"/></button>
    <button class="lfsettings-entry" type="button" @click="future='Le notifiche verranno abilitate dopo il collegamento ai servizi.'"><LionIcon name="mail"/><span><b>{{uiText("Notifiche")}}</b><small>{{uiText("Avvisi e comunicazioni")}}</small></span><em>{{uiText('In aggiornamento')}}</em><LionIcon name="chevron" :size="17"/></button>
    <label class="lfsettings-entry lfsettings-language"><LionIcon name="info"/><span><b>{{uiText('Lingua')}}</b><small>{{uiText("Interface language · impostazione locale")}}</small></span><select :value="interfaceLanguage" aria-label="Lingua interfaccia" @change="setInterfaceLanguage(($event.target as HTMLSelectElement).value)"><option value="it">🇮🇹 Italiano</option><option value="en">{{uiText("🇬🇧 English")}}</option></select></label>
    <div class="lfsettings-entry lfsettings-static"><LionIcon name="dumbbell"/><span><b>{{uiText("Unità di misura")}}</b><small>{{uiText("Valori del profilo")}}</small></span><strong>kg, cm</strong></div>
   </section>
   <section class="lfsettings-group"><h2>{{uiText("Privacy e account")}}</h2>
    <RouterLink class="lfsettings-entry" :to="profilePath"><LionIcon name="edit"/><span><b>{{uiText("Modifica profilo")}}</b><small>{{uiText("I tuoi dati personali")}}</small></span><LionIcon name="chevron" :size="17"/></RouterLink>
    <button class="lfsettings-entry" type="button" @click="securityOpen=true;securityStatus=''"><LionIcon name="shield"/><span><b>{{uiText("Sicurezza")}}</b><small>{{uiText("Password e accessi")}}</small></span><strong>{{uiText("Gestisci")}}</strong><LionIcon name="chevron" :size="17"/></button>
    <a class="lfsettings-entry"  :href="privacyHref" target="_blank" rel="noopener noreferrer"><LionIcon name="shield"/><span><b>{{uiText("Privacy")}}</b><small>{{uiText("Informativa sul trattamento dati")}}</small></span><LionIcon name="chevron" :size="17"/></a>
    <a class="lfsettings-entry"  :href="termsHref" target="_blank" rel="noopener noreferrer"><LionIcon name="clipboard"/><span><b>{{uiText("Termini e condizioni")}}</b><small>{{uiText("Documenti legali")}}</small></span><LionIcon name="chevron" :size="17"/></a>
    <a class="lfsettings-entry" :href="cookiesHref" target="_blank" rel="noopener noreferrer"><LionIcon name="info"/><span><b>{{uiText("Cookie e tecnologie locali")}}</b><small>{{uiText("Informazioni sul trattamento locale")}}</small></span><LionIcon name="chevron" :size="17"/></a>
   </section>
   <section class="lfsettings-group"><h2>{{uiText("App e supporto")}}</h2>
    <button class="lfsettings-entry" type="button" @click="infoOpen=true"><LionIcon name="info"/><span><b>{{uiText("Informazioni")}}</b><small>{{uiText("Chi ha creato LionFit, versione e aggiornamenti")}}</small></span><strong>{{appVersion}}</strong><LionIcon name="chevron" :size="17"/></button>
    <button class="lfsettings-entry" type="button" @click="supportOpen=true;supportStatus=''"><LionIcon name="mail"/><span><b>{{uiText("Assistenza e feedback")}}</b><small>{{uiText("Segnala problemi e suggerisci miglioramenti")}}</small></span><LionIcon name="chevron" :size="17"/></button>
   </section>
  </div>
  <p v-if="future" class="notice" role="status">{{uiText(future)}}</p>
  <button class="lfsettings-exit" @click="exit"><LionIcon name="logout" :size="19"/> {{uiText("Esci dall’account")}}</button>
  <div v-if="infoOpen" class="modal-overlay" @click.self="infoOpen=false"><div class="dialog lf-about-dialog" role="dialog" aria-modal="true" aria-label="Informazioni sull'applicazione">
   <div class="row between"><h2>{{uiText("LionFit · Informazioni")}}</h2><button class="bare" type="button" :aria-label="uiText('Chiudi informazioni')" @click="infoOpen=false">✕</button></div>
   <p class="eyebrow">{{uiText("LA TUA PALESTRA, SEMPRE CON TE.")}}</p>
   <p>{{uiText("LionFit è una piattaforma digitale pensata per semplificare la gestione degli allenamenti e l'organizzazione delle attività sportive, collegando palestre, allenatori e atleti in un ambiente condiviso.")}}</p>
   <p>{{uiText("Permette di consultare programmi e schede di allenamento, esplorare la libreria degli esercizi, seguire la programmazione e gestire le prenotazioni secondo le autorizzazioni del proprio ruolo.")}}</p>
   <p><strong>{{uiText("Ideazione e sviluppo:")}}</strong> Matteo Perini</p>
   <p><strong>{{uiText("Versione del progetto web:")}}</strong> {{appVersion}}</p>
   <p class="muted small">{{uiText("La versione Android installata può essere diversa da quella dei sorgenti web e si verifica nelle informazioni di sistema dell'app.")}}</p>
   <section v-if="nativeAndroid" class="lf-android-update-box" aria-label="Aggiornamenti Android">
    <h3>{{uiText('Aggiornamenti Android')}}</h3>
    <p v-if="installedAndroidVersion" class="muted small">{{uiText('Versione Android installata:')}} <strong>{{installedAndroidVersion}}</strong></p>
    <button class="primary wide" type="button" :disabled="updateBusy" @click="checkForUpdatesManually">{{uiText(updateBusy?'Controllo in corso…':'Controlla aggiornamenti')}}</button>
    <p v-if="updateMessage" class="muted small" role="status" aria-live="polite">{{uiText(updateMessage)}}</p>
    <button v-if="latestUpdate" class="primary wide" type="button" :disabled="downloadBusy" @click="downloadLatestUpdate">{{uiText(downloadBusy?'Apertura download…':'Scarica aggiornamento')}} {{latestUpdate.tag}}</button>
    <button class="secondary wide" type="button" @click="openLatestReleases">{{uiText('Apri GitHub Releases')}}</button>
   </section>
   <p v-else class="muted small">{{uiText('Il controllo manuale degli aggiornamenti APK è disponibile nell’app Android.')}}</p>
   <p>{{uiText("LionFit è un progetto in continua evoluzione: nuove funzioni, ottimizzazioni e miglioramenti vengono introdotti progressivamente. Le funzioni contrassegnate «In aggiornamento» non sono ancora disponibili.")}}</p>
   <button class="secondary wide" type="button" @click="infoOpen=false">{{uiText("Chiudi")}}</button>
  </div></div>
  <div v-if="securityOpen" class="modal-overlay" @click.self="securityOpen=false"><div class="dialog" role="dialog" aria-modal="true" :aria-label="uiText('Sicurezza account')" style="max-width:510px">
   <div class="row between"><h2>{{uiText("Sicurezza account")}}</h2><button class="bare" type="button" :aria-label="uiText('Chiudi sicurezza')" @click="securityOpen=false">✕</button></div>
   <p class="muted small">{{uiText("Per cambiare la password riceverai un link di ripristino da Firebase Authentication. La tua password non viene mai salvata da LionFit.")}}</p>
   <button class="primary wide" type="button" :disabled="securityBusy" @click="resetPasswordViaEmail">{{uiText(securityBusy?'Invio…':'Cambia password tramite email')}}</button>
   <p v-if="securityStatus" class="notice" role="status">{{uiText(securityStatus)}}</p>
  </div></div>
  <div v-if="supportOpen" class="modal-overlay" @click.self="supportOpen=false"><div class="dialog" role="dialog" aria-modal="true" :aria-label="uiText('Assistenza e feedback')" style="max-width:480px">
   <div class="row between"><h2>Assistenza &amp; feedback</h2><button class="bare" :aria-label="uiText('Chiudi feedback')" @click="supportOpen=false">✕</button></div>
   <p class="muted small">{{uiText("Descrivi un problema o proponi un miglioramento. Attualmente il messaggio viene salvato nel sistema assistenza della palestra se le scritture Live sono abilitate: non è ancora inoltrato via email al creatore.")}}</p>
   <label>{{uiText("Tipo di richiesta")}}<select v-model="supportType" :aria-label="uiText('Tipo richiesta assistenza')"><option value="problema">{{uiText("Segnala un problema")}}</option><option value="suggerimento">{{uiText("Suggerisci un miglioramento")}}</option><option value="account">{{uiText("Problema account o accesso")}}</option><option value="altro">{{uiText("Altro")}}</option></select></label>
   <label>{{uiText("Oggetto")}}<input v-model="supportSubject" type="text" maxlength="100" autocomplete="off" :placeholder="uiText('Es. Non vedo la mia prenotazione')"/></label>
   <label>{{uiText("Descrivi la richiesta")}}<textarea v-model="supportText" rows="5" maxlength="1800" :placeholder="uiText('Spiega cosa è successo o cosa vorresti migliorare…')"/></label>
   <p v-if="supportStatus" class="notice" role="status">{{uiText(supportStatus)}}</p>
   <div class="row between"><button class="secondary" @click="supportOpen=false">{{uiText("Annulla")}}</button><button class="primary" :disabled="supportBusy||!supportText.trim()" @click="sendSupport">{{uiText("Invia richiesta")}}</button></div>
  </div></div>
 </div>
</template>
