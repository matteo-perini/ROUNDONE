/** Fixture sicuro: un unico modello condiviso nella palestra A per Coach fittizio.
 * Nessuna operazione su modelli reali, archivi personali o Firebase produzione.
 */
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore'
import { assertEmulatorCoachWrite, type LabCoachIdentity } from './coachLabActions.ts'
import { labCoachModelId, mayOperateLabCoachModel } from './coachTemplateArchive.ts'
import type { RosterAthlete } from './coachRoster.ts'
import { trashShared, restoreFromTrash } from '../../integrations/firestore/sheets.ts'

function assertLabOwner(session:LabCoachIdentity|null,athlete:RosterAthlete|null,consent:boolean) {
  assertEmulatorCoachWrite(session,athlete,consent)
  if(athlete?.email.toLowerCase()!=='athlete2h@lionfit.invalid')throw new Error('Solo atleta 2H per la prova 2M/H.')
  return session
}
export async function createLabCoachModel(db:Firestore,session:LabCoachIdentity|null,athlete:RosterAthlete|null,consent:boolean):Promise<string> {
  const coach=assertLabOwner(session,athlete,consent)
  const id=labCoachModelId(coach.uid)
  const ref=doc(db,'gyms',coach.gymId,'templates',id)
  await runTransaction(db,async tx=>{
    const existing=await tx.get(ref)
    if(existing.exists())throw new Error('Modello 2M/H già presente. Utilizza il ripristino, senza creare duplicati.')
    tx.set(ref,{
      title:'LAB 2M/H · Modello Coach di prova',category:'Test laboratorio',
      exercises:[{name:'Squat dimostrativo 2M/H',sets:3,reps:'8',notes:'Solo emulator'}],
      createdBy:coach.uid,createdAt:serverTimestamp()
    })
  })
  return id
}
export async function trashLabCoachModel(db:Firestore,session:LabCoachIdentity|null,athlete:RosterAthlete|null,consent:boolean,id:string) {
  const coach=assertLabOwner(session,athlete,consent)
  if(!mayOperateLabCoachModel(coach.uid,id))throw new Error('Puoi cestinare soltanto il tuo modello fittizio 2M/H.')
  await trashShared(db,coach.gymId,id,coach.uid)
}
export async function restoreLabCoachModel(db:Firestore,session:LabCoachIdentity|null,athlete:RosterAthlete|null,consent:boolean,id:string) {
  const coach=assertLabOwner(session,athlete,consent)
  if(!mayOperateLabCoachModel(coach.uid,id))throw new Error('Puoi ripristinare soltanto il tuo modello fittizio 2M/H.')
  await restoreFromTrash(db,coach.gymId,'shared',id,coach.uid)
}
