import type {CatalogExercise} from './catalog'

/** Presentation-only groups. Never mutate original catalogue IDs or muscle metadata. */
const groups = [
 {id:'chest',it:'Petto',en:'Chest',targets:['pectorals','serratus anterior','petto','pettorali','dentato anteriore'],parts:['chest','petto']},
 {id:'back',it:'Schiena',en:'Back',targets:['upper back','lats','spine','traps','schiena','dorsali','colonna vertebrale','trapezio','trapezi','parte alta della schiena'],parts:['back','schiena']},
 {id:'shoulders',it:'Spalle',en:'Shoulders',targets:['delts','deltoids','deltoidi','spalle'],parts:['shoulders','spalle']},
 {id:'arms',it:'Braccia',en:'Arms',targets:['biceps','triceps','forearms','bicipiti','tricipiti','avambracci'],parts:['upper arms','lower arms','arms','braccia','parte superiore delle braccia','parte inferiore delle braccia']},
 {id:'legs',it:'Gambe e glutei',en:'Legs and glutes',targets:['glutes','quads','quadriceps','hamstrings','calves','adductors','abductors','glutei','quadricipiti','femorali','polpacci','adduttori','abduttori'],parts:['upper legs','lower legs','legs','gambe','parte superiore delle gambe','parte inferiore delle gambe','glutei']},
 {id:'core',it:'Addome',en:'Abs and core',targets:['abs','abdominals','core','obliques','addome','addominali','obliqui'],parts:['waist','vita','addome','core']},
 {id:'cardio',it:'Cardio',en:'Cardio',targets:['cardiovascular system','cardio','sistema cardiovascolare'],parts:['cardio','cardiovascular system']},
 {id:'neck',it:'Collo',en:'Neck',targets:['levator scapulae','neck','elevatore della scapola','collo'],parts:['neck','collo']},
 {id:'other',it:'Altro',en:'Other',targets:[],parts:[]},
] as const
export type LibraryGroupId = typeof groups[number]['id']
export type LibraryGroupFilter = ''|LibraryGroupId
const key = (value:unknown) => typeof value==='string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[\s_-]+/g,' ') : ''
const byTarget = new Map<string,LibraryGroupId>()
const byPart = new Map<string,LibraryGroupId>()
for(const group of groups){
 for(const value of group.targets)byTarget.set(key(value),group.id)
 for(const value of group.parts)byPart.set(key(value),group.id)
}
/** Primary muscle wins; body region is the fallback. Secondary muscles do not
 * duplicate an exercise across categories. Unknown future rows remain in Other. */
export function exerciseGroup(exercise:Pick<CatalogExercise,'target'|'bodyPart'>):LibraryGroupId{
 return byTarget.get(key(exercise.target))??byPart.get(key(exercise.bodyPart))??'other'
}
export function libraryGroupOptions(rows:readonly CatalogExercise[],lang:'it'|'en'='it'){
 const counts=new Map<LibraryGroupId,number>()
 for(const row of rows){const id=exerciseGroup(row);counts.set(id,(counts.get(id)??0)+1)}
 return groups.flatMap(group=>{
  const count=counts.get(group.id)??0
  return count?[{id:group.id,label:group[lang],count}]:[]
 })
}
export function exercisesInGroup(rows:CatalogExercise[],group:LibraryGroupFilter):CatalogExercise[]{
 return group?rows.filter(row=>exerciseGroup(row)===group):rows
}
