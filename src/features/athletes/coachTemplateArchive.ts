/** Proiezione solo UI: archivio modelli Coach della palestra, NON ancora per-Coach.
 * Non modificare ID e non deduplicare modelli omonimi.
 */
export type CoachModel = {
  id: string
  title: string
  category: string
  exercises: readonly string[]
  createdBy: string
  trashed: boolean
}
export type ModelFilter = 'active'|'trashed'|'all'
export type ModelOrder = 'title'|'category'

export function countModels(models:readonly CoachModel[]) {
  const active = models.filter(x=>!x.trashed).length
  return {all:models.length,active,trashed:models.length-active}
}
export function categoriesFor(models:readonly CoachModel[]):string[] {
  return [...new Set(models.map(x=>x.category).filter(x=>x.trim()))].sort((a,b)=>a.localeCompare(b,'it'))
}
export function modelResults(models: readonly CoachModel[], filter:ModelFilter, query='', category='', order:ModelOrder='title'):CoachModel[] {
  const q=query.trim().toLocaleLowerCase('it')
  return models.filter(m=>{
    if(filter==='active' && m.trashed || filter==='trashed'&&!m.trashed) return false
    if(category && m.category!==category)return false
    if(!q)return true
    return [m.id,m.title,m.category,...m.exercises].some(x=>x.toLocaleLowerCase('it').includes(q))
  }).slice().sort((a,b)=>(order==='category'?a.category.localeCompare(b.category,'it'):a.title.localeCompare(b.title,'it'))||a.id.localeCompare(b.id,'it'))
}

/** Un fixture deterministico per Coach; mai crearne N per clic accidentali. */
export function labCoachModelId(uid:string):string {
  if(!/^[A-Za-z0-9_-]{2,128}$/.test(uid))throw new Error('UID fittizio non valido.')
  return `lab2mh_model_${uid}`
}
export function mayOperateLabCoachModel(uid:string,id:string):boolean {
  try{return id===labCoachModelId(uid)}catch{return false}
}
