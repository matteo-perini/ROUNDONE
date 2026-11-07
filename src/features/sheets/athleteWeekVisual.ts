/** PATCH-4 — visual projections ONLY. Never translate a displayed group into a
 * synthetic Firestore ID. Actions must retain the actual personal_templates ID. */
import type {Groups, Personal} from './domain.ts'
import type {VisualSheetGroup} from './semanticDedup.ts'
export function forWeekRepresentative(group:VisualSheetGroup,weekId:string):Personal{
 const current=group.links
  .filter(l=>l.weekId===weekId)
  .sort((a,b)=>a.dayIndex-b.dayIndex||a.slot-b.slot)
 for(const link of current){const matched=group.members.find(x=>x.id===link.templateId);if(matched)return matched}
 return group.sheet // Only for display-only cards without a link in the selected week.
}
/** Keep repeated titles if they belong to two different day slots (1 & 2). */
export function weekDayLinkedSheetNames(groups:Groups,weekId:string,dayIndex:number):string[]{
 const items=groups.programmed.flatMap(group=>group.links
  .filter(l=>l.weekId===weekId&&l.dayIndex===dayIndex)
  .map(l=>({slot:l.slot,sheet:group.sheet,title:group.sheet.title})))
 return items.sort((a,b)=>a.slot-b.slot).map(l=>`SCHEDA ${l.slot}: ${l.title}`)
}

/** Post-PATCH7: resolve both visible day slots to their *exact* V1 document IDs.
 * No semantic title match, no document writes and no automatic fallback to a
 * visually equivalent template. Missing/deleted copies remain unavailable. */
export function exactWeekDaySlots(groups:Groups,week:import('./domain.ts').ProgramWeek|undefined,dayIndex:number){
 const day=week?.days[dayIndex]
 if(!day)return []
 const items=[{slot:1 as const,id:day.templateId},{slot:2 as const,id:day.templateId2}]
 return items.filter(x=>Boolean(x.id)).flatMap(link=>{
  const sheet=groups.programmed.find(g=>g.sheet.id===link.id)?.sheet
    ??groups.unprogrammed.find(g=>g.sheet.id===link.id)?.sheet
  return sheet&&!sheet.deletedAt?[{id:`${link.id}-${link.slot}`,slot:link.slot,sheet}]:[]
 })
}
