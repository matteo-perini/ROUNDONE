import {validId,activeProfile,wants} from './model.mjs';
const pilotId=v=>validId(v)&&/^[A-Za-z0-9_-]+$/.test(v)&&!v.startsWith('INSERISCI_');
export function pilotScope(env){
 if(env.LF_PUSH_EVENTS_ENABLED!=='true')return null;
 const mode=env.LF_PUSH_SCOPE??'pilot';
 if(mode==='all')return {mode:'all'};
 if(mode!=='pilot')return null;
 const gym=env.LF_PUSH_PILOT_GYM,admin=env.LF_PUSH_PILOT_ADMIN_UID,athlete=env.LF_PUSH_PILOT_ATHLETE_UID;
 if(![gym,admin,athlete].every(pilotId)||admin===athlete)return null;
 return {mode:'pilot',gym,admin,athlete};
}
export function scopeGym(scope,gym){return validId(gym)&&(scope?.mode==='all'||(scope?.mode==='pilot'&&gym===scope.gym));}
export function pilotMatches(scope,gym,booking){
 if(!scopeGym(scope,gym)||!validId(booking?.coachId)||!validId(booking?.athleteId)||booking.coachId===booking.athleteId)return false;
 return scope.mode==='all'||(booking.coachId===scope.admin&&booking.athleteId===scope.athlete);
}
export function recipientAllowed(gym,booking,uid,role,profile,device,job,now){
 return validId(uid)&&(['admin','athlete'].includes(role))&&
  (role==='admin'?booking?.coachId===uid:booking?.athleteId===uid)&&
  activeProfile(profile,gym,role)&&device?.uid===uid&&device.gym===gym&&device.role===role&&
  Number.isFinite(device.expires)&&device.expires>now&&wants(device.prefs,job);
}
