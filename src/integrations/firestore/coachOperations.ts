/** Writes for the Coach operational editor (emulator only via guarded UI).
 * Uses transactions, immutable history, original V1 exercise fields, and id-based links.
 * Never delete a document. No Firebase init here.
 */
import { collection,doc,runTransaction,serverTimestamp,type Firestore } from 'firebase/firestore'
import type {V1ExerciseRow} from '../../features/sheets/v1ExerciseCodec'
import {editableModel,safeTitle,safeExerciseRows,COACH_EDITOR_PREFIX} from '../../features/coach/coachOperationalPolicy'

const refTemplate=(db:Firestore,g:string,id:string)=>doc(db,'gyms',g,'templates',id)
const modelBody=(title:string,category:string,exercises:readonly V1ExerciseRow[])=>{
 safeExerciseRows(exercises)
 return {title:safeTitle(title),category:category.trim().slice(0,100)||'Allenamento',exercises:exercises.map(x=>({...x}))}
}
/** Distinct model ID: NEVER upsert existing originals or write into an archive. */
export async function createCoachModel(db:Firestore,gym:string,uid:string,title:string,category:string,rows:readonly V1ExerciseRow[]):Promise<string>{
 const model=doc(collection(db,'gyms',gym,'templates'))
 const id=COACH_EDITOR_PREFIX+model.id
 const target=refTemplate(db,gym,id),body=modelBody(title,category,rows)
 await runTransaction(db,async tx=>{
  if((await tx.get(target)).exists())throw new Error('ID modello già presente.')
  tx.set(target,{...body,createdAt:serverTimestamp(),createdBy:uid,updatedAt:serverTimestamp(),updatedBy:uid,revision:1})
 })
 return id
}
/** Edit ONLY a new 2M/J model owned by the current fake Coach. No retroactive history edits. */
export async function updateCoachModel(db:Firestore,gym:string,uid:string,id:string,expectedRevision:number,title:string,category:string,rows:readonly V1ExerciseRow[]):Promise<void>{
 const target=refTemplate(db,gym,id),body=modelBody(title,category,rows)
 if(!editableModel(id,uid,uid))throw new Error('Puoi modificare solo i nuovi modelli creati da questa fase.')
 await runTransaction(db,async tx=>{
  const snap=await tx.get(target)
  if(!snap.exists() || snap.data().deletedAt)throw new Error('Modello assente o cestinato.')
  if(!editableModel(id,String(snap.data().createdBy||''),uid))throw new Error('Modello non creato da questo Coach.')
  if(snap.data().revision!==expectedRevision)throw new Error('Il modello è cambiato: riaprilo prima di salvare.')
  tx.update(target,{...body,revision:expectedRevision+1,updatedAt:serverTimestamp(),updatedBy:uid})
 })
}
export async function duplicateCoachModel(db:Firestore,gym:string,uid:string,sourceId:string):Promise<string>{
 const target=doc(collection(db,'gyms',gym,'templates'))
 const newId=COACH_EDITOR_PREFIX+target.id,copy=refTemplate(db,gym,newId),source=refTemplate(db,gym,sourceId)
 await runTransaction(db,async tx=>{
  const [s,d]=await Promise.all([tx.get(source),tx.get(copy)])
  if(!s.exists()||s.data().deletedAt)throw new Error('Modello sorgente non attivo.')
  if(d.exists())throw new Error('Copia già presente.')
  const {title,category,exercises}=s.data()
  tx.set(copy,{...modelBody(String(title||'' )+' (copia)',String(category||''),exercises),createdBy:uid,createdAt:serverTimestamp(),updatedBy:uid,updatedAt:serverTimestamp(),revision:1})
 })
 return newId
}
/** Personal new sheet + historical copy in same transaction: never modify historical copy. */
export async function createCoachPersonal(db:Firestore,gym:string,athleteId:string,uid:string,title:string,category:string,rows:readonly V1ExerciseRow[]):Promise<string>{
 const raw=doc(collection(db,'gyms',gym,'athlete_programs',athleteId,'personal_templates'))
 const id=COACH_EDITOR_PREFIX+raw.id
 const personal=doc(db,'gyms',gym,'athlete_programs',athleteId,'personal_templates',id)
 const archived=doc(db,'gyms',gym,'athlete_programs',athleteId,'archive_templates',id)
 const body=modelBody(title,category,rows)
 await runTransaction(db,async tx=>{
  const [p,a]=await Promise.all([tx.get(personal),tx.get(archived)])
  if(p.exists() || a.exists())throw new Error('ID scheda personale già presente.')
  tx.set(archived,{sourceTemplateId:id,title:body.title,exercises:body.exercises,archiveVersion:1,archivedAt:serverTimestamp(),archivedBy:uid})
  tx.set(personal,{...body,createdBy:uid,createdAt:serverTimestamp()})
 })
 return id
}
