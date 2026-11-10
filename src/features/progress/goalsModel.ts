/** LionFit Progressi 360: obiettivi assegnati dal Coach, in sola lettura per l'Atleta. */
export type ProgressGoalStatus='active'|'reached'|'paused'|'archived'
export type ProgressGoal={
 id:string;athleteId:string;title:string;notes:string;dueDate:string;
 status:ProgressGoalStatus;createdBy:string;createdAt?:unknown;updatedAt?:unknown
}
export type GoalInput={title:string;notes:string;dueDate:string}
export function validGoalDate(date:string):boolean{
 if(!date)return true
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false
 const d=new Date(`${date}T12:00:00Z`)
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date
}
export function normalizeGoal(input:GoalInput):GoalInput{
 const title=input.title.trim(),notes=input.notes.trim(),dueDate=input.dueDate.trim()
 if(!title||title.length>100)throw new Error('Inserisci un titolo di massimo 100 caratteri.')
 if(!notes||notes.length>1000)throw new Error('Scrivi una nota di massimo 1.000 caratteri.')
 if(!validGoalDate(dueDate))throw new Error('La scadenza non è una data valida.')
 return {title,notes,dueDate}
}
export function statusLabel(status:ProgressGoalStatus){
 return {active:'Attivo',reached:'Raggiunto',paused:'In pausa',archived:'Archiviato'}[status]
}
export function shownGoals(goals:readonly ProgressGoal[],showArchived=false):ProgressGoal[]{
 return goals.filter(g=>showArchived||g.status!=='archived').slice().sort((a,b)=>{
  const priority={active:0,paused:1,reached:2,archived:3}
  return priority[a.status]-priority[b.status]||(a.dueDate||'9999-99-99').localeCompare(b.dueDate||'9999-99-99')||a.title.localeCompare(b.title,'it')
 })
}
