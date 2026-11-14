/** LionFit native Android update checker: automatic throttled notice + manual on-demand check.
 * Both paths use the same validated GitHub Release asset. No auto-install or silent download.
 */
import {Capacitor} from '@capacitor/core'
import {App} from '@capacitor/app'
import {AppLauncher} from '@capacitor/app-launcher'
import {NATIVE_UPDATE_API,isSnoozed,makeUpdateGate,permittedApkUrl,rateLimitUntil,selectAndroidRelease} from './nativeUpdatePolicy'

let started=false
let automaticChecking=false
const gate=makeUpdateGate()
const rateKey='lf_modern_android_update_rate_until_v18'
let inFlight:Promise<NativeUpdateStatus>|null=null
let manualGeneration=0
const snoozeKey=(tag:string)=>'lf_modern_android_update_snooze_v7_'+tag
const RELEASES_URL='https://github.com/matteo-perini/ROUNDONE/releases'
function read(key:string):number {try{return Number(localStorage.getItem(key)||0)||0}catch{return 0}}
function write(key:string,value:number) {try{localStorage.setItem(key,String(value))}catch{/* unavailable storage */}}
export function isNativeAndroid():boolean {return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'}
export type NativeUpdateStatus =
 | {kind:'available';installed:string;tag:string;url:string}
 | {kind:'current';installed:string}
 | {kind:'unsupported'}
 | {kind:'error';message:string}

/** Share a single request between resume and manual checks. Manual bypasses the normal
 * throttle and snooze, never an explicit GitHub rate limit. */
const rateMessage='GitHub limita temporaneamente le verifiche. Riprova più tardi.'
export function checkNativeUpdateNow():Promise<NativeUpdateStatus>{
 manualGeneration++
 return requestUpdate()
}
function requestUpdate():Promise<NativeUpdateStatus>{
 if(!isNativeAndroid())return Promise.resolve({kind:'unsupported'})
 if(inFlight)return inFlight
 if(read(rateKey)>Date.now())return Promise.resolve({kind:'error',message:rateMessage})
 inFlight=fetchUpdate().then(result=>{
  gate.record(Date.now(),result.kind==='available'||result.kind==='current')
  return result
 }).finally(()=>{inFlight=null})
 return inFlight
}
async function fetchUpdate():Promise<NativeUpdateStatus>{
 const controller=new AbortController()
 const timeout=setTimeout(()=>controller.abort(),12000)
 try{
  const installed=(await App.getInfo()).version
  const response=await fetch(NATIVE_UPDATE_API,{
   headers:{Accept:'application/vnd.github+json'},cache:'no-store',signal:controller.signal
  })
  if(!response.ok){
   if(response.status===403||response.status===429){
    write(rateKey,rateLimitUntil(Date.now(),response.headers.get('retry-after'),response.headers.get('x-ratelimit-reset')))
    return {kind:'error',message:rateMessage}
   }
   return {kind:'error',message:`GitHub non risponde (HTTP ${response.status}).`}
  }
  const result=selectAndroidRelease(await response.json(),installed)
  if(result.kind==='available')return {kind:'available',installed,...result.candidate}
  if(result.kind==='error')return result
  return {kind:'current',installed}
 }catch(error){
  return {kind:'error',message:error instanceof Error&&error.name==='AbortError'?'Controllo scaduto. Verifica la connessione e riprova.':'Controllo non riuscito. Verifica Internet e riprova.'}
 }finally{clearTimeout(timeout)}
}
/** Android ACTION_VIEW: passes the URL to an external app/browser instead of a Capacitor Custom Tab.
 * The asset URL is validated by the Release policy before being passed here.
 */
export async function openAndroidApkDownload(url:string):Promise<void>{
 if(!isNativeAndroid())throw new Error('Il download APK è disponibile nell’app Android.')
 if(!permittedApkUrl(url))throw new Error('Indirizzo APK non valido.')
 const result=await AppLauncher.openUrl({url})
 if(!result.completed)throw new Error('Impossibile aprire il browser esterno.')
}
export async function openAndroidReleases():Promise<void>{
 if(!isNativeAndroid())throw new Error('Disponibile solo nell’app Android.')
 const result=await AppLauncher.openUrl({url:RELEASES_URL})
 if(!result.completed)throw new Error('Impossibile aprire GitHub Releases.')
}
function notice(tag:string,installed:string,url:string){
 if(isSnoozed(read(snoozeKey(tag)),Date.now()))return
 const previous=document.getElementById('lf-modern-update')
 if(previous?.dataset.tag===tag)return
 previous?.remove()
 const style=document.createElement('style')
 style.textContent=`#lf-modern-update{position:fixed;z-index:2147483000;bottom:calc(84px + env(safe-area-inset-bottom,0px));left:12px;right:12px;max-width:460px;margin:auto;background:#182a27;color:white;border:1px solid #67c99b;border-radius:15px;padding:14px;box-shadow:0 10px 40px #0008;font:14px system-ui}#lf-modern-update button{padding:10px 12px;border-radius:8px;border:1px solid #64cfa0;margin-right:8px;margin-top:12px;color:white;background:#167850;font-weight:650;cursor:pointer}#lf-modern-update button.later{background:transparent}`
 if(!document.getElementById('lf-modern-update-style')){style.id='lf-modern-update-style';document.head.appendChild(style)}
 const panel=document.createElement('section');panel.id='lf-modern-update';panel.dataset.tag=tag;panel.setAttribute('role','status')
 const title=document.createElement('strong');title.textContent='Aggiornamento Lion Fit disponibile'
 const p=document.createElement('p');p.textContent=`Versione ${tag} disponibile (installata: ${installed}). Vuoi aprire il download?`
 const download=document.createElement('button');download.type='button';download.textContent='Aggiorna'
 let useReleasesPage=false
 download.addEventListener('click',()=>{
  if(download.disabled)return
  download.disabled=true
  void (useReleasesPage?openAndroidReleases():openAndroidApkDownload(url)).catch(()=>{
   p.textContent='Non è stato possibile aprire il download. Prova dalla pagina GitHub Releases.'
   useReleasesPage=true
   download.textContent='Apri GitHub Releases'
  }).finally(()=>{download.disabled=false})
 })
 const later=document.createElement('button');later.type='button';later.className='later';later.textContent='Più tardi'
 later.addEventListener('click',()=>{write(snoozeKey(tag),Date.now());panel.remove()})
 panel.append(title,p,download,later);document.body.appendChild(panel)
}
export function installNativeUpdateChecker():void {
 if(started||!isNativeAndroid())return
 started=true
 let pending:Extract<NativeUpdateStatus,{kind:'available'}>|null=null
 let nativeActive=true
 const showPending=()=>{
  if(pending&&nativeActive&&!document.hidden)notice(pending.tag,pending.installed,pending.url)
 }
 const check=async()=>{
  if(!nativeActive||document.hidden||automaticChecking)return
  // Re-show a pending result after returning to foreground (unless snoozed).
  if(!gate.due(Date.now())){showPending();return}
  if(read(rateKey)>Date.now())return
  automaticChecking=true
  const generation=manualGeneration
  const joinedManual=!!inFlight
  try{
   const result=await requestUpdate()
   if(result.kind==='available'){
    if(!joinedManual&&generation===manualGeneration){pending=result;showPending()}
   }else if(result.kind==='current'){
    pending=null;document.getElementById('lf-modern-update')?.remove()
   }
  }catch{/* Never block the app during connectivity errors. */}
  finally{automaticChecking=false}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()})
 // Native lifecycle is more reliable than WebView visibility alone on Android.
 void App.addListener('appStateChange',({isActive})=>{nativeActive=isActive;if(isActive)void check()}).catch(()=>{})
 void check()
}
