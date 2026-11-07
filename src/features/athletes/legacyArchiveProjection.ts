/** PATCH-3: il vecchio personal_templates e' consultabile anche se
 * ROUNDONE non ha ancora generato una copia archive_templates. Solo proiezione:
 * non riassegna, non sovrascrive, non cancella e non rinomina un ID. */
import type {HistoricalArchive} from './labArchive.ts'
import type {Personal,ProgramWeek} from '../sheets/domain.ts'
import {linksBySheet} from '../sheets/domain.ts'
import {semanticSheetSignature} from '../sheets/semanticDedup.ts'
export type ShownArchive=HistoricalArchive&{legacy?:boolean}
export function joinArchivesWithLegacy(protectedCopies:readonly HistoricalArchive[],personal:readonly Personal[]):ShownArchive[]{
 const oldIds=new Set(protectedCopies.map(c=>c.id))
 return [
  ...protectedCopies.map(c=>({...c,legacy:false})),
  ...personal.filter(p=>!oldIds.has(p.id)).map(p=>({id:p.id,title:p.title,exercises:p.exercises,sourceTemplateId:p.id,archivedAt:'',archivedBy:'',legacy:true}))
 ].sort((a,b)=>a.title.localeCompare(b.title,'it')||a.id.localeCompare(b.id))
}
/** V1: non consentire a un atleta di nascondere una scheda se QUALSIASI
 * scheda semanticamente equivalente e' collegata a una settimana attiva.
 * Controllo di interfaccia, non sostituisce Security Rules / coordinamento server. */
export function isArchiveCopyLinkedOrEquivalent(id:string,all:readonly ShownArchive[],weeks:readonly ProgramWeek[],athleteId:string):boolean{
 const selected=all.find(c=>c.id===id)
 if(!selected)return true // unknown id: fail closed
 const signature=semanticSheetSignature(selected)
 const ids=new Set(all.filter(c=>semanticSheetSignature(c)===signature).map(c=>c.id))
 const active=linksBySheet(weeks,athleteId)
 return [...ids].some(key=>(active.get(key)||[]).length>0)
}
