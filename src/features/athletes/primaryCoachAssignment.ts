import {isLiveMode} from '../../integrations/firebase/stagingConfig'
/** PATCH 2/7: proprieta organizzativa, NON ACL per-atleta.
 * Le Firestore Rules autorizzano i Coach per palestra; questo modulo NON concede accessi.
 * La scrittura di nuovi campi e disattivata finche le Rules aggiornate non sono pubblicate.
 */
export type GymCoach = {id:string;name:string;gymId:string;role:string;membershipStatus?:string}

export function coachAssignmentWritesReady():boolean {
 return (import.meta.env.PROD || isLiveMode()) && import.meta.env.VITE_LIONFIT_COACH_ASSIGNMENT_V1 === 'ENABLED_AFTER_RULES_REVIEW'
}

export function activeCoaches(coaches:readonly GymCoach[], gymId:string):GymCoach[]{
 return coaches.filter(c=>c.gymId===gymId && c.role==='admin' && c.membershipStatus!=='revoked')
}

export function confirmPrimaryCoach(coachUid:string,coaches:readonly GymCoach[],gymId:string):string{
 if(!coachUid || !activeCoaches(coaches,gymId).some(c=>c.id===coachUid))
  throw new Error('Seleziona un Coach attivo appartenente alla stessa palestra.')
 return coachUid
}
