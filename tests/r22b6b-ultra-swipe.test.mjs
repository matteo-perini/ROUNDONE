import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {swipeNeighbor,swipePreviewOffset,shouldNavigateOnRelease,snapBackDuration} from '../src/features/navigation/fluidSwipe.ts'
const order=['/messaggi','/home','/piano','/archivio','/progressi']
test('chat to the left, home to the right, no imaginary pages',()=>{
 assert.equal(swipeNeighbor('/home',130,order),'/messaggi')
 assert.equal(swipeNeighbor('/messaggi',-80,order),'/home')
 assert.equal(swipeNeighbor('/home',-140,order),'/piano')
 assert.equal(swipeNeighbor('/progressi',-100,order),null)
})
test('finger preview is directional, clamped, and resists at boundaries',()=>{
 assert.equal(swipePreviewOffset(100,0,380,true)>40,true)
 assert.equal(swipePreviewOffset(-100,0,380,true)<-40,true)
 assert.equal(swipePreviewOffset(30,80,380,true),0)
 assert.equal(swipePreviewOffset(500,0,380,false)<=24,true)
 assert.equal(swipePreviewOffset(1000,0,380,true)<=380*.68,true)
})
test('release responds to long deliberate swipes and short flicks',()=>{
 assert.equal(shouldNavigateOnRelease(130,5,370,390,true),true)
 assert.equal(shouldNavigateOnRelease(55,3,80,390,true),true)
 assert.equal(shouldNavigateOnRelease(15,5,140,390,true),false)
 assert.equal(shouldNavigateOnRelease(180,8,300,390,false),false)
 assert.equal(shouldNavigateOnRelease(130,120,250,390,true),false)
})
test('snap back timing remains bounded',()=>{
 assert.equal(snapBackDuration(100,390)>=135,true)
 assert.equal(snapBackDuration(2000,390)<=240,true)
})
test('app keeps safe fallbacks and prefers reduced motion',()=>{
 const app=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
 assert.match(app,/chatTouchMove/)
 assert.match(app,/prefers-reduced-motion: reduce/)
 assert.match(app,/skipSectionSwipe/)
 assert.match(app,/@touchmove="chatTouchMove"/)
 assert.match(app,/chatSwipeDestination/)
 assert.match(app,/sectionSwipeDestination/)
})
