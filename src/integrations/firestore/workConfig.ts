import {doc,getDocFromServer,runTransaction,serverTimestamp,Timestamp,type Firestore} from 'firebase/firestore'
import {validWorkConfig,workConfigRole,workConfigEditable,type WorkConfig,type WorkSite} from '../../features/work/workConfig'
import type {StagingSession} from '../firebase/stagingSession'
export type StoredWorkConfig={config:WorkConfig;lockedAt:Timestamp}
function target(db:Firestore,s:StagingSession){
 if(!workConfigRole(s.role)||!s.uid||!s.gymId||s.gymId.includes('/')||s.gymId.includes('..'))throw new Error('Accesso non autorizzato.')
 return doc(db,'gyms',s.gymId,'work_config','site')
}
function cleanSite(s:WorkSite):WorkSite{return {name:s.name,latitude:s.latitude,longitude:s.longitude,radius:s.radius,centerAccuracy:s.centerAccuracy}}
function decode(data:Record<string,unknown>):StoredWorkConfig{
 const lockedAt=data.lockedAt;if(!(lockedAt instanceof Timestamp)||data.locked!==true||data.schemaVersion!==2||!validWorkConfig(data))throw new Error('Configurazione esistente non compatibile. Contatta l’assistenza; non tentare di sovrascriverla.')
 return {config:{enabled:true,site1:cleanSite(data.site1),site2:data.site2?cleanSite(data.site2):null},lockedAt}
}
export async function readWorkConfig(db:Firestore,s:StagingSession):Promise<StoredWorkConfig|null>{
 const snap=await getDocFromServer(target(db,s));return snap.exists()?decode(snap.data()):null
}
export async function saveWorkConfig(db:Firestore,s:StagingSession,config:WorkConfig){
 if(!workConfigEditable(s.role)||!validWorkConfig(config))throw new Error('Configurazione non autorizzata o non valida.')
 const ref=target(db,s)
 await runTransaction(db,async tx=>{
  if((await tx.get(ref)).exists())throw new Error('Le sedi sono già configurate definitivamente. Ricarica la schermata.')
  tx.set(ref,{schemaVersion:2,enabled:true,locked:true,site1:cleanSite(config.site1),site2:config.site2?cleanSite(config.site2):null,lockedBy:s.uid,lockedAt:serverTimestamp()})
 })
}
