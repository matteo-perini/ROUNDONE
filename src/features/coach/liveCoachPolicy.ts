/** Client-side validation: Firestore Rules remain the authorization source. */
import {safeTitle,safeExerciseRows} from './coachOperationalPolicy'
export {safeTitle,safeExerciseRows}
export const COACH_EDITOR_PREFIX='lfm_'
export type LiveCoachIdentity={uid:string;gymId:string;role:'titolare'|'collaboratore'|'atleta'}
export type AthleteIdentity={id:string;gymId:string;email:string}
export function editableModel(id:string,owner:string,uid:string){return !!uid && !!owner && uid===owner && id.startsWith(COACH_EDITOR_PREFIX) && !id.includes('/')}
export function verifyCoachEditor(s:LiveCoachIdentity|null,a:AthleteIdentity|null,consent:boolean):asserts s is LiveCoachIdentity{
 if(!s || !['titolare','collaboratore'].includes(s.role)||!s.uid||s.uid.includes('/')||!s.gymId||s.gymId.includes('/')||s.gymId.startsWith('demo-'))throw new Error('Sessione Coach non valida.')
 if(!a||a.gymId!==s.gymId||!a.id||a.id.includes('/'))throw new Error('Seleziona un atleta della tua palestra.')
 if(!consent)throw new Error('Conferma questa operazione sul database Firebase.')
}

/** Archive models belong to a verified Coach and gym, not to a selected athlete. */
export function verifyCoachArchiveEditor(s:LiveCoachIdentity|null,consent:boolean):asserts s is LiveCoachIdentity{
 if(!s || !['titolare','collaboratore'].includes(s.role)||!s.uid||s.uid.includes('/')||!s.gymId||s.gymId.includes('/')||s.gymId.startsWith('demo-'))throw new Error('Sessione Coach non valida.')
 if(!consent)throw new Error('Conferma prima la modifica.')
}

/** Model ID authorization is separate from the original lab2mj_ prefix policy. */
export {canManageCoachModel} from './legacyModelPolicy'
