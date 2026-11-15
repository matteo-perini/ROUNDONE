/** Scope one projection to one subscription. Reuse only unchanged decoded rows.
 * Snapshot order and removals/limit-window changes remain authoritative.
 * No persistent cache, no changes to reads, metadata or Firestore permissions. */
export function createSnapshotProjection<D extends {id:string},T>(decode:(doc:D)=>T){
 let rows=new Map<string,T>()
 return (snapshot:{docs:readonly D[];docChanges:()=>readonly {type:string;doc:D}[]})=>{
  const changed=new Set(snapshot.docChanges().filter(c=>c.type!=='removed').map(c=>c.doc.id))
  const next=new Map<string,T>()
  const result=snapshot.docs.map(doc=>{
   const value=rows.has(doc.id)&&!changed.has(doc.id)?rows.get(doc.id)!:decode(doc)
   next.set(doc.id,value);return value
  })
  rows=next;return result
 }
}
