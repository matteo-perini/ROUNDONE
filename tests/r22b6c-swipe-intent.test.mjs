import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveSwipeIntent,protectedSwipeSelector,hasNativeHorizontalScroll,insideSystemEdge,suppressSwipeClick} from '../src/features/navigation/swipeIntent.ts'
const app=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
test('tap jitter stays pending, horizontal movement locks, vertical wins diagonals',()=>{
 assert.equal(resolveSwipeIntent('pending',5,2),'pending')
 assert.equal(resolveSwipeIntent('pending',-12,2),'horizontal')
 assert.equal(resolveSwipeIntent('pending',12,2),'horizontal')
 assert.equal(resolveSwipeIntent('pending',2,12),'vertical')
 assert.equal(resolveSwipeIntent('pending',25,23),'vertical')
})
test('axis lock never switches midway through native scroll or drag',()=>{
 assert.equal(resolveSwipeIntent('vertical',140,2),'vertical')
 assert.equal(resolveSwipeIntent('horizontal',2,140),'horizontal')
})
test('ordinary buttons links tables and icons are not blanket excluded',()=>{
 const selectors=protectedSwipeSelector.split(',')
 for(const x of ['a','button','table','td','th','img','svg','picture'])assert.ok(!selectors.includes(x),x)
 for(const x of ['input','textarea','select','dialog','.lf-r5-grip','.lf-p360-graph','.lf-ms-chart','[data-lf-no-section-swipe]'])assert.ok(selectors.includes(x),x)
})
test('native horizontal overflow remains protected, not mere table geometry',()=>{
 assert.equal(hasNativeHorizontalScroll(500,300,'auto'),true)
 assert.equal(hasNativeHorizontalScroll(500,300,'scroll'),true)
 assert.equal(hasNativeHorizontalScroll(500,300,'hidden'),false)
 assert.equal(hasNativeHorizontalScroll(301,300,'auto'),false)
 assert.equal(hasNativeHorizontalScroll(300,300,'auto'),false)
})
test('narrow system edge reserve increases usable width',()=>{
 assert.equal(insideSystemEdge(12,390),true)
 assert.equal(insideSystemEdge(24,390),false)
 assert.equal(insideSystemEdge(366,390),false)
 assert.equal(insideSystemEdge(385,390),true)
})
test('click suppression is short lived and excludes keyboard and physical mouse',()=>{
 assert.equal(suppressSwipeClick(50,1,true,true),true)
 assert.equal(suppressSwipeClick(50,1,true),true)
 assert.equal(suppressSwipeClick(50,0,true,true),false)
 assert.equal(suppressSwipeClick(50,1,true,false),false)
 assert.equal(suppressSwipeClick(50,1,false,true),false)
 assert.equal(suppressSwipeClick(451,1,true,true),false)
})
test('shell claims only horizontal drags, cancels touch conflicts, preserves tap handlers',()=>{
 assert.match(app,/start\.intent=resolveSwipeIntent/)
 assert.match(app,/if\(start\.intent!=='horizontal'\)return/)
 assert.match(app,/if\(!event\.cancelable\)\{cancelGesture\(\);return\}/)
 assert.match(app,/event\.preventDefault\(\)/)
 assert.match(app,/touchstartCapturePassive:chatTouchStart/)
 assert.match(app,/touchmoveCapture:chatTouchMove/)
 assert.match(app,/touchendCapture:chatTouchEnd/)
 assert.match(app,/@click\.capture="chatClickCapture"/)
 assert.match(app,/point.identifier!==start.identifier/)
})
