import {createHash} from 'node:crypto';
export const LEADS=[4320,1440,720,120,60,30];
export const MINUTE=60_000;
export const DAY=86_400_000;
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function prefs(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['booked','cancelled','leads'].includes(k))||typeof input.booked!=='boolean'||typeof input.cancelled!=='boolean'||!Array.isArray(input.leads)||input.leads.length>LEADS.length||input.leads.some(n=>!LEADS.includes(n)))throw new Error('PREFERENZE_NON_VALIDE');
 return {booked:input.booked,cancelled:input.cancelled,leads:[...new Set(input.leads)].sort((a,b)=>b-a)};
}
export const validToken=t=>typeof t==='string'&&t.length>=20&&t.length<=4096&&/^[A-Za-z0-9_:\-.]+$/.test(t);
export const validId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&!/[/.]/.test(x);
export const validDeviceId=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
export function activeProfile(profile,gym,role){return !!profile&&profile.gymId===gym&&['admin','athlete'].includes(profile.role)&&(role===undefined||profile.role===role)&&(!('membershipStatus' in profile)||profile.membershipStatus==='active')}
export const ms=t=>typeof t?.toMillis==='function'?t.toMillis():NaN;
function safeBooking(b){return !!b&&validId(b.athleteId)&&validId(b.coachId)&&Number.isFinite(ms(b.startAt))&&[60,120].includes(b.durationMinutes)&&['confirmed','cancelled'].includes(b.status)}
export function jobsForChange(gym,id,before,after,now){
 if(!validId(gym)||!validId(id)||!safeBooking(after))return [];
 const b=after,start=ms(b.startAt),created=ms(b.createdAt),cancelled=ms(b.cancelledAt),jobs=[];
 const add=(kind,due,expires,lead=0)=>{if(expires<=now)return;jobs.push({id:hash(JSON.stringify([gym,id,kind,start,lead])),gym,booking:id,kind,start,lead,due,expires})};
 if(!before&&b.status==='confirmed'&&start>now){
  if(Number.isFinite(created)&&created<=now+MINUTE&&created+30*MINUTE>now)add('booked',now,Math.min(start,created+30*MINUTE));
  for(const lead of LEADS){const due=start-lead*MINUTE;if(due>=now-5*MINUTE)add('reminder',due,Math.min(start,due+10*MINUTE),lead)}
 }
 if(before?.status==='confirmed'&&b.status==='cancelled'&&Number.isFinite(cancelled)&&cancelled<=now+MINUTE&&cancelled+30*MINUTE>now)add('cancelled',now,cancelled+30*MINUTE);
 return jobs;
}
export function stillValid(job,b,now){return safeBooking(b)&&ms(b.startAt)===job.start&&now<job.expires&&((job.kind==='cancelled'&&b.status==='cancelled')||(['booked','reminder'].includes(job.kind)&&b.status==='confirmed'&&job.start>now))}
export function wants(p,job){try{const v=prefs(p);return job.kind==='reminder'?v.leads.includes(job.lead):job.kind==='booked'?v.booked:job.kind==='cancelled'&&v.cancelled}catch{return false}}
export function message(kind,lead){
 if(kind==='booked')return {title:'LionFit · Agenda',body:'Una nuova lezione privata è stata prenotata. Apri l’Agenda.'};
 if(kind==='cancelled')return {title:'LionFit · Agenda',body:'Una lezione privata è stata annullata o spostata. Controlla l’Agenda.'};
 if(kind==='reminder')return {title:'LionFit · Promemoria',body:`Hai un appuntamento programmato${lead>=60?` tra circa ${lead/60} ore`:' tra circa 30 minuti'}. Controlla l’Agenda.`};
 return {title:'LionFit',body:'Notifica di prova. Le notifiche di questo dispositivo sono raggiungibili.'};
}
