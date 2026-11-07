/** Read-only ROUNDONE compatibility when the local exercise JSON cannot load.
 * The root "exercises" collection matches ROUNDONE/www/athlete.html.
 * Called on error ONLY, never as a periodic listener. */
import {collection,getDocs} from 'firebase/firestore'
import {getStagingClients} from '../firebase/stagingClient'
import type {CatalogExercise} from '../../features/exercises/catalog'
export async function readLegacyExerciseCatalog():Promise<CatalogExercise[]>{
 const {db}=getStagingClients()
 const rows=await getDocs(collection(db,'exercises'))
 return rows.docs.map(d=>({
  ...d.data(),
  id:d.id,
  name:String(d.data().name||d.data().name_en||''),
 })) as CatalogExercise[]
}
