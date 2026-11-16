// Use the same owner identity as the existing Control Center rules. Not a credential.
export const CONTROL_UID='bngmYLSrq5fTXlvxm62aAzGSoWJ3';
export const CONTROL_EMAIL='lionfit.control@gmail.com';
export const CONTROL_SCOPE='lf-control';
export const verifiedControl=(uid,email,verified,claims)=>uid===CONTROL_UID&&email===CONTROL_EMAIL&&verified===true&&claims?.lionfitSuperAdmin===true;
export const ms=t=>typeof t?.toMillis==='function'?t.toMillis():0;
export function incomingRecipient(ticket,author){if(!ticket||typeof ticket.requesterId!=='string'||!ticket.requesterId||typeof ticket.gymId!=='string'||!ticket.gymId||ticket.requesterId===CONTROL_UID)return null;if(author==='requester')return {uid:CONTROL_UID,gym:CONTROL_SCOPE,role:'control'};if(author==='platform')return {uid:ticket.requesterId,gym:ticket.gymId};return null;}
export function activityPatch(ticket,author,createdAt){if(!['platform','requester'].includes(author)||!ms(createdAt))return {};const field=author==='platform'?'lastPlatformAt':'lastRequesterAt',out={};if(ms(createdAt)>ms(ticket[field]))out[field]=createdAt;if(ms(createdAt)>ms(ticket.updatedAt))out.updatedAt=createdAt;return out;}
export const notificationText=author=>({title:'LionFit · Assistenza',body:author==='platform'?'Hai ricevuto una risposta. Apri LionFit.':'Hai una nuova richiesta o un messaggio. Apri LionFit.'});
