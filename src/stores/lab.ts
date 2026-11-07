import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Athlete, LabData, Role, Sheet, Week, Booking } from '../model'
import { newId } from '../model'
import { seed } from '../data/seed'
import { buildProgramWeeks, active, activeLinks, assertDay, assertSlot, changeActivity, copy, groupSheets, linkDay, normalizeWeek, protectedPayload, unlinkDay,canHideProtected } from '../features/sheets/domain'
import type { Slot } from '../features/sheets/domain'
/** LAB SOLTANTO: tutte le scritture qui sono LOCALSTORAGE. Nessun Firebase di produzione. */
const STORAGE='lionfit-v1-modern-local-sheets-v4'
function restore():LabData{
 try{const s=localStorage.getItem(STORAGE);if(s){const d=JSON.parse(s) as LabData
  if(Array.isArray(d.weeks)&&Array.isArray(d.assignments)&&Array.isArray(d.protectedArchives)&&Array.isArray(d.archiveExclusions))return d
 }}catch{ /* dati non validi: torna al seed */ }
 return copy(seed)
}
const need = (ok:boolean,msg:string):void=>{if(!ok)throw new Error(msg)}
export const useLabStore = defineStore('lab',()=>{
 const data=ref<LabData>(restore())
 const role=ref<Role|null>(localStorage.getItem('lionfit-v1-modern-role-v3')==='coach'?'coach':localStorage.getItem('lionfit-v1-modern-role-v3')==='atleta'?'atleta':null)
 const athleteId=ref(localStorage.getItem('lionfit-v1-modern-athlete-v3')||'marco')
 const weekId=ref(localStorage.getItem('lionfit-v1-modern-week-v4')||'marco-w1')
 const theme=ref(localStorage.getItem('lionfit-v1-modern-theme-v3')==='light'?'light':'dark')
 watch(data,d=>localStorage.setItem(STORAGE,JSON.stringify(d)),{deep:true})
 watch(role,v=>v?localStorage.setItem('lionfit-v1-modern-role-v3',v):localStorage.removeItem('lionfit-v1-modern-role-v3'))
 watch(athleteId,v=>localStorage.setItem('lionfit-v1-modern-athlete-v3',v))
 watch(weekId,v=>localStorage.setItem('lionfit-v1-modern-week-v4',v))
 watch(theme,v=>localStorage.setItem('lionfit-v1-modern-theme-v3',v))
 const athlete=computed(()=>data.value.athletes.find(a=>a.id===athleteId.value))
 const weeksFor=(id:string)=>data.value.weeks.filter(w=>w.athleteId===id&&active(w)).sort((a,b)=>(a.startDate||a.id).localeCompare(b.startDate||b.id))
 const weeks=computed(()=>weeksFor(athleteId.value))
 const week=computed(()=>weeks.value.find(w=>w.id===weekId.value)??weeks.value[0])
 watch(athleteId,()=>{if(!weeks.value.some(w=>w.id===weekId.value))weekId.value=weeks.value[0]?.id||''})
 const mySheets=computed(()=>data.value.assignments.filter(s=>s.athleteId===athleteId.value&&active(s)))
 const myBookings=computed(()=>data.value.bookings.filter(b=>b.athlete===athlete.value?.name))
 const groupsFor=(id:string)=>groupSheets(data.value.assignments.filter(s=>!!s.athleteId) as (Sheet &{athleteId:string})[],data.value.weeks,id)
 const grouped=computed(()=>groupsFor(athleteId.value))
 const protectedFor=(id:string)=>data.value.protectedArchives.filter(a=>a.athleteId===id&&!data.value.archiveExclusions.some(e=>e.athleteId===id&&e.templateId===a.id))
 const trashItems=computed(()=>([
  ...data.value.templates.filter(s=>!active(s)).map(item=>({kind:'shared' as const,id:item.id,title:item.title,athleteId:'',deletedAt:item.deletedAt})),
  ...data.value.assignments.filter(s=>!active(s)).map(item=>({kind:'personal' as const,id:item.id,title:item.title,athleteId:item.athleteId||'',deletedAt:item.deletedAt})),
  ...data.value.weeks.filter(s=>!active(s)).map(item=>({kind:'week' as const,id:item.id,title:item.name,athleteId:item.athleteId,deletedAt:item.deletedAt}))
 ]).sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt))))
 const trash=computed(()=>data.value.templates.filter(s=>!active(s))) // compatibilità UI
 function login(which:Role){role.value=which}
 function logout(){role.value=null}
 function toggleTheme(){theme.value=theme.value==='dark'?'light':'dark'}
 function resetDemo(){data.value=copy(seed);athleteId.value='marco';weekId.value='marco-w1'}
 function addAthlete(name:string,email:string){const a:Athlete={id:newId(),name,email};data.value.athletes.push(a);return a}
 function updateActivity(wid:string,dayIndex:number,slot:1|2,value:string){const i=data.value.weeks.findIndex(w=>w.id===wid&&active(w));need(i>=0,'Settimana non disponibile.');data.value.weeks[i]=changeActivity(data.value.weeks[i],dayIndex,slot,value)}
 function updateDay(wid:string,dayIndex:number,text:string){const arr=text.split(/[,;\n]+/).map(s=>s.trim());updateActivity(wid,dayIndex,1,arr[0]||'');updateActivity(wid,dayIndex,2,arr[1]||'')}
 function createTemplate(title:string,category:string,exercises:Sheet['exercises']){need(!!title.trim()&&exercises.length>0,'Scheda non valida.');const t:Sheet={id:newId(),title,category,exercises:copy(exercises)};data.value.templates.push(t);return t}
 function ensureProtected(id:string,sid:string){const s=data.value.assignments.find(s=>s.id===sid&&s.athleteId===id)
  if(!s)return false
  if(!data.value.protectedArchives.some(a=>a.athleteId===id&&a.id===sid)){data.value.protectedArchives.push(protectedPayload(s as Sheet&{athleteId:string},'coach-demo',new Date().toISOString()));return true}return false
 }
 /** V1: una sola copia personale per (atleta, ID modello), mai duplicati silenziosi. */
 function assignTemplate(templateId:string,ids:string[]){const t=data.value.templates.find(s=>s.id===templateId&&active(s));need(!!t,'Modello assente o nel Cestino.')
  const output:Sheet[]=[];for(const athleteId of new Set(ids)){
   need(data.value.athletes.some(a=>a.id===athleteId),'Atleta non trovato.')
   const existing=data.value.assignments.find(s=>s.athleteId===athleteId&&s.id===templateId)
   if(existing){need(active(existing),'La copia personale è nel Cestino: ripristinala prima.');ensureProtected(athleteId,existing.id);output.push(existing);continue}
   const s:Sheet={...copy(t!),athleteId,sourceId:t!.id,deletedAt:undefined,deletedBy:undefined}
   data.value.assignments.push(s);ensureProtected(athleteId,s.id);output.push(s)
  }return output
 }
 function createForAthlete(id:string,title:string,category:string,exercises:Sheet['exercises'],archive:boolean){
  need(data.value.athletes.some(a=>a.id===id),'Atleta non valido.');need(!!title.trim()&&exercises.length>0,'Scheda non valida.')
  const s:Sheet={id:newId(),title,category,athleteId:id,exercises:copy(exercises)};data.value.assignments.push(s);ensureProtected(id,s.id)
  if(archive)createTemplate(title,category,exercises);return s
 }
 function copyPersonalToShared(id:string,sid:string){const s=data.value.assignments.find(x=>x.athleteId===id&&x.id===sid&&active(x));need(!!s,'Scheda personale non disponibile.');return createTemplate(s!.title,s!.category,s!.exercises)}
 function linkPersonal(wid:string,dayIndex:number,slot:1|2,id:string,expected?:string){
  const w=data.value.weeks.find(w=>w.id===wid&&active(w));need(!!w,'Settimana assente.')
  const s=data.value.assignments.find(s=>s.id===id&&s.athleteId===w!.athleteId&&active(s));need(!!s,'La scheda deve essere già assegnata a questo atleta e attiva.')
  ensureProtected(w!.athleteId,id)
  const next=linkDay(w!,w!.athleteId,dayIndex,slot,id,expected)
  data.value.weeks.splice(data.value.weeks.findIndex(x=>x.id===wid),1,next)
 }
 function unlinkPersonal(wid:string,dayIndex:number,slot:1|2,expectedId:string){
  const i=data.value.weeks.findIndex(w=>w.id===wid&&active(w));need(i>=0,'Settimana assente.')
  const w=data.value.weeks[i]; // sicurezza: proteggi prima di scollegare
  const current=slot===1?w.days[dayIndex]?.templateId:w.days[dayIndex]?.templateId2
  need(current===expectedId,'Il collegamento è cambiato: ricarica la settimana.')
  ensureProtected(w.athleteId,expectedId)
  data.value.weeks[i]=unlinkDay(w,w.athleteId,dayIndex,slot,expectedId)
 }
 function removePersonal(id:string,sid:string){
  const s=data.value.assignments.find(s=>s.athleteId===id&&s.id===sid&&active(s));need(!!s,'Scheda personale non disponibile.')
  need(!activeLinks(data.value.weeks,id,sid).length,'Scheda collegata a settimane attive: scollega prima i giorni.')
  ensureProtected(id,sid);s!.deletedAt=new Date().toISOString();s!.deletedBy='coach-demo'
 }
 function createProgram(id:string,title:string,monday:string,count:number){
  need(data.value.athletes.some(a=>a.id===id),'Atleta inesistente.')
  const result=buildProgramWeeks(id,title,monday,count,newId)
  data.value.weeks.push(...result);athleteId.value=id;weekId.value=result[0].id;return result
 }
 function deleteWeek(wid:string){const w=data.value.weeks.find(w=>w.id===wid&&active(w));need(!!w,'Settimana non disponibile.');w!.deletedAt=new Date().toISOString();w!.deletedBy='coach-demo'}
 function duplicateWeek(wid:string){const w=data.value.weeks.find(w=>w.id===wid&&active(w));need(!!w,'Settimana assente.');const n=normalizeWeek({...copy(w!),id:newId(),name:'Settimana '+(weeksFor(w!.athleteId).length+1),deletedAt:undefined});data.value.weeks.push(n);return n}
 function toTrash(id:string){const t=data.value.templates.find(s=>s.id===id&&active(s));need(!!t,'Modello non disponibile.');t!.deletedAt=new Date().toISOString();t!.deletedBy='coach-demo'}
 function restoreTrash(id:string){restoreItem('shared',id,'')}
 function restoreItem(kind:'shared'|'personal'|'week',id:string,athleteId:string){const t=kind==='shared'?data.value.templates.find(x=>x.id===id):kind==='personal'?data.value.assignments.find(x=>x.id===id&&x.athleteId===athleteId):data.value.weeks.find(x=>x.id===id&&x.athleteId===athleteId);need(!!t&&!!t.deletedAt,'Elemento non presente nel Cestino.');delete t!.deletedAt;delete t!.deletedBy}
 function hideProtected(id:string,sid:string){need(canHideProtected(sid, data.value.assignments.filter(s=>!!s.athleteId) as (Sheet&{athleteId:string})[],data.value.weeks,id),'Scheda ancora in uso: non puoi nasconderla.');need(data.value.protectedArchives.some(a=>a.athleteId===id&&a.id===sid),'Copia storica mancante.');if(!data.value.archiveExclusions.some(e=>e.athleteId===id&&e.templateId===sid))data.value.archiveExclusions.push({athleteId:id,templateId:sid,excludedAt:new Date().toISOString()})}
 function createBooking(b:Omit<Booking,'id'|'status'>){data.value.bookings.push({id:newId(),...b,status:'confirmed'})}
 function cancelBooking(id:string){const b=data.value.bookings.find(x=>x.id===id);if(b)b.status='cancelled'}
 function finishWorkout(title:string){data.value.history.unshift(new Date().toLocaleString('it-IT')+' · '+title)}
 return {data,trash,trashItems,role,athleteId,weekId,theme,athlete,week,weeks,mySheets,myBookings,grouped,groupsFor,protectedFor,login,logout,toggleTheme,resetDemo,addAthlete,updateDay,updateActivity,createTemplate,assignTemplate,createForAthlete,copyPersonalToShared,ensureProtected,linkPersonal,unlinkPersonal,removePersonal,createProgram,deleteWeek,duplicateWeek,toTrash,restoreTrash,restoreItem,hideProtected,createBooking,cancelBooking,finishWorkout}
})
