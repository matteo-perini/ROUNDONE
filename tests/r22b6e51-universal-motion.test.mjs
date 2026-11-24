import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {continuousDragOffset,continuousCommitMotion,pairedPosition} from '../src/features/navigation/universalMotion.ts'
import {railFits} from '../src/features/navigation/swipeRails.ts'
import {protectedSwipeSelector} from '../src/features/navigation/swipeIntent.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.vue'),live=read('src/views/AthleteLiveWorkspace.vue'),motion=read('src/features/navigation/universalMotion.ts'),css=read('src/styles-continuous-motion.css')
test('continuous drag follows 98% of the finger in either direction up to 88% of viewport',()=>{
 for(const x of [7,12,28,80,160,240]){assert.ok(Math.abs(continuousDragOffset(x,390,true)-x*.98)<1e-8);assert.equal(continuousDragOffset(-x,390,true),-continuousDragOffset(x,390,true))}
 assert.equal(continuousDragOffset(999,390,true),343.2);assert.ok(continuousDragOffset(999,390,false)<=18)
 assert.equal(continuousDragOffset(100,0,true),0);assert.equal(continuousDragOffset(NaN,390,true),0)
})
test('paired surfaces are separated by exactly one physical span',()=>{
 for(const w of [320,390,799,900])for(const d of [-1,1])for(const x of [0,7,48,180])assert.equal(pairedPosition(x*d,w,d)-x*d,-d*w)
})
test('handoff retains larger offsets; shorter remaining distance completes faster',()=>{
 const a=continuousCommitMotion(28,390,1,.4),b=continuousCommitMotion(200,390,1,.4)
 assert.equal(b.offset,200);assert.ok(b.duration<a.duration);assert.equal(continuousCommitMotion(-200,390,-1,-.4).duration,b.duration)
 assert.equal(continuousCommitMotion(200,390,-1,-.4).offset,0);assert.equal(continuousCommitMotion(0,0,1,0),null)
 for(const offset of [0,50,300,999])for(const v of [0,.5,4]){const r=continuousCommitMotion(offset,390,1,v);assert.ok(r.duration>=125&&r.duration<=300);assert.ok(r.offset<=390*.88)}
})
test('fitting rails do not own a horizontal gesture; actual overflow stays native',()=>{
 assert.equal(railFits(300,300),true);assert.equal(railFits(302,300),true);assert.equal(railFits(303,300),false);assert.equal(railFits(0,0),false)
 assert.match(css,/\[data-lf-rail-fits\]\{overflow-x:visible!important;overflow-x:clip!important;overflow-y:visible!important/)
 assert.match(read('src/features/navigation/swipeRails.ts'),/ResizeObserver/);assert.match(app,/v-lf-swipe-rails/)
})
test('labels and ordinary click surfaces no longer excluded; native controls remain protected',()=>{
 const s=protectedSwipeSelector.split(',');for(const name of ['label','a','button','img','table'])assert.ok(!s.includes(name));for(const name of ['input','select','textarea','dialog','[role="slider"]','[draggable="true"]'])assert.ok(s.includes(name))
})
test('cue is inert, uses only text nodes, is destroyed, and cannot clone or persist account data',()=>{
 assert.match(motion,/panel.inert=true/);assert.match(motion,/aria-hidden/);assert.match(motion,/panel.remove\(\)/);assert.match(motion,/textContent=/)
 assert.doesNotMatch(motion,/innerHTML|cloneNode|localStorage|sessionStorage|fetch\(|onSnapshot/)
 assert.match(app,/snapCue\?\.dispose\(\)/);assert.match(app,/cue\?\.dispose\(\)/)
})
test('read-only projection is scoped, ready-only, and never used for Chat or coach',()=>{
 const part=live.slice(live.indexOf('function motionSummary'),live.indexOf('const retryWorkspace'))
 assert.match(part,/status.value!=='ready'/);assert.match(part,/accountKey\(session.value\)!==scope/);assert.match(part,/archiveReady.value/)
 assert.doesNotMatch(part,/messaggi|coach|fetch\(|onSnapshot/);assert.match(app,/motion-scope-invalidated/)
})
test('all drags can reverse before release, no early routing or forced overlap',()=>{
 const move=app.slice(app.indexOf('function moveGesture'),app.indexOf('function finishConsumedContact'))
 assert.doesNotMatch(move,/commitSwipe\(/);assert.match(app,/if\(now-commit.at<500\)/);assert.match(app,/settle\(\);return \/\/ never force/)
 assert.match(app,/rememberSectionLayout\(swipeRouteRoot\)/)
})
