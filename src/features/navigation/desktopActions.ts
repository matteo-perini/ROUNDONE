import type {ComputedRef,InjectionKey} from 'vue'
import type {StagingSession} from '../../integrations/firebase/stagingSession'

// Only the authenticated shell supplies this context. No separate chat or inbox queries.
export type DesktopActions={visible:boolean;chatTo:string|null;unread:number;inboxSession:StagingSession|null}
export const desktopActionsKey:InjectionKey<ComputedRef<DesktopActions>>=Symbol('lionfit-desktop-actions')
