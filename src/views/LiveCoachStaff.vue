<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Inviti email: token monouso creati internamente e revocabili, senza distribuzione manuale. */
import {onMounted,onUnmounted,ref,computed} from 'vue'
import {RouterLink} from 'vue-router'
import {collection,doc,getDocs,getDocFromServer,onSnapshot,query,where,runTransaction,serverTimestamp,Timestamp,updateDoc,type Unsubscribe} from 'firebase/firestore'
import {readStagingSession,stagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {isLiveMode,isTestMode} from '../integrations/firebase/stagingConfig'
import {visibleInvite,emailValid} from '../features/invites/visibility'
import {coachRevocationEnabled} from '../features/athletes/coachRevocation'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {LEGACY_EMAILJS_PUBLIC} from '../integrations/email/legacyEmailJs'
type InviteKind='atleta'|'coach'
type Invite={id:string;email?:string;status:string;type:InviteKind;expiresAt?:{toMillis():number}}
const status=ref('Caricamento coach e inviti…'),busy=ref(false),athleteEmail=ref(''),coachEmail=ref('')
const coaches=ref<{id:string;name:string;role:string;membershipStatus?:string}[]>([]),invited=ref<Invite[]>([])
const owner=computed(()=>stagingSession.value?.role==='titolare')
const activeInvites=computed(()=>invited.value.filter(x=>visibleInvite(x)))
const MAIL_CONF_KEY='lionfit-emailjs-public-config-v1',UNSENT_KEY='lionfit-unsent-invite-session-v1',UNSENT_COACH_KEY='lionfit-unsent-coach-invite-v1'
// Stesso template generico EmailJS per Coach e Atleti; il ruolo dipende dall'invito Firebase.
const serviceId=ref(LEGACY_EMAILJS_PUBLIC.serviceId),publicKey=ref(LEGACY_EMAILJS_PUBLIC.publicKey),templateId=ref(LEGACY_EMAILJS_PUBLIC.templateId)
type Unsent={email:string;link:string;gymId:string;createdAt:number}
let unsent:Unsent|null=null,coachUnsent:Unsent|null=null;let mounted=true;const stops:Unsubscribe[]=[]
function inviteUrlBase():string {
 if(!isTestMode())return 'https://www.lionfit.it'
 const raw=String(import.meta.env.VITE_LIONFIT_STAGING_INVITE_BASE_URL||'').trim()
 if(!raw)throw new Error('Imposta un dominio STAGING separato prima di generare link di prova.')
 const u=new URL(raw)
 if((u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname))) ||
  u.username || u.password || u.search || u.hash || u.pathname!=='/' || u.hostname==='www.lionfit.it' || u.hostname==='lionfit.it')
  throw new Error("URL inviti STAGING non sicuro: inserisci l'origine HTTPS del sito di test, separata da lionfit.it.")
 return u.origin
}
function invitationLink(gym:string,t:string,kind:InviteKind){
 const u=new URL('/www/index.html',inviteUrlBase())
 u.searchParams.set('gym',gym);u.searchParams.set(kind==='atleta'?'athleteInvite':'coachInvite',t)
 return u.href
}
function validStoredInviteLink(value:string,gymId:string,kind:InviteKind):boolean {
 try{
  const u=new URL(value),key=kind==='atleta'?'athleteInvite':'coachInvite'
  return u.origin===inviteUrlBase() && u.pathname==='/www/index.html' && u.searchParams.get('gym')===gymId && /^[a-f0-9]{48}$/.test(u.searchParams.get(key)||'')
 }catch{return false}
}
function allowedMailRecipient(address:string){
 if(isLiveMode())return true
 if(!isTestMode())return false
 // Solo destinatari fittizi esplicitamente indicati in .env.staging.local.
 const emails=String(import.meta.env.VITE_LIONFIT_STAGING_TEST_EMAILS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean)
 return emails.includes(address.toLowerCase())
}

