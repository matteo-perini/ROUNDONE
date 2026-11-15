/** Bounded, deduplicated work queue. Closing discards waiting jobs; in-flight results are ignored by caller. */
export function createBoundedLookup<T>(limit:number,run:(item:T)=>Promise<void>){
 const pending=new Set<T>(),queue:T[]=[];let active=0,closed=false
 const width=Math.max(1,Math.floor(limit)||1)
 function drain(){
  while(!closed&&active<width&&queue.length){
   const item=queue.shift()!;active++
   void Promise.resolve().then(()=>{if(!closed)return run(item)}).catch(()=>{}).finally(()=>{active--;pending.delete(item);drain()})
  }
 }
 return {add(items:Iterable<T>){if(closed)return;for(const item of items){if(!pending.has(item)){pending.add(item);queue.push(item)}}drain()},close(){closed=true;queue.length=0;pending.clear()}}
}
