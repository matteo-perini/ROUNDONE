import type {CheckPhoto,ProgressCheck} from './progressModel.ts'
export const checkSides=[{id:'front',label:'Foto frontale'},{id:'back',label:'Foto posteriore'},{id:'right',label:'Foto laterale destra'},{id:'left',label:'Foto laterale sinistra'}] as const
export const sideLabel=(side:CheckPhoto['side'])=>checkSides.find(s=>s.id===side)?.label||'Foto'
export function comparisonOptions(checks:readonly ProgressCheck[],side:CheckPhoto['side'],from='',to=''){
 return checks.filter(c=>(!from||c.performedOn>=from)&&(!to||c.performedOn<=to)).flatMap(c=>c.photos.filter(p=>p.side===side).map(p=>({id:c.id,date:c.performedOn,photo:p}))).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))
}
export function validComparison(a:{id:string;date:string}|undefined,b:{id:string;date:string}|undefined){return !!a&&!!b&&a.id!==b.id&&a.date<=b.date}
