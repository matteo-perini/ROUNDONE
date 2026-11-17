/** PATCH 30 R6 — UI-only invite monitoring. No extra Firestore queries.
 * Neither a delivery receipt nor a global cross-gym analytics service.
 */
export type MonitorKind='atleta'|'coach'
export type MonitorInvite={
 id:string;type:MonitorKind;status:string;email?:string;createdBy?:string;
 expiresAt?:{toMillis():number}
}
export type MonitorFilter='all'|'atleta'|'coach'
export const EXPIRING_SOON_MS=48*60*60*1000
function expiry(item:MonitorInvite):number{
 try{const n=item.expiresAt?.toMillis();return Number.isFinite(n)?Number(n):Infinity}catch{return Infinity}
}
export function isCurrentInvite(item:MonitorInvite,now=Date.now()):boolean{
 const exp=expiry(item)
 return item.status==='pending' && exp>now
}
export function pendingMonitor(items:readonly MonitorInvite[],now=Date.now()){
 const active=items.filter(x=>isCurrentInvite(x,now))
 const expiring=active.filter(x=>Number.isFinite(expiry(x))&&expiry(x)-now<=EXPIRING_SOON_MS)
 return {
  active:active.length,
  expiring:expiring.length,
  athletes:active.filter(x=>x.type==='atleta').length,
  collaborators:active.filter(x=>x.type==='coach').length,
 }
}
export function visiblePendingMonitor(items:readonly MonitorInvite[],filter:MonitorFilter,search:string,now=Date.now()):MonitorInvite[]{
 const normalized=String(search||'').trim().toLocaleLowerCase('it-IT')
 return items.filter(x=>isCurrentInvite(x,now))
  .filter(x=>filter==='all'||x.type===filter)
  // Never search or expose personal invitation tokens in the UI.
  .filter(x=>!normalized||String(x.email||'').toLocaleLowerCase('it-IT').includes(normalized))
  .sort((a,b)=>expiry(a)-expiry(b)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id))
}
export function expiryLabel(item:MonitorInvite,now=Date.now()):string{
 const remaining=expiry(item)-now
 if(!Number.isFinite(remaining))return 'Scadenza non disponibile'
 if(remaining<=0)return 'Scaduto'
 const hrs=Math.ceil(remaining/3600000)
 return hrs<=48?(hrs===1?'Scade entro 1 ora':`Scade entro ${hrs} ore`):`Scade tra ${Math.ceil(remaining/86400000)} giorni`
}
