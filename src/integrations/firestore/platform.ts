import {collection,doc,onSnapshot,serverTimestamp,runTransaction,getDocFromServer,setDoc,query,where,orderBy,limit,startAfter,getDocsFromServer,getCountFromServer,updateDoc,addDoc,documentId,type QueryDocumentSnapshot} from 'firebase/firestore'
import {getStagingClients} from '../firebase/stagingClient'
import {mayWriteLive,isStagingMode} from '../firebase/stagingConfig'
import {readStagingSession,type StagingSession} from '../firebase/stagingSession'
import {verifyPlatformAccess} from '../firebase/platformAccess'
import {readCommercialMode,type CommercialMode,type CommercialGym} from '../../features/platform/commercialModel'
import {accountKey,cleanHidden,gymName,safeImage,ticketTypes,ticketStates,type WidgetId,type TicketState} from '../../features/platform/platformModel'
const ensureWrite=()=>{if(!mayWriteLive())throw new Error('Scritture non abilitate in questo ambiente.')}
const db=()=>getStagingClients().db
export type Identity={name:string;logo:string;cover:string}
export type IdentityField=keyof Identity
export type IdentityPart='gym'|'appearance'
export type IdentityStatus={state:'loading'|'ready'|'error';message?:string}
export type IdentityRead={identity:Identity;gym:IdentityStatus;appearance:IdentityStatus}
export const emptyIdentity=():Identity=>({name:'',logo:'',cover:''})
export const emptyIdentityRead=():IdentityRead=>({identity:emptyIdentity(),gym:{state:'loading'},appearance:{state:'loading'}})
export function watchGymIdentity(s:StagingSession,next:(v:IdentityRead)=>void){
 let state=emptyIdentityRead(),active=true
 const stops:(()=>void)[]=[]
 function publish(part:IdentityPart,status:IdentityStatus,values:Partial<Identity>){if(!active)return;state={...state,[part]:status,identity:{...state.identity,...values}};next(state)}
 const sources=[{part:'gym' as const,ref:doc(db(),'gyms',s.gymId)}, {part:'appearance' as const,ref:doc(db(),'gyms',s.gymId,'identity','appearance')}]
 for(const {part,ref} of sources){
  const blank=part==='gym'?{name:''}:{logo:'',cover:''}
  const error=(e:unknown)=>publish(part,{state:'error',message:String((e as {code?:string})?.code||'lettura-non-riuscita')},blank)
  const accept=(snap:Awaited<ReturnType<typeof getDocFromServer>>)=>{
   if(!active||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return
   if(part==='gym'&&!snap.exists()){publish(part,{state:'error',message:'palestra-non-trovata'},blank);return}
   const d=snap.data() as Record<string,unknown>|undefined
   publish(part,{state:'ready'},part==='gym'?{name:gymName(d?.name)||gymName(d?.gymName)}:{logo:safeImage(d?.logo,120000),cover:safeImage(d?.cover,420000)})
  }
  // A single listener delivers the first server-confirmed snapshot and future changes.
  // Cached or pending writes are still rejected by accept(); absence is valid for branding.
  stops.push(onSnapshot(ref,{includeMetadataChanges:true},accept,error))
 }
 return()=>{active=false;stops.forEach(stop=>stop())}
}
export async function saveGymIdentity(d:Identity,expected:string,fields:readonly IdentityField[]){
 ensureWrite();const s=await readStagingSession();if(accountKey(s)!==expected)throw new Error('Account cambiato: riapri le impostazioni.');if(s.role!=='titolare')throw new Error('Solo il titolare può modificare la palestra.');
 const name=d.name.trim(),changeName=fields.includes('name'),changeLogo=fields.includes('logo'),changeCover=fields.includes('cover'),changeBrand=changeLogo||changeCover
 if(!changeName&&!changeBrand)return
 if(changeName&&(!name||name.length>100))throw new Error('Inserisci un nome da 1 a 100 caratteri.')
 if((changeLogo&&d.logo&&!safeImage(d.logo,120000))||(changeCover&&d.cover&&!safeImage(d.cover,420000)))throw new Error('Immagine non valida o troppo grande.')
 const store=db(),gym=doc(store,'gyms',s.gymId),brand=doc(store,'gyms',s.gymId,'identity','appearance')
 // Never replace an unedited image with stale data. If only the name changed,
 // no read/write of the optional appearance document is necessary.
 await runTransaction(store,async tx=>{
  const root=await tx.get(gym);if(!root.exists()||root.data().ownerUid!==s.uid)throw new Error('Solo il titolare verificato può modificare la palestra.')
  const old=changeBrand?(await tx.get(brand)).data():undefined
  if(changeName)tx.update(gym,{name})
  if(changeBrand)tx.set(brand,{logo:changeLogo?d.logo:safeImage(old?.logo,120000),cover:changeCover?d.cover:safeImage(old?.cover,420000),updatedAt:serverTimestamp()})
 })
}
export function watchDashboard(s:StagingSession,next:(v:WidgetId[])=>void,fail:(e:Error)=>void){return onSnapshot(doc(db(),'gyms',s.gymId,'dashboard_preferences',s.uid),{includeMetadataChanges:true},p=>{if(!p.metadata.fromCache)next(cleanHidden(p.data()?.hidden))},fail)}
export async function saveDashboard(hidden:WidgetId[],expected:string){ensureWrite();const s=await readStagingSession();if(accountKey(s)!==expected)throw new Error('Account cambiato: riapri le impostazioni.');if(s.role==='atleta')throw new Error('Solo Coach.');await setDoc(doc(db(),'gyms',s.gymId,'dashboard_preferences',s.uid),{hidden:cleanHidden(hidden),updatedAt:serverTimestamp()})}
export async function platformGuard(write=false){if(write)ensureWrite();if(!isStagingMode()||!await verifyPlatformAccess())throw new Error('Accesso piattaforma non autorizzato.');return db()}
export type PlatformGym={id:string;name:string;createdAt?:number}
export type Ticket={id:string;gymId:string;requesterId:string;requesterName:string;type:string;subject:string;message:string;status:TicketState;createdAt:number}
export type Reply={id:string;author:'requester'|'platform';message:string;createdAt:number}
const ms=(v:any)=>typeof v?.toMillis==='function'?v.toMillis():0
const asTicket=(d:QueryDocumentSnapshot):Ticket=>({id:d.id,gymId:String(d.data().gymId||''),requesterId:String(d.data().requesterId||''),requesterName:String(d.data().requesterName||''),type:String(d.data().type||''),subject:String(d.data().subject||''),message:String(d.data().message||''),status:d.data().status,createdAt:ms(d.data().createdAt)})
export async function listPlatformGyms(cursor?:QueryDocumentSnapshot){const store=await platformGuard();const q=collection(store,'gyms');const snap=await getDocsFromServer(query(q,orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(40)));return {rows:snap.docs.map(d=>({id:d.id,name:gymName(d.data().name)||'Palestra senza nome',createdAt:ms(d.data().createdAt)})),cursor:snap.docs.at(-1),more:snap.size===40}}
export async function platformCounts(){const store=await platformGuard();const [g,t]=await Promise.all([getCountFromServer(collection(store,'gyms')),getCountFromServer(query(collection(store,'support_tickets'),where('status','in',['open','working']))) ]);return {gyms:g.data().count,tickets:t.data().count}}
export async function listTickets(platform:boolean,cursor?:QueryDocumentSnapshot){const store=platform?await platformGuard():db();const s=platform?null:await readStagingSession();const q=query(collection(store,'support_tickets'),...(s?[where('requesterId','==',s.uid),where('gymId','==',s.gymId)]:[]),orderBy('createdAt','desc'),...(cursor?[startAfter(cursor)]:[]),limit(40));const snap=await getDocsFromServer(q);return {rows:snap.docs.map(asTicket),cursor:snap.docs.at(-1),more:snap.size===40}}
export async function createTicket(type:string,subject:string,message:string,expected:string){ensureWrite();const s=await readStagingSession();if(accountKey(s)!==expected)throw new Error('Account cambiato: riapri assistenza.');subject=subject.trim();message=message.trim();if(!ticketTypes.some(t=>t===type)||!subject||subject.length>100||message.length<2||message.length>1800)throw new Error('Controlla oggetto, tipo e messaggio.');return (await addDoc(collection(db(),'support_tickets'),{gymId:s.gymId,requesterId:s.uid,requesterName:s.label.slice(0,80),type,subject,message,status:'open',createdAt:serverTimestamp(),updatedAt:serverTimestamp()})).id}
export async function readReplies(ticketId:string,platform:boolean,cursor?:QueryDocumentSnapshot){const store=platform?await platformGuard():db();if(!platform)await readStagingSession();const snap=await getDocsFromServer(query(collection(store,'support_tickets',ticketId,'replies'),orderBy('createdAt','asc'),...(cursor?[startAfter(cursor)]:[]),limit(50)));return {rows:snap.docs.map(d=>({id:d.id,author:d.data().author as Reply['author'],message:String(d.data().message||''),createdAt:ms(d.data().createdAt)})),cursor:snap.docs.at(-1),more:snap.size===50}}
export async function replyTicket(ticketId:string,platform:boolean,text:string){ensureWrite();const store=platform?await platformGuard(true):db();if(!platform)await readStagingSession();text=text.trim();if(text.length<2||text.length>1800)throw new Error('Messaggio da 2 a 1800 caratteri.');await addDoc(collection(store,'support_tickets',ticketId,'replies'),{author:platform?'platform':'requester',message:text,createdAt:serverTimestamp()})}
export async function changeTicketStatus(ticketId:string,status:TicketState){const store=await platformGuard(true);if(!ticketStates.includes(status))throw new Error('Stato non valido.');await updateDoc(doc(store,'support_tickets',ticketId),{status,updatedAt:serverTimestamp()})}
export async function setBillingExemption(gym:string,exempt:boolean){if(typeof exempt!=='boolean')throw new Error('Preferenza non valida.');const store=await platformGuard(true);await setDoc(doc(store,'platform_billing',gym),{exempt,updatedAt:serverTimestamp()})}
async function readGymCommercialMode(store:ReturnType<typeof db>,gym:string):Promise<CommercialMode>{
 const p=await getDocFromServer(doc(store,'platform_billing',gym))
 if(p.metadata.fromCache||p.metadata.hasPendingWrites)return 'unavailable'
 return readCommercialMode(p.exists(),p.data()?.exempt)
}
export async function getGymCommercialMode(gym:string){return readGymCommercialMode(await platformGuard(),gym)}
export async function listGymCommercialModes(gyms:readonly PlatformGym[]):Promise<CommercialGym[]>{
 const store=await platformGuard(),rows:CommercialGym[]=[]
 // The existing rules allow individual reads, not listing platform_billing.
 // Limit parallel reads and keep a failed lookup distinct from an exemption.
 for(let i=0;i<gyms.length;i+=8){
  rows.push(...await Promise.all(gyms.slice(i,i+8).map(async g=>{
   let commercial:CommercialMode
   try{commercial=await readGymCommercialMode(store,g.id)}catch{commercial='unavailable'}
   return {...g,commercial}
  })))
 }
 return rows
}
export async function getBillingExemption(gym:string){return await getGymCommercialMode(gym)==='exempt'}
