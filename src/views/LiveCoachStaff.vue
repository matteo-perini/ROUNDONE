<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** Inviti email: token monouso creati internamente e revocabili, senza distribuzione manuale. */
import {onMounted,onUnmounted,ref,computed} from 'vue'
import InviteTeamHub from '../components/InviteTeamHub.vue'
import InviteEmailStudio from '../components/InviteEmailStudio.vue'
import {shareToken,shareWhatsappUrl,type ShareInviteKind} from '../features/invites/shareLinks'
import {safeImage} from '../features/platform/platformModel'
import {collection,doc,getDocs,getDocFromServer,onSnapshot,query,where,runTransaction,serverTimestamp,Timestamp,updateDoc,type Unsubscribe} from 'firebase/firestore'
import {readStagingSession,stagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {isLiveMode,isTestMode} from '../integrations/firebase/stagingConfig'
import {emailValid} from '../features/invites/visibility'
import {pendingMonitor,visiblePendingMonitor,expiryLabel,type MonitorFilter} from '../features/invites/monitor'
import {coachRevocationEnabled} from '../features/athletes/coachRevocation'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {sendCentralInviteEmail} from '../integrations/firebase/inviteMail'
type InviteKind='atleta'|'coach'
type Invite={id:string;email?:string;status:string;type:InviteKind;createdBy?:string;expiresAt?:{toMillis():number}}
type PreparedShare={kind:ShareInviteKind;link:string;gymId:string;uid:string;email:string;origin:string}
const status=ref('Caricamento coach e inviti…'),busy=ref(false),athleteEmail=ref(''),coachEmail=ref('')
const studioGymName=ref('LionFit'),studioLogo=ref(''),studioCover=ref('')
const coaches=ref<{id:string;name:string;role:string;membershipStatus?:string}[]>([]),invited=ref<Invite[]>([])
const owner=computed(()=>stagingSession.value?.role==='titolare')
const inviteFilter=ref<MonitorFilter>('all'),inviteSearch=ref('')
const inviteNow=ref(Date.now())
let inviteClock:ReturnType<typeof setInterval>|null=null
// Collaborators see only invitations they created; the owner can manage the gym's invitations.
const scopedInvites=computed(()=>owner.value?invited.value:invited.value.filter(x=>x.createdBy===stagingSession.value?.uid))
const inviteStats=computed(()=>pendingMonitor(scopedInvites.value,inviteNow.value))
const activeInvites=computed(()=>visiblePendingMonitor(scopedInvites.value,inviteFilter.value,inviteSearch.value,inviteNow.value))
const UNSENT_KEY='lionfit-unsent-invite-session-v1',UNSENT_COACH_KEY='lionfit-unsent-coach-invite-v1'
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

function token(kind:'email'|'coach'|'manual'){
 if(kind==='coach'){const bytes=crypto.getRandomValues(new Uint8Array(24));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
 const bytes=crypto.getRandomValues(new Uint8Array(23))
 return (kind==='manual'?'a1':'e1')+[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
}
function restoreLocal(){
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
 inviteClock=setInterval(()=>{if(document.visibilityState==='visible')inviteNow.value=Date.now()},60000)
 restoreLocal()
 try{
  const s=await readStagingSession(),{db}=getStagingClients()
  const gym=await getDocFromServer(doc(db,'gyms',s.gymId));if(!mounted||!gym.exists())return
  studioGymName.value=String(gym.data().name||gym.data().gymName||'LionFit').slice(0,70)
  // Branding opzionale: non ritardare il caricamento di Coach e inviti se manca.
  void getDocFromServer(doc(db,'gyms',s.gymId,'identity','appearance'))
   .then(appearance=>{if(mounted){studioLogo.value=safeImage(appearance.data()?.logo,120000);studioCover.value=safeImage(appearance.data()?.cover,420000)}})
   .catch(()=>{})
  stops.push(onSnapshot(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','admin')),sn=>{
   if(!mounted)return
   coaches.value=sn.docs.filter(d=>d.data().gymId===s.gymId&&d.data().role==='admin').map(d=>({id:d.id,name:String(d.data().name||d.id),role:d.id===gym.data().ownerUid?'TITOLARE':'COACH',membershipStatus:d.data().membershipStatus}))
  },e=>{if(mounted)status.value=`Elenco coach: ${e.message}`}))
  const kinds:InviteKind[]=s.role==='titolare'?['atleta','coach']:['atleta']
  kinds.forEach(kind=>stops.push(onSnapshot(query(collection(db,'gyms',s.gymId,kind==='atleta'?'athlete_invites':'coach_invites'),where('status','==','pending')),sn=>{
   if(!mounted)return
   invited.value=[...invited.value.filter(x=>x.type!==kind),...sn.docs.map(d=>({id:d.id,email:typeof d.data().email==='string'?d.data().email:undefined,status:String(d.data().status||''),type:kind,createdBy:String(d.data().createdBy||''),expiresAt:d.data().expiresAt}))]
   status.value=''
  },e=>{if(mounted)status.value=`Inviti: ${e.message}`})))
 }catch(e){status.value=e instanceof Error?e.message:String(e)}
})
onUnmounted(()=>{mounted=false;if(inviteClock)clearInterval(inviteClock);stops.forEach(x=>x())})
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
async function makeInvite(kind:InviteKind,channel:'email'|'coach'|'manual'){
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

/** Manual invitations reuse the SAME Firestore schema, expiry and rules as email invites.
 * A collaborator link remains bound to the exact email and requires email verification.
 * Manual sharing tokens remain memory-only; email retry state uses sessionStorage only.
 */
async function assertSharePending(kind:ShareInviteKind,link:string,gymId:string,uid:string,email:string):Promise<void>{
 const id=shareToken(link,kind,gymId,inviteUrlBase())
 if(!id)throw new Error('Link personale non valido. Rigenera un invito.')
 const {db}=getStagingClients()
 const snap=await getDocFromServer(doc(db,'gyms',gymId,kind==='coach'?'coach_invites':'athlete_invites',id))
 const data=snap.data()
 if(!snap.exists()||data?.gymId!==gymId||data.status!=='pending'||data.expiresAt?.toMillis?.()<=Date.now()||!data.expiresAt?.toMillis?.())
  throw new Error('Invito già usato, scaduto o revocato. Creane uno nuovo.')
 if(!owner.value&&data.createdBy!==uid)throw new Error('Puoi condividere solo i tuoi inviti.')
 if(kind==='coach'&&(!owner.value||data.email!==email))throw new Error('Invito collaboratore non corrispondente alla email indicata.')
}
async function prepareShare(kind:ShareInviteKind,fromPending?:Invite):Promise<PreparedShare|null>{
 if(busy.value)return null
 const s=stagingSession.value
 if(!mayWriteLive()||!s||s.role==='atleta'||(kind==='coach'&&!owner.value)){
  status.value='Non sei autorizzato a generare inviti in questo ambiente.';return null
 }
 const email=(kind==='coach'?(fromPending?.email||coachEmail.value):'').trim().toLowerCase()
 if(kind==='coach'&&!emailValid(email)){
  status.value='Indica una email valida del collaboratore prima di condividere il link.';return null
 }
 if(fromPending&&(fromPending.type!==kind||(!owner.value&&fromPending.createdBy!==s.uid))){
  status.value='Non puoi condividere questo invito.';return null
 }
 // A bad environment URL must fail before any Firestore write.
 try{inviteUrlBase()}catch(e){status.value=e instanceof Error?e.message:String(e);return null}
 busy.value=true;status.value=''
 try{
  let link:string|null=null
  if(fromPending){
   link=invitationLink(s.gymId,fromPending.id,kind)
  }else{
   const prev=preparedShareCache
   if(prev&&prev.kind===kind&&prev.gymId===s.gymId&&prev.uid===s.uid&&prev.email===email){
    try{await assertSharePending(kind,prev.link,s.gymId,s.uid,email);link=prev.link}catch{}
   }
   if(!link && kind==='coach')link=await existingValidCoachInvite(email,s.gymId,s.uid)
   if(!link)link=await makeInvite(kind,kind==='coach'?'coach':'manual')
  }
  await assertSharePending(kind,link,s.gymId,s.uid,email)
  const ready={kind,link,gymId:s.gymId,uid:s.uid,email,origin:inviteUrlBase()}
  preparedShareCache=ready
  return ready
 }catch(e){
  status.value=e instanceof Error?e.message:'Non è stato possibile preparare il link. Controlla gli inviti in attesa.'
  return null
 }finally{busy.value=false}
}
// Cache only in this component session; not localStorage, URL bar, telemetry or logs.
let preparedShareCache:PreparedShare|null=null
/** Invito One-Click: il Firestore viene validato PRIMA di copiare o condividere.
 * Su WhatsApp apriamo una finestra vuota durante il click (anti popup-blocker),
 * e la indirizziamo solo dopo la verifica: mai link in log o localStorage.
 */
async function shareInOneClick(kind:ShareInviteKind,action:'copy'|'whatsapp',fromPending?:Invite){
 if(busy.value)return
 // La finestra deve essere aperta sincronicamente dal click reale dell'utente.
 const tab=action==='whatsapp'?window.open('about:blank','_blank'):null
 if(tab){try{tab.opener=null}catch{}}
 const ready=await prepareShare(kind,fromPending)
 if(!ready){if(tab&&!tab.closed)tab.close();return}
 try{
  if(action==='whatsapp'){
   const url=shareWhatsappUrl(ready.link,ready.kind,studioGymName.value,ready.gymId,ready.origin)
   if(!url)throw new Error('Collegamento WhatsApp non valido.')
   if(tab&&!tab.closed)tab.location.replace(url)
   else window.location.assign(url) // Il blocco popup non impedisce la condivisione.
   status.value='WhatsApp aperto: scegli il contatto e conferma tu l’invio. Nessuna email inviata.'
  }else{
   await copyInviteToClipboard(ready.link)
   status.value='Link copiato! Incollalo soltanto nella chat del destinatario.'
  }
 }catch(e){
  if(tab&&!tab.closed)tab.close()
  status.value=e instanceof Error?e.message:'Condivisione non disponibile.'
 }
}
async function copyInviteToClipboard(link:string){
 try{
  if(!navigator.clipboard?.writeText)throw new Error('Clipboard API non disponibile')
  await navigator.clipboard.writeText(link)
  return
 }catch{
  // Fallback per browser che perdono l'attivazione dopo le letture Firestore.
  const field=document.createElement('textarea')
  field.value=link;field.setAttribute('readonly','');field.setAttribute('aria-hidden','true')
  field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(field);field.focus();field.select()
  let copied=false
  try{copied=document.execCommand('copy')}finally{field.remove()}
  if(!copied)throw new Error('Il browser ha bloccato la copia. Consenti l’accesso agli appunti e riprova.')
 }
}

/** Resend accepts delivery for processing; it does not certify inbox reception.
 * Failed attempts reuse the same pending token instead of producing new records.
 */
async function sendCoachMail(){if(busy.value)return
 const email=coachEmail.value.trim().toLowerCase()
 if(!owner.value){status.value='Solo il titolare può invitare un Coach.';return}
 if(!allowedMailRecipient(email)){status.value='Email di test disabilitata: usa un destinatario esplicitamente autorizzato per STAGING.';return}
 if(!emailValid(email)){status.value='Inserisci l’email del collaboratore.';return}
 const s=stagingSession.value;if(!s){status.value='Sessione titolare assente.';return}
 busy.value=true;status.value=''
 try{
  const link=await reusableCoachInvite(email,s.gymId)??await existingValidCoachInvite(email,s.gymId,s.uid)??await makeInvite('coach','coach')
  coachUnsent={email,link,gymId:s.gymId,createdAt:Date.now()}
  sessionStorage.setItem(UNSENT_COACH_KEY,JSON.stringify(coachUnsent))
  await sendCentralInviteEmail({gymId:s.gymId,kind:'coach',link,recipient:email,uid:s.uid})
  coachUnsent=null;sessionStorage.removeItem(UNSENT_COACH_KEY);coachEmail.value=''
  status.value='Resend ha accettato l’invito Coach. Il destinatario deve verificare la ricezione e la propria email.'
 }catch(e){status.value='Invio Coach non confermato: '+(e instanceof Error?e.message:String(e))+'. Per sicurezza non ripetere automaticamente lo stesso invito.'}
 finally{busy.value=false}
}
async function sendAthleteMail(){if(busy.value)return
 const email=athleteEmail.value.trim().toLowerCase()
 if(!emailValid(email)){status.value='Inserisci un indirizzo email valido.';return}
 if(!allowedMailRecipient(email)){status.value='Email di test disabilitata: usa un destinatario esplicitamente autorizzato per STAGING.';return}
 const s=stagingSession.value;if(!s){status.value='Sessione coach assente.';return}
 busy.value=true;status.value=''
 try{
  let link=await reusableUnsent(email,s.gymId)
  if(!link){link=await makeInvite('atleta','email')}
  unsent={email,link,gymId:s.gymId,createdAt:Date.now()}
  sessionStorage.setItem(UNSENT_KEY,JSON.stringify(unsent))
  await sendCentralInviteEmail({gymId:s.gymId,kind:'athlete',link,recipient:email,uid:s.uid})
  unsent=null;sessionStorage.removeItem(UNSENT_KEY);athleteEmail.value=''
  status.value='Resend ha accettato l’invito Atleta. Controlla la ricezione nella casella del destinatario.'
 }catch(e){status.value=`Invio centralizzato non confermato: ${e instanceof Error?e.message:String(e)}. Per sicurezza non ripetere automaticamente lo stesso invito.`}
 finally{busy.value=false}
}
async function revoke(x:Invite){
 if(!mayWriteLive()||!stagingSession.value||busy.value||x.status!=='pending')return
 if(x.type==='coach'&&!owner.value)return
 if(!owner.value&&x.createdBy!==stagingSession.value.uid)return
 if(!window.confirm('Revocare questo invito? Non potrà più essere usato.'))return
 busy.value=true
 try{
  const s=stagingSession.value,{db}=getStagingClients(),ref=doc(db,'gyms',s.gymId,x.type==='coach'?'coach_invites':'athlete_invites',x.id)
  await runTransaction(db,async tx=>{const d=await tx.get(ref);if(!d.exists()||d.data().status!=='pending')throw new Error('Invito già utilizzato o revocato.');tx.update(ref,{status:'revoked'})})
  if(unsent?.link.includes(x.id)){unsent=null;sessionStorage.removeItem(UNSENT_KEY)}
  if(coachUnsent?.link.includes(x.id)){coachUnsent=null;sessionStorage.removeItem(UNSENT_COACH_KEY)}
  if(preparedShareCache?.link.includes(x.id))preparedShareCache=null
  status.value='Invito revocato; rimane nello storico Firebase.'
 }catch(e){status.value=e instanceof Error?e.message:'Revoca non riuscita.'}finally{busy.value=false}
}
</script>
<template>
 <InviteTeamHub :owner="owner" :busy="busy" :pending-count="inviteStats.active" :expiring-count="inviteStats.expiring" :team-count="coaches.length">
  <template #athlete>
   <h3>{{uiText("INVITA UN ATLETA")}}</h3><p class="muted small">{{uiText("Inviti personali · validi 7 giorni.")}}</p>
   <div class="lf-invite-send"><label>{{uiText("EMAIL DELL'ATLETA")}}<input v-model="athleteEmail" type="email" autocomplete="email" placeholder="atleta@esempio.it" :disabled="busy"/></label><button type="button" class="primary" :disabled="busy||!mayWriteLive()||!emailValid(athleteEmail)" @click="sendAthleteMail">{{uiText("✉ INVIA INVITO ATLETA")}}</button></div>
   <div class="lf-invite-manual"><button type="button" class="secondary" :disabled="busy||!mayWriteLive()" @click="shareInOneClick('atleta','copy')">Copia link</button><button type="button" class="lf-wa-button" :disabled="busy||!mayWriteLive()" @click="shareInOneClick('atleta','whatsapp')">WhatsApp</button><span class="muted small">Un clic per generare o recuperare il link; nessuna email viene inviata.</span></div>
  </template>
  <template v-if="owner" #coach>
   <h3>{{uiText("INVITA UN COACH COLLABORATORE")}}</h3><p class="muted small">{{uiText("Invito valido 7 giorni. Il coach deve registrarsi con la stessa email.")}}</p>
   <div class="lf-invite-send"><label>{{uiText('Email collaboratore')}}<input v-model="coachEmail" type="email" autocomplete="email" placeholder="Email del nuovo coach" :disabled="busy"/></label><button type="button" class="primary" :disabled="busy||!mayWriteLive()||!emailValid(coachEmail)" @click="sendCoachMail">{{uiText("✉ INVIA INVITO COACH")}}</button></div>
   <div class="lf-invite-manual"><button type="button" class="secondary" :disabled="busy||!mayWriteLive()||!emailValid(coachEmail)" @click="shareInOneClick('coach','copy')">Copia link</button><button type="button" class="lf-wa-button" :disabled="busy||!mayWriteLive()||!emailValid(coachEmail)" @click="shareInOneClick('coach','whatsapp')">WhatsApp</button><span class="muted small">Il collaboratore deve usare e verificare l'email indicata.</span></div>
  </template>

  <template #status><p v-if="status==='Caricamento coach e inviti…'" v-lf-quiet-loading class="lf-quiet-status" role="status">{{status}}</p><p v-else-if="status" class="muted small lf-invite-feedback" role="status">{{status}}</p><p v-if="!mayWriteLive()" class="muted small lf-invite-feedback">{{uiText('Invio disabilitato in questo ambiente.')}}</p></template>
  <template #team><div v-for="c in coaches" :key="c.id" class="line-card staff-person"><span>{{c.name}}</span><span class="pill staff-role">{{c.membershipStatus==='revoked'?'REVOCATO':c.role}}</span><button v-if="owner && c.role!=='TITOLARE' && coachRevocationEnabled() && mayWriteLive()" class="secondary" :disabled="busy" @click="setMemberStatus(c.id,c.membershipStatus==='revoked'?'active':'revoked')">{{c.membershipStatus==='revoked'?'Riattiva':'Revoca accesso'}}</button></div><p v-if="owner && !coachRevocationEnabled()" class="muted small">{{uiText("Revoca accessi non disponibile. Revocare un invito non revoca un account.")}}</p><p v-if="!coaches.length" class="muted small">{{uiText("Nessun coach caricato.")}}</p></template>
  <template #pending>
   <div class="lf-monitor-controls">
    <label class="lf-monitor-search">Cerca inviti per email<input v-model="inviteSearch" type="search" autocomplete="off" placeholder="Cerca email…" aria-label="Cerca inviti per email"/></label>
    <div class="lf-monitor-filters" role="group" aria-label="Filtra inviti in attesa">
     <button type="button" :aria-pressed="inviteFilter==='all'" @click="inviteFilter='all'">Tutti</button>
     <button type="button" :aria-pressed="inviteFilter==='atleta'" @click="inviteFilter='atleta'">Atleti</button>
     <button v-if="owner" type="button" :aria-pressed="inviteFilter==='coach'" @click="inviteFilter='coach'">Collaboratori</button>
    </div>
   </div>
   <p class="lf-monitor-caption muted small">{{inviteStats.active}} validi · {{inviteStats.expiring}} in scadenza entro 48 ore. Ordinati per scadenza. Lo stato di consegna email non è disponibile.</p>
   <div v-if="!activeInvites.length" class="muted small">Nessun invito valido con questi filtri.</div>
   <div v-for="x in activeInvites" :key="x.type+x.id" class="line-card lf-monitor-invite">
    <div class="lf-monitor-identity"><strong>{{x.type==='coach'?'Collaboratore':'Atleta'}}</strong><span class="small">{{x.email||'Link personale'}}</span><small :class="{'lf-monitor-soon':x.expiresAt?.toMillis&&x.expiresAt.toMillis()-inviteNow<=48*3600000}">{{expiryLabel(x,inviteNow)}}</small></div>
    <div class="lf-pending-actions"><button v-if="mayWriteLive() && (owner||x.createdBy===stagingSession?.uid)" class="secondary" :disabled="busy" @click="shareInOneClick(x.type,'copy',x)">Copia</button><button v-if="mayWriteLive() && (owner||x.createdBy===stagingSession?.uid)" class="lf-wa-button" :disabled="busy" @click="shareInOneClick(x.type,'whatsapp',x)">WhatsApp</button><button class="ghost" :disabled="busy||!mayWriteLive()" @click="revoke(x)">{{uiText("Revoca")}}</button></div>
   </div>
  </template>
  <template v-if="owner" #studio><InviteEmailStudio v-if="stagingSession?.uid&&stagingSession?.gymId" :gym-id="stagingSession.gymId" :uid="stagingSession.uid" :gym-name="studioGymName" :logo="studioLogo" :cover="studioCover" :busy="busy"/></template>
  <template #settings><p class="muted small">LionFit Mail · Resend: inviti inviati attraverso Firebase. Mittente e credenziali sono gestiti esclusivamente sul server. Il logo e la copertina seguono il branding della palestra, con immagini standard LionFit quando mancano.</p></template>
 </InviteTeamHub>
</template>

<style scoped>
.lf-invite-manual{margin-top:11px;display:flex;align-items:center;flex-wrap:wrap;gap:9px}.lf-invite-manual button{min-height:42px;font-size:12px;white-space:normal}.lf-wa-button{background:#168754;color:#fff;border:1px solid #168754;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer}.lf-wa-button:hover:not(:disabled){background:#107249}.lf-wa-button:disabled{opacity:.52;cursor:not-allowed}.lf-invite-manual .muted{font-size:12px}.lf-pending-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.lf-pending-actions button{min-height:38px;font-size:12px}.lf-monitor-controls{display:grid;gap:9px;margin:0 0 11px}.lf-monitor-search{display:grid;gap:5px;font-size:12px}.lf-monitor-search input{min-height:42px}.lf-monitor-filters{display:flex;gap:6px;flex-wrap:wrap}.lf-monitor-filters button{padding:8px 11px;border:1px solid var(--border);border-radius:9px;min-height:39px;background:var(--field);color:var(--text);font-weight:700;font-size:12px}.lf-monitor-filters button[aria-pressed=true]{border-color:var(--mint);background:var(--green-bg);color:var(--mint)}.lf-monitor-caption{font-size:11px;line-height:1.45;margin:0 0 9px}.lf-monitor-invite{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:9px}.lf-monitor-identity{display:grid;min-width:0;gap:3px;overflow-wrap:anywhere}.lf-monitor-identity strong{font-size:12px}.lf-monitor-identity span{font-size:12px}.lf-monitor-identity small{font-size:11px;color:var(--muted)}.lf-monitor-identity .lf-monitor-soon{color:#dfaa54;font-weight:700}
@media(max-width:430px){.lf-invite-manual{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.lf-invite-manual .muted{grid-column:1/-1}.lf-invite-manual button{width:100%;min-width:0}.lf-pending-actions button{min-height:42px}}
</style>
