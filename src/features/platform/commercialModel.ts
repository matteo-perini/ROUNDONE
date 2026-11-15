/** Commercial intention, not payment settlement or access enforcement. */
export type CommercialMode='exempt'|'subscription'|'unconfigured'|'unavailable'
export type CommercialChoice=Extract<CommercialMode,'exempt'|'subscription'>
export type CommercialFilter='all'|CommercialMode
export type CommercialGym={id:string;name:string;createdAt?:number;commercial:CommercialMode}
export const commercialLabels:Record<CommercialMode,string>={
 exempt:'Esente · non paga',subscription:'A pagamento · previsto',unconfigured:'Da configurare',unavailable:'Da verificare'
}
export function readCommercialMode(exists:boolean,value:unknown):CommercialMode{
 if(!exists)return 'unconfigured'
 if(value===true)return 'exempt'
 if(value===false)return 'subscription'
 return 'unavailable'
}
export function commercialCounts(rows:readonly CommercialGym[]){
 const counts:Record<CommercialMode,number>={exempt:0,subscription:0,unconfigured:0,unavailable:0}
 for(const row of rows)counts[row.commercial]++
 return counts
}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim()
export function filterCommercialGyms(rows:readonly CommercialGym[],filter:CommercialFilter,search:string){
 const terms=normalize(search).split(/\s+/).filter(Boolean)
 return rows.filter(row=>(filter==='all'||row.commercial===filter)&&terms.every(term=>normalize(`${row.name} ${row.id}`).includes(term))).sort((a,b)=>a.name.localeCompare(b.name,'it')||a.id.localeCompare(b.id))
}
export function commercialChoice(mode:CommercialMode):CommercialChoice|''{return mode==='exempt'||mode==='subscription'?mode:''}
export function exemptionValue(choice:CommercialChoice):boolean{if(choice==='exempt')return true;if(choice==='subscription')return false;throw new Error('Scelta commerciale non valida.')}
