import type {ApprovedAlternative,ExerciseRecord} from './domain'
export function blankAlternative():ApprovedAlternative{return {name:'',exerciseId:'',sets:'',reps:'',load:'',rest:'',notes:''}}
export function validateAlternatives(raw:unknown):ApprovedAlternative[]{
 if(raw===undefined)return []
 if(!Array.isArray(raw)||raw.length>2)throw new Error('Massimo due alternative per esercizio.')
 return raw.map(a=>{if(!a||typeof a!=='object')throw new Error('Alternativa non valida.');const out=blankAlternative();for(const k of Object.keys(out) as (keyof ApprovedAlternative)[]){out[k]=String(a[k]??'').trim();if(out[k].length>(k==='notes'?1000:200))throw new Error('Campo alternativa troppo lungo.')}if(!out.name)throw new Error('Compila il nome dell’alternativa o rimuovila.');return out})
}
export function substituteExercise(ex:ExerciseRecord,a:ApprovedAlternative):ExerciseRecord{
 // Keep group position but never reuse original identity or planned load by accident.
 return {...ex,name:a.name,exerciseId:a.exerciseId,catalogId:a.exerciseId,id:undefined,sets:a.sets||ex.sets,reps:a.reps||ex.reps,load:a.load,rest:a.rest,notes:a.notes,kg:undefined}
}
