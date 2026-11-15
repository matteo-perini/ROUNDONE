import {getFunctions,httpsCallable} from 'firebase/functions'
import {getStagingClients} from './stagingClient'
import {isLiveMode,mayWriteLive} from './stagingConfig'
import type {WorkFix} from '../../features/work/gpsPilot'
import type {WorkSiteId} from '../../features/work/workConfig'
export type WorkStatus={enabled:false}|{enabled:true;now:number;revision:number;dayStartMs:number;closedMs:Record<WorkSiteId,number>;openTodayMs:number;open:{id:string;siteId:WorkSiteId;startMs:number}|null;sites:{id:WorkSiteId;name:string}[]}
export type PunchResult={status:'ok';duplicate:boolean}|{status:'choice';ids:WorkSiteId[]}|{status:'outside'|'uncertain'|'wrong-site'}
async function call<T>(uid:string,name:string,data:Record<string,unknown>){if(!isLiveMode()||!mayWriteLive())throw new Error('LionFit Work non disponibile.');const {auth}=getStagingClients();if(auth.currentUser?.uid!==uid)throw new Error('Account cambiato.');const r=await httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(data);if(auth.currentUser?.uid!==uid)throw new Error('Account cambiato.');return r.data}
export const workStatus=(uid:string)=>call<WorkStatus>(uid,'lfWorkStatus',{})
export const workPunch=(uid:string,action:'in'|'out',revision:number,fix:WorkFix,siteId:WorkSiteId|null)=>call<PunchResult>(uid,'lfWorkPunch',{action,revision,fix,siteId,requestId:crypto.randomUUID().replace(/-/g,'')})
export type WorkReportPart={siteId:WorkSiteId;startMs:number;endMs:number;carryIn:boolean;carryOut:boolean;ongoing:boolean;long:boolean}
export type WorkReportDay={date:string;startMs:number;endMs:number;bySite:Record<WorkSiteId,number>;totalMs:number;pendingMs:number;parts:WorkReportPart[];future:boolean}
export type WorkReport={enabled:true;month:string;now:number;sites:{id:WorkSiteId;name:string}[];days:WorkReportDay[];totals:Record<WorkSiteId,number>;totalMs:number;pendingMs:number;workedDays:number;flaggedDays:number;person:string;gymName:string;logo:string}
export const workReport=(uid:string,month:string)=>call<WorkReport|{enabled:false}>(uid,'lfWorkReport',{month})
