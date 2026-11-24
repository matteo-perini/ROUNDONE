/** Code-only warmup. No navigation, component mounting, user data or Firebase calls. */
export type RouteLoader=()=>Promise<unknown>
export type WarmupConnection={saveData?:boolean;effectiveType?:string}
export function canWarmRoute(visible:boolean,online:boolean,connection?:WarmupConnection):boolean{
 return visible&&online&&!connection?.saveData&&!['slow-2g','2g','3g'].includes(connection?.effectiveType||'')
}
export function adjacentRouteLoader(path:string,order:readonly string[],loaders:Readonly<Record<string,RouteLoader>>,loaded:ReadonlySet<RouteLoader>):RouteLoader|undefined{
 const i=order.indexOf(path)
 if(i<0)return undefined
 const current=loaders[path]
 // Skip aliases/shared components (Home, Piano, Archivio) without warming them twice.
 for(const direction of [1,-1]){
  for(let j=i+direction;j>=0&&j<order.length;j+=direction){
   const candidate=loaders[order[j]]
   if(!candidate||candidate===current)continue
   if(!loaded.has(candidate))return candidate
   break // never walk across already-loaded distinct sections
  }
 }
 return undefined
}
