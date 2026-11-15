import type {CheckPhoto,ProgressCheck} from './progressModel.ts'
import {checkSides} from './checkComparison.ts'
export type PhotoScope={gymId:string;athleteId:string;actorId:string}
export type PhotoRequest={checkId:string;side:CheckPhoto['side'];storagePath:string}
const validSegment=(v:string)=>typeof v==='string'&&/^[\w-]{3,128}$/.test(v)
export function checkPhotos(check:ProgressCheck,scope:PhotoScope):PhotoRequest[]{
 if(!validSegment(scope.gymId)||!validSegment(scope.athleteId)||!validSegment(scope.actorId)||!validSegment(check.id)||check.athleteId!==scope.athleteId||check.createdBy!==scope.athleteId||!Array.isArray(check.photos))return []
 return checkSides.flatMap(({id:side})=>{const storagePath=`progress_photos/${scope.gymId}/${scope.athleteId}/${check.id}/${side}.jpg`;return check.photos.some(p=>p?.side===side&&p.storagePath===storagePath)?[{checkId:check.id,side,storagePath}]:[]})
}
export function permittedChecks(checks:readonly ProgressCheck[],role:'athlete'|'coach',scope:PhotoScope,shareIds:readonly string[],confirmed:boolean,online:boolean){
 if(!online)return []
 return checks.filter(c=>(role==='athlete'?scope.actorId===scope.athleteId:confirmed&&shareIds.includes(c.id))&&checkPhotos(c,scope).length>0)
}
export function orderChecks(checks:readonly ProgressCheck[]){return [...checks].sort((a,b)=>b.performedOn.localeCompare(a.performedOn)||b.id.localeCompare(a.id))}
export function comparableSides(a:ProgressCheck|undefined,b:ProgressCheck|undefined,scope:PhotoScope){if(!a||!b||a.id===b.id||a.performedOn>b.performedOn)return [];const left=checkPhotos(a,scope),right=checkPhotos(b,scope);return checkSides.filter(s=>left.some(p=>p.side===s.id)&&right.some(p=>p.side===s.id))}
export function photoError(e:unknown){const code=String((e as {code?:string}|null)?.code||'');if(code==='storage/unauthorized'||code==='storage/unauthenticated')return 'Accesso alla foto non autorizzato. Verifica condivisione e permessi Storage.';if(code==='storage/object-not-found')return 'Foto non trovata nello Storage.';return 'Foto non caricata. Verifica la connessione e riprova.'}
