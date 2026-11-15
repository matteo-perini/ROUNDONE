import test from 'node:test';import assert from 'node:assert/strict';import {pilotAvailable,pilotMobileDevice,validWorkPoint,distanceMetres,checkWorkArea} from '../src/features/work/gpsPilot.ts';
const c={latitude:45,longitude:12};test('pilot allows every valid tenant with same staff roles, never athletes or Control',()=>{for(const gymId of ['gym_test','gym_other','gym_1791234','legacy_123']){for(const role of ['titolare','collaboratore'])assert.equal(pilotAvailable({gymId,role}),true);for(const role of ['atleta','platform','admin'])assert.equal(pilotAvailable({gymId,role}),false)}assert.equal(pilotAvailable(null),false);for(const gymId of ['','x','a/b','../gym','x'.repeat(121)])assert.equal(pilotAvailable({gymId,role:'titolare'}),false)});
test('mobile presentation detects Android/iPhone/iPad/native, rejects ordinary desktop',()=>{for(const ua of ['Mozilla Android','Mozilla iPhone','iPad'])assert.equal(pilotMobileDevice(ua,0),true);assert.equal(pilotMobileDevice('Macintosh',5),true);assert.equal(pilotMobileDevice('Macintosh',0),false);assert.equal(pilotMobileDevice('Windows NT',10),false);assert.equal(pilotMobileDevice('Windows NT',0,true),true)});
test('GPS distance and invalid coordinates',()=>{assert.equal(distanceMetres(c,c),0);assert.ok(Math.abs(distanceMetres(c,{...c,latitude:45.001})-111.2)<1);assert.equal(validWorkPoint({latitude:91,longitude:0}),false);assert.throws(()=>distanceMetres(c,{latitude:NaN,longitude:0}))});
test('inside, outside, uncertain incl. weak fixes',()=>{assert.equal(checkWorkArea(c,{...c,accuracy:5},80).status,'inside');assert.equal(checkWorkArea(c,{...c,latitude:45.002,accuracy:5},80).status,'outside');assert.equal(checkWorkArea(c,{...c,latitude:45.0007,accuracy:15},80).status,'uncertain');assert.equal(checkWorkArea(c,{...c,accuracy:51},80).status,'uncertain');assert.throws(()=>checkWorkArea(c,{...c,accuracy:5},0));assert.throws(()=>checkWorkArea(c,{...c,accuracy:NaN},80))});

import {readFileSync} from 'node:fs';
test('optional settings UI has no tenant allowlist and GPS rechecks live staff session',()=>{const settings=readFileSync(new URL('../src/views/Settings.vue',import.meta.url),'utf8'),component=readFileSync(new URL('../src/components/WorkGpsPilot.vue',import.meta.url),'utf8');assert.ok(!settings.includes('VITE_LIONFIT_WORK_PILOT_GYM_ID'));assert.match(settings,/isLiveMode\(\)&&workPilotMobile&&pilotAvailable\(stagingSession.value\)/);assert.match(settings,/workPilotOpen=ref\(false\)/);assert.match(component,/await readStagingSession\(\)/);assert.match(component,/s.gymId!==props.gymId/);assert.match(component,/navigator.geolocation.getCurrentPosition/);assert.doesNotMatch(component,/watchPosition|setDoc|addDoc|localStorage/)});

import {ref,shallowRef,watch,nextTick} from 'vue';
test('GPS settings stays open on verified session refresh and closes on actual identity changes',async()=>{
 const settings=readFileSync(new URL('../src/views/Settings.vue',import.meta.url),'utf8');
 const watcher='watch([()=>stagingSession.value?.uid,()=>stagingSession.value?.gymId,()=>stagingSession.value?.role],()=>{workPilotOpen.value=false})';
 assert.ok(settings.includes(watcher));
 const initial={uid:'user1',gymId:'gym1',role:'titolare',label:'Coach'};
 const stagingSession=shallowRef(initial),workPilotOpen=ref(true);
 const stop=watch([()=>stagingSession.value?.uid,()=>stagingSession.value?.gymId,()=>stagingSession.value?.role],()=>{workPilotOpen.value=false});
 try{
  stagingSession.value={...initial};await nextTick();assert.equal(workPilotOpen.value,true);
  stagingSession.value={...initial,label:'Coach updated'};await nextTick();assert.equal(workPilotOpen.value,true);
  for(const changed of [{...initial,uid:'user2'},{...initial,gymId:'gym2'},{...initial,role:'collaboratore'},null]){
   stagingSession.value={...initial};await nextTick();workPilotOpen.value=true;
   stagingSession.value=changed;await nextTick();assert.equal(workPilotOpen.value,false);
  }
 }finally{stop()}
});
