import {nextTick} from 'vue'
import type {Router,RouteLocationNormalized} from 'vue-router'
/** Local measurements only. Includes route guard, imports and first frame, not data-ready. */
export function installNavigationTiming(router:Router){
 if(typeof performance==='undefined'||typeof requestAnimationFrame==='undefined')return
 const pending=new WeakMap<RouteLocationNormalized,number>()
 const name='lionfit:route-first-frame'
 router.beforeEach(to=>{pending.set(to,performance.now())})
 router.afterEach((to,from,failure)=>{
  const start=pending.get(to)
  if(failure||start===undefined||to.path===from.path)return
  void nextTick(()=>requestAnimationFrame(()=>{
   if(router.currentRoute.value!==to)return
   if(performance.getEntriesByName(name).length>=50)performance.clearMeasures(name)
   try{performance.measure(name,{start,end:performance.now()})}catch{/* optional diagnostics */}
  }))
 })
}
