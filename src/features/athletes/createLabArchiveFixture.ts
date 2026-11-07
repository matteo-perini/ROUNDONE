/** SOLO UI di laboratorio 2M/F. Nessuna scrittura all'importazione. */
import { collection, doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore'
import { isLabArchiveId, LAB_ARCHIVE_ATHLETE_EMAIL } from './labArchive.ts'
import { assertEmulatorCoachWrite, type LabCoachIdentity } from './coachLabActions.ts'
import type { RosterAthlete } from './coachRoster.ts'

/** Crea modello, copia personale e archivio immutabile nello stesso commit.
 * Uso limitato alla palestra fittizia A e all'atleta fittizio 2H. */
export async function createLabArchiveFixture(db: Firestore, session: LabCoachIdentity | null, athlete: RosterAthlete | null, explicitlyAllowed: boolean): Promise<string> {
  assertEmulatorCoachWrite(session, athlete, explicitlyAllowed)
  if (athlete!.email.toLowerCase() !== LAB_ARCHIVE_ATHLETE_EMAIL) throw new Error('Solo atleta fittizio 2H per il fixture archivio.')
  const id = `lab2mf_${doc(collection(db,'gyms',session.gymId,'templates')).id}`
  if (!isLabArchiveId(id)) throw new Error('ID fixture non valido.')
  const shared=doc(db,'gyms',session.gymId,'templates',id)
  const personal=doc(db,'gyms',session.gymId,'athlete_programs',athlete!.id,'personal_templates',id)
  const history=doc(db,'gyms',session.gymId,'athlete_programs',athlete!.id,'archive_templates',id)
  const title='LAB 2M/F · Scheda archivio di prova'
  const exercises=[{name:'Esercizio archivio 2M/F',sets:2,reps:'8',notes:'Solo emulator; non utilizzare come allenamento'}]
  await runTransaction(db,async tx=>{
    const [s,p,a]=await Promise.all([tx.get(shared),tx.get(personal),tx.get(history)])
    if(s.exists()||p.exists()||a.exists())throw new Error('Fixture già presente: non sovrascrivo documenti.')
    tx.set(shared,{title,category:'Prova',exercises,createdAt:serverTimestamp(),createdBy:session.uid})
    tx.set(personal,{title,category:'Prova',exercises,sourceSharedTemplateId:id,createdAt:serverTimestamp()})
    tx.set(history,{sourceTemplateId:id,title,exercises,archiveVersion:1,archivedAt:serverTimestamp(),archivedBy:session.uid})
  })
  return id
}
