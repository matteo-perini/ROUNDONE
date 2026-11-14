import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStagingClients} from './stagingClient'
import {isStagingMode,mayWriteLive} from './stagingConfig'
export const coachInboxEnabled=()=>isStagingMode()&&mayWriteLive()&&import.meta.env.VITE_LIONFIT_PATCH17==='true'
export type CoachBookingInput={athleteId:string;service:'pesi'|'fighter';discipline:string;startMs:number;durationMinutes:60|120;note:string;requestId:string}
export type InboxItem={id:string;title:string;kind:'booked'|'cancelled'|'sheet'|'program'|'revision'|'revision_reply'|'support'|'reminder';bookingId:string;startMs:number;createdAt:number;read:boolean}
async function invoke<T>(name:string,data:Record<string,unknown>,uid:string){if(!coachInboxEnabled())throw new Error('Funzione non abilitata.');const {auth}=getStagingClients();if(auth.currentUser?.uid!==uid)throw new Error('Account cambiato.');const r=await httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(data);if(auth.currentUser?.uid!==uid)throw new Error('Account cambiato.');return r.data}
export const coachBook=(uid:string,d:CoachBookingInput)=>invoke<{id:string;duplicate:boolean}>('lfCoachBook',d,uid)
export const inboxList=(uid:string,full:boolean)=>invoke<{rows:InboxItem[];unread:number}>('lfInboxList',{full},uid)
export const inboxRead=(uid:string,ids:string[])=>invoke<{ok:boolean}>('lfInboxRead',{ids},uid)
