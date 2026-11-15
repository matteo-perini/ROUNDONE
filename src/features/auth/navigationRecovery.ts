import {shallowRef} from 'vue'
import type {Router} from 'vue-router'
export type NavigationFailure={kind:'assets'|'navigation';path:string}
export const navigationFailure=shallowRef<NavigationFailure|null>(null)
export function classifyNavigationError(error:unknown):NavigationFailure['kind']{
 const message=error instanceof Error?error.message:typeof error==='string'?error:''
 return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk .+ failed|chunkloaderror|unable to preload css|failed to load module script/i.test(message)?'assets':'navigation'
}
export function installNavigationRecovery(router:Router){
 router.onError((error,to)=>{navigationFailure.value={kind:classifyNavigationError(error),path:to.fullPath}})
 router.afterEach((_to,_from,failure)=>{if(!failure)navigationFailure.value=null})
 // Also cover nested components that are dynamically loaded after the route settles.
 window.addEventListener('vite:preloadError',()=>{navigationFailure.value={kind:'assets',path:router.currentRoute.value.fullPath}})
}
export function reloadNavigation(){window.location.reload()}