function token(kind:'email'|'coach'){
 if(kind==='coach'){const bytes=crypto.getRandomValues(new Uint8Array(24));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
 const bytes=crypto.getRandomValues(new Uint8Array(23))
 return 'e1'+[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
}
function saveEmailSettings(){
 if(!serviceId.value.trim()||!publicKey.value.trim()||!templateId.value.trim()){status.value='Compila Service ID, Public Key e Template ID.';return}
 try{localStorage.setItem(MAIL_CONF_KEY,JSON.stringify({service_id:serviceId.value.trim(),user_id:publicKey.value.trim(),template_id:templateId.value.trim()}));status.value='Impostazioni EmailJS salvate solo su questo dispositivo.'}
 catch{status.value='Impossibile salvare le impostazioni email sul dispositivo.'}
}
function restoreLocal(){
 try{const c=JSON.parse(localStorage.getItem(MAIL_CONF_KEY)||'{}')
  if(typeof c.service_id==='string')serviceId.value=c.service_id
  if(typeof c.user_id==='string')publicKey.value=c.user_id
  if(typeof c.template_id==='string')templateId.value=c.template_id
 }catch{}
 try{const d=JSON.parse(sessionStorage.getItem(UNSENT_KEY)||'null') as Unsent|null
  if(d && typeof d.email==='string' && typeof d.link==='string' && typeof d.gymId==='string' && Date.now()-d.createdAt<7*86400000 && validStoredInviteLink(d.link,d.gymId,'atleta')){
   unsent=d;athleteEmail.value=d.email
  }else{sessionStorage.removeItem(UNSENT_KEY)}
 }catch{unsent=null}
 try{const d=JSON.parse(sessionStorage.getItem(UNSENT_COACH_KEY)||'null') as Unsent|null
  if(d && typeof d.email==='string' && typeof d.link==='string' && typeof d.gymId==='string' && Date.now()-d.createdAt<7*86400000 && validStoredInviteLink(d.link,d.gymId,'coach'))coachUnsent=d
  else sessionStorage.removeItem(UNSENT_COACH_KEY)
 }catch{coachUnsent=null}
}
onMounted(async()=>{
 restoreLocal()
 try{
  const s=await readStagingSession(),{db}=getStagingClients()
  const gym=await getDocFromServer(doc(db,'gyms',s.gymId));if(!mounted||!gym.exists())return
  stops.push(onSnapshot(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','admin')),sn=>{
   if(!mounted)return
   coaches.value=sn.docs.filter(d=>d.data().gymId===s.gymId&&d.data().role==='admin').map(d=>({id:d.id,name:String(d.data().name||d.id),role:d.id===gym.data().ownerUid?'TITOLARE':'COACH',membershipStatus:d.data().membershipStatus}))
  },e=>{if(mounted)status.value=`Elenco coach: ${e.message}`}))
  const kinds:InviteKind[]=s.role==='titolare'?['atleta','coach']:['atleta']
  kinds.forEach(kind=>stops.push(onSnapshot(query(collection(db,'gyms',s.gymId,kind==='atleta'?'athlete_invites':'coach_invites'),where('status','==','pending')),sn=>{
   if(!mounted)return
   invited.value=[...invited.value.filter(x=>x.type!==kind),...sn.docs.map(d=>({id:d.id,email:typeof d.data().email==='string'?d.data().email:undefined,status:String(d.data().status||''),type:kind,expiresAt:d.data().expiresAt}))]
   status.value=''
  },e=>{if(mounted)status.value=`Inviti: ${e.message}`})))
 }catch(e){status.value=e instanceof Error?e.message:String(e)}
})
onUnmounted(()=>{mounted=false;stops.forEach(x=>x())})
/** Revocation is separate from pending-invite revocation: the Auth UID is retained.
 * Fail closed on the current Rules unless the ACL V2 rollout is explicitly enabled.
 */
async function setMemberStatus(memberId:string,next:'revoked'|'active'){
 if(!owner.value||!coachRevocationEnabled()||!mayWriteLive()||busy.value)return
 const s=stagingSession.value;if(!s||s.uid===memberId)return
 const member=coaches.value.find(c=>c.id===memberId)
 if(!member||member.role==='TITOLARE')return
 if(!window.confirm(next==='revoked'?`Revocare l’accesso del Coach ${member.name} senza cancellare l’account?`:`Riattivare il Coach ${member.name}?`))return
 busy.value=true;status.value=''
 try{
  const {db}=getStagingClients()
  await updateDoc(doc(db,'users',memberId),{membershipStatus:next})
  status.value=next==='revoked'?'Collaborazione revocata; nessun account o invito è stato eliminato.':'Collaborazione riattivata.'
 }catch(e){status.value=e instanceof Error?e.message:'Modifica collaborazione non consentita dalle Rules.'}
 finally{busy.value=false}
}
async function makeInvite(kind:InviteKind,channel:'email'|'coach'){
 if(!mayWriteLive())throw new Error('Inviti non disponibili: verificare le Rules e l’abilitazione delle scritture Firebase.')
 inviteUrlBase() // Fail closed BEFORE writing a pending token to Firestore.
 const s=stagingSession.value;if(!s||s.role==='atleta'||(kind==='coach'&&!owner.value))throw new Error('Non sei autorizzato a creare questo invito.')
 const email=kind==='coach'?coachEmail.value.trim().toLowerCase():''
 if(kind==='coach'&&!emailValid(email))throw new Error('Inserisci l’email del nuovo coach.')
 const {db}=getStagingClients(),gym=await getDocFromServer(doc(db,'gyms',s.gymId))
 if(!gym.exists())throw new Error('Palestra non trovata.')
 const id=token(channel),name=String(gym.data().name||gym.data().gymName||'Lion Fit')
 const ref=doc(db,'gyms',s.gymId,kind==='coach'?'coach_invites':'athlete_invites',id)
 await runTransaction(db,async tx=>{
  const old=await tx.get(ref);if(old.exists())throw new Error('Token duplicato.')
  tx.set(ref,{gymId:s.gymId,gymName:name,status:'pending',createdBy:s.uid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+7*86400000),...(kind==='coach'?{email}:{})})
 })
 return invitationLink(s.gymId,id,kind)
}
async function reusableUnsent(email:string,gymId:string):Promise<string|null>{
 if(!unsent||unsent.email!==email||unsent.gymId!==gymId||!validStoredInviteLink(unsent.link,gymId,'atleta'))return null
 const token=new URL(unsent.link).searchParams.get('athleteInvite')||''
 try{
  const {db}=getStagingClients(),snap=await getDocFromServer(doc(db,'gyms',gymId,'athlete_invites',token)),d=snap.data()
  if(d?.status==='pending'&&d.gymId===gymId&&d.expiresAt?.toMillis?.()>Date.now())return unsent.link
 }catch{}
 return null
}
async function reusableCoachInvite(email:string,gymId:string):Promise<string|null>{
 if(!coachUnsent||coachUnsent.email!==email||coachUnsent.gymId!==gymId)return null
 try{
  const u=new URL(coachUnsent.link),token=u.searchParams.get('coachInvite')||''
  if(!validStoredInviteLink(coachUnsent.link,gymId,'coach'))return null
  const {db}=getStagingClients(),snap=await getDocFromServer(doc(db,'gyms',gymId,'coach_invites',token)),d=snap.data()
  if(d?.status==='pending'&&d.email===email&&d.gymId===gymId&&d.expiresAt?.toMillis?.()>Date.now())return coachUnsent.link
 }catch{}
 return null
}
/** Recupera un invito pendente valido per lo stesso destinatario senza moltiplicare
 * i token a ogni nuovo invio. Non tocca gli inviti scaduti, usati o revocati.
 * Solo titolare, stessa palestra e stesso creatore.
 */
