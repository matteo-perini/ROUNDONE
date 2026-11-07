/** OPTIONAL updater for verified Android APK only. No auto-download/installation.
 * Never executed in a dev server; requires explicit release env opt-in in main.ts.
 */
import {Capacitor} from '@capacitor/core'
import {App} from '@capacitor/app'
import {Browser} from '@capacitor/browser'
import {NATIVE_UPDATE_API,NATIVE_UPDATE_CHECK_MS,NATIVE_UPDATE_SNOOZE_MS,safeNewAndroidRelease} from './nativeUpdatePolicy'
let started=false
const lastKey='lf_modern_android_update_checked_v7'
const snoozeKey=(tag:string)=>'lf_modern_android_update_snooze_v7_'+tag
function read(key:string):number {try{return Number(localStorage.getItem(key)||0)||0}catch{return 0}}
function write(key:string,value:number) {try{localStorage.setItem(key,String(value))}catch{ /* storage disabled */ }}
function isAndroid(){return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'}
function notice(tag:string,installed:string,url:string){
 if(Date.now()-read(snoozeKey(tag))<NATIVE_UPDATE_SNOOZE_MS || document.getElementById('lf-modern-update'))return
 const style=document.createElement('style')
 style.textContent=`#lf-modern-update{position:fixed;z-index:2147483000;bottom:calc(84px + env(safe-area-inset-bottom,0px));left:12px;right:12px;max-width:460px;margin:auto;background:#182a27;color:white;border:1px solid #67c99b;border-radius:15px;padding:14px;box-shadow:0 10px 40px #0008;font:14px system-ui}#lf-modern-update button{padding:10px 12px;border-radius:8px;border:1px solid #64cfa0;margin-right:8px;margin-top:12px;color:white;background:#167850;font-weight:650;cursor:pointer}#lf-modern-update button.later{background:transparent}`
 document.head.appendChild(style)
 const panel=document.createElement('section');panel.id='lf-modern-update';panel.setAttribute('role','status')
 const title=document.createElement('strong');title.textContent='Aggiornamento Lion Fit disponibile'
 const p=document.createElement('p');p.textContent=`Versione ${tag} disponibile (installata: ${installed}). Vuoi aprire il download?`
 const download=document.createElement('button');download.type='button';download.textContent='Scarica aggiornamento'
 download.addEventListener('click',()=>{void Browser.open({url}).catch(()=>{p.textContent='Impossibile aprire il download. Riprovare più tardi.'})})
 const later=document.createElement('button');later.type='button';later.className='later';later.textContent='Più tardi'
 later.addEventListener('click',()=>{write(snoozeKey(tag),Date.now());panel.remove()})
 panel.append(title,p,download,later);document.body.appendChild(panel)
}
export function installNativeUpdateChecker():void {
 if(started||!isAndroid())return
 started=true
 let checking=false
 const check=async()=>{
  if(checking||document.hidden||Date.now()-read(lastKey)<NATIVE_UPDATE_CHECK_MS)return
  checking=true
  try {
   const installed=(await App.getInfo()).version
   const controller=new AbortController()
   const timeout=setTimeout(()=>controller.abort(),9000)
   try{
    const response=await fetch(NATIVE_UPDATE_API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',signal:controller.signal})
    if(!response.ok)return
    const candidate=safeNewAndroidRelease(await response.json(),installed)
    write(lastKey,Date.now())
    if(candidate)notice(candidate.tag,installed,candidate.url)
   }finally{clearTimeout(timeout)}
  }catch{ /* offline/no GitHub: never block the app */ }
  finally{checking=false}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()})
 void check()
}
