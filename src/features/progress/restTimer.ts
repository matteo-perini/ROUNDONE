/** Deadline based, not tick based: background throttling never extends recovery. */
export type RestClock={remaining:number;deadline:number|null}
export const clampRest=(seconds:number)=>Math.max(0,Math.min(900,Number.isFinite(seconds)?Math.round(seconds):90))
export function restRemaining(state:RestClock,now:number):number{return state.deadline===null?state.remaining:clampRest(Math.ceil((state.deadline-now)/1000))}
export function startRest(state:RestClock,now:number):RestClock{if(state.deadline!==null||state.remaining<=0)return state;return {remaining:state.remaining,deadline:now+state.remaining*1000}}
export function pauseRest(state:RestClock,now:number):RestClock{return {remaining:restRemaining(state,now),deadline:null}}
export function adjustRest(state:RestClock,delta:number,now:number):RestClock{const remaining=clampRest(restRemaining(state,now)+delta);return {remaining,deadline:state.deadline!==null&&remaining>0?now+remaining*1000:null}}
