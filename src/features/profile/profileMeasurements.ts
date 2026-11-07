/** Keep mobile decimal commas and legacy string fields safe and predictable. */
export function normalizeMeasurement(value:string):string {
 return String(value ?? '').trim().replace(',', '.')
}
export function validMeasurement(value:string,max:number):boolean {
 const normalized=normalizeMeasurement(value)
 if(!normalized)return true
 if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized))return false
 const n=Number(normalized)
 return Number.isFinite(n)&&n>0&&n<=max
}
