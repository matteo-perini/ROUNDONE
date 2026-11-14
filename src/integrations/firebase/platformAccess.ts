import {getStagingClients} from './stagingClient'
import {isStagingMode} from './stagingConfig'
import {isPlatformClaim} from '../../features/platform/platformModel'
export async function verifyPlatformAccess(){
 if(!isStagingMode())return false
 try{const {auth}=getStagingClients();await auth.authStateReady();const u=auth.currentUser;if(!u)return false;const t=await u.getIdTokenResult(true);return auth.currentUser?.uid===u.uid&&isPlatformClaim(t.claims)}catch{return false}
}
