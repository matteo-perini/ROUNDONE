import {getStagingClients} from './stagingClient'
import {isStagingMode,isLiveMode,isTestMode} from './stagingConfig'
import {isPlatformClaim} from '../../features/platform/platformModel'
import {isControlIdentity,isVerifiedControl} from '../../features/platform/controlAccess'
export async function isCurrentControlAccount(){
 if(!isLiveMode())return false
 try{const {auth}=getStagingClients();await auth.authStateReady();return isControlIdentity(auth.currentUser?.uid)}catch{return false}
}
export async function verifyPlatformAccess(forceRefresh=true){
 if(!isStagingMode())return false
 try{const {auth}=getStagingClients();await auth.authStateReady();const u=auth.currentUser;if(!u)return false;if(isLiveMode()&&!isControlIdentity(u.uid))return false;const t=forceRefresh?await u.getIdTokenResult(true):await u.getIdTokenResult();return auth.currentUser?.uid===u.uid&&(isLiveMode()?isVerifiedControl(u.uid,t.claims):isTestMode()&&isPlatformClaim(t.claims))}catch{return false}
}
