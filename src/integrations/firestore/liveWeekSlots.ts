/** PATCH-3: unico writer slot tramite fence weeksVersion.
 * Non rimuove mai le schede né l'archivio storico; ID originali invariati. */
import {type Firestore} from 'firebase/firestore'
import {DAY_KEYS,type Slot} from '../../features/sheets/domain'
import {linkPersonalDay,unlinkPersonalDay} from './sheets'
const id=(v:string,l:string)=>{if(!v||v.length>128||v.includes('/')||v.includes('..'))throw new Error(l+' non valido');return v}
export async function updateV1WeekSlot(db:Firestore,gymId:string,athleteId:string,weekId:string,day:number,slot:Slot,expectedId:string,nextId:string,coachUid:string){
 if(!Number.isInteger(day)||day<0||day>=7||![1,2].includes(slot))throw new Error('Giorno o slot non valido')
 const g=id(gymId,'Palestra'),a=id(athleteId,'Atleta'),w=id(weekId,'Settimana'),uid=id(coachUid,'Coach')
 if(nextId===expectedId)return
 if(nextId)await linkPersonalDay(db,g,a,w,DAY_KEYS[day],slot,id(nextId,'Scheda'),uid,expectedId)
 else if(expectedId)await unlinkPersonalDay(db,g,a,w,DAY_KEYS[day],slot,id(expectedId,'Scheda'),uid)
}
