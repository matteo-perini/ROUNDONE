import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const PROJECT='app-palestra-b0b9d', REGION='europe-west1';
export const SCOPE='https://www.googleapis.com/auth/calendar.app.created';
export const REDIRECT=`https://${REGION}-${PROJECT}.cloudfunctions.net/lfCalendarOAuthCallback`;
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const nonce=()=>randomBytes(32).toString('base64url');
export const code=()=>randomBytes(8).toString('hex').toUpperCase();
export const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{3,128}$/.test(v)&&!/^INSERISCI|^demo-/i.test(v);
// Global access is an explicit opt-in; absent scope preserves the existing pilot.
export function calendarScope(env){
 if(env.LF_CALENDAR_ENABLED!=='true')return 'off';
 const scope=env.LF_CALENDAR_SCOPE;
 if(scope==='all')return 'all';
 if(scope!==undefined&&scope!=='pilot')return 'off';
 if(!validId(env.LF_CALENDAR_PILOT_GYM)||!validId(env.LF_CALENDAR_PILOT_ADMIN_UID)||!validId(env.LF_CALENDAR_PILOT_ATHLETE_UID)||env.LF_CALENDAR_PILOT_ADMIN_UID===env.LF_CALENDAR_PILOT_ATHLETE_UID)return 'off';
 return 'pilot';
}
export function allowed(env,uid,p){
 const scope=calendarScope(env);
 if(scope==='off'||!validId(uid)||!validId(p?.gymId)||!['admin','athlete'].includes(p.role)||(p.membershipStatus!==undefined&&p.membershipStatus!=='active'))return false;
 if(scope==='all')return true;
 return p.gymId===env.LF_CALENDAR_PILOT_GYM&&((uid===env.LF_CALENDAR_PILOT_ADMIN_UID&&p.role==='admin')||(uid===env.LF_CALENDAR_PILOT_ATHLETE_UID&&p.role==='athlete'));
}
export function keyFrom(s){if(typeof s!=='string'||! /^[0-9a-f]{64}$/i.test(s))throw new Error('invalid encryption key');return Buffer.from(s,'hex');}
export function seal(value,key,uid){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',keyFrom(key),iv);c.setAAD(Buffer.from(`lf-calendar-v1:${uid}`));const data=Buffer.concat([c.update(value,'utf8'),c.final()]);return [iv,c.getAuthTag(),data].map(x=>x.toString('base64url')).join('.');}
export function open(value,key,uid){const parts=value.split('.');if(parts.length!==3)throw new Error('invalid ciphertext');const [iv,tag,data]=parts.map(v=>Buffer.from(v,'base64url'));const d=createDecipheriv('aes-256-gcm',keyFrom(key),iv);d.setAAD(Buffer.from(`lf-calendar-v1:${uid}`));d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString('utf8');}
export function equalHash(a,b){return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function authUrl(client,state,verifier){const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:client,redirect_uri:REDIRECT,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return u.href;}
export function fresh(d,phase,now){return !!d&&d.phase===phase&&Number.isFinite(d.expires)&&d.expires>now;}
export function publicState(d,now){if(d?.phase==='connected')return {state:'connected'};if(fresh(d,'pending',now))return {state:'pending'};if(fresh(d,'authorized',now))return {state:'authorized'};if(['authorized','creating','error','disconnecting'].includes(d?.phase))return {state:'review'};return {state:'disconnected'};}
