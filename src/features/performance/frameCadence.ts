/** Local rAF cadence, not presented frames or GPU FPS. Bounded sample window. */
export function summarizeFrameCadence(stamps:readonly number[]){
 const gaps:number[]=[]
 for(let i=1;i<Math.min(stamps.length,120);i++){const delta=stamps[i]-stamps[i-1];if(Number.isFinite(delta)&&delta>0)gaps.push(delta)}
 if(!gaps.length)return {intervals:0,p50Ms:0,p95Ms:0,maxMs:0,over25Ms:0,over50Ms:0}
 const sorted=[...gaps].sort((a,b)=>a-b),q=(n:number)=>Math.round(sorted[Math.ceil(sorted.length*n)-1]*10)/10
 return {intervals:gaps.length,p50Ms:q(.5),p95Ms:q(.95),maxMs:q(1),over25Ms:gaps.filter(x=>x>25).length,over50Ms:gaps.filter(x=>x>50).length}
}
