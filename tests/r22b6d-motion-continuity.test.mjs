import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {swipeCommitMotion} from '../src/features/navigation/fluidSwipe.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.vue'), workspace=read('src/views/AthleteLiveWorkspace.vue')
test('commit begins at the painted position in both directions, with adaptive duration',()=>{
 const left=swipeCommitMotion(-120,390,-140),right=swipeCommitMotion(120,390,140)
 assert.deepEqual(left,{offset:-120,duration:291})
 assert.deepEqual(right,{offset:120,duration:291})
 assert.ok(swipeCommitMotion(220,390,1).duration<right.duration)
 assert.ok(swipeCommitMotion(10000,390,1).duration>=180)
})
test('never continue a tiny, invalid or reversed drag',()=>{
 for(const args of [[0,390,1],[2,390,1],[120,390,-1],[120,0,1],[NaN,390,1],[120,390,0]])assert.equal(swipeCommitMotion(...args),null)
})
test('freeze until real route change, use painted offset rather than queued frame, snap back on failure',()=>{
 assert.match(app,/transferSwipeMotion\(before,now\);[\s\S]*?outerMotion\.begin\([\s\S]*?restoreDrag\(false\)/)
 assert.match(app,/continuousCommitMotion\(dragRoot\?\.isConnected\?dragPaintedOffset:0,stage.clientWidth,pending.direction,pending.velocity\)/)
 assert.match(app,/pendingSwipe=commit/)
 assert.match(app,/\.then\(settle,settle\)/)
 assert.match(app,/route\.path!==commit\.to/)
 assert.match(app,/dragPaintedOffset=painted/)
 assert.match(app,/if\(!destination\)\{[^\n]*restoreDrag\(true\);return\}/)
 assert.match(app,/snapAnimation\?\.cancel\(\)/)
})
test('outer Vue transitions inherit offset; native workspace uses one rail and normal taps retain 340ms',()=>{
 for(const source of [app]){
  assert.match(source,/leave-from\{transform:translate3d\(var\(--lf-swipe-commit-offset,0px\)/)
  assert.match(source,/calc\(var\(--lf-motion-span,100%\) \+ var\(--lf-swipe-commit-offset,0px\)\)/)
  assert.match(source,/calc\(-1 \* var\(--lf-motion-span,100%\) \+ var\(--lf-swipe-commit-offset,0px\)\)/)
  assert.match(source,/var\(--lf-swipe-commit-duration,340ms\)/)
  assert.match(source,/prefers-reduced-motion:reduce/)
 }
 assert.match(workspace,/createNativePageTrack/);assert.match(app,/commitTrack\?\./);assert.match(app,/:340\n const nativeHandled/);
 assert.match(app,/removeProperty\('--lf-swipe-commit-offset'\)/)
 assert.match(app,/removeProperty\('--lf-swipe-commit-duration'\)/)
 assert.match(app,/clearSwipeMotion\(\)\}/)
})
