/** Read-only visual pairing consistent with ROUNDONE/V1: the SECOND row links to the first.
 * Never merge, reorder or change the data's original exercise rows/IDs.
 */
export type SupersetRow = {supersetWithPrevious?:boolean;supersetRest?:string}
export type SupersetBadge = {pair:number;position:'first'|'second';rest:string}
export function supersetView(rows:readonly SupersetRow[]):(SupersetBadge|null)[] {
 const result:(SupersetBadge|null)[]=rows.map(()=>null)
 let pair=0
 for(let i=1;i<rows.length;i++) {
  if(rows[i].supersetWithPrevious===true && rows[i-1].supersetWithPrevious!==true) {
   ++pair
   const rest=String(rows[i].supersetRest||'')
   result[i-1]={pair,position:'first',rest}
   result[i]={pair,position:'second',rest}
  }
 }
 return result
}
