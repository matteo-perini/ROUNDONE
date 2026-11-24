import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ref,computed} from 'vue'
import {nextRomeDaySample} from '../src/features/performance/romeDayClock.ts'
import {romeDate} from '../src/features/sheets/assignmentPolicy.ts'
import {canWarmRoute,adjacentRouteLoader} from '../src/features/performance/routeWarmup.ts'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('calendar-only sample avoids unnecessary recomputation within same Rome day',()=>{
 const initial=Date.parse('2026-11-24T07:00:00Z'),clock=ref(initial);let runs=0
 const day=computed(()=>{runs++;return romeDate(clock.value)})
 assert.equal(day.value,'2026-11-24')
 for(let n=1;n<=120;n++){clock.value=nextRomeDaySample(clock.value,initial+n*30_000);assert.equal(day.value,'2026-11-24')}
 assert.equal(runs,1)
 clock.value=nextRomeDaySample(clock.value,Date.parse('2026-11-24T23:00:00Z'))
 assert.equal(day.value,'2026-11-25');assert.equal(runs,2)
})
test('Rome midnight across summer, winter and returning after multiple days',()=>{
 for(const [before,after] of [['2026-07-01T21:59:59Z','2026-07-01T22:00:00Z'],['2026-11-24T22:59:59Z','2026-11-24T23:00:00Z'],['2026-10-25T22:59:59Z','2026-10-25T23:00:00Z']]){
  const a=Date.parse(before),b=Date.parse(after);assert.equal(nextRomeDaySample(a,b),b)
 }
 const a=Date.parse('2026-11-24T08:00:00Z'),b=Date.parse('2026-11-27T08:00:00Z')
 assert.equal(nextRomeDaySample(a,b),b);assert.equal(nextRomeDaySample(b,a),a)
})
test('route warmup skips same component, restricts selection to neighboring code and ignores already loaded routes',()=>{
 const shared=async()=>{},progress=async()=>{},agenda=async()=>{},profile=async()=>{},foreign=async()=>{}
 const order=['home','plan','archive','progress','agenda','profile'],loaders={home:shared,plan:shared,archive:shared,progress,agenda,profile,foreign}
 assert.equal(adjacentRouteLoader('home',order,loaders,new Set([shared])),progress)
 assert.equal(adjacentRouteLoader('archive',order,loaders,new Set([shared,progress])),undefined)
 assert.equal(adjacentRouteLoader('agenda',order,loaders,new Set([agenda,profile])),progress)
 assert.equal(adjacentRouteLoader('foreign',order,loaders,new Set()),undefined)
})
test('no warmup offline, hidden, on constrained connection or with data saver',()=>{
 assert.equal(canWarmRoute(true,true),true)
 assert.equal(canWarmRoute(false,true),false);assert.equal(canWarmRoute(true,false),false)
 for(const effectiveType of ['slow-2g','2g','3g'])assert.equal(canWarmRoute(true,true,{effectiveType}),false)
 assert.equal(canWarmRoute(true,true,{effectiveType:'4g',saveData:true}),false)
})
test('day links preserve exact IDs and use cached week projection',()=>{
 const plan=read('src/components/AthletePlanContent.vue')
 assert.match(plan,/weekDayProjection=computed/);assert.match(plan,/exactWeekDaySlots\(liveGroups.value,week.value,index\)/)
 assert.match(plan,/return weekDayProjection.value\[index\]\?\.links/)
 assert.match(plan,/return weekDayProjection.value\[index\]\?\.activities/)
 assert.match(plan,/openSheet\(link.sheet\)/)
})
test('clock lifecycle and prefetch do not add Firebase calls or persist user data',()=>{
 const clock=read('src/features/performance/useRomeDayClock.ts'),router=read('src/router/index.ts').split('// R22B.6C.2:')[1]
 assert.match(clock,/if\(document.hidden\)\{stop\(\);return\}/)
 assert.match(clock,/removeEventListener\('visibilitychange',resume\)/)
 assert.match(router,/cancelRouteWarmup/);assert.match(router,/stagingSession.value\?\.uid===session.uid/)
 assert.doesNotMatch(router,/onSnapshot\(|getDoc\(|getDocs\(|httpsCallable\(|localStorage|sessionStorage/)
})
test('updated Vue components compile and keep calendar-only clock',()=>{
 for(const file of ['src/views/AthleteLiveWorkspace.vue','src/components/AthletePlanContent.vue']){
  const src=read(file);assert.match(src,/useRomeDayClock\(\)/)
  const {descriptor,errors}=parse(src,{filename:file});assert.deepEqual(errors,[])
  const script=compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({id:file,filename:file,source:descriptor.template.content,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
 }
})
