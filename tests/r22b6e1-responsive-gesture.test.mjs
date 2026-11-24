import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveSwipeIntent} from '../src/features/navigation/swipeIntent.ts'
import {swipeNeighbor,swipePreviewOffset,shouldNavigateOnRelease} from '../src/features/navigation/fluidSwipe.ts'
const app=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
const chat=readFileSync(new URL('../src/views/AthleteChatPreview.vue',import.meta.url),'utf8')
const pages=['/messaggi','/home','/piano','/archivio']
test('early response with diagonal tolerance, but jitter and vertical movement are not navigation',()=>{
 assert.equal(resolveSwipeIntent('pending',6,1),'pending')
 assert.equal(resolveSwipeIntent('pending',8,5),'horizontal')
 assert.equal(resolveSwipeIntent('pending',-12,9),'horizontal')
 assert.equal(resolveSwipeIntent('pending',6,9),'vertical')
 assert.equal(resolveSwipeIntent('pending',20,19),'vertical')
 assert.equal(resolveSwipeIntent('vertical',100,1),'vertical')
 assert.ok(swipePreviewOffset(8,0,390,true)>0)
})
test('short flicks, moderate diagonal drags and deliberate slow drags commit',()=>{
 for(const [dx,dy,ms] of [[38,3,65],[76,48,600],[-85,50,1700],[85,40,2800]]){
  assert.equal(shouldNavigateOnRelease(dx,dy,ms,390,true),true)
 }
})
test('tiny drags, dominant vertical travel, absent neighbor and invalid times do not commit',()=>{
 for(const [dx,dy,ms,neighbor] of [[15,0,40,true],[30,0,40,true],[60,90,300,true],[62,60,300,true],[85,2,300,false],[100,0,0,true]]){
  assert.equal(shouldNavigateOnRelease(dx,dy,ms,390,neighbor),false)
 }
})
test('same policy in both directions, chat available only in authorized route order',()=>{
 assert.equal(swipeNeighbor('/home',80,pages),'/messaggi')
 assert.equal(swipeNeighbor('/messaggi',-80,pages),'/home')
 assert.equal(swipeNeighbor('/home',80,pages.slice(1)),null)
 assert.equal(swipeNeighbor('/home',-80,pages),'/piano')
 assert.equal(swipeNeighbor('/allenamento/abc',80,pages),null)
 assert.match(app,/const destination=shouldMove\?candidate:null/)
 assert.doesNotMatch(app,/chatSwipeDestination|sectionSwipeDestination/)
})
test('touch-action is scoped to mobile top-level sections and vertical chat scrollports',()=>{
 assert.match(app,/swipeSurfaceEnabled=computed\(\(\)=>!!shownRole.value&&swipePages.value.includes\(route.path\)\)/)
 assert.match(app,/'lf-swipe-surface':swipeSurfaceEnabled/)
 assert.match(app,/\.main-layout\.athlete-container\.lf-swipe-surface\{touch-action:pan-y pinch-zoom\}/)
 assert.match(app,/\.main-layout\.coach-container\.lf-swipe-surface\{touch-action:pan-y pinch-zoom\}/)
 assert.match(chat,/\.lf-chat-workspace,\.lf-chat-sidebar,\.lf-chat-messages\{touch-action:pan-y pinch-zoom\}/)
 assert.match(app,/hasNativeHorizontalScroll\(node.scrollWidth,node.clientWidth/)
})
test('fast release can classify pending intent, while cancellation and tap guard survive',()=>{
 const end=app.slice(app.indexOf('function chatTouchEnd'),app.indexOf('function chatTouchCancel'))
 assert.match(end,/start.intent=resolveSwipeIntent\(start.intent,dx,dy\)/)
 assert.match(end,/if\(start.intent!=='horizontal'\)\{restoreDrag\(true\);return\}/)
 assert.match(end,/armSwipeClickGuard\(start\)/)
 assert.match(app,/if\(!event.cancelable\)\{chatTouchCancel\(\);return\}/)
})

test('crossing the origin during a drag does not start a snap-back animation',()=>{
 const move=app.slice(app.indexOf('function chatTouchMove'),app.indexOf('function chatTouchEnd'))
 assert.match(move,/if\(!offset&&!dragRoot\)return/)
 assert.doesNotMatch(move,/restoreDrag\(true\)/)
})
