/** DEV only. Rules enforce server authorization; the UI further limits writes to lab fixtures.
 * In production, this guard denies every write until the separate cut-over is signed off.
 */
export type VerifiedCoach = {uid:string;gymId:string;role:'titolare'|'collaboratore'|'atleta'}
export type AthleteIdentity = {id:string;gymId:string;email:string}
export const COACH_EDITOR_PREFIX = 'lab2mj_'
export function verifyCoachEditor(session:VerifiedCoach|null, athlete:AthleteIdentity|null, consent:boolean):asserts session is VerifiedCoach {
 if (!session || !['titolare','collaboratore'].includes(session.role) || !session.uid || session.uid.includes('/')) throw new Error('Sessione Coach non verificata.')
 if (session.gymId!=='gym_lab2c_a') throw new Error('Operazioni ammesse solo nella palestra fittizia A.')
 if (!athlete || athlete.gymId!==session.gymId || !athlete.id || athlete.id.includes('/') || !athlete.email.toLowerCase().endsWith('@lionfit.invalid')) throw new Error('Seleziona un atleta fittizio della stessa palestra.')
 if (!consent) throw new Error('Autorizzazione per questa operazione mancante.')
}
export function editableModel(id:string,createdBy:string,uid:string):boolean {
 return !!uid && createdBy===uid && id.startsWith(COACH_EDITOR_PREFIX) && !id.includes('/')
}
export function safeTitle(name:string):string {
 const out=name.trim()
 if (!out || out.length>200) throw new Error('Titolo obbligatorio, massimo 200 caratteri.')
 return out
}
export function safeExerciseRows(exercises:readonly {name:string;sets:unknown;reps:unknown;supersetWithPrevious?:boolean}[]):void {
 if(!Array.isArray(exercises) || exercises.length<1 || exercises.length>250)throw new Error('Da 1 a 250 esercizi obbligatori.')
 for(let i=0;i<exercises.length;i++) {
  if (!exercises[i].name?.trim() || exercises[i].name.length>200)throw new Error(`Nome dell’esercizio ${i+1} non valido.`)
  if(exercises[i].supersetWithPrevious && (i===0 || exercises[i-1].supersetWithPrevious))throw new Error('Un superset unisce due esercizi consecutivi, senza sovrapposizioni.')
 }
}
