import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core'
import {getFunctions,httpsCallable} from 'firebase/functions'
import {getMessaging,getToken,deleteToken,isSupported,onMessage} from 'firebase/messaging'
import {shallowRef} from 'vue'
import {getStagingClients} from './stagingClient'
import {isLiveMode,mayWriteLive} from './stagingConfig'
export const reminderChoices=[{value:4320,label:'3 giorni prima'},{value:1440,label:'24 ore prima'},{value:720,label:'12 ore prima'},{value:120,label:'2 ore prima'},{value:60,label:'1 ora prima'},{value:30,label:'30 minuti prima'}]
export type PushPreferences={booked:boolean;cancelled:boolean;leads:number[]}
export const defaultPushPrefs=():PushPreferences=>({booked:true,cancelled:true,leads:[1440,30]})
type Binding={uid:string;id:string;platform:'android'|'web';prefs:PushPreferences}
type Permission={receive:string}
type NativePush={checkPermissions():Promise<Permission>;requestPermissions():Promise<Permission>;register():Promise<void>;unregister():Promise<void>;addListener(event:'registration',listener:(v:{value:string})=>void):Promise<PluginListenerHandle>;addListener(event:'registrationError',listener:(v:{error:string})=>void):Promise<PluginListenerHandle>;addListener(event:'pushNotificationReceived',listener:(v:{title?:string;body?:string;data?:Record<string,string>})=>void):Promise<PluginListenerHandle>;addListener(event:'pushNotificationActionPerformed',listener:(v:{notification:{data?:Record<string,string>}})=>void):Promise<PluginListenerHandle>}
const native=registerPlugin<NativePush>('PushNotifications')
const isAndroid=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'
const vapid=()=>String(import.meta.env.VITE_LIONFIT_PUSH_VAPID_KEY||'').trim()
export const pushFeatureEnabled=()=>isLiveMode()&&mayWriteLive()&&import.meta.env.VITE_LIONFIT_PUSH_ENABLED==='true'
const key=()=>`lf-notify-v1:${getStagingClients().auth.app.options.projectId}`
export const pushNotice=shallowRef<{title:string;body:string}|null>(null)
let detach: (()=>void)|undefined
let generation=0
function localBinding():Binding|null{try{const b=JSON.parse(localStorage.getItem(key())||'null');return b&&typeof b.uid==='string'&&/^[a-f0-9]{64}$/.test(b.id)&&['web','android'].includes(b.platform)&&b.prefs?b:null}catch{return null}}
function storeBinding(b:Binding){localStorage.setItem(key(),JSON.stringify(b))}
function forget(){try{localStorage.removeItem(key())}catch{/* explicit best effort */}}
const offerKey=(uid:string)=>`${key()}:offer-dismissed:${uid}`
export function shouldOfferPush(uid:string){try{return !localStorage.getItem(offerKey(uid))}catch{return false}}
export function declinePush(uid:string){try{localStorage.setItem(offerKey(uid),'1')}catch{/* optional storage */}}
function allowOffer(uid:string){try{localStorage.removeItem(offerKey(uid))}catch{/* optional storage */}}
function signedUid(){const u=getStagingClients().auth.currentUser?.uid;if(!u)throw new Error('Accedi a LionFit.');return u}
async function call<T>(name:string,payload:Record<string,unknown>):Promise<T>{if(!pushFeatureEnabled())throw new Error('Notifiche non configurate.');const {auth}=getStagingClients();if(!auth.currentUser)throw new Error('Accedi a LionFit.');return (await httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(payload)).data}
export async function pushSupported(){if(!pushFeatureEnabled())return false;if(isAndroid())return Capacitor.isPluginAvailable('PushNotifications');if(Capacitor.isNativePlatform()||!vapid()||!window.isSecureContext||!('Notification' in window)||!('serviceWorker' in navigator))return false;try{return await isSupported()}catch{return false}}
async function obtainNative(prompt:boolean){
 if(!Capacitor.isPluginAvailable('PushNotifications'))throw new Error('APK senza supporto notifiche.');let p=await native.checkPermissions();if(p.receive!=='granted'&&prompt)p=await native.requestPermissions();if(p.receive!=='granted')throw new Error('Consenti le notifiche nelle impostazioni Android.');
 let ok:PluginListenerHandle|undefined,fail:PluginListenerHandle|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 try{return await new Promise<string>((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Registrazione Android scaduta.')),20000);void(async()=>{ok=await native.addListener('registration',v=>resolve(v.value));fail=await native.addListener('registrationError',()=>reject(new Error('FCM Android non configurato.')));await native.register()})().catch(reject)})}finally{clearTimeout(timer);await ok?.remove();await fail?.remove()}
}
async function obtainWeb(prompt:boolean){
 if(!vapid()||!('Notification' in window))throw new Error('Notifiche web non configurate.');let p=Notification.permission;if(p==='default'&&prompt)p=await Notification.requestPermission();if(p!=='granted')throw new Error('Consenti le notifiche dal browser. Su iPhone apri LionFit dalla schermata Home.');
 const {auth}=getStagingClients();const c=auth.app.options;const url=new URL('/lf-push-worker.js',location.origin);for(const k of ['apiKey','projectId','appId','messagingSenderId'] as const){if(!c[k])throw new Error('Configurazione FCM incompleta.');url.searchParams.set(k,c[k]!)}
 const reg=await navigator.serviceWorker.register(url.href,{scope:'/lf-push/'});if(!reg.active){const sw=reg.installing||reg.waiting;if(!sw)throw new Error('Service worker non pronto.');await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{sw.removeEventListener('statechange',change);reject(new Error('Attivazione notifiche web scaduta.'))},20000);function change(){if(sw!.state==='activated'||sw!.state==='redundant'){clearTimeout(timer);sw!.removeEventListener('statechange',change);sw!.state==='activated'?resolve():reject(new Error('Service worker non attivato.'))}}sw.addEventListener('statechange',change);change()})}
 return getToken(getMessaging(auth.app),{serviceWorkerRegistration:reg,vapidKey:vapid()})
}
async function obtain(prompt:boolean){return isAndroid()?obtainNative(prompt):obtainWeb(prompt)}
export async function activatePush(prefs:PushPreferences,prompt=true){const uid=signedUid(),old=localBinding();const token=await obtain(prompt);if(uid!==signedUid())throw new Error('Account cambiato.');const platform=isAndroid()?'android':'web';const result=await call<{id:string;prefs:PushPreferences}>('lfPushRegister',{token,platform,prefs});if(uid!==signedUid())throw new Error('Account cambiato.');const b={uid,id:result.id,platform,prefs:result.prefs} as Binding;storeBinding(b);allowOffer(uid);if(old?.uid===uid&&old.id!==b.id)await call('lfPushUnregister',{id:old.id}).catch(()=>{});return {active:true,prefs:b.prefs}}
export async function readPushSettings(){const b=localBinding();if(!b||b.uid!==signedUid())return {active:false,prefs:defaultPushPrefs()};const r=await call<{active:boolean;prefs?:PushPreferences}>('lfPushSettings',{id:b.id});if(!r.active){forget();return {active:false,prefs:defaultPushPrefs()}}return {active:true,prefs:r.prefs||b.prefs}}
export async function savePushSettings(prefs:PushPreferences){const b=localBinding();if(!b||b.uid!==signedUid())throw new Error('Attiva le notifiche.');const r=await call<{active:boolean;prefs:PushPreferences}>('lfPushSettings',{id:b.id,prefs});if(!r.active)throw new Error('Registrazione scaduta: riattiva le notifiche.');storeBinding({...b,prefs:r.prefs});return r}
export async function testPush(){const b=localBinding();if(!b||b.uid!==signedUid())throw new Error('Attiva le notifiche.');return call('lfPushTest',{id:b.id})}
async function revokeLocal(b:Binding){if(b.platform==='android'){await native.unregister()}else if(await isSupported()){await deleteToken(getMessaging(getStagingClients().auth.app))}else throw new Error('FCM non disponibile.');}
export async function deactivatePush(explicit=true){const b=localBinding();if(!b)return;++generation;detach?.();detach=undefined;let remote=false,local=false;if(b.uid===signedUid()){try{await call('lfPushUnregister',{id:b.id});remote=true}catch{/* try revoke device */}}try{await revokeLocal(b);local=true}catch{/* explicit failure */}if(!remote&&!local)throw new Error('Impossibile disattivare le notifiche. Riprova con una connessione attiva.');forget();if(explicit)declinePush(b.uid);pushNotice.value=null;}
export async function disconnectPushBeforeLogout(){if(!pushFeatureEnabled()||!localBinding())return true;try{await deactivatePush(false);return true}catch{return window.confirm('Non è stato possibile confermare la disattivazione delle notifiche. Uscire comunque? Potrebbero arrivare ancora avvisi generici.')}}
export async function connectPushSession(uid:string|null,openAgenda:()=>void){const turn=++generation;detach?.();detach=undefined;pushNotice.value=null;if(!uid||!pushFeatureEnabled())return;const b=localBinding();if(!b||b.uid!==uid)return;
 if(!(await pushSupported())||turn!==generation)return;
 const show=(v:{title?:string;body?:string})=>{if(turn!==generation||getStagingClients().auth.currentUser?.uid!==uid||!v.title||!v.body)return;pushNotice.value={title:v.title,body:v.body}};
 if(isAndroid()){const handles:PluginListenerHandle[]=[];try{handles.push(await native.addListener('pushNotificationReceived',show));handles.push(await native.addListener('pushNotificationActionPerformed',v=>{if(turn===generation&&getStagingClients().auth.currentUser?.uid===uid&&v.notification.data?.open==='bookings')openAgenda()}));if(turn!==generation){handles.forEach(h=>void h.remove());return}detach=()=>handles.forEach(h=>void h.remove())}catch{handles.forEach(h=>void h.remove())}}
 else{const stop=onMessage(getMessaging(getStagingClients().auth.app),v=>show(v.notification||{}));if(turn!==generation)stop();else detach=stop;}
}
