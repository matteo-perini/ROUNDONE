/** Read-only gym video index. Coalesce repeated modal opens for 30 s.
 * Cache is in memory only and scoped to the Firebase instance + verified gym/UID.
 * Failed reads are never cached; a new view can retry immediately.
 */
import { collection, getDocs, type Firestore } from 'firebase/firestore'
export type ExerciseVideo = { name:string; url:string }
type Entry = { until:number; rows:ExerciseVideo[] }
const cached = new WeakMap<Firestore,Map<string,Entry>>()
const pending = new WeakMap<Firestore,Map<string,Promise<ExerciseVideo[]>>>()
function safeHttps(value:string):string {
 try {const url=new URL(value);return url.protocol==='https:'?url.href:''} catch {return ''}
}
export async function loadGymExerciseVideos(db:Firestore,gymId:string,uid:string):Promise<ExerciseVideo[]> {
 if(!gymId||gymId.includes('/')||!uid||uid.includes('/'))throw new Error('Contesto video non valido.')
 const key=gymId+'\u0000'+uid
 const hit=cached.get(db)?.get(key)
 if(hit&&Date.now()<hit.until)return hit.rows
 const inFlight=pending.get(db)?.get(key)
 if(inFlight)return inFlight
 let calls=pending.get(db)
 if(!calls){calls=new Map();pending.set(db,calls)}
 const load=getDocs(collection(db,'gyms',gymId,'exercise_videos'))
  .then(rows=>{
   const videos=rows.docs.map(d=>({name:String(d.data().name||''),url:safeHttps(String(d.data().url||''))}))
    .filter(v=>v.name&&v.url)
   let target=cached.get(db)
   if(!target){target=new Map();cached.set(db,target)}
   target.set(key,{until:Date.now()+30_000,rows:videos})
   return videos
  }).finally(()=>{calls?.delete(key)})
 calls.set(key,load)
 return load
}
