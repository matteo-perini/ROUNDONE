/** Read-only V1 catalogue: source ID, original English, italian overlay and aliases. */
export type CatalogExercise={id:string;name:string;name_it?:string;target?:string;bodyPart?:string;equipment?:string;secondaryMuscles?:string[];dataLicense?:string;mediaStatus?:string;movementPattern?:string;instructions?:string[];instructions_it?:string[];aliases_it?:string[];animation?:{frames?:string[];sequence?:number[];frameDurationMs?:number;license?:string}|null}
type Overlay={entries:Record<string,{name_it?:string;name_en?:string;aliases_it?:string[];instructions_it?:string[]}>}
type CatalogFallback = () => Promise<CatalogExercise[]>
const BASE='/v1-preview/exercise-library/data/'
let loading:Promise<CatalogExercise[]>|null=null
/** Italian overlay is OPTIONAL, exactly as in ROUNDONE. Cache only successful loads.
 * The optional fallback can read legacy root /exercises from Firestore, but is
 * invoked ONLY when local EN fails. No Firebase or network call during import. */
export function loadCatalog(fallback?:CatalogFallback):Promise<CatalogExercise[]>{
 if(!loading)loading=Promise.all([
  fetch(BASE+'exercises.json').then(async r=>{
   if(!r.ok)throw new Error('Catalogo inglese locale assente')
   const data:unknown=await r.json()
   const rows=Array.isArray(data)?data:(data && typeof data==='object' && 'exercises' in data?(data as {exercises:unknown}).exercises:null)
   if(!Array.isArray(rows))throw new Error('Formato catalogo inglese non valido')
   return rows as CatalogExercise[]
  }).catch(async error=>{
   if(!fallback)throw error
   const rows=await fallback()
   if(!Array.isArray(rows))throw new Error('Fallback catalogo non valido')
   return rows
  }),
  fetch(BASE+'exercises-it.json').then(r=>r.ok?r.json() as Promise<Overlay>:null).catch(()=>null)
 ]).then(([raw,it])=>{
  const entries=it?.entries && typeof it.entries==='object'?it.entries:{}
  return raw.map(ex=>({...ex,...(entries[ex.id]||{}),id:ex.id,name:ex.name}))
 }).catch(err=>{loading=null;throw err})
 return loading
}
/** Return ALL exact matches: an ambiguous name must never silently choose an ID. */
export function exactCatalogMatches(list:readonly CatalogExercise[],name:string):CatalogExercise[]{
 const key=searchKey(name)
 if(!key)return []
 return list.filter(x=>searchKey(x.name)===key || searchKey(x.name_it)===key || (x.aliases_it||[]).some(a=>searchKey(a)===key))
}
export const searchKey=(v:string|undefined)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\bpushups?\b/g,'push up').replace(/\bpullups?\b/g,'pull up').replace(/\bsitups?\b/g,'sit up')
function oneEdit(a:string,b:string){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let errors=0,i=0,j=0;if(a.length===b.length){const differences=[...a].map((v,i)=>v===b[i]?-1:i).filter(x=>x>=0);if(differences.length===2&&differences[1]===differences[0]+1&&a[differences[0]]===b[differences[1]]&&a[differences[1]]===b[differences[0]])return true}while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}errors++;if(errors>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}}return true}
function scoreName(q:string,n:string){if(!n)return 0;if(q===n)return 1600;if(n.startsWith(q+' '))return 1150-Math.min(170,n.length-q.length);if(n.startsWith(q))return 1080-Math.min(170,n.length-q.length);if((' '+n+' ').includes(' '+q+' '))return 890-Math.min(120,n.length-q.length);
 const wanted=q.split(' '),got=n.split(' '),used=new Set<number>();let exact=0,near=0
 for(const w of wanted){let best=-1,quality=0;for(let i=0;i<got.length;i++){if(used.has(i))continue;const g=got[i],level=w===g?3:w.length>=3&&g.startsWith(w)?2:w.length>=4&&oneEdit(w,g)?1:0;if(level>quality){best=i;quality=level}}if(quality===0)return 0;used.add(best);if(quality===3)exact++;if(quality===1)near++}
 return Math.max(410,800-45*(got.length-wanted.length)-95*near-18*(wanted.length-exact-near))
}
export function rankedExercises(list:CatalogExercise[],term:string,muscle='',limit=100):CatalogExercise[]{const q=searchKey(term),m=searchKey(muscle);if(!q)return list.filter(x=>!m||searchKey(x.target).includes(m)||searchKey(x.bodyPart).includes(m)).slice(0,limit)
 return list.flatMap(ex=>{if(m&&!searchKey(ex.target).includes(m)&&!searchKey(ex.bodyPart).includes(m))return []
 const candidates=[{v:ex.name,weight:40},{v:ex.name_it,weight:25},...(ex.aliases_it||[]).map(v=>({v,weight:10}))]
 const score=Math.max(...candidates.map(c=>scoreName(q,searchKey(c.v))+c.weight),0);return score>=400?[{ex,score}]:[]}).sort((a,b)=>b.score-a.score||searchKey(a.ex.name).length-searchKey(b.ex.name).length||a.ex.name.localeCompare(b.ex.name)).slice(0,limit).map(x=>x.ex)
}
