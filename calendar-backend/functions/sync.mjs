import {hash,validId,allowed} from './model.mjs';
export const eventId=(gym,booking,uid)=>hash(JSON.stringify(['lionfit-calendar-v1',gym,booking,uid]));
export function participants(env,gym,b){
 if(!b||!validId(gym)||!validId(b.athleteId)||!validId(b.coachId)||b.athleteId===b.coachId)return [];
 const people=[{uid:b.athleteId,role:'athlete'},{uid:b.coachId,role:'admin'}];
 return people.every(p=>allowed(env,p.uid,{gymId:gym,role:p.role}))?people:[];
}
export function plan(env,j,b,now){
 if(!validId(j.gym)||!validId(j.booking)||!validId(j.uid)||!allowed(env,j.uid,{gymId:j.gym,role:j.role}))return {kind:'skip'};
 const id=eventId(j.gym,j.booking,j.uid);
 if(!participants(env,j.gym,b).some(p=>p.uid===j.uid&&p.role===j.role)||b.status==='cancelled')return {kind:'delete',id};
 if(b.status!=='confirmed')return {kind:'skip'};
 const start=b.startAt?.toMillis?.();
 if(!Number.isFinite(start)||start<=now||start>now+31*86400000||![60,120].includes(b.durationMinutes))return {kind:'skip'};
 return {kind:'upsert',id,event:{id,summary:'LionFit · Lezione privata',description:'Appuntamento sincronizzato da LionFit. Per modifiche o annullamenti usa LionFit.',start:{dateTime:new Date(start).toISOString()},end:{dateTime:new Date(start+b.durationMinutes*60000).toISOString()},visibility:'private',reminders:{useDefault:false,overrides:[]}}};
}
export function sameConnection(d,j){return d?.phase==='connected'&&d.gym===j.gym&&d.role===j.role&&d.createdAt===j.linkCreatedAt&&typeof d.refresh==='string'&&typeof d.calendarId==='string'&&d.calendarId.length>0&&d.calendarId.length<1024&&d.calendarId!=='primary';}
export class GoogleError extends Error{constructor(status,reason=''){super(`Google HTTP ${status}`);this.status=status;this.reason=reason;}}
export async function refreshAccess(fetcher,cid,secret,refresh){
 const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cid,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(12000),redirect:'error'});
 let data;try{data=await r.json()}catch{throw new GoogleError(r.status)}
 if(!r.ok||typeof data.access_token!=='string')throw new GoogleError(r.status,data.error==='invalid_grant'?'invalid_grant':'');return data.access_token;
}
export async function applyEvent(fetcher,calendar,access,p,check=async()=>true){
 if(p.kind==='skip')return 'skipped';
 const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`,url=`${base}/${encodeURIComponent(p.id)}`;
 const call=async(method,path,body)=>{if(!await check())return null;return fetcher(`${path}?sendUpdates=none`,{method,headers:{authorization:`Bearer ${access}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});};
 if(p.kind==='delete'){const r=await call('DELETE',url);if(!r)return 'skipped';if(r.ok||[404,410].includes(r.status))return 'deleted';throw new GoogleError(r.status);}
 // PATCH existing deterministic event; if absent insert the same ID. Concurrent/ambiguous inserts can be retried.
 const {id,...fields}=p.event;let r=await call('PATCH',url,fields);if(!r)return 'skipped';if(r.ok)return 'updated';if(r.status!==404)throw new GoogleError(r.status);
 r=await call('POST',base,p.event);if(!r)return 'skipped';if(r.ok)return 'created';if(r.status!==409)throw new GoogleError(r.status);
 r=await call('PATCH',url,fields);if(!r)return 'skipped';if(r.ok)return 'updated';throw new GoogleError(r.status);
}
export const retryAt=(attempt,now)=>attempt>=6?null:now+Math.min(60,2**attempt)*60000;
