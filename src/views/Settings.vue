<script setup lang="ts">
import {computed,ref,onMounted,onUnmounted,watch} from 'vue'
import CalendarPilotSettings from '../components/CalendarPilotSettings.vue'
import {calendarPilotEnabled} from '../integrations/firebase/calendarPilot'
const calendarOpen=ref(false)
import PushSettings from '../components/PushSettings.vue'
import {pushFeatureEnabled} from '../integrations/firebase/pushNotifications'
const pushAvailable=ref(false),pushOpen=ref(false)
onMounted(()=>{pushAvailable.value=pushFeatureEnabled()})
import BillingSandbox from '../components/BillingSandbox.vue'
import {billingSandboxEnabled} from '../integrations/firebase/billingSandbox'
import GymIdentity from '../components/GymIdentity.vue'
import WorkConfigSettings from '../components/WorkConfigSettings.vue'
import {defineAsyncComponent} from 'vue'
const WorkReport=defineAsyncComponent(()=>import('./WorkReport.vue'))
const workReportOpen=ref(false)
import {pilotAvailable,pilotMobileDevice} from '../features/work/gpsPilot'
import DashboardPreferences from '../components/DashboardPreferences.vue'
import {LIONFIT_CONTACT_EMAIL,LIONFIT_CONTACT_MAILTO} from '../features/platform/contact'
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
import LinkedProfileSettings from '../components/LinkedProfileSettings.vue'
import {linkedPair} from '../integrations/firebase/linkedProfiles'
import {sideOf} from '../features/auth/linkedProfileModel'
const linkedOpen=ref(false)
const linkedAllowed=computed(()=>isLiveMode()&&!!stagingSession.value&&(stagingSession.value.role!=='atleta'||!!sideOf(linkedPair.value,stagingSession.value)))
import {interfaceLanguage,setInterfaceLanguage,uiText} from '../features/i18n/interfaceLanguage'
const workPilotOpen=ref(false)
const workPilotMobile=pilotMobileDevice(navigator.userAgent,navigator.maxTouchPoints,Capacitor.isNativePlatform()&&['android','ios'].includes(Capacitor.getPlatform()))
const workPilotAllowed=computed(()=>isLiveMode()&&pilotAvailable(stagingSession.value))
// A refreshed session is a new object even when its identity is unchanged.
// Watch each primitive separately: close only on an actual account, gym or role change.
watch([()=>stagingSession.value?.uid,()=>stagingSession.value?.gymId,()=>stagingSession.value?.role],()=>{workPilotOpen.value=false;workReportOpen.value=false})
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
const identityOpen=ref(false),dashboardOpen=ref(false)
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
 <div class="lfsettings lfsettings-compact lfsettings-v23" v-lf-entrance="{id:'settings',premiumOnly:true,rows:[{match:'.lfsettings-header'},{match:'.lfsettings-flat-list'}]}">
  <header class="lfsettings-header"><div><h1>{{uiText("Impostazioni")}}</h1></div></header>
  <div class="lfsettings-flat-list" data-lf-settings-layout="flat-r7">
   <h2 class="lfsettings-section-title">{{uiText("Personalizzazione")}}</h2>
   <button class="lfsettings-flat-row" type="button" @click="lab.toggleTheme()"><LionIcon name="sun"/><span><b>{{uiText("Tema")}}</b></span><strong>{{uiText(lab.theme==='dark'?'Scuro':'Chiaro')}}</strong><LionIcon name="chevron" :size="17"/></button>

    <label class="lfsettings-flat-row lfsettings-flat-language"><LionIcon name="globe"/><span><b>{{uiText('Lingua')}}</b></span><select :value="interfaceLanguage" :aria-label="uiText('Lingua dell’interfaccia')" @change="setInterfaceLanguage(($event.target as HTMLSelectElement).value)"><option value="it">🇮🇹 Italiano</option><option value="en">{{uiText("🇬🇧 English")}}</option></select></label>
   <template v-if="isStagingMode()&&stagingSession&&stagingSession.role!=='atleta'">
    <button v-if="stagingSession.role==='titolare'" type="button" class="lfsettings-flat-row" :aria-expanded="identityOpen" @click="identityOpen=!identityOpen"><LionIcon name="gym"/><span><b>Personalizza palestra</b></span><LionIcon name="chevron" :size="17"/></button>
    <GymIdentity v-if="identityOpen&&stagingSession.role==='titolare'" edit/>
    <button type="button" class="lfsettings-flat-row" :aria-expanded="dashboardOpen" @click="dashboardOpen=!dashboardOpen"><LionIcon name="settings"/><span><b>Personalizza dashboard</b></span><LionIcon name="chevron" :size="17"/></button>
    <DashboardPreferences v-if="dashboardOpen"/>
   </template>
   <h2 v-if="workPilotAllowed||competitionAvailable||(pushAvailable&&stagingSession)||(calendarPilotEnabled()&&stagingSession)||linkedAllowed||(billingSandboxEnabled()&&stagingSession?.role==='titolare')||platformAllowed" class="lfsettings-section-title">{{uiText("Funzionalità aggiuntive")}}</h2>
   <template v-if="workPilotAllowed">
    <button type="button" class="lfsettings-flat-row" :aria-expanded="workPilotOpen" @click="workPilotOpen=!workPilotOpen;workReportOpen=false"><LionIcon name="fingerprint"/><span><b>Timbratura GPS</b></span><LionIcon name="chevron" :size="17"/></button><WorkConfigSettings v-if="workPilotOpen" :key="`${stagingSession?.uid}:${stagingSession?.gymId}:${stagingSession?.role}`" :gym-id="stagingSession?.gymId||''" :uid="stagingSession?.uid||''" :mobile="workPilotMobile"/><button type="button" class="lfsettings-flat-row" :aria-expanded="workReportOpen" @click="workReportOpen=!workReportOpen;workPilotOpen=false"><LionIcon name="clock"/><span><b>Report mensili</b></span><LionIcon name="chevron" :size="17"/></button><WorkReport v-if="workReportOpen" embedded :key="`${stagingSession?.uid}:${stagingSession?.gymId}:${stagingSession?.role}`"/>
   </template>
   <template v-if="competitionAvailable">
    <button type="button" class="lfsettings-flat-row" :disabled="competitionBusy||!mayWriteLive()" @click="toggleCompetition"><LionIcon name="trophy"/><span><b>Competizioni e gare</b><small>Nascondi senza eliminare gli eventi.</small></span><strong>{{competitionEnabled?'Attivo':'Disattivo'}}</strong></button><p v-if="competitionMessage" class="notice" role="status">{{competitionMessage}}</p>
   </template>
   <template v-if="pushAvailable&&stagingSession">
    <button class="lfsettings-flat-row" type="button" :aria-expanded="pushOpen" @click="pushOpen=!pushOpen"><LionIcon name="bell"/><span><b>{{uiText("Notifiche")}}</b></span><LionIcon name="chevron" :size="17"/></button><PushSettings v-if="pushOpen"/>
   </template>
   <template v-if="calendarPilotEnabled()&&stagingSession">
    <button class="lfsettings-flat-row" type="button" :aria-expanded="calendarOpen" @click="calendarOpen=!calendarOpen"><LionIcon name="calendar"/><span><b>Google Calendar</b></span><LionIcon name="chevron" :size="17"/></button><CalendarPilotSettings v-if="calendarOpen" :key="stagingSession.uid"/>
   </template>
   <button v-if="linkedAllowed" type="button" class="lfsettings-flat-row" :aria-expanded="linkedOpen" @click="linkedOpen=!linkedOpen"><LionIcon name="switch"/><span><b>Cambio rapido profilo</b></span><LionIcon name="chevron" :size="17"/></button>
    <LinkedProfileSettings v-if="linkedAllowed&&linkedOpen" :key="stagingSession?.uid"/>
   <template v-if="billingSandboxEnabled()&&stagingSession?.role==='titolare'">
    <button type="button" class="lfsettings-flat-row" :aria-expanded="billingOpen" @click="billingOpen=!billingOpen"><LionIcon name="clipboard"/><span><b>Abbonamento LionFit (Sandbox)</b><small>Prova gratuita, piani e rinnovi simulati</small></span><LionIcon name="chevron" :size="17"/></button><BillingSandbox v-if="billingOpen"/>
   </template>
   <template v-if="platformAllowed">
    <RouterLink class="lfsettings-flat-row" to="/lionfit-control"><LionIcon name="shield"/><span><b>Control Center</b><small>Accesso riservato Super Admin</small></span><LionIcon name="chevron" :size="17"/></RouterLink>
   </template>
   <h2 class="lfsettings-section-title">{{uiText("Account e assistenza")}}</h2>
    <RouterLink v-if="!isStagingMode()||stagingSession" class="lfsettings-flat-row" :to="profilePath+(emulator?'&edit=1':'?edit=1')"><LionIcon name="user"/><span><b>{{uiText("Modifica profilo")}}</b></span><LionIcon name="chevron" :size="17"/></RouterLink>
    <button v-if="canResetPassword" class="lfsettings-flat-row" type="button" @click="securityOpen=true;securityStatus=''"><LionIcon name="shield"/><span><b>{{uiText("Sicurezza")}}</b></span><LionIcon name="chevron" :size="17"/></button>
    <a class="lfsettings-flat-row"  :href="privacyHref" target="_blank" rel="noopener noreferrer"><LionIcon name="shield"/><span><b>{{uiText("Privacy")}}</b></span><LionIcon name="chevron" :size="17"/></a>
    <a class="lfsettings-flat-row"  :href="termsHref" target="_blank" rel="noopener noreferrer"><LionIcon name="clipboard"/><span><b>{{uiText("Termini e condizioni")}}</b></span><LionIcon name="chevron" :size="17"/></a>
   <button class="lfsettings-flat-row" type="button" @click="infoOpen=true"><LionIcon name="info"/><span><b>{{uiText("Informazioni")}}</b></span><strong>{{appVersion}}</strong><LionIcon name="chevron" :size="17"/></button>
    <RouterLink v-if="isStagingMode()" class="lfsettings-flat-row" to="/assistenza"><LionIcon name="mail"/><span><b>{{uiText("Assistenza e feedback")}}</b></span><LionIcon name="chevron" :size="17"/></RouterLink>
  </div>
  <button class="lfsettings-exit" @click="exit"><LionIcon name="logout" :size="19"/> {{uiText("Esci dall’account")}}</button>
  <div v-if="infoOpen" class="modal-overlay" @click.self="infoOpen=false"><div class="dialog lf-about-dialog" role="dialog" aria-modal="true" aria-label="Informazioni sull'applicazione">
   <div class="row between"><h2>{{uiText("LionFit · Informazioni")}}</h2><button class="bare" type="button" :aria-label="uiText('Chiudi informazioni')" @click="infoOpen=false">✕</button></div>
   
   <p>{{uiText("LionFit è una piattaforma digitale pensata per semplificare la gestione degli allenamenti e l'organizzazione delle attività sportive, collegando palestre, allenatori e atleti in un ambiente condiviso.")}}</p>
   <p>{{uiText("Permette di consultare programmi e schede di allenamento, esplorare la libreria degli esercizi, seguire la programmazione e gestire le prenotazioni secondo le autorizzazioni del proprio ruolo.")}}</p>
   <p><strong>{{uiText("Ideazione e sviluppo:")}}</strong> Matteo Perini</p>
   <p><strong>{{uiText("Contatto ufficiale LionFit:")}}</strong> <a :href="LIONFIT_CONTACT_MAILTO">{{LIONFIT_CONTACT_EMAIL}}</a></p>
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
   
   <button class="secondary wide" type="button" @click="infoOpen=false">{{uiText("Chiudi")}}</button>
  </div></div>
  <div v-if="securityOpen" class="modal-overlay" @click.self="securityOpen=false"><div class="dialog" role="dialog" aria-modal="true" :aria-label="uiText('Sicurezza account')" style="max-width:510px">
   <div class="row between"><h2>{{uiText("Sicurezza account")}}</h2><button class="bare" type="button" :aria-label="uiText('Chiudi sicurezza')" @click="securityOpen=false">✕</button></div>
   <p class="muted small">{{uiText("Riceverai un link via email per cambiare la password. LionFit non conserva la password.")}}</p>
   <button class="primary wide" type="button" :disabled="securityBusy" @click="resetPasswordViaEmail">{{uiText(securityBusy?'Invio…':'Cambia password tramite email')}}</button>
   <p v-if="securityStatus" class="notice" role="status">{{uiText(securityStatus)}}</p>
  </div></div>

 </div>
