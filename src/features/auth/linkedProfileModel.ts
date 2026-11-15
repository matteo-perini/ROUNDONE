export type LinkSide='coach'|'athlete'
export type LinkIdentity={uid:string;gymId:string;role:'atleta'|'titolare'|'collaboratore';email:string;label:string}
export type ProfilePair={version:1;gymId:string;coachUid:string;athleteUid:string}
const safe=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)
export function parsePair(raw:string|null):ProfilePair|null{
 try{const p=JSON.parse(raw||'null');return p?.version===1&&safe(p.gymId)&&safe(p.coachUid)&&safe(p.athleteUid)&&p.coachUid!==p.athleteUid?{version:1,gymId:p.gymId,coachUid:p.coachUid,athleteUid:p.athleteUid}:null}catch{return null}
}
export function makePair(coach:LinkIdentity,athlete:LinkIdentity):ProfilePair{
 if(!['titolare','collaboratore'].includes(coach.role)||athlete.role!=='atleta'||coach.gymId!==athlete.gymId||coach.uid===athlete.uid)throw new Error('Collega soltanto il tuo profilo atleta della stessa palestra.')
 const pair=parsePair(JSON.stringify({version:1,gymId:coach.gymId,coachUid:coach.uid,athleteUid:athlete.uid}))
 if(!pair)throw new Error('Identità dei profili non valida.');return pair
}
export function sideOf(pair:ProfilePair|null,s:LinkIdentity|null|undefined):LinkSide|null{
 if(!pair||!s||s.gymId!==pair.gymId)return null
 if(s.uid===pair.coachUid&&['titolare','collaboratore'].includes(s.role))return 'coach'
 if(s.uid===pair.athleteUid&&s.role==='atleta')return 'athlete'
 return null
}
export const opposite=(side:LinkSide):LinkSide=>side==='coach'?'athlete':'coach'
export const uidFor=(p:ProfilePair,side:LinkSide)=>side==='coach'?p.coachUid:p.athleteUid
export type SwitchIntent={from:LinkSide;to:LinkSide;fromUid:string;toUid:string;gymId:string}
export function switchIntent(pair:ProfilePair,from:LinkSide):SwitchIntent{
 const to=opposite(from);return {from,to,fromUid:uidFor(pair,from),toUid:uidFor(pair,to),gymId:pair.gymId}
}
export function parseSwitch(raw:string|null):SwitchIntent|null{
 try{const p=JSON.parse(raw||'null');return (p?.from==='coach'||p?.from==='athlete')&&p.to===opposite(p.from)&&safe(p.fromUid)&&safe(p.toUid)&&safe(p.gymId)&&p.fromUid!==p.toUid?{from:p.from,to:p.to,fromUid:p.fromUid,toUid:p.toUid,gymId:p.gymId}:null}catch{return null}
}
export function matchesIntent(pair:ProfilePair|null,intent:SwitchIntent):boolean{
 return !!pair&&pair.gymId===intent.gymId&&uidFor(pair,intent.from)===intent.fromUid&&uidFor(pair,intent.to)===intent.toUid
}
