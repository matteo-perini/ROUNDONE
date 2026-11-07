import { reactive } from 'vue'

/** Profilo dimostrativo V1 Modern. Nessuna chiamata a Firebase. */
export type DemoRole = 'coach' | 'atleta'
type LocalProfile = { name: string; photo: string; bio: string; location: string; height: string; weight: string }
const PREFIX = 'lionfit-modern-demo-profile-v1:'
const defaults: Record<DemoRole, string> = { coach: 'TEST11', atleta: 'ATLETA DEMO' }
function read(role: DemoRole): LocalProfile {
  const fallback: LocalProfile = { name: defaults[role], photo: '', bio: '', location: 'Italia', height: '', weight: '' }
  try {
    const raw = localStorage.getItem(PREFIX + role)
    if (!raw) return fallback
    const obj: unknown = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return fallback
    const data = obj as Partial<LocalProfile>
    return {
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : defaults[role],
      photo: typeof data.photo === 'string' && /^data:image\/jpeg;base64,/i.test(data.photo) && data.photo.length <= 700_000 ? data.photo : '',
      bio: typeof data.bio === 'string' ? data.bio.slice(0,160) : '',
      location: typeof data.location === 'string' ? data.location.slice(0,80) : 'Italia',
      height: typeof data.height === 'string' ? data.height.slice(0,6) : '',
      weight: typeof data.weight === 'string' ? data.weight.slice(0,6) : ''
    }
  } catch { return fallback }
}
export const demoProfiles = reactive<Record<DemoRole, LocalProfile>>({ coach: read('coach'), atleta: read('atleta') })

/** Prima persiste, poi aggiorna la UI: niente salvataggi falsamente dichiarati riusciti. */
export function saveDemoProfile(role: DemoRole, patch: Partial<LocalProfile>): boolean {
  const next: LocalProfile = { ...demoProfiles[role], ...patch }
  try {
    localStorage.setItem(PREFIX + role, JSON.stringify(next))
    Object.assign(demoProfiles[role], next)
    return true
  } catch { return false }
}
