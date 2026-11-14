<script setup lang="ts">
import {computed,ref,onMounted,onUnmounted,watch} from 'vue'
import CalendarPilotSettings from '../components/CalendarPilotSettings.vue'
import {calendarPilotEnabled} from '../integrations/firebase/calendarPilot'
const calendarOpen=ref(false)
import PushSettings from '../components/PushSettings.vue'
import {pushSupported} from '../integrations/firebase/pushNotifications'
const pushAvailable=ref(false),pushOpen=ref(false)
onMounted(async()=>{pushAvailable.value=await pushSupported()})
import BillingSandbox from '../components/BillingSandbox.vue'
import {billingSandboxEnabled} from '../integrations/firebase/billingSandbox'
import GymIdentity from '../components/GymIdentity.vue'
import DashboardPreferences from '../components/DashboardPreferences.vue'
import SupportTickets from '../components/SupportTickets.vue'
import {verifyPlatformAccess} from '../integrations/firebase/platformAccess'
import {Capacitor} from '@capacitor/core'
import type {NativeUpdateStatus} from '../features/release/nativeUpdates'
import {sendPasswordResetEmail} from 'firebase/auth'
import appMeta from '../../package.json'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import {isStagingMode,isLiveMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {watchCompetitionEnabled,setCompetitionEnabled} from '../integrations/firestore/competitions'
import type {Unsubscribe} from 'firebase/firestore'
import type {StagingSession} from '../integrations/firebase/stagingSession'
import {readStagingSession} from '../integrations/firebase/stagingSession'
import {signOutStaging,stagingSession} from '../integrations/firebase/stagingSession'
import { useLabStore } from '../stores/lab'
import LionIcon from '../components/LionIcon.vue'
import {interfaceLanguage,setInterfaceLanguage,uiText} from '../features/i18n/interfaceLanguage'
const router = useRouter()
const route=useRoute()
const emulator=computed(()=>import.meta.env.DEV&&route.query.source==='emulator')
const lab = useLabStore()
const competitionAvailable=ref(false),competitionEnabled=ref(false),competitionBusy=ref(false),competitionMessage=ref('')
let competitionUnsub:Unsubscribe|undefined,competitionSession:StagingSession|undefined,settingsAlive=true
onMounted(async()=>{if(!isStagingMode())return;try{const s=await readStagingSession();if(!settingsAlive||s.role!=='titolare')return;competitionSession=s;competitionUnsub=watchCompetitionEnabled(getStagingClients().db,s.gymId,enabled=>{if(settingsAlive){competitionAvailable.value=true;competitionEnabled.value=enabled}},()=>{competitionAvailable.value=false})}catch{/* module unavailable until verification */}})
onUnmounted(()=>{settingsAlive=false;competitionUnsub?.()})
async function toggleCompetition(){if(competitionBusy.value||!competitionSession||!competitionAvailable.value||!mayWriteLive())return;competitionBusy.value=true;competitionMessage.value='';try{await setCompetitionEnabled(getStagingClients().db,competitionSession,!competitionEnabled.value);competitionMessage.value='Preferenza salvata.'}catch(e){competitionMessage.value='Salvataggio non riuscito: '+(e instanceof Error?e.message:String(e))}finally{competitionBusy.value=false}}
const billingOpen=ref(false)
const identityOpen=ref(false),dashboardOpen=ref(false),ticketsOpen=ref(route.query.inboxSupport==='1')
watch(()=>route.query.inboxSupport,v=>{if(v==='1')ticketsOpen.value=true})
const verifiedCoach=ref(false),platformAllowed=ref(false)
watch(()=>stagingSession.value?.uid,async(uid)=>{platformAllowed.value=false;if(uid&&isStagingMode()){const ok=await verifyPlatformAccess();if(stagingSession.value?.uid===uid)platformAllowed.value=ok}},{immediate:true})
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
const canResetPassword=computed(()=>{if(!isLiveMode()||!stagingSession.value)return false;try{return !!getStagingClients().auth.currentUser?.providerData.some(p=>p.providerId==='password')}catch{return false}})
onMounted(async()=>{if(!emulator.value)return;try{const {readVerifiedDevSession}=await import('../integrations/firebase/devSession');verifiedCoach.value=(await readVerifiedDevSession()).role!=='atleta'}catch{/* Nessuna escalation autorizzazioni tramite UI. */}})
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
const profilePath = computed(() => { const coach=isStagingMode()?stagingSession.value?.role!=='atleta':emulator.value?verifiedCoach.value:lab.role==='coach';return (coach?'/coach/profilo':'/profilo')+(emulator.value?'?source=emulator':'') })
async function exit() { if(isStagingMode()){if(await signOutStaging())await router.replace('/accesso');return}if(emulator.value){const {leaveDevSession}=await import('../integrations/firebase/devSession');await leaveDevSession();await router.push('/dev/accesso')}else{lab.logout();await router.push('/accesso')} }
</script>
<template>
 <div class="lfsettings">
  <header class="lfsettings-header"><div><span class="eyebrow">{{uiText("LION FIT · ACCOUNT")}}</span><h1>{{uiText("Impostazioni")}}</h1></div></header>
  <div class="lfsettings-categories">
   <section class="lfsettings-group"><h2>{{uiText("Generali")}}</h2>
    <button class="lfsettings-entry" type="button" @click="lab.toggleTheme()"><LionIcon name="sun"/><span><b>{{uiText("Tema")}}</b><small>{{uiText("Personalizza l’aspetto dell’app")}}</small></span><strong>{{uiText(lab.theme==='dark'?'Scuro':'Chiaro')}}</strong><LionIcon name="chevron" :size="17"/></button>

    <label class="lfsettings-entry lfsettings-language"><LionIcon name="info"/><span><b>{{uiText('Lingua')}}</b><small>{{uiText("Interface language · impostazione locale")}}</small></span><select :value="interfaceLanguage" aria-label="Lingua interfaccia" @change="setInterfaceLanguage(($event.target as HTMLSelectElement).value)"><option value="it">🇮🇹 Italiano</option><option value="en">{{uiText("🇬🇧 English")}}</option></select></label>
    <div class="lfsettings-entry lfsettings-static"><LionIcon name="dumbbell"/><span><b>{{uiText("Unità di misura")}}</b><small>{{uiText("Valori del profilo")}}</small></span><strong>kg, cm</strong></div>
   </section>
   <section v-if="isStagingMode()&&stagingSession&&stagingSession.role!=='atleta'" class="lfsettings-group"><h2>Personalizzazione</h2>
    <button v-if="stagingSession.role==='titolare'" type="button" class="lfsettings-entry" :aria-expanded="identityOpen" @click="identityOpen=!identityOpen"><LionIcon name="gym"/><span><b>Identità palestra</b><small>Nome, logo e copertina</small></span><LionIcon name="chevron" :size="17"/></button>
    <GymIdentity v-if="identityOpen&&stagingSession.role==='titolare'" edit/>
    <button type="button" class="lfsettings-entry" :aria-expanded="dashboardOpen" @click="dashboardOpen=!dashboardOpen"><LionIcon name="settings"/><span><b>Personalizza dashboard</b><small>Seleziona i tuoi riquadri</small></span><LionIcon name="chevron" :size="17"/></button>
    <DashboardPreferences v-if="dashboardOpen"/>
   </section>
   <section v-if="billingSandboxEnabled()&&stagingSession?.role==='titolare'" class="lfsettings-group"><h2>Abbonamento · Ambiente di test</h2><button type="button" class="lfsettings-entry" :aria-expanded="billingOpen" @click="billingOpen=!billingOpen"><LionIcon name="clipboard"/><span><b>Abbonamento LionFit (Sandbox)</b><small>Prova gratuita, piani e rinnovi simulati</small></span><LionIcon name="chevron" :size="17"/></button><BillingSandbox v-if="billingOpen"/></section>
   <section v-if="platformAllowed" class="lfsettings-group"><h2>LionFit · Gestione piattaforma</h2><RouterLink class="lfsettings-entry" to="/lionfit-control"><LionIcon name="shield"/><span><b>Control Center</b><small>Accesso riservato Super Admin</small></span><LionIcon name="chevron" :size="17"/></RouterLink></section>
   <section v-if="competitionAvailable" class="lfsettings-group"><h2>Moduli palestra</h2><button type="button" class="lfsettings-entry" :disabled="competitionBusy||!mayWriteLive()" @click="toggleCompetition"><LionIcon name="calendar"/><span><b>Competizioni e gare</b><small>Mostra o nascondi il modulo della palestra, senza cancellare gli eventi.</small></span><strong>{{competitionEnabled?'Attivo':'Disattivo'}}</strong></button><p v-if="competitionMessage" class="notice" role="status">{{competitionMessage}}</p></section>
   <section v-if="pushAvailable&&stagingSession" class="lfsettings-group"><h2>Notifiche</h2><button class="lfsettings-entry" type="button" :aria-expanded="pushOpen" @click="pushOpen=!pushOpen"><LionIcon name="calendar"/><span><b>Avvisi e promemoria Agenda</b><small>Personalizza questo dispositivo</small></span><LionIcon name="chevron" :size="17"/></button><PushSettings v-if="pushOpen"/></section>
   <section v-if="calendarPilotEnabled()&&stagingSession" class="lfsettings-group"><h2>Integrazioni</h2><button class="lfsettings-entry" type="button" :aria-expanded="calendarOpen" @click="calendarOpen=!calendarOpen"><LionIcon name="calendar"/><span><b>Google Calendar</b><small>Collegamento facoltativo</small></span><LionIcon name="chevron" :size="17"/></button><CalendarPilotSettings v-if="calendarOpen" :key="stagingSession.uid"/></section>
   <section class="lfsettings-group"><h2>{{uiText("Privacy e account")}}</h2>
    <RouterLink v-if="!isStagingMode()||stagingSession" class="lfsettings-entry" :to="profilePath+(emulator?'&edit=1':'?edit=1')"><LionIcon name="edit"/><span><b>{{uiText("Modifica profilo")}}</b><small>{{uiText("I tuoi dati personali")}}</small></span><LionIcon name="chevron" :size="17"/></RouterLink>
    <button v-if="canResetPassword" class="lfsettings-entry" type="button" @click="securityOpen=true;securityStatus=''"><LionIcon name="shield"/><span><b>{{uiText("Sicurezza")}}</b><small>{{uiText("Password e accessi")}}</small></span><strong>{{uiText("Gestisci")}}</strong><LionIcon name="chevron" :size="17"/></button>
    <a class="lfsettings-entry"  :href="privacyHref" target="_blank" rel="noopener noreferrer"><LionIcon name="shield"/><span><b>{{uiText("Privacy")}}</b><small>{{uiText("Informativa, cookie e tecnologie locali")}}</small></span><LionIcon name="chevron" :size="17"/></a>
    <a class="lfsettings-entry"  :href="termsHref" target="_blank" rel="noopener noreferrer"><LionIcon name="clipboard"/><span><b>{{uiText("Termini e condizioni")}}</b><small>{{uiText("Documenti legali")}}</small></span><LionIcon name="chevron" :size="17"/></a>
   </section>
   <section class="lfsettings-group"><h2>{{uiText("App e supporto")}}</h2>
    <button class="lfsettings-entry" type="button" @click="infoOpen=true"><LionIcon name="info"/><span><b>{{uiText("Informazioni")}}</b><small>{{uiText("Chi ha creato LionFit, versione e aggiornamenti")}}</small></span><strong>{{appVersion}}</strong><LionIcon name="chevron" :size="17"/></button>
    <button v-if="isStagingMode()" class="lfsettings-entry" type="button" :aria-expanded="ticketsOpen" @click="ticketsOpen=!ticketsOpen"><LionIcon name="mail"/><span><b>{{uiText("Assistenza e feedback")}}</b><small>{{uiText("Segnala problemi e suggerisci miglioramenti")}}</small></span><LionIcon name="chevron" :size="17"/></button>
   </section>
  </div>

  <SupportTickets v-if="ticketsOpen&&isStagingMode()"/>
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
   <p>{{uiText("LionFit è un progetto in continua evoluzione: nuove funzioni, ottimizzazioni e miglioramenti vengono introdotti progressivamente. Le funzioni non ancora disponibili non sono mostrate nelle impostazioni.")}}</p>
   <button class="secondary wide" type="button" @click="infoOpen=false">{{uiText("Chiudi")}}</button>
  </div></div>
  <div v-if="securityOpen" class="modal-overlay" @click.self="securityOpen=false"><div class="dialog" role="dialog" aria-modal="true" :aria-label="uiText('Sicurezza account')" style="max-width:510px">
   <div class="row between"><h2>{{uiText("Sicurezza account")}}</h2><button class="bare" type="button" :aria-label="uiText('Chiudi sicurezza')" @click="securityOpen=false">✕</button></div>
   <p class="muted small">{{uiText("Per cambiare la password riceverai un link di ripristino da Firebase Authentication. La tua password non viene mai salvata da LionFit.")}}</p>
   <button class="primary wide" type="button" :disabled="securityBusy" @click="resetPasswordViaEmail">{{uiText(securityBusy?'Invio…':'Cambia password tramite email')}}</button>
   <p v-if="securityStatus" class="notice" role="status">{{uiText(securityStatus)}}</p>
  </div></div>

 </div>
</template>
