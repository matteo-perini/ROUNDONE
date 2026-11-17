import {romeParts} from './bookingPolicy.ts'
export const competitionCategories=['combattimento','forza','altro'] as const
export type CompetitionCategory=typeof competitionCategories[number]
export const competitionCategoryLabels:Record<CompetitionCategory,string>={combattimento:'Sport da combattimento',forza:'Sport di forza',altro:'Altre discipline'}
export type CompetitionEvent={id:string;title:string;category:CompetitionCategory;discipline:string;location:string;notes:string;startMs:number;status:'published'|'cancelled';createdBy:string;coverId?:string}
export type CompetitionEntry={id:string;eventId:string;athleteId:string;status:'pending'|'approved'|'rejected'|'withdrawn';result:string;updatedBy?:string}
export type CompetitionDraft={title:string;category:CompetitionCategory;discipline:string;location:string;notes:string;date:string;time:string}
export function romeLocalStart(date:string,time:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Data o orario non valido.')
 const wall=Date.parse(`${date}T${time}:00Z`)
 if(!Number.isFinite(wall))throw new Error('Data o orario non valido.')
 // Europe/Rome modern dates: avoid device-local parsing and reject DST ambiguities.
 const candidates=[wall-3600_000,wall-7200_000].filter(t=>{const p=romeParts(t);return p.date===date&&p.time===time})
 if(candidates.length!==1)throw new Error('Orario inesistente o ambiguo per il cambio dell’ora. Scegli un altro orario.')
 return candidates[0]
}
export function normalizeCompetition(d:CompetitionDraft,now:number){
 const title=d.title.trim(),discipline=d.discipline.trim(),location=d.location.trim(),notes=d.notes.trim(),startMs=romeLocalStart(d.date,d.time)
 if(!title||title.length>100||!discipline||discipline.length>60||!location||location.length>160||notes.length>1500||!competitionCategories.includes(d.category))throw new Error('Compila titolo, disciplina, luogo e categoria (rispetta le lunghezze indicate).')
 if(startMs<=now||startMs>now+730*86_400_000)throw new Error('Scegli una data futura entro due anni.')
 return {title,category:d.category,discipline,location,notes,startMs}
}
export function nextCompetition(rows:readonly CompetitionEvent[],now:number){return [...rows].filter(e=>e.status==='published'&&e.startMs>=now).sort((a,b)=>a.startMs-b.startMs||a.id.localeCompare(b.id))[0]||null}
export function confirmedCompetitions(events:readonly CompetitionEvent[],entries:readonly CompetitionEntry[]){const ids=new Set(entries.filter(e=>e.status==='approved').map(e=>e.eventId));return events.filter(e=>ids.has(e.id)&&e.status==='published').sort((a,b)=>a.startMs-b.startMs)}
/** An invite is identified by updatedBy=Coach when pending; responses by athlete.
 * Uses the existing competition_entries shape and never rewrites voluntary requests. */
export function isPendingCoachInvite(e:CompetitionEntry|undefined){return !!e&&e.status==='pending'&&!!e.updatedBy&&e.updatedBy!==e.athleteId}
export function invitationState(e:CompetitionEntry|undefined):'waiting'|'accepted'|'declined'|null{
 if(!e)return null
 if(isPendingCoachInvite(e))return 'waiting'
 if(e.status==='approved'&&e.updatedBy===e.athleteId)return 'accepted'
 if(e.status==='rejected'&&e.updatedBy===e.athleteId)return 'declined'
 return null
}
export function invitationCounts(rows:CompetitionEntry[]){const states=rows.map(invitationState);return {invited:states.filter(Boolean).length,waiting:states.filter(s=>s==='waiting').length,accepted:states.filter(s=>s==='accepted').length,declined:states.filter(s=>s==='declined').length}}
export function participantEntryLabel(e:CompetitionEntry){const state=invitationState(e);return state==='waiting'?'Invitato · in attesa':state==='accepted'?'Partecipa':state==='declined'?'Non partecipa':entryLabel(e.status)}
export function entryLabel(s:CompetitionEntry['status']){return {pending:'Da valutare',approved:'Partecipazione confermata',rejected:'Non approvata',withdrawn:'Ritirata'}[s]}
