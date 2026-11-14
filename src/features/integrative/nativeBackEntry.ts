/** Lion Fit – Indietro deterministico (Android hardware + comando visibile).
 * La history WebView puo' contenere redirect e tab ripetuti. La trail applicativa
 * consuma i passi in ordine senza mai usare router.back(), evitando i cicli.
 * Nessun accesso a Firebase e nessuna modifica ai dati dell'app.
 */
import {Capacitor} from '@capacitor/core'
import {isNavigationFailure,type Router} from 'vue-router'
import router from '../../router'
import {stagingSession} from '../../integrations/firebase/stagingSession'
import {AppBackTrail,appRoot,routeScope} from './appBackTrail'
import {shouldCloseOnSecondBack,EXIT_DOUBLE_BACK_MS} from './nativeBackPolicy'
import './polish.css'

const history=new AppBackTrail()
let nativeHandler:(()=>Promise<void>)|null=null
let navigating=false

function sessionScope(): 'athlete'|'coach'|'none' {
 const role=stagingSession.value?.role
 return role==='atleta'?'athlete':role==='titolare'||role==='collaboratore'?'coach':'none'
}
router.afterEach((to,_from,failure)=>{if(!failure)history.record(to.fullPath,sessionScope())})
void router.isReady().then(async()=>{
 history.record(router.currentRoute.value.fullPath,sessionScope())
 if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android')await installAndroidBack(router)
}).catch(error=>console.warn('Navigazione Indietro Lion Fit non inizializzata:',error))

async function goToPrevious(nav:Router):Promise<boolean>{
 if(navigating)return true
 // A mounted page may own nested screens that are not router entries.
 if(!window.dispatchEvent(new Event('lionfit:local-back',{cancelable:true})))return true
 const current=nav.currentRoute.value
 const currentScope=sessionScope()==='none'?history.currentScope():sessionScope()
 const root=appRoot(current.path,current.fullPath,currentScope)
 if(routeScope(current.path,currentScope)==='none')return false
 const previous=history.previous(current.fullPath)
 const destination=previous||root
 if(destination===current.fullPath||(!previous&&current.path===root.split('?')[0]))return false
 navigating=true
 try{
  // Replace, non Push: un percorso consumato non si deve reinserire nella history.
  const failure=await nav.replace(destination)
  if(isNavigationFailure(failure))history.restore(current.fullPath)
  return true
 }catch(error){
  history.restore(current.fullPath)
  console.warn('Torna indietro: navigazione non riuscita',error)
  return true
 }finally{navigating=false}
}
/** Condiviso col bottone visibile e col tasto hardware Android. */
export async function requestLionFitBack():Promise<void>{
 if(nativeHandler){await nativeHandler();return}
 await goToPrevious(router)
}

// La pagina HTML importa gia' nativeBackEntry.ts: evento unico per il pulsante UI.
window.addEventListener('lionfit:ui-back',()=>{void requestLionFitBack()})

async function installAndroidBack(nav:Router):Promise<void>{
 const {App:NativeApp}=await import('@capacitor/app')
 let lastPress=0
 let closing=false
 let dialog:HTMLElement|null=null

 function dismissExit(){dialog?.remove();dialog=null;lastPress=0}
 nav.afterEach(()=>dismissExit())

 function showExitPrompt(){
  if(dialog)return
  const backdrop=document.createElement('div')
  backdrop.className='lf-native-exit-shade'
  backdrop.setAttribute('role','presentation')
  backdrop.innerHTML=`<section class="lf-native-exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="lf-exit-title" aria-describedby="lf-exit-description">
   <div class="lf-exit-badge" aria-hidden="true">🦁</div>
   <h2 id="lf-exit-title">Vuoi chiudere Lion Fit?</h2>
   <p id="lf-exit-description">Premi di nuovo <strong>Indietro</strong> entro pochi secondi per uscire, oppure scegli qui sotto.</p>
   <div class="lf-exit-actions"><button type="button" data-lf-exit="cancel">Resta nell’app</button><button type="button" data-lf-exit="confirm">Chiudi app</button></div>
  </section>`
  backdrop.querySelector<HTMLButtonElement>('[data-lf-exit="cancel"]')?.addEventListener('click',dismissExit)
  backdrop.querySelector<HTMLButtonElement>('[data-lf-exit="confirm"]')?.addEventListener('click',()=>{void exitNative()})
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)dismissExit()})
  document.body.append(backdrop)
  dialog=backdrop
  backdrop.querySelector<HTMLButtonElement>('[data-lf-exit="cancel"]')?.focus()
 }
 async function exitNative(){
  if(closing)return
  closing=true
  dismissExit()
  try{await NativeApp.exitApp()}catch(error){console.warn('Uscita non riuscita:',error);closing=false}
 }
 function closeTopDialog():boolean{
  const shade=document.querySelector<HTMLElement>('.coach-mobile-shade')
  if(shade){shade.click();return true}
  const overlays=[...document.querySelectorAll<HTMLElement>('.modal-overlay,.sheet-modal-bg,.athlete-day-overlay')]
    .filter(node=>node.getClientRects().length>0)
  if(!overlays.length)return false
  const overlay=overlays.at(-1)!
  const close=[...overlay.querySelectorAll<HTMLButtonElement>('button')].find(button=>
   !button.disabled&&(/^(chiudi|annulla|indietro)/i.test(button.textContent?.trim()||'')||/chiudi|annulla/i.test(button.getAttribute('aria-label')||'')))
  if(close)close.click()
  else window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
  return true
 }
 async function performBack():Promise<void>{
  if(closing||navigating)return
  if(dialog){
   if(shouldCloseOnSecondBack(lastPress,Date.now()))await exitNative()
   else lastPress=Date.now()
   return
  }
  if(closeTopDialog())return
  if(await goToPrevious(nav))return
  // Raggiunta la Home: niente navigazione alla schermata precedente.
  lastPress=Date.now()
  showExitPrompt()
 }
 nativeHandler=performBack
 await NativeApp.addListener('backButton',()=>{void performBack()})
 await NativeApp.addListener('appStateChange',({isActive})=>{
  if(!isActive||dialog)dismissExit()
  if(isActive)lastPress=0
 })
 document.addEventListener('visibilitychange',()=>{if(document.hidden)dismissExit()})
 console.info('Lion Fit: Indietro progressivo senza rimbalzi; uscita con conferma.',EXIT_DOUBLE_BACK_MS)
}
