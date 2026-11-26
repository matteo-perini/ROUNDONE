import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createNativePageTrack,nativePagePaths,nativeTrackSide,nativeTrackOffset,nativeTrackHeight} from '../src/features/navigation/nativePageTrack.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
function fixture(){
 const style=()=>({removeProperty(k){delete this[k]}})
 const panes=Object.fromEntries(nativePagePaths.map(p=>[p,{style:style(),dataset:{}}]))
 let reads=0,queries=0
 const animations=[]
 const rail={isConnected:true,get clientWidth(){reads++;return 366},style:style(),dataset:{},querySelector(s){queries++;return panes[s.match(/"([^"]+)"/)[1]]},animate(frames,options){const a={frames,options,onfinish:null,oncancel:null,cancel(){this.cancelled=true;this.oncancel?.()}};animations.push(a);return a}}
 const track=createNativePageTrack(rail,'/home')
 return {panes,rail,track,animations,counts:()=>({reads,queries})}
}
test('the six athlete dock paths participate, geometry is finite and direction is stable',()=>{
 assert.equal(nativeTrackSide('/home','/piano'),1);assert.equal(nativeTrackSide('/archivio','/piano'),-1);assert.equal(nativeTrackSide('/home','/messaggi'),-1)
 assert.equal(nativeTrackOffset(-150,366,1),-150);assert.equal(nativeTrackOffset(150,366,1),0);assert.equal(nativeTrackOffset(-900,366,1),-366*.88);assert.equal(nativeTrackOffset(NaN,366,1),0)
 assert.equal(nativeTrackHeight(95,776),681);assert.equal(nativeTrackHeight(900,776),null);assert.equal(nativeTrackHeight(100,NaN),null)
})
test('real panes move on one rail; successive frames do not read layout',()=>{
 const f=fixture();assert.equal(f.track.paint('/home','/piano',-100),-100);const initial=f.counts()
 assert.equal(f.panes['/piano'].style.left,'366px');assert.equal(f.panes['/home'].style.left,'0px');assert.equal(f.panes['/archivio'].dataset.lfTrackShown,undefined)
 for(let x=101;x<150;x++)f.track.paint('/home','/piano',-x)
 assert.deepEqual(f.counts(),initial);assert.equal(f.rail.style.transform,'translate3d(-149px,0,0)')
})
test('router confirmation settles from the actual painted position without swapping DOM',()=>{
 const f=fixture(),home=f.panes['/home'],plan=f.panes['/piano'];f.track.paint('/home','/piano',-147)
 assert.equal(f.track.navigate('/home','/piano',210),true);const a=f.animations[0];assert.deepEqual(a.frames,[{transform:'translate3d(-147px,0,0)'},{transform:'translate3d(-366px,0,0)'}]);assert.equal(a.options.duration,189);assert.ok(f.track.moving());a.onfinish()
 assert.equal(f.rail.style.transform,undefined);assert.equal(f.track.moving(),false);assert.equal(plan.dataset.lfTrackShown,undefined);assert.equal(f.panes['/home'],home);assert.equal(f.panes['/piano'],plan)
})
test('router rejection and reversal return to the real origin and remove shown markers',()=>{
 const f=fixture();f.track.paint('/piano','/archivio',-200);f.track.paint('/piano','/home',120)
 assert.equal(f.panes['/archivio'].dataset.lfTrackShown,undefined);assert.equal(f.panes['/home'].style.left,'-366px');f.track.cancel(true);const a=f.animations[0];assert.deepEqual(a.frames,[{transform:'translate3d(120px,0,0)'},{transform:'translate3d(0px,0,0)'}]);a.onfinish();assert.equal(f.rail.dataset.lfTrackMoving,undefined)
})
test('rapid navbar changes cancel prior animation and direct jumps never expose an intermediate page',()=>{
 const f=fixture();f.track.navigate('/home','/piano',340);const prior=f.animations[0];f.track.navigate('/piano','/archivio',340);assert.equal(prior.cancelled,true);assert.equal(prior.onfinish,null);f.animations[1].onfinish();f.track.navigate('/archivio','/home',340);assert.equal(f.panes['/piano'].dataset.lfTrackShown,undefined);assert.equal(f.panes['/home'].style.left,'-366px');f.track.dispose();assert.equal(f.rail.dataset.lfTrackMoving,undefined);assert.equal(f.track.paint('/home','/piano',-100),null)
})
test('reduced motion and missing WAAPI never leave a moving rail or blank pane',()=>{
 const f=fixture();f.track.navigate('/home','/piano',0);assert.equal(f.animations.length,0);assert.equal(f.rail.dataset.lfTrackMoving,undefined);f.rail.animate=()=>{throw Error('unsupported')};assert.equal(f.track.navigate('/piano','/archivio',340),true);assert.equal(f.rail.dataset.lfTrackMoving,undefined)
})
test('verified scope, one workspace, lazy archive loading and safe inactive pages',()=>{
 const view=read('src/views/AthleteLiveWorkspace.vue'),app=read('src/App.vue'),plan=read('src/components/AthletePlanContent.vue'),home=read('src/components/AthleteHomeContent.vue'),css=read('src/styles-continuous-motion.css')
 assert.match(view,/accountKey\(session.value\)===accountKey\(stagingSession.value\)/);assert.match(view,/data&&scopeValid/);assert.match(view,/trackViewport.value.inert=!valid/);assert.equal((view.match(/=useAthleteLive\(/g)||[]).length,1);assert.match(view,/useAthleteLive\(\(\)=>archiveRequested.value,\(\)=>coreRequested.value&&shellScopeValid.value\)/);assert.match(view,/:inert="page!==props.screen"/);assert.match(view,/:page-active="page===props.screen"/);assert.match(plan,/if\(!active\)\{selectedDay.value=null;opened.value=null/);assert.match(home,/activeSheet.value=null;videoOpen.value=false/);assert.match(css,/overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain/);assert.match(app,/nativeHandled=swipeRouteInstance\?\.commitTrack/);assert.match(app,/if\(typeof trackOffset==='number'\)/);assert.match(app,/swipeRouteInstance\?\.cancelTrack\?\.\(false\)/)
})
