import type {WorkReport,WorkReportDay,WorkReportPart} from '../../integrations/firebase/workAttendance'
export const duration=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
export const monthNow=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}`}
export const monthTitle=(m:string)=>new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${m}-01T12:00:00Z`))
export const dayTitle=(d:string)=>new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`))
const timeFmt=new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'})
export const rangeLabel=(p:WorkReportPart,d:WorkReportDay)=>`${timeFmt.format(p.startMs)}${p.carryIn?' (continua)':''} – ${p.endMs===d.endMs?'24:00':timeFmt.format(p.endMs)}${p.carryOut?' (segue)':''}`
export const partState=(p:WorkReportPart)=>p.ongoing?'Aperto · non conteggiato':p.long?'Concluso · verifica durata':'Concluso'
export const dayState=(d:WorkReportDay)=>d.future?'Futuro':d.parts.some(p=>p.ongoing)?'Turno aperto':d.parts.some(p=>p.long)?'Verifica durata':d.parts.length?'Concluso':'Nessuna timbratura'
export const siteName=(r:WorkReport,id:string)=>r.sites.find(s=>s.id===id)?.name||id
export const reportFilename=(r:WorkReport,extension:string)=>`LionFit-Work-${r.month}.${extension}`
