/** Atleta 2M/K: abbonamento Firebase Emulator di sola lettura per identità verificata.
 * I documenti non dipendono mai da parametri URL. Nessun metodo di scrittura qui.
 */
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDocFromServer, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { readVerifiedDevSession, type VerifiedDevSession } from '../../integrations/firebase/devSession'
import { isStagingMode,mayWriteLive,isLiveMode } from '../../integrations/firebase/stagingConfig'
import {getStagingClients} from '../../integrations/firebase/stagingClient'
import {readStagingSession} from '../../integrations/firebase/stagingSession'
import { getLocalEmulatorClients } from '../../integrations/firebase/emulatorClient'
import { watchAthleteSheets } from '../../integrations/firestore/sheets'
import type { Groups, Personal, ProgramWeek } from '../sheets/domain'
import { archiveItemFromRaw, type HistoricalArchive } from './labArchive'
import { assertAthleteLabIdentity } from './athleteOperationalPolicy'
import { hideOneArchiveCopy } from './archiveExclusions'
export type AthleteLiveData={personal:Personal[];weeks:ProgramWeek[];groups:Groups}
export function useAthleteLive(){
 const router=useRouter()
 const status=ref<'loading'|'ready'|'error'>('loading')
 const message=ref(isStagingMode()?'Connessione a Firebase staging…':'Connessione a Firebase Emulator…')
 const session=shallowRef<VerifiedDevSession|null>(null)
 const avatarUrl=ref('')
 const data=shallowRef<AthleteLiveData|null>(null)
 const archive=ref<HistoricalArchive[]>([])
 const archiveReady=ref(false)
 const hiddenArchiveIds=ref(new Set<string>())
 const snapshots=ref(0)
 const updatedAt=ref('')
 let alive=true
 let stopSheets:Unsubscribe|null=null,stopArchive:Unsubscribe|null=null,stopExclusions:Unsubscribe|null=null,stopAuth:Unsubscribe|null=null
 function close(){stopSheets?.();stopSheets=null;stopArchive?.();stopArchive=null;stopExclusions?.();stopExclusions=null;stopAuth?.();stopAuth=null}
 onMounted(async()=>{
  try{
   const staged=isStagingMode()
   const verified=staged ? await readStagingSession() : await readVerifiedDevSession()
   if(!alive)return
   if(verified.role!=='atleta'||(!staged && verified.gymId!=='gym_lab2c_a'))throw new Error('Accesso consentito soltanto all’atleta autenticato.')
   const {db,auth}=staged?getStagingClients():getLocalEmulatorClients()
   const profile=await getDocFromServer(doc(db,'users',verified.uid))
   if(!alive)return
   const target=staged?{gymId:verified.gymId,athleteId:verified.uid}:
    assertAthleteLabIdentity(verified,profile.exists()?profile.data():undefined)
   if(!profile.exists()||profile.data().gymId!==verified.gymId||profile.data().role!=='athlete')throw new Error('Profilo Atleta non valido.')
   const possibleAvatar=profile.data()?.photoURL||profile.data()?.photoUrl
   avatarUrl.value=typeof possibleAvatar==='string'&&possibleAvatar.length<870000&&/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(possibleAvatar)?possibleAvatar:''
   session.value=verified
   stopAuth=onAuthStateChanged(auth,user=>{
    if(!alive)return
    if(!user||user.uid!==verified.uid){close();data.value=null;archive.value=[];void router.replace(staged?'/accesso':'/dev/accesso')}
   })
   stopSheets=watchAthleteSheets(db,target.gymId,target.athleteId,value=>{
    if(!alive)return
    data.value=value
    status.value='ready'
    snapshots.value++
    updatedAt.value=new Date().toLocaleTimeString('it-IT')
    message.value=staged?'Piano sincronizzato con lo staging Firebase.':'Piano sincronizzato con Firebase Emulator.'
   },error=>{
    if(!alive)return
    status.value='error';data.value=null
    message.value=`Impossibile leggere il piano dell'atleta: ${error.message}`
    close()
   })
   stopExclusions=onSnapshot(collection(db,'gyms',target.gymId,'athlete_programs',target.athleteId,'archive_exclusions'),snap=>{
    if(alive)hiddenArchiveIds.value=new Set(snap.docs.map(d=>d.id))
   },error=>{if(alive){status.value='error';message.value=`Impossibile leggere le esclusioni dell'archivio: ${error.message}`;close()}})
   stopArchive=onSnapshot(collection(db,'gyms',target.gymId,'athlete_programs',target.athleteId,'archive_templates'),snap=>{
    if(!alive)return
    archive.value=snap.docs.map(d=>archiveItemFromRaw(d.id,d.data())).sort((a,b)=>a.title.localeCompare(b.title,'it'))
    archiveReady.value=true
   },error=>{
    if(!alive)return
    archiveReady.value=false
    message.value=`Archivio storico non leggibile: ${error.message}`
    status.value='error';data.value=null;close()
   })
  }catch(error){
   if(!alive)return
   status.value='error';data.value=null;archive.value=[]
   message.value=error instanceof Error?error.message:'Sessione Atleta non verificata.'
   close()
  }
 })
 onUnmounted(()=>{alive=false;close();data.value=null;archive.value=[]})
 async function hideArchiveCopy(id:string){
  const s=session.value
  if(!mayWriteLive())throw new Error('Scritture archivio disabilitate in questa build; lo storico non viene modificato.')
  if(!alive||!s||s.role!=='atleta'||(s.gymId!== 'gym_lab2c_a' && !isStagingMode())||!id||id.includes('/')||!archive.value.some(a=>a.id===id))
   throw new Error('Copia non valida o sessione Atleta non verificata.')
  const {db}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
  await hideOneArchiveCopy(db,s,id)
 }
 return {status,message,session,data,avatarUrl,archive,archiveReady,hiddenArchiveIds,hideArchiveCopy,snapshots,updatedAt}
}
