import type {Exercise} from '../../model'

/** UI groups only. Saved V1 remains a flat ordered array, with the SECOND row flagged. */
export type ExercisePair = {primaryIndex:number;secondaryIndex:number|null}
export function groupExerciseRows<T extends {supersetWithPrevious?:boolean}>(rows:readonly T[]):ExercisePair[] {
 const groups:ExercisePair[]=[]
 for(let i=0;i<rows.length;i++) {
  if(rows[i].supersetWithPrevious === true && groups.length && groups[groups.length-1].secondaryIndex === null) {
   groups[groups.length-1].secondaryIndex=i
  }else groups.push({primaryIndex:i,secondaryIndex:null})
 }
 return groups
}
export function primaryExerciseCount<T extends {supersetWithPrevious?:boolean}>(rows:readonly T[]):number {
 return groupExerciseRows(rows).length
}
/** Increasing N adds blank primary rows. Decreasing N NEVER drops data. */
export function ensurePrimaryExerciseCount(rows:readonly Exercise[],requested:number,makeBlank:()=>Exercise):Exercise[] {
 if(!Number.isInteger(requested)||requested<0||requested>250) return [...rows]
 const missing=Math.min(requested-primaryExerciseCount(rows),250-rows.length)
 if(missing<=0)return [...rows]
 return [...rows,...Array.from({length:missing},makeBlank)]
}
/** Insert a single paired exercise directly after its main row; no nested pairs. */
export function insertSuperset(rows:readonly Exercise[],primaryId:string,makeBlank:()=>Exercise):Exercise[] {
 const index=rows.findIndex(e=>e.id===primaryId)
 if(index<0||rows.length>=250||rows[index].supersetWithPrevious===true||rows[index+1]?.supersetWithPrevious===true)return [...rows]
 const pair:Exercise={...makeBlank(),supersetWithPrevious:true,executionMode:'superset'}
 return [...rows.slice(0,index+1),pair,...rows.slice(index+1)]
}
/** Removing the first item unpairs the second, never silently deletes its contents. */
export function removeExercise(rows:readonly Exercise[],rowId:string):Exercise[] {
 const index=rows.findIndex(e=>e.id===rowId)
 if(index<0)return [...rows]
 const result=rows.slice()
 result.splice(index,1)
 if(rows[index].supersetWithPrevious!==true && result[index]?.supersetWithPrevious===true)
  result[index]={...result[index],supersetWithPrevious:false,executionMode:'normale',supersetRest:''}
 return result
}
