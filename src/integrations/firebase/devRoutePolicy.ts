/** Regole di navigazione DEV: non sostituiscono le Firestore Security Rules. */
export type DevScreen = 'coach' | 'atleta'
export type DevRole = 'titolare' | 'collaboratore' | 'atleta'
export function devScreenForRole(role: DevRole): DevScreen {
  return role === 'atleta' ? 'atleta' : 'coach'
}
export function mayOpenDevScreen(role: DevRole, screen: DevScreen): boolean {
  return devScreenForRole(role) === screen
}
export function devRouteForRole(role: DevRole): '/dev/pannello/coach' | '/dev/pannello/atleta' {
  return role === 'atleta' ? '/dev/pannello/atleta' : '/dev/pannello/coach'
}