</template>


<style>
/* PATCH 28 R7: one flat list with small headings, no nested cards. */
.app .lfsettings.lfsettings-compact{gap:14px;min-width:0}
.app .lfsettings-compact .lfsettings-header{margin:0 0 3px}
.app .lfsettings-compact .lfsettings-header .eyebrow{display:none}
.app .lfsettings-compact .lfsettings-flat-list{display:block;gap:0;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:0 16px;min-width:0}
.app .lfsettings-compact .lfsettings-flat-row>span>small{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.app .lfsettings-compact .lfsettings-flat-list>.lfsettings-flat-row{display:flex;align-items:center;width:100%;min-width:0;text-align:left;color:var(--text);font:inherit;background:transparent;border:0;border-bottom:1px solid var(--border);border-radius:0;margin:0;padding:9px 4px;min-height:52px;gap:12px;box-shadow:none;text-decoration:none;box-sizing:border-box}
.app .lfsettings-compact .lfsettings-flat-list>.lfsettings-flat-row:last-child{border-bottom:0}
.app .lfsettings-compact .lfsettings-flat-row>span{flex:1;min-width:0}
.app .lfsettings-compact .lfsettings-flat-row>span>b{display:block;font-size:14px;line-height:1.3;font-weight:750;overflow-wrap:anywhere}
.app .lfsettings-compact .lfsettings-flat-row>svg:first-child{color:var(--mint);width:21px;height:21px;flex:none}
.app .lfsettings-compact .lfsettings-flat-row>svg{flex-shrink:0}
.app .lfsettings-compact .lfsettings-flat-row>svg:last-child:not(:first-child){color:var(--muted);transition:transform .16s ease}
.app .lfsettings-compact .lfsettings-flat-row[aria-expanded=true]>svg:last-child{transform:rotate(90deg);color:var(--mint)}
.app .lfsettings-compact .lfsettings-flat-row:focus-visible{outline:2px solid var(--mint);outline-offset:-2px;border-radius:6px}
.app .lfsettings-compact .lfsettings-flat-row>strong{font-size:12px;white-space:nowrap;flex-shrink:0}
.app .lfsettings-compact .lfsettings-flat-language{flex-wrap:nowrap!important;gap:10px!important;cursor:default}
.app .lfsettings-compact .lfsettings-flat-language select{margin:0!important;min-width:0!important;max-width:min(48%,175px)!important;min-height:40px!important;width:auto!important;font-size:12px!important}
.app .lfsettings-compact .lfsettings-flat-list>:not(.lfsettings-flat-row){margin-block:8px 12px;min-width:0}
/* Headings stay in the same list, outside Premium card styling. */
.app .lfsettings-compact .lfsettings-flat-list>.lfsettings-section-title{display:block;margin:0;padding:19px 4px 4px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.025em;color:var(--muted);background:transparent;border:0;box-shadow:none;border-radius:0;text-transform:none}
.app .lfsettings-compact .lfsettings-flat-list>.lfsettings-section-title:first-child{padding-top:12px}
.app .lfsettings-compact .lfsettings-exit{min-height:48px;border-radius:12px}
@media (hover:hover){.app .lfsettings-compact .lfsettings-flat-row:not(.lfsettings-flat-language):not(:disabled):hover{background:var(--card2)}}
@media (max-width: 767px){
 .app .lfsettings.lfsettings-compact{gap:10px}
 .app .lfsettings-compact .lfsettings-header h1{font-size:24px;margin:0}
 .app .lfsettings-compact .lfsettings-flat-list{padding:0 12px;border-radius:14px}
 .app .lfsettings-compact .lfsettings-flat-list>.lfsettings-section-title{padding:16px 2px 4px;font-size:11px}
 .app .lfsettings-compact .lfsettings-flat-list>.lfsettings-section-title:first-child{padding-top:10px}
 .app .lfsettings-compact .lfsettings-flat-list>.lfsettings-flat-row{min-height:49px;padding:8px 2px;gap:10px}
 .app.as-athlete .lfsettings-v23 .lfsettings-exit{padding:10px;font-size:14px}
}
@media(prefers-reduced-motion:reduce){.app .lfsettings-compact .lfsettings-flat-row>svg:last-child{transition:none}}
</style>
