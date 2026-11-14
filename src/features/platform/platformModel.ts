export const widgets = [
 {id:'metrics',label:'Statistiche palestra'}, {id:'banner',label:'Copertina palestra'}, {id:'actions',label:'Azioni rapide'},
 {id:'activity',label:'Attività palestra'}, {id:'distribution',label:'Distribuzione contenuti'}, {id:'appointments',label:'Prossimi appuntamenti'},
 {id:'summary',label:'Stato palestra'}, {id:'recent',label:'Attività recenti'}, {id:'shortcuts',label:'Accesso veloce'}
] as const
export type WidgetId=typeof widgets[number]['id']
export const widgetIds=widgets.map(x=>x.id)
export function cleanHidden(value:unknown):WidgetId[]{return Array.isArray(value)?widgetIds.filter(x=>value.includes(x)):[]}
export const gymName=(v:unknown)=>typeof v==='string'?v.trim().slice(0,100):''
export function safeImage(v:unknown,max:number):string{return typeof v==='string'&&v.length<=max&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)?v:''}
export const ticketTypes=['problema','suggerimento','account','altro'] as const
export const ticketStates=['open','working','resolved'] as const
export type TicketState=typeof ticketStates[number]
export const ticketStateLabel=(s:string)=>s==='open'?'Aperta':s==='working'?'In lavorazione':s==='resolved'?'Risolta':'Stato non riconosciuto'
export type SearchItem={id:string;kind:'Atleta'|'Scheda'|'Appuntamento'|'Esercizio';title:string;detail?:string;terms?:string;to:string}
export function normalized(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim()}
export function searchItems(rows:readonly SearchItem[],term:string,perKind=6){const q=normalized(term).split(/\s+/).filter(Boolean);if(!q.length||normalized(term).length<2)return [];const counts:Record<string,number>={};return rows.filter(x=>q.every(w=>normalized([x.title,x.detail,x.terms].filter(Boolean).join(' ')).includes(w))).sort((a,b)=>Number(!normalized(a.title).startsWith(normalized(term)))-Number(!normalized(b.title).startsWith(normalized(term)))||a.title.localeCompare(b.title,'it')).filter(x=>{counts[x.kind]=(counts[x.kind]||0)+1;return counts[x.kind]<=perKind})}
export function isPlatformClaim(claims:Record<string,unknown>){return claims.lionfitSuperAdmin===true&&claims.email_verified===true}

export const accountKey=(s:{uid:string;gymId:string;role:string}|null|undefined)=>s?`${s.uid}|${s.gymId}|${s.role}`:''
