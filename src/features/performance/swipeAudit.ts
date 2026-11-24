/** E.5 opt-in local DEV diagnostics. Only aggregate timing/status, never touch
 * coordinates, user data, account identifiers or network telemetry. */
type Sample={kind:'lock'|'paint'|'route'|'cancel'|'ignored';ms:number;reason?:string}
const samples:Sample[]=[]
export function reportSwipeTiming(kind:Sample['kind'],started:number,reason?:string):void{
 if(!import.meta.env.DEV||typeof window==='undefined')return
 try{if(sessionStorage.getItem('lionfit-motion-audit')!=='1'&&new URLSearchParams(location.search).get('lfPerf')!=='1')return}catch{return}
 const ms=Math.max(0,Math.round(performance.now()-started));if(!Number.isFinite(ms))return
 samples.push({kind,ms,reason});if(samples.length>100)samples.shift()
 const values=samples.filter(s=>s.kind===kind).map(s=>s.ms).sort((a,b)=>a-b)
 console.debug('[LionFit Swipe Audit]',{kind,ms,reason,count:values.length,p50:values[Math.floor((values.length-1)*.5)],p95:values[Math.floor((values.length-1)*.95)]})
}
