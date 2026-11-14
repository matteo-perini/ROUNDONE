import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStagingClients} from './stagingClient'
import {isLiveMode,mayWriteLive} from './stagingConfig'
export const calendarPilotEnabled=()=>isLiveMode()&&mayWriteLive()&&import.meta.env.VITE_LIONFIT_CALENDAR_PILOT==='true'
export type CalendarState='disconnected'|'pending'|'authorized'|'connected'|'review'
async function call<T>(name:string,data:Record<string,unknown>={}){if(!calendarPilotEnabled())throw new Error('Calendario non attivo.');const {auth}=getStagingClients();const uid=auth.currentUser?.uid;if(!uid)throw new Error('Accedi a LionFit.');const result=await httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(data);if(auth.currentUser?.uid!==uid)throw new Error('Account cambiato.');return result.data}
export const calendarStatus=()=>call<{state:CalendarState}>('lfCalendarStatus')
export const calendarStart=()=>call<{url:string}>('lfCalendarStart')
export const calendarConfirm=(code:string)=>call<{state:CalendarState}>('lfCalendarConfirm',{code})
export const calendarDisconnect=()=>call<{state:CalendarState;revoked:boolean}>('lfCalendarDisconnect')
