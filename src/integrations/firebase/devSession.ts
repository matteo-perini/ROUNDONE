/**
 * Autenticazione di LABORATORIO, esclusivamente sotto /dev/*.
 * Rilegge SEMPRE profilo e palestra dal server, senza fidarsi della UI.
 * Non scrive su Firestore e non copia dati nel negozio della demo.
 */
import { inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDocFromServer } from 'firebase/firestore'
import { getLocalEmulatorClients } from './emulatorClient'
import { LAB_PERSONAS, LAB_TEST_PASSWORD, resolveLabRole } from './roleLab'
import type { VerifiedLabRole } from './roleLab'

export type VerifiedDevSession = {
  uid: string
  email: string
  gymId: string
  role: VerifiedLabRole
  label: string
}
export type DevPersonaId = typeof LAB_PERSONAS[number]['id']

export async function readVerifiedDevSession(): Promise<VerifiedDevSession> {
  const { auth, db } = getLocalEmulatorClients()
  await auth.authStateReady()
  const user = auth.currentUser
  if (!user?.email) throw new Error('Non autenticato: entra dalla pagina /dev/accesso.')
  const persona = LAB_PERSONAS.find(p => p.email === user.email)
  if (!persona) throw new Error('Account non presente tra gli utenti fittizi consentiti.')

  const profileSnap = await getDocFromServer(doc(db, 'users', user.uid))
  if (!profileSnap.exists()) throw new Error('Profilo di prova non trovato. Ricrea i fixture 2C.')
  const profile = profileSnap.data()
  if (profile.gymId !== persona.gymId) throw new Error('Palestra diversa da quella attesa per il test.')
  const gymSnap = await getDocFromServer(doc(db, 'gyms', persona.gymId))
  if (!gymSnap.exists()) throw new Error('Palestra di prova mancante.')
  const role = resolveLabRole(user.uid, user.email, profile, gymSnap.data())
  if (role !== persona.expectedRole) throw new Error('Il ruolo letto dal server non coincide con il fixture.')

  return { uid: user.uid, email: user.email, gymId: persona.gymId, role, label: persona.label }
}

export async function enterDevSession(personaId: DevPersonaId): Promise<VerifiedDevSession> {
  const persona = LAB_PERSONAS.find(p => p.id === personaId)
  if (!persona) throw new Error('Persona di laboratorio non valida.')
  const { auth } = getLocalEmulatorClients()
  await setPersistence(auth, inMemoryPersistence)
  await signOut(auth)
  try {
    await signInWithEmailAndPassword(auth, persona.email, LAB_TEST_PASSWORD)
    return await readVerifiedDevSession()
  } catch (err) {
    await signOut(auth).catch(() => {})
    throw err
  }
}

export async function leaveDevSession(): Promise<void> {
  const { auth } = getLocalEmulatorClients()
  await signOut(auth)
}
