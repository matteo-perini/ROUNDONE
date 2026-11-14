import type {CatalogExercise} from './catalog'
import type {Exercise} from '../../model'
import type {ApprovedAlternative} from '../sheets/domain'

// The filter values stay in the original catalogue vocabulary. Only labels change.
const musclesIt:Record<string,string>={
 abductors:'Abduttori',abs:'Addominali',adductors:'Adduttori',biceps:'Bicipiti',calves:'Polpacci',
 'cardiovascular system':'Sistema cardiovascolare',delts:'Deltoidi',forearms:'Avambracci',glutes:'Glutei',
 hamstrings:'Femorali',lats:'Dorsali','levator scapulae':'Elevatore della scapola',pectorals:'Pettorali',
 quads:'Quadricipiti','serratus anterior':'Dentato anteriore',spine:'Colonna vertebrale',traps:'Trapezi',
 triceps:'Tricipiti','upper back':'Parte alta della schiena',back:'Schiena',cardio:'Cardio',chest:'Petto',
 'lower arms':'Parte inferiore delle braccia','lower legs':'Parte inferiore delle gambe',neck:'Collo',
 shoulders:'Spalle','upper arms':'Parte superiore delle braccia','upper legs':'Parte superiore delle gambe',waist:'Vita'
}
export function muscleLabel(value:string,lang:'it'|'en'='it'):string{
 const key=value.trim().toLowerCase()
 if(!key)return ''
 return (lang==='it'?musclesIt[key]:undefined)||key.charAt(0).toUpperCase()+key.slice(1)
}
export function exerciseLabel(ex:CatalogExercise,lang:'it'|'en'='it'):string{return lang==='en'?ex.name:(ex.name_it||ex.name)}
export type LibraryTarget={row:Exercise;alternative?:ApprovedAlternative}
/** Only update the original row (or alternative) which opened the picker. No index guessing. */
export function applyLibraryChoice(rows:readonly Exercise[],target:LibraryTarget,ex:CatalogExercise,lang:'it'|'en'='it'):boolean{
 if(!rows.includes(target.row)||!ex.id||!exerciseLabel(ex,lang).trim())return false
 if(target.alternative){
  if(!target.row.alternatives?.includes(target.alternative))return false
  target.alternative.name=exerciseLabel(ex,lang);target.alternative.exerciseId=ex.id
 }else{
  target.row.name=exerciseLabel(ex,lang);target.row.exerciseId=ex.id;target.row.catalogId=ex.id
 }
 return true
}
export function clearManualIdentity(row:Exercise|ApprovedAlternative){
 row.exerciseId=''
 if('id' in row)row.catalogId=''
}
