import type {Result} from './model.ts'
export type MultiScope={gym:string;athlete:string;actor:string;role:'athlete'|'coach'}
export type MultiSnapshot={rows:Result[];fromCache:boolean;pending:boolean;more:boolean}
export function matchesMultiActor(scope:MultiScope,uid:string|undefined){
 return !!uid&&uid===scope.actor&&!!scope.gym&&!!scope.athlete&&(scope.role==='athlete'?scope.athlete===uid:scope.athlete!==uid)
}
export function isConfirmedMulti(snapshot:MultiSnapshot){return !snapshot.fromCache&&!snapshot.pending}
export function confirmedMultiRows(snapshot:MultiSnapshot,athlete:string){return snapshot.rows.filter(r=>r.athleteId===athlete&&!!r.id&&!!r.createdBy)}
export function multiAuthor(r:Pick<Result,'createdBy'|'athleteId'>,actor:string){return (r.createdBy===r.athleteId?'Atleta':'Coach')+(r.createdBy===actor?' · tu':'')}