async function existingValidCoachInvite(email:string,gymId:string,ownerUid:string):Promise<string|null>{
 const {db}=getStagingClients()
 const snap=await getDocs(query(collection(db,'gyms',gymId,'coach_invites'),where('status','==','pending')))
 const match=snap.docs
  .filter(d=>{
   const x=d.data()
   return typeof x.email==='string'&&x.email.trim().toLowerCase()===email &&
    x.gymId===gymId&&x.createdBy===ownerUid && x.expiresAt?.toMillis?.()>Date.now()
  })
  .sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0))[0]
 return match?invitationLink(gymId,match.id,'coach'):null
}

/** EmailJS accepts delivery for processing; it does not certify inbox reception.
 * Failed attempts reuse the same pending token instead of producing new records.
 */
async function sendCoachMail(){if(busy.value)return
 const email=coachEmail.value.trim().toLowerCase()
 if(!owner.value){status.value='Solo il titolare può invitare un Coach.';return}
 if(!allowedMailRecipient(email)){status.value='Email di test disabilitata: usa un destinatario esplicitamente autorizzato per STAGING.';return}
 if(!emailValid(email)){status.value='Inserisci l’email del collaboratore.';return}
 if(!serviceId.value.trim()||!publicKey.value.trim()){
  status.value='Configura EmailJS e il template inviti nelle impostazioni avanzate.';return
 }
 const s=stagingSession.value;if(!s){status.value='Sessione titolare assente.';return}
 busy.value=true;status.value=''
 try{
  const link=await reusableCoachInvite(email,s.gymId)??await existingValidCoachInvite(email,s.gymId,s.uid)??await makeInvite('coach','coach')
  coachUnsent={email,link,gymId:s.gymId,createdAt:Date.now()}
  sessionStorage.setItem(UNSENT_COACH_KEY,JSON.stringify(coachUnsent))
  const response=await fetch('https://api.emailjs.com/api/v1.0/email/send',{
   method:'POST',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({service_id:serviceId.value.trim(),template_id:templateId.value.trim(),user_id:publicKey.value.trim(),
    template_params:{to_email:email,invite_link:link,recipient_role:'coach',apk_link:'https://github.com/matteo-perini/ROUNDONE/releases/latest/download/LionFit.apk',ios_guide_link:'https://www.lionfit.it/www/ios.html'}})
  })
  if(!response.ok)throw new Error('EmailJS HTTP '+response.status)
  coachUnsent=null;sessionStorage.removeItem(UNSENT_COACH_KEY);coachEmail.value=''
  status.value='Email Coach accettata da EmailJS. Il destinatario deve verificare la ricezione e la propria email.'
 }catch(e){status.value='Invio Coach non completato: '+(e instanceof Error?e.message:String(e))+'. Il token resta pending per il nuovo tentativo.'}
 finally{busy.value=false}
}
async function sendAthleteMail(){if(busy.value)return
 const email=athleteEmail.value.trim().toLowerCase()
 if(!emailValid(email)){status.value='Inserisci un indirizzo email valido.';return}
 if(!allowedMailRecipient(email)){status.value='Email di test disabilitata: usa un destinatario esplicitamente autorizzato per STAGING.';return}
 if(!serviceId.value.trim()||!publicKey.value.trim()||!templateId.value.trim()){status.value='Configura prima Service ID, Public Key e Template ID nelle impostazioni avanzate.';return}
 const s=stagingSession.value;if(!s){status.value='Sessione coach assente.';return}
 busy.value=true;status.value=''
 try{
  let link=await reusableUnsent(email,s.gymId)
  if(!link){link=await makeInvite('atleta','email')}
  unsent={email,link,gymId:s.gymId,createdAt:Date.now()}
  sessionStorage.setItem(UNSENT_KEY,JSON.stringify(unsent))
  const response=await fetch('https://api.emailjs.com/api/v1.0/email/send',{
   method:'POST',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:serviceId.value.trim(),template_id:templateId.value.trim(),user_id:publicKey.value.trim(),template_params:{to_email:email,invite_link:link,recipient_role:'atleta',apk_link:'https://github.com/matteo-perini/ROUNDONE/releases/latest/download/LionFit.apk',ios_guide_link:'https://www.lionfit.it/www/ios.html'}})
  })
  if(!response.ok)throw new Error('EmailJS HTTP '+response.status)
  unsent=null;sessionStorage.removeItem(UNSENT_KEY);athleteEmail.value=''
  status.value='Email accettata dal servizio di invio. Verifica che sia arrivata nella casella dell’atleta.'
 }catch(e){status.value=`Invio email non completato: ${e instanceof Error?e.message:String(e)}. Il token non è stato eliminato; riprova per riutilizzarlo.`}
 finally{busy.value=false}
}
async function revoke(x:Invite){
 if(!mayWriteLive()||!stagingSession.value||busy.value||x.status!=='pending')return
 if(x.type==='coach'&&!owner.value)return
 if(!window.confirm('Revocare questo invito? Non potrà più essere usato.'))return
 busy.value=true
 try{
  const s=stagingSession.value,{db}=getStagingClients(),ref=doc(db,'gyms',s.gymId,x.type==='coach'?'coach_invites':'athlete_invites',x.id)
  await runTransaction(db,async tx=>{const d=await tx.get(ref);if(!d.exists()||d.data().status!=='pending')throw new Error('Invito già utilizzato o revocato.');tx.update(ref,{status:'revoked'})})
  if(unsent?.link.includes(x.id)){unsent=null;sessionStorage.removeItem(UNSENT_KEY)}
  if(coachUnsent?.link.includes(x.id)){coachUnsent=null;sessionStorage.removeItem(UNSENT_COACH_KEY)}
  status.value='Invito revocato; rimane nello storico Firebase.'
 }catch(e){status.value=e instanceof Error?e.message:'Revoca non riuscita.'}finally{busy.value=false}
}
</script>
<template>
 <div class="stack coach-staff-screen staff-v1" style="gap:12px">
  <section class="panel"><h2>{{uiText("COACH DELLA PALESTRA")}}</h2><p class="muted small">{{uiText("Inviti monouso · validi 7 giorni. Gli inviti usati o scaduti non vengono mostrati fra quelli attivi.")}}</p><p v-if="status" class="muted small" role="status">{{status}}</p></section>
  <div class="staff-v1-columns">
   <div class="stack">
    <section class="panel"><h3>{{uiText("COACH PRESENTI NELLA PALESTRA")}}</h3><div v-for="c in coaches" :key="c.id" class="line-card staff-person"><span>{{c.name}}</span><span class="pill staff-role">{{c.membershipStatus==='revoked'?'REVOCATO':c.role}}</span><button v-if="owner && c.role!=='TITOLARE' && coachRevocationEnabled() && mayWriteLive()" class="secondary" :disabled="busy" @click="setMemberStatus(c.id,c.membershipStatus==='revoked'?'active':'revoked')">{{c.membershipStatus==='revoked'?'Riattiva':'Revoca accesso'}}</button></div><p v-if="owner && !coachRevocationEnabled()" class="muted small">{{uiText("La revoca dei collaboratori verra attivata solo dopo la pubblicazione delle Rules dedicate e il collaudo finale. Revocare un invito non revoca un account gia registrato.")}}</p><p v-if="!coaches.length" class="muted small">{{uiText("Nessun coach caricato.")}}</p></section>
    <section v-if="owner" class="panel"><h3>{{uiText("INVITA UN COACH COLLABORATORE")}}</h3><p class="muted small">{{uiText("Invito personale via email, valido 7 giorni. Solo il titolare può invitarlo. Non è necessario un account preesistente: il collaboratore deve registrarsi usando la stessa email dell’invito.")}}</p>
     <div class="staff-email-row"><input v-model="coachEmail" type="email" placeholder="Email del nuovo coach" aria-label="Email collaboratore"/><button class="primary" :disabled="busy||!emailValid(coachEmail)" @click="sendCoachMail">{{uiText("✉ INVIA INVITO COACH")}}</button></div>
    </section>
   </div>
   <section class="panel staff-athlete-invites"><h3>{{uiText("INVITA UN ATLETA")}}</h3><p class="muted small">{{uiText("Inviti personali · validi 7 giorni.")}}</p>
    <section class="staff-invite-subcard"><h4>{{uiText("INVITO VIA EMAIL")}}</h4><label>{{uiText("EMAIL DELL'ATLETA")}}<input v-model="athleteEmail" type="email" placeholder="atleta@esempio.it"/></label><button class="primary wide" :disabled="busy||!emailValid(athleteEmail)" @click="sendAthleteMail">{{uiText("✉ INVIA INVITO ATLETA")}}</button></section>
    <details class="staff-details"><summary>{{uiText("Impostazioni email (avanzate)")}}</summary><div class="staff-email-settings"><label>SERVICE ID<input v-model="serviceId" autocomplete="off" placeholder="service_..."/></label><label>PUBLIC KEY<input v-model="publicKey" autocomplete="off" placeholder="Public Key EmailJS"/></label><label>{{uiText("TEMPLATE INVITI (COACH E ATLETI)")}}<input v-model="templateId" autocomplete="off" placeholder="template_..."/></label></div><button class="secondary" @click="saveEmailSettings">{{uiText("Salva configurazione EmailJS")}}</button><p class="muted small">{{uiText("Questi ID pubblici sono salvati solo su questo dispositivo. Usiamo un solo template neutro per entrambi i ruoli. Il ruolo e il tipo di account sono determinati esclusivamente dall’invito Firebase verificato. Non inserire password o chiavi private.")}}</p></details>
    <details class="staff-details"><summary>{{uiText("Gestisci inviti pendenti e precedenti (")}}{{activeInvites.length}})</summary><div v-if="!activeInvites.length" class="muted small">{{uiText("Nessun invito pendente.")}}</div><div v-for="x in activeInvites" :key="x.type+x.id" class="line-card row between"><span class="small">{{x.type==='coach'?'Coach':'Atleta'}} · {{x.email||x.id.slice(0,8)+'…'}}</span><button class="ghost" :disabled="busy" @click="revoke(x)">{{uiText("Revoca")}}</button></div></details>
   </section>
  </div>
  <RouterLink to="/coach" class="secondary">{{uiText("← TORNA ALLA DASHBOARD")}}</RouterLink>
 </div>
</template>
