/** R22B — pure, testable chat policy. A UI role or supplied gymId is never authority. */
import {createHash} from 'node:crypto'
export const safeId=(x)=>typeof x==='string' && /^[a-zA-Z0-9_-]{3,128}$/.test(x)
export const safeGym=(x)=>safeId(x)&&x.length<=120
export const validActor=(uid,profile,gym)=>{
 if(!safeId(uid)||!safeGym(profile?.gymId)||!gym||!safeId(gym.ownerUid))return null
 if(!['admin','athlete'].includes(profile.role))return null
 if(profile.membershipStatus!==undefined&&profile.membershipStatus!=='active')return null
 if(profile.role==='athlete'){
  if(uid===gym.ownerUid||profile.coachRole)return null
  return {uid,gymId:profile.gymId,role:'athlete'}
 }
 if(profile.coachRole==='owner'&&uid!==gym.ownerUid)return null
 if(profile.coachRole==='collaborator'&&uid===gym.ownerUid)return null
 if(profile.coachRole!==undefined&&!['owner','collaborator'].includes(profile.coachRole))return null
 return {uid,gymId:profile.gymId,role:'coach'}
}
export function allowedCoach(athlete,coachUid,ownerUid){
 if(!safeId(coachUid)||!safeId(ownerUid))return false
 const primary=typeof athlete?.primaryCoachUid==='string'&&safeId(athlete.primaryCoachUid)?athlete.primaryCoachUid:null
 const other=Array.isArray(athlete?.coachUids)?athlete.coachUids.filter(safeId):[]
 // Explicit associations are authoritative. Legacy athletes without an assigned
 // coach can contact only the verified gym owner until a coach is assigned.
 if(primary||other.length)return primary===coachUid||other.includes(coachUid)
 return coachUid===ownerUid
}
export function pairFor(actor,peer,peerProfile,actorProfile,gym){
 const p=validActor(peer,peerProfile,gym)
 if(!p||p.gymId!==actor.gymId||p.role===actor.role||peer===actor.uid)return null
 const coach=actor.role==='coach'?actor:p,athlete=actor.role==='athlete'?actor:p
 const athleteData=actor.role==='athlete'?actorProfile:peerProfile
 if(!allowedCoach(athleteData,coach.uid,gym.ownerUid))return null
 return {gymId:actor.gymId,coachUid:coach.uid,athleteUid:athlete.uid}
}
export const threadIdFor=(pair)=>'lfc_'+createHash('sha256').update(`v1\u0000${pair.gymId}\u0000${pair.coachUid}\u0000${pair.athleteUid}`).digest('hex')
export const threadValid=(id,thread,actor,peerProfile,actorProfile,gym)=>{
 if(!safeId(id)||!thread||thread.gymId!==actor.gymId)return false
 if(!safeId(thread.coachUid)||!safeId(thread.athleteUid))return false
 const peer=thread.coachUid===actor.uid?thread.athleteUid:thread.athleteUid===actor.uid?thread.coachUid:null
 if(!peer)return false
 const pair=pairFor(actor,peer,peerProfile,actorProfile,gym)
 return !!pair&&threadIdFor(pair)===id
}
export function cleanText(text){
 if(typeof text!=='string')return null
 const out=text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim()
 return out.length>=1&&out.length<=1200?out:null
}
export const validMessageKey=(id)=>typeof id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(id)
export function publicName(profile,uid){
 const parts=[profile?.name,profile?.surname].filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim())
 return (parts.join(' ').trim()||`Utente ${uid.slice(0,6)}`).slice(0,80)
}
export function publicMessage(id,doc){
 if(!doc||!validMessageKey(id)||!safeId(doc.fromUid)||typeof doc.text!=='string')return null
 return {id,fromUid:doc.fromUid,text:doc.text,createdAt:typeof doc.createdAtMs==='number'?doc.createdAtMs:0}
}
export function publicThread(id,data,uid,peerName){
 if(!safeId(id)||!data||!safeId(uid))return null
 const peerUid=data.coachUid===uid?data.athleteUid:data.athleteUid===uid?data.coachUid:null
 if(!safeId(peerUid))return null
 return {id,peerUid,peerName,updatedAt:typeof data.updatedAt==='number'?data.updatedAt:0,
  lastText:typeof data.lastText==='string'?data.lastText.slice(0,90):'',unread:Number.isSafeInteger(data.unread)&&data.unread>=0?data.unread:0}
}
