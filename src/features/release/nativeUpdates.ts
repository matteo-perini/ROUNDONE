/** LionFit native Android update checker: automatic throttled notice + manual on-demand check.
 * Both paths use the same validated GitHub Release asset. No auto-install or silent download.
 */
import {Capacitor} from '@capacitor/core'
import {App} from '@capacitor/app'
import {AppLauncher} from '@capacitor/app-launcher'
import {NATIVE_UPDATE_API,NATIVE_UPDATE_CHECK_MS,NATIVE_UPDATE_SNOOZE_MS,safeNewAndroidRelease} from './nativeUpdatePolicy'

let started=false
let automaticChecking=false
const lastKey='lf_modern_android_update_checked_v7'
const snoozeKey=(tag:string)=>'lf_modern_android_update_snooze_v7_'+tag
const RELEASES_URL='https://github.com/matteo-perini/ROUNDONE/releases/latest'
function read(key:string):number {try{return Number(localStorage.getItem(key)||0)||0}catch{return 0}}
function write(key:string,value:number) {try{localStorage.setItem(key,String(value))}catch{/* unavailable storage */}}
export function isNativeAndroid():boolean {return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'}
export type NativeUpdateStatus =
 | {kind:'available';installed:string;tag:string;url:string}
 | {kind:'current';installed:string}
 | {kind:'unsupported'}
 | {kind:'error';message:string}

/** Always bypasses the automatic 8-hour interval and any snooze; returns a status for the settings UI.
 * It does not display the automatic banner, so no overlapping modals.
 */
export async function checkNativeUpdateNow():Promise<NativeUpdateStatus>{
 if(!isNativeAndroid())return {kind:'unsupported'}
 const controller=new AbortController()
 const timeout=setTimeout(()=>controller.abort(),12000)
 try{
  const installed=(await App.getInfo()).version
  const response=await fetch(NATIVE_UPDATE_API,{
   headers:{Accept:'application/vnd.github+json'},cache:'no-store',signal:controller.signal
  })
  if(!response.ok){
   return {kind:'error',message:response.status===403?'GitHub limita temporaneamente le verifiche. Riprova tra qualche minuto.':`GitHub non risponde (HTTP ${response.status}).`}
  }
  const candidate=safeNewAndroidRelease(await response.json(),installed)
  write(lastKey,Date.now())
  return candidate?{kind:'available',installed,...candidate}:{kind:'current',installed}
 }catch(error){
  return {kind:'error',message:error instanceof Error&&error.name==='AbortError'?'Controllo scaduto. Verifica la connessione e riprova.':'Controllo non riuscito. Verifica Internet e riprova.'}
 }finally{clearTimeout(timeout)}
}
/** Android ACTION_VIEW: passes the URL to an external app/browser instead of a Capacitor Custom Tab.
 * The asset URL is validated by the Release policy before being passed here.
 */
export async function openAndroidApkDownload(url:string):Promise<void>{
 if(!isNativeAndroid())throw new Error('Il download APK è disponibile nell’app Android.')
 const result=await AppLauncher.openUrl({url})
 if(!result.completed)throw new Error('Impossibile aprire il browser esterno.')
}
export async function openAndroidReleases():Promise<void>{
 if(!isNativeAndroid())throw new Error('Disponibile solo nell’app Android.')
 const result=await AppLauncher.openUrl({url:RELEASES_URL})
 if(!result.completed)throw new Error('Impossibile aprire GitHub Releases.')
}
function notice(tag:string,installed:string,url:string){
 if(Date.now()-read(snoozeKey(tag))<NATIVE_UPDATE_SNOOZE_MS || document.getElementById('lf-modern-update'))return
 const style=document.createElement('style')
 style.textContent=`#lf-modern-update{position:fixed;z-index:2147483000;bottom:calc(84px + env(safe-area-inset-bottom,0px));left:12px;right:12px;max-width:460px;margin:auto;background:#182a27;color:white;border:1px solid #67c99b;border-radius:15px;padding:14px;box-shadow:0 10px 40px #0008;font:14px system-ui}#lf-modern-update button{padding:10px 12px;border-radius:8px;border:1px solid #64cfa0;margin-right:8px;margin-top:12px;color:white;background:#167850;font-weight:650;cursor:pointer}#lf-modern-update button.later{background:transparent}`
 document.head.appendChild(style)
 const panel=document.createElement('section');panel.id='lf-modern-update';panel.setAttribute('role','status')
 const title=document.createElement('strong');title.textContent='Aggiornamento Lion Fit disponibile'
 const p=document.createElement('p');p.textContent=`Versione ${tag} disponibile (installata: ${installed}). Vuoi aprire il download?`
 const download=document.createElement('button');download.type='button';download.textContent='Scarica aggiornamento'
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
 const check=async()=>{
  if(automaticChecking||document.hidden||Date.now()-read(lastKey)<NATIVE_UPDATE_CHECK_MS)return
  automaticChecking=true
  try{
   const result=await checkNativeUpdateNow()
   if(result.kind==='available')notice(result.tag,result.installed,result.url)
  }catch{/* Never block the app during connectivity errors. */}
  finally{automaticChecking=false}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()})
 void check()
}
