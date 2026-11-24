import {watchGymIdentity,type IdentityRead} from '../../integrations/firestore/platform'
import {createVerifiedSessionStream} from '../performance/verifiedSessionStreams'
export const liveIdentityStream=createVerifiedSessionStream<IdentityRead>()
export const startIdentityStream=(s:Parameters<typeof watchGymIdentity>[0],publish:(value:IdentityRead,replayable?:boolean)=>void)=>watchGymIdentity(s,v=>publish(v,v.gym.state==='ready'&&v.appearance.state==='ready'))
