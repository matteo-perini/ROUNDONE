/** Regola di sicurezza: questo client usa SOLO il progetto fittizio dell'emulatore. */
export const EMULATOR_PROJECT_ID = 'demo-lionfit-029' as const
export const EMULATOR_HOST = '127.0.0.1' as const
export const FIRESTORE_EMULATOR_PORT = 18080 as const
export const AUTH_EMULATOR_PORT = 9099 as const
/** Nome di raccolta lecito Firestore: non usare il prefisso/suffisso riservati __. */
export const DIAGNOSTIC_COLLECTION_ID = 'lionfit_emulator_diagnostic' as const

export function assertSafeEmulatorContext(context: {
  development: boolean
  hostname: string
  projectId: string
}): void {
  if (!context.development) {
    throw new Error('Firebase Emulator è disponibile solo con npm run dev.')
  }
  if (context.hostname !== '127.0.0.1' && context.hostname !== 'localhost') {
    throw new Error('Firebase Emulator richiede Chrome su localhost.')
  }
  if (context.projectId !== EMULATOR_PROJECT_ID || !context.projectId.startsWith('demo-')) {
    throw new Error('Project ID non sicuro: non connettere Firebase reale.')
  }
}
