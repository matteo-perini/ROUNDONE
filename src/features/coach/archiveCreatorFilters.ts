/** PATCH 03: filtro organizzativo dell'Archivio Coach.
 * NON assegna proprieta' o permessi Firestore: le Rules mantengono l'archivio condiviso.
 * Le schede ROUNDONE senza createdBy restano esplicitamente storiche.
 */
export type ArchiveCreatorCoach={id:string;name:string}
export type ArchiveCreatorModel={createdBy:string}
export type CreatorFilterChoice={value:string;label:string}

export function creatorFilterMatches(createdBy:string, filter:string, currentUid:string):boolean{
 const uid=createdBy.trim()
 if(filter==='all')return true
 if(filter==='mine')return !!currentUid && uid===currentUid
 if(filter==='legacy')return !uid
 if(filter.startsWith('coach:'))return !!uid && uid===filter.slice(6)
 return false
}

export function creatorDisplayName(uid:string,coaches:readonly ArchiveCreatorCoach[],currentUid:string):string{
 const name=coaches.find(c=>c.id===uid)?.name.trim()
 if(name)return name
 if(uid===currentUid && uid)return 'Tu'
 // UID abbreviato permette di distinguere i Coach non piu' presenti nella palestra.
 return uid?'Coach non presente ('+uid.slice(0,6)+'…)':'Autore non registrato'
}

export function creatorFilterChoices(models:readonly ArchiveCreatorModel[],coaches:readonly ArchiveCreatorCoach[],currentUid:string):CreatorFilterChoice[]{
 const ids=[...new Set(models.map(m=>m.createdBy.trim()).filter(Boolean))]
  .filter(uid=>uid!==currentUid)
  .sort((a,b)=>{
   const namedA=coaches.some(c=>c.id===a&&c.name.trim())?1:0
   const namedB=coaches.some(c=>c.id===b&&c.name.trim())?1:0
   return namedB-namedA || creatorDisplayName(a,coaches,currentUid).localeCompare(creatorDisplayName(b,coaches,currentUid),'it') || a.localeCompare(b)
  })
 const values:CreatorFilterChoice[]=[{value:'all',label:'Tutte le schede'},{value:'mine',label:'Le mie schede'}]
 for(const id of ids)values.push({value:'coach:'+id,label:'Schede di '+creatorDisplayName(id,coaches,currentUid)})
 if(models.some(m=>!m.createdBy.trim()))values.push({value:'legacy',label:'Schede storiche'})
 return values
}
