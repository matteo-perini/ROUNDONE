/** E.3: opt-in, development-only timings of actual view readiness.
 * No UID, gym, route parameters, data payload or network telemetry. */
export type DataAuditArea='athlete-workspace'|'gym-identity'|'home-highlights'|'chat-list'
export type DataAuditPhase='warm-hint'|'ready'|'error'
export function beginSessionDataAudit(area:DataAuditArea):(phase:DataAuditPhase)=>void{
 if(!import.meta.env.DEV||typeof window==='undefined')return()=>{}
 try{if(sessionStorage.getItem('lionfit-motion-audit')!=='1')return()=>{}}catch{return()=>{}}
 const start=performance.now(),seen=new Set<DataAuditPhase>()
 return phase=>{if(seen.has(phase))return;seen.add(phase);console.debug('[LionFit Data Audit]',{area,phase,ms:Math.round(performance.now()-start)})}
}
