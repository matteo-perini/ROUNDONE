import {createHash} from 'node:crypto';
export const SLOT=1800000,DAY=86400000;
export const validId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&!/[/.]/.test(x);
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const reasons={pesi:['Consegna nuova scheda','Nuova scheda','Consulenza','Aggiornamento scheda','Pesistica','Valutazione','Altro appuntamento'],fighter:['MMA','Boxe','K1','BJJ','Grappling','Karate tradizionale','Karate agonistico','Jiu-jitsu tradizionale','Lezione privata','Altro appuntamento']};
export function scope(env){if(env.LF_PATCH17_ENABLED!=='true')return null;if(env.LF_PATCH17_SCOPE==='all')return {mode:'all'};if(env.LF_PATCH17_SCOPE!=='pilot')return null;const gym=env.LF_PATCH17_PILOT_GYM,admin=env.LF_PATCH17_PILOT_ADMIN_UID,athlete=env.LF_PATCH17_PILOT_ATHLETE_UID;if(![gym,admin,athlete].every(validId)||admin===athlete||[gym,admin,athlete].some(s=>/^INSERISCI/i.test(s)))return null;return {mode:'pilot',gym,admin,athlete}}
export const active=(p,gym,role)=>!!p&&validId(gym)&&p.gymId===gym&&['admin','athlete'].includes(p.role)&&(!role||p.role===role)&&(p.membershipStatus===undefined||p.membershipStatus==='active');
export const allowed=(s,gym,uid,role)=>!!s&&validId(uid)&&validId(gym)&&(s.mode==='all'||(s.gym===gym&&(role==='admin'?s.admin===uid:role==='athlete'&&s.athlete===uid)));
export function validInput(d,now){if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['athleteId','service','discipline','startMs','durationMinutes','note','requestId'].includes(k))||!validId(d.athleteId)||!Object.hasOwn(reasons,d.service)||!reasons[d.service].includes(d.discipline)||![60,120].includes(d.durationMinutes)||!Number.isSafeInteger(d.startMs)||d.startMs%SLOT!==0||d.startMs<=now+15*60000||d.startMs+d.durationMinutes*60000>now+30*DAY||typeof d.note!=='string'||d.note.length>300||typeof d.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(d.requestId))return null;return {...d,note:d.note.trim()}}
export function slotTimes(start,duration){return Array.from({length:duration/30},(_,i)=>start+i*SLOT)}
export function freeSlot(d,coach,t){return !!d&&d.coachId===coach&&d.startAt?.toMillis?.()===t&&d.endAt?.toMillis?.()===t+SLOT&&d.status==='open'&&d.bookingId===''}
export function overlap(b,start,end){const t=b?.startAt?.toMillis?.();return b?.status==='confirmed'&&Number.isFinite(t)&&[60,120].includes(b.durationMinutes)&&t<end&&t+b.durationMinutes*60000>start}
export const bookingId=(gym,coach,request)=>'c17_'+hash([gym,coach,request]);
export function sameBooking(b,d,coach){return b?.createdBy===coach&&b.athleteId===d.athleteId&&b.coachId===coach&&b.startAt?.toMillis?.()===d.startMs&&b.durationMinutes===d.durationMinutes&&b.discipline===d.discipline&&b.service===d.service&&b.note===d.note}
export function inboxPlan(gym,id,before,after,now){if(!validId(gym)||!validId(id)||!validId(after?.athleteId)||!validId(after?.coachId)||after.athleteId===after.coachId||![60,120].includes(after.durationMinutes))return [];
 const start=after.startAt?.toMillis?.();if(!Number.isFinite(start))return [];
 let kind,at,people,title;
 if(!before&&after.status==='confirmed'){kind='booked';at=after.createdAt?.toMillis?.();if(start<=now)return [];if(after.createdBy===after.coachId){people=[[after.athleteId,'athlete']];title='Nuovo appuntamento fissato dal coach'}else{people=[[after.coachId,'admin']];title='Nuova prenotazione ricevuta'}}
 else if(before?.status==='confirmed'&&after.status==='cancelled'){kind='cancelled';at=after.cancelledAt?.toMillis?.();people=[[after.athleteId,'athlete'],[after.coachId,'admin']];title='Appuntamento annullato o spostato'}else return [];
 if(!Number.isFinite(at)||at>now+60000||at<now-7*DAY)return [];
 return people.map(([uid,role])=>({uid,role,id:hash([gym,id,kind,uid]),kind,title,bookingId:id,startMs:start,createdAt:at,read:false}));
}
// Informazioni generiche: mai testi delle schede, note o dati sanitari nella notifica.
export function activityNotice(kind,gym,uid,source,at,now,role='athlete'){
 const titles={sheet:'Nuova scheda disponibile',program:'Programma di allenamento aggiornato',revision:'Nuova richiesta di revisione',revision_reply:'Aggiornamento della tua richiesta di revisione',support:'Nuova risposta dall’assistenza',reminder:'Promemoria appuntamento'};
 if(!Object.hasOwn(titles,kind)||!validId(gym)||!validId(uid)||typeof source!=='string'||!source||source.length>512||!Number.isFinite(at)||at>now+60000||at<now-7*DAY)return null;
 return {id:hash([gym,uid,kind,source]),uid,role,kind,title:titles[kind],createdAt:at,read:false};
}
export function programChange(b,a){return !!b&&!!a&&Number.isSafeInteger(b.weeksVersion)&&Number.isSafeInteger(a.weeksVersion)&&a.weeksVersion>b.weeksVersion&&validId(a.weeksTouchedBy)&&Number.isFinite(a.weeksTouchedAt?.toMillis?.())}
export function revisionChange(b,a){if(!a)return null;if(!b&&a.status==='pending')return 'revision';if((b?.status==='pending'&&a.status==='working')||(b?.status==='working'&&a.status==='completed'))return 'revision_reply';return null}
export function reminderChange(b,a,now){return !!b?.dueAt&&!b.claimedAt&&!!a?.claimedAt&&!a.dueAt&&a.kind==='reminder'&&[1440,30].includes(a.lead)&&validId(a.gym)&&validId(a.booking)&&Number.isFinite(a.start)&&a.start>now&&Number.isFinite(a.expires)&&a.expires>now}
