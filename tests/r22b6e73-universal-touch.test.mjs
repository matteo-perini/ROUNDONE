import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveSwipeIntent,protectedSwipeSelector,insideSystemEdge} from '../src/features/navigation/swipeIntent.ts'
import {releaseSwipeCommit} from '../src/features/navigation/nativeSwipe.ts'
import {knownSwipeRails} from '../src/features/navigation/swipeRails.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.vue'),plan=read('src/components/AthletePlanContent.vue'),css=read('src/styles-continuous-motion.css')
test('slightly diagonal deliberate motion locks earlier, ambiguous and vertical motion remain protected',()=>{
 for(const sign of [-1,1]){assert.equal(resolveSwipeIntent('pending',sign*17,15),'horizontal');assert.equal(resolveSwipeIntent('pending',sign*6,1),'pending');assert.equal(resolveSwipeIntent('pending',sign*20,19),'vertical');assert.equal(resolveSwipeIntent('pending',sign*12,20),'vertical')}
 assert.equal(resolveSwipeIntent('vertical',100,0),'vertical');assert.equal(resolveSwipeIntent('horizontal',0,100),'horizontal');assert.equal(insideSystemEdge(10,390),true)
})
test('release remains reversible and rejects vertical travel, tiny movements and no neighbor',()=>{
 const d={dx:65,dy:42,elapsed:450,width:390,velocity:0,hasNeighbor:true}
 assert.equal(releaseSwipeCommit(d),true);assert.equal(releaseSwipeCommit({...d,dx:7}),false);assert.equal(releaseSwipeCommit({...d,dx:25,velocity:1}),false);assert.equal(releaseSwipeCommit({...d,velocity:-.5}),false);assert.equal(releaseSwipeCommit({...d,hasNeighbor:false}),false)
})
test('mobile program control is a swipeable disclosure or static value, native select remains on desktop',()=>{
 assert.match(plan,/programs.length===1/);assert.match(plan,/class="lf-p11-athlete-program-select lf-program-static"/);assert.match(plan,/ref="programToggle" type="button"/);assert.match(plan,/:aria-expanded="programMenuOpen"/);assert.match(plan,/@click="pickMobileProgram\(p.id\)"/);assert.match(plan,/closeProgramMenu\(true\);chooseProgram\(id\)/);assert.match(plan,/\.lf-program-desktop\{display:none!important\}/);assert.match(plan,/\.lf-program-mobile\{display:none\}/);assert.match(plan,/<select id="lf-p11-athlete-program"/)
})
test('menu closes on page deactivation, identity change, escape and external click; listener is cleaned',()=>{
 assert.match(plan,/if\(!active\)\{[^}]*closeProgramMenu\(\)/);assert.match(plan,/props.athleteKey[^\n]*closeProgramMenu\(\)/);assert.match(plan,/programMenuOpen.value\)\{closeProgramMenu\(true\);return\}/);assert.match(plan,/addEventListener\('click',outsideProgramMenu\)/);assert.match(plan,/removeEventListener\('click',outsideProgramMenu\)/)
})
test('only horizontal intent claims capture; capture transfer is not interpreted as cancel',()=>{
 const move=app.slice(app.indexOf('function moveGesture'),app.indexOf('function renderGestureAt'))
 assert.ok(move.indexOf("if(start.intent!=='horizontal')return")<move.indexOf('stage.setPointerCapture(event.pointerId)'));assert.match(app,/!swipeStage.value\?\.hasPointerCapture\(event.pointerId\)\)cancelGesture\(\)/);assert.match(app,/if\(!event.isPrimary\)\{cancelGesture\(\);return\}/)
})
test('in-progress transition can recover latest displacement without further input, bounded and cleaned',()=>{
 assert.match(app,/if\(touchStart!==start\|\|start.path!==route.path/);assert.match(app,/performance.now\(\)-waitStarted<500/);assert.match(app,/gestureRetryFrame=requestAnimationFrame\(\(\)=>\{gestureRetryFrame=0;renderGestureAt\(start,dx,waitStarted\)\}\)/);assert.match(app,/clearGestureRetry\(\);armSwipeClickGuard/);assert.match(app,/touchStart=null;clearGestureRetry\(\)/);assert.match(app,/function restoreDrag\(animateBack:boolean\)\{\s*clearGestureRetry\(\)/)
})
test('coach fit-only calendar rail and audited vertical scrollports, protected editing and modals',()=>{
 assert.ok(knownSwipeRails.includes('.lf-compact-week-days'));assert.match(css,/\.assignment-scroll,\.lf-r8b-invite-roster-list\)\{touch-action:pan-y pinch-zoom\}/);for(const selector of ['input','textarea','select','[role="dialog"]','[role="slider"]'])assert.ok(protectedSwipeSelector.split(',').includes(selector));assert.match(app,/hasNativeHorizontalScroll\(node.scrollWidth,node.clientWidth/)
})
