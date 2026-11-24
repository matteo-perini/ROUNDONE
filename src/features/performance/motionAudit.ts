/** R22B.6A - opt-in, local-only motion diagnostics. No telemetry/network calls.
 * Open npm run dev with ?lfPerf=1 once. Console records ONLY route names and timing.
 */
import type {Router} from 'vue-router'
type AuditSample={from:string;to:string;navigationMs:number;frameMs:number;when:number}
const MAX_SAMPLES=80
let history:AuditSample[]=[]
export function diagnosticSummary(){
 const values=history.map(x=>x.navigationMs+x.frameMs).sort((a,b)=>a-b)
 const quantile=(n:number)=>values.length?Math.round(values[Math.min(values.length-1,Math.floor(n*(values.length-1)))]):0
 return {count:values.length,p50Ms:quantile(.5),p95Ms:quantile(.95)}
}
export function installMotionAudit(router:Router):()=>void{
 if(!import.meta.env.DEV||typeof window==='undefined')return ()=>{}
 let active=false
 try{
  if(new URLSearchParams(location.search).get('lfPerf')==='1')sessionStorage.setItem('lionfit-motion-audit','1')
  active=sessionStorage.getItem('lionfit-motion-audit')==='1'
 }catch{/* optional diagnostic storage */}
 if(!active)return ()=>{}
 let pending:{from:string;to:string;started:number}|null=null
 let alive=true
 const removeBefore=router.beforeEach((to,from)=>{
  if(to.path!==from.path)pending={from:from.path,to:to.path,started:performance.now()}
 })
 const removeAfter=router.afterEach((to,from,failure)=>{
  const current=pending;pending=null
  if(failure||!current||current.to!==to.path)return
  const navigated=performance.now()
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(!alive)return
   const sample={from:current.from,to:current.to,navigationMs:Math.round(navigated-current.started),frameMs:Math.round(performance.now()-navigated),when:Date.now()}
   history.push(sample);if(history.length>MAX_SAMPLES)history.shift()
   console.debug('[LionFit Motion Audit]',sample,diagnosticSummary())
  }))
 })
 let observer:PerformanceObserver|null=null
 try{
  const types=PerformanceObserver.supportedEntryTypes||[]
  const type=types.includes('long-animation-frame')?'long-animation-frame':types.includes('longtask')?'longtask':null
  if(type){
   observer=new PerformanceObserver(list=>{
    for(const entry of list.getEntries())if(entry.duration>=50)console.debug('[LionFit Long Frame]',{ms:Math.round(entry.duration),type:entry.entryType})
   })
   observer.observe({type,buffered:false})
  }
 }catch{observer?.disconnect();observer=null}
 console.info('[LionFit Motion Audit] Attivo solo in sviluppo. Disattiva con sessionStorage.removeItem("lionfit-motion-audit") e ricarica. Nessun dato viene inviato.')
 return ()=>{alive=false;removeBefore();removeAfter();observer?.disconnect()}
}
