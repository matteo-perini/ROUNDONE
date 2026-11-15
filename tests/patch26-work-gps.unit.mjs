import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {getWorkFix,gpsFailure,WorkGpsError} from '../src/features/work/gpsPilot.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const manifest=read('android/app/src/main/AndroidManifest.xml')
test('APK declares both foreground runtime location permissions, never background',()=>{
 for(const name of ['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION'])assert.equal((manifest.match(new RegExp(`android.permission.${name}`, 'g'))||[]).length,1)
 assert.doesNotMatch(manifest,/ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION/)
 assert.match(manifest,/android.permission.INTERNET/)
})
test('denied, disabled/unavailable and timeout are distinct; Android precise setting guidance',()=>{
 assert.equal(gpsFailure(1,true).reason,'denied');assert.match(gpsFailure(1,true).message,/Posizione precisa/)
 assert.match(gpsFailure(1,false).message,/browser/);assert.equal(gpsFailure(2,true).reason,'unavailable');assert.equal(gpsFailure(3,true).reason,'timeout')
})
async function withGeo(handler,fn,secure=true){
 const prev=Object.getOwnPropertyDescriptor(globalThis,'navigator'),win=Object.getOwnPropertyDescriptor(globalThis,'window')
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:handler?{getCurrentPosition:handler}:undefined}})
 Object.defineProperty(globalThis,'window',{configurable:true,value:{isSecureContext:secure}})
 try{await fn()}finally{if(prev)Object.defineProperty(globalThis,'navigator',prev);else delete globalThis.navigator;if(win)Object.defineProperty(globalThis,'window',win);else delete globalThis.window}
}
test('single fresh position per call; exact numeric coordinates; no automatic retry',async()=>{
 let calls=0
 await withGeo((ok,err,options)=>{calls++;assert.deepEqual(options,{enableHighAccuracy:true,maximumAge:0,timeout:20000});ok({coords:{latitude:45,longitude:12,accuracy:5}})},async()=>{assert.equal(calls,0);assert.deepEqual(await getWorkFix(),{latitude:45,longitude:12,accuracy:5});assert.equal(calls,1)})
})
test('denied GPS can be retried after permissions change without reloading',async()=>{
 let calls=0
 await withGeo((ok,err)=>{if(++calls===1)err({code:1});else ok({coords:{latitude:45,longitude:12,accuracy:10}})},async()=>{await assert.rejects(getWorkFix(),e=>e instanceof WorkGpsError&&e.reason==='denied');assert.equal((await getWorkFix()).accuracy,10);assert.equal(calls,2)})
})
test('reject timeout, unavailable, impossible GPS fixes, absent API and insecure origin',async()=>{
 for(const [code,reason] of [[2,'unavailable'],[3,'timeout']])await withGeo((ok,err)=>err({code}),async()=>assert.rejects(getWorkFix(),e=>e.reason===reason))
 for(const coords of [{latitude:91,longitude:12,accuracy:3},{latitude:45,longitude:12,accuracy:0},{latitude:45,longitude:12,accuracy:NaN}])await withGeo(ok=>ok({coords}),async()=>assert.rejects(getWorkFix(),e=>e.reason==='invalid'))
 await withGeo(null,async()=>assert.rejects(getWorkFix(),e=>e.reason==='unsupported'))
 await withGeo(()=>assert.fail('insecure must not invoke GPS'),async()=>assert.rejects(getWorkFix(),e=>e.reason==='unsupported'),false)
})
test('settings distinguishes Firebase denial; badge retains status on GPS-only failure',()=>{
 const settings=read('src/components/WorkConfigSettings.vue'),badge=read('src/components/WorkAttendanceBadge.vue'),gps=read('src/features/work/gpsPilot.ts')
 assert.match(settings,/non è un errore GPS/);assert.match(badge,/if\(!\(e instanceof WorkGpsError\)\)\{data.value=null/)
 assert.match(settings,/await getWorkFix\(\)/);assert.match(badge,/await getWorkFix\(\)/);assert.doesNotMatch(gps,/watchPosition|localStorage|setDoc|addDoc/)
 assert.match(settings,/confirmStep.value!==2\|\|!accepted.value/);assert.match(settings,/validWorkCenter\(fix\)/)
 assert.match(read('src/integrations/firestore/workConfig.ts'),/if\(\(await tx.get\(ref\)\).exists\(\)\)throw/)
 for(const [name,source] of [['WorkConfigSettings.vue',settings],['WorkAttendanceBadge.vue',badge]]){const {descriptor,errors}=parse(source);assert.deepEqual(errors,[]);assert.ok(compileScript(descriptor,{id:name}).content);assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:name,id:name}).errors,[])}
})
