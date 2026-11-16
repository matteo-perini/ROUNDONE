/** Local-only coach preference; identities and Firebase projects never share keys. */
export type FavoriteScope={project:string;gym:string;uid:string}
type Store=Pick<Storage,'getItem'|'setItem'>
export function favoriteKey(scope:FavoriteScope):string{
 if(!scope.project||!scope.gym||!scope.uid)throw new Error('Missing favorite scope')
 return 'lionfit.exercise-favorites.v1:'+JSON.stringify([scope.project,scope.gym,scope.uid])
}
const valid=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=256
export function readFavorites(store:Store,scope:FavoriteScope):string[]{
 const raw=store.getItem(favoriteKey(scope));if(!raw)return []
 try{const rows:unknown=JSON.parse(raw);return Array.isArray(rows)?[...new Set(rows.filter(valid))].slice(0,10000):[]}catch{return []}
}
export function toggleFavorite(store:Store,scope:FavoriteScope,id:string):string[]{
 if(!valid(id))throw new Error('Invalid exercise ID')
 const ids=new Set(readFavorites(store,scope));if(ids.has(id))ids.delete(id);else {if(ids.size>=10000)throw new Error('Favorite limit');ids.add(id)}
 const rows=[...ids];store.setItem(favoriteKey(scope),JSON.stringify(rows));return rows
}
