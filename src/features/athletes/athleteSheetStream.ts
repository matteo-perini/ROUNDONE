import type {Firestore} from 'firebase/firestore'
import type {StagingSession} from '../../integrations/firebase/stagingSession'
import {watchAthleteSheets} from '../../integrations/firestore/sheets'
import type {AthleteLiveData} from './useAthleteLive'
import {createVerifiedSessionStream} from '../performance/verifiedSessionStreams'
import type {StreamSubscriber} from '../performance/warmSessionStream'
type SheetUpdate={kind:'data';value:AthleteLiveData}|{kind:'error';error:Error}
const stream=createVerifiedSessionStream<SheetUpdate>()
/** A fresh verified profile is still required before calling this function.
 * Only server-confirmed projections may survive a screen unmount. */
export function subscribeAthleteSheets(db:Firestore,s:StagingSession,subscriber:StreamSubscriber<SheetUpdate>){
 return stream.acquire(s,publish=>{
  let last:AthleteLiveData|undefined,lastConfirmed=false
  const sameRows=(a:readonly unknown[],b:readonly unknown[])=>a===b||(a.length===b.length&&a.every((row,i)=>row===b[i]))
  return watchAthleteSheets(db,s.gymId,s.uid,(value,confirmed)=>{
   const verified=confirmed===true
   const same=!!last&&sameRows(last.personal,value.personal)&&sameRows(last.weeks,value.weeks)
   if(same&&verified===lastConfirmed)return
   if(!same)last=value
   lastConfirmed=verified
   // Metadata-only events update replay eligibility without replacing the projection.
   publish({kind:'data',value:last!},verified)
  },error=>publish({kind:'error',error},false),true)
 },subscriber)
}
