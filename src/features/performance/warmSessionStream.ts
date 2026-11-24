/** A bounded, in-memory subscription lease. One source per verified scope.
 * Replays only values explicitly marked replayable by the source. No storage.
 * The owner must invalidate on auth/session change. No permission decisions here.
 */
export type StreamPublish<T>=(value:T,replayable?:boolean)=>void
export type StreamStart<T>=(publish:StreamPublish<T>)=>()=>void
export type StreamSubscriber<T>={next:(value:T)=>void;reset:()=>void}
type Entry<T>={key:string;valid:()=>boolean;subscribers:Set<StreamSubscriber<T>>;stop?:()=>void;timer?:ReturnType<typeof setTimeout>;idleUntil:number;leaseVersion:number;last?:T;replayable:boolean;closed:boolean}
export function createWarmSessionStream<T>(graceMs=15000,now=Date.now){
 let entry:Entry<T>|undefined
 function close(e:Entry<T>,notify=true){
  if(e.closed)return
  e.closed=true;if(entry===e)entry=undefined
  clearTimeout(e.timer);e.last=undefined;e.replayable=false
  const subs=[...e.subscribers];e.subscribers.clear()
  try{e.stop?.()}finally{if(notify)for(const s of subs)s.reset()}
 }
 function invalidate(){if(entry)close(entry)}
 function acquire(key:string,valid:()=>boolean,start:StreamStart<T>,subscriber:StreamSubscriber<T>,allowIdleReuse=true){
  if(!key||!valid()){subscriber.reset();return()=>{}}
  if(entry&&(entry.key!==key||!entry.valid()||(!entry.subscribers.size&&(!allowIdleReuse||entry.idleUntil<=now()))))close(entry)
  // A reset callback can synchronously acquire another identity. Never join it
  // just because it was installed while the previous source was being closed.
  if(!valid()||(entry&&(entry.key!==key||!entry.valid()))){subscriber.reset();return()=>{}}
  let e=entry
  if(e){
   const wasActive=e.subscribers.size>0
   clearTimeout(e.timer);e.leaseVersion++;e.idleUntil=0;e.subscribers.add(subscriber)
   if((wasActive||e.replayable)&&e.last!==undefined&&valid())subscriber.next(e.last)
  }else{
   const fresh:Entry<T>={key,valid,subscribers:new Set([subscriber]),idleUntil:0,leaseVersion:0,replayable:false,closed:false}
   entry=e=fresh
   try{
    const stop=start((value,replayable=true)=>{
     if(fresh.closed||entry!==fresh)return
     if(!fresh.valid()){close(fresh);return}
     if(!fresh.subscribers.size&&fresh.idleUntil<=now()){close(fresh,false);return}
     fresh.last=value;fresh.replayable=replayable
     if(!fresh.subscribers.size&&!replayable){close(fresh,false);return}
     for(const s of [...fresh.subscribers]){
      if(fresh.closed)break
      if(!fresh.valid()){close(fresh);break}
      if(fresh.subscribers.has(s))s.next(value)
     }
    })
    if(fresh.closed)stop();else fresh.stop=stop
   }catch(error){close(fresh);throw error}
  }
  const captured=e
  return()=>{
   if(captured.closed||!captured.subscribers.delete(subscriber)||captured.subscribers.size)return
   if(!captured.valid()||!captured.replayable||graceMs<=0){close(captured,false);return}
   captured.idleUntil=now()+graceMs
   const leaseVersion=++captured.leaseVersion
   captured.timer=setTimeout(()=>{if(!captured.subscribers.size&&captured.leaseVersion===leaseVersion)close(captured,false)},graceMs)
  }
 }
 return {acquire,invalidate}
}
