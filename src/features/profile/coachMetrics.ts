/** Conteggi SOLO in lettura, sotto le Firestore Rules effettivamente pubblicate.
 * Query limitate alla palestra condivisa; i fallimenti sono indicati come dato non disponibile.
 * L'account con ruolo Admin è titolare soltanto se verificato altrove nella sessione.
 */
import { collection, getCountFromServer, getDocs, limit, query, where, type Firestore } from 'firebase/firestore'
export type CoachMetrics = {athletes?:number;templates?:number;bookings?:number;coaches?:number}
export async function readCoachMetrics(db:Firestore, gymId:string, uid:string, owner:boolean):Promise<CoachMetrics>{
  const result:CoachMetrics = {}
  const users = collection(db,'users')
  const athletesQuery = query(users,where('gymId','==',gymId),where('role','==','athlete'),limit(501))
  const tasks = [
    getDocs(athletesQuery).then(s=>{if(s.size<=500)result.athletes=s.docs.filter(d=>d.data().membershipStatus!=='revoked').length}),
    getDocs(query(users,where('gymId','==',gymId),where('role','==','admin'),limit(501))).then(s=>{if(s.size<=500)result.coaches=s.docs.filter(d=>d.data().membershipStatus!=='revoked').length}),
    getDocs(query(collection(db,'gyms',gymId,'templates'),limit(501))).then(s=>{if(s.size<=500)result.templates=s.docs.filter(d=>!d.data().deletedAt).length}),
    getCountFromServer(owner
      ? query(collection(db,'gyms',gymId,'spark_booking_reservations'),where('status','==','confirmed'))
      : query(collection(db,'gyms',gymId,'spark_booking_reservations'),where('coachId','==',uid),where('status','==','confirmed'))
    ).then(s=>{result.bookings=s.data().count}),
  ]
  await Promise.allSettled(tasks)
  return result
}
