/** Calendar-only clock: consumers must not use this for elapsed time or timers. */
import {romeDate} from '../sheets/assignmentPolicy.ts'
export function nextRomeDaySample(previous:number,now:number):number{
 return romeDate(previous)===romeDate(now)?previous:now
}
