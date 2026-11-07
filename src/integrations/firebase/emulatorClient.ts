/**
 * Client di sviluppo esplicitamente separato dalla demo e dalla produzione.
 * Nessuna operazione su Firestore avviene all'importazione del modulo.
 * Usato SOLTANTO dalla pagina di diagnostica locale.
 */
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import {
  assertSafeEmulatorContext, EMULATOR_PROJECT_ID, EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT, AUTH_EMULATOR_PORT,
} from './emulatorPolicy'

type EmulatorClients = { db: Firestore; auth: Auth }
let clients: EmulatorClients | null = null

export function getLocalEmulatorClients(): EmulatorClients {
  assertSafeEmulatorContext({
    development: import.meta.env.DEV,
    hostname: window.location.hostname,
    projectId: EMULATOR_PROJECT_ID,
  })
  if (clients) return clients

  // Credenziali deliberatamente fittizie: non usare configurazioni di produzione.
  const app = getApps().find(candidate => candidate.name === 'lionfit-emulator-only') ?? initializeApp({
    apiKey: 'lionfit-emulator-fake-api-key',
    authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
    projectId: EMULATOR_PROJECT_ID,
    appId: '1:123456789:web:lionfit-emulator-only',
  }, 'lionfit-emulator-only')

  const db = getFirestore(app)
  connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true })
  clients = { db, auth }
  return clients
}
