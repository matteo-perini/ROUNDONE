import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {isAppleStandalone,iosStandaloneSwipeIntent,iosStandaloneTrackHeight,iosSoftwareKeyboard} from '../src/features/navigation/iosStandaloneScroll.ts'
import {resolveSwipeIntent} from '../src/features/navigation/swipeIntent.ts'
const iphone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',platform:'iPhone',maxTouchPoints:5,displayStandalone:false}
test('only Apple installed web apps opt in; iOS tabs, Android and desktop retain the old path',()=>{
 assert.equal(isAppleStandalone(iphone),false)
 assert.equal(isAppleStandalone({...iphone,standalone:true}),true)
 assert.equal(isAppleStandalone({...iphone,displayStandalone:true}),true)
 assert.equal(isAppleStandalone({userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:5,displayStandalone:true}),true)
 for(const d of [{userAgent:'Android',platform:'Linux arm',maxTouchPoints:5},{userAgent:'Windows',platform:'Win32',maxTouchPoints:0},{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}])assert.equal(isAppleStandalone({...d,displayStandalone:true,standalone:true}),false)
})
test('vertical and diagonal iOS gestures do not lock horizontal, while deliberate swipes do in both directions',()=>{
 for(const sign of [-1,1]){
  for(const [x,y,want] of [[7,1,'pending'],[13,1,'pending'],[14,0,'horizontal'],[17,15,'vertical'],[20,15,'vertical'],[20,13,'pending'],[26,19,'vertical'],[28,15,'horizontal'],[3,10,'vertical'],[0,30,'vertical']])assert.equal(iosStandaloneSwipeIntent('pending',sign*x,sign*y),want,`${x},${y}`)
  assert.equal(resolveSwipeIntent('pending',sign*17,15),'horizontal')
 }
 assert.equal(iosStandaloneSwipeIntent('vertical',100,0),'vertical')
 assert.equal(iosStandaloneSwipeIntent('horizontal',0,100),'horizontal')
 assert.equal(iosStandaloneSwipeIntent('pending',NaN,20),'pending')
})
const base={top:116,documentScrollY:0,layoutHeight:844,visibleHeight:844,visibleTop:0,scale:1,dockTop:750,focused:false,baselineHeight:844,previousHeight:null}
test('ordinary scrolling is stable through visual viewport changes, document bounce and subpixel jitter',()=>{
 const previousHeight=iosStandaloneTrackHeight(base);assert.equal(previousHeight,634)
 for(const [visibleHeight,visibleTop] of [[842,2],[700,10],[845,-3],[740,100]])assert.equal(iosStandaloneTrackHeight({...base,visibleHeight,visibleTop,previousHeight}),634)
 for(const y of [-12,-4,6,25])assert.equal(iosStandaloneTrackHeight({...base,top:base.top-y,documentScrollY:y,previousHeight}),634)
 assert.equal(iosStandaloneTrackHeight({...base,dockTop:748.9,previousHeight}),634)
 assert.equal(iosStandaloneTrackHeight({...base,dockTop:720,previousHeight}),604)
 assert.equal(iosStandaloneTrackHeight({...base,top:140,previousHeight}),610)
})
test('software keyboard changes height only when focused, including resized layout viewport and hidden dock',()=>{
 assert.equal(iosSoftwareKeyboard(true,844,480,844),true)
 assert.equal(iosSoftwareKeyboard(true,480,480,844),true)
 assert.equal(iosSoftwareKeyboard(true,844,800,844),false)
 assert.equal(iosSoftwareKeyboard(false,844,480,844),false)
 assert.equal(iosStandaloneTrackHeight({...base,focused:true,visibleHeight:480,visibleTop:30,dockTop:null,previousHeight:634}),394)
 assert.equal(iosStandaloneTrackHeight({...base,focused:true,layoutHeight:480,visibleHeight:480,dockTop:null,previousHeight:634}),364)
 assert.equal(iosStandaloneTrackHeight({...base,focused:true,visibleHeight:240,dockTop:null,previousHeight:634}),124)
 assert.equal(iosStandaloneTrackHeight({...base,previousHeight:394}),634)
})
test('invalid geometry or pinch retains valid height; rotation can recompute from scratch',()=>{
 for(const delta of [{scale:1.5},{scale:.8},{visibleHeight:0},{top:NaN},{dockTop:120},{layoutHeight:0}])assert.equal(iosStandaloneTrackHeight({...base,...delta,previousHeight:634}),634)
 assert.equal(iosStandaloneTrackHeight({...base,top:NaN}),null)
 assert.equal(iosStandaloneTrackHeight({...base,layoutHeight:430,visibleHeight:430,top:75,dockTop:365,baselineHeight:430}),290)
})
test('real integration scopes behavior to installed athlete track, avoids release-only commit and cleans listeners',()=>{
 const app=readFileSync('src/App.vue','utf8'),view=readFileSync('src/views/AthleteLiveWorkspace.vue','utf8'),css=readFileSync('src/styles-continuous-motion.css','utf8')
 assert.match(app,/iosStandalone&&nativeTrackShell.value/)
 assert.match(app,/if\(start.iosScroll\)start.intent=iosStandaloneSwipeIntent/)
 assert.match(app,/if\(start.iosScroll&&start.intent!=='horizontal'\)return\s*lockGesture/)
 assert.match(app,/if\(start.intent!=='horizontal'\)return[^\n]*\n if\(!pointerSwipeEnabled\)/)
 assert.match(app,/data-lf-chat-keyboard/)
 assert.match(view,/if\(iosStandalone\)scheduleTrackLayout\(\);else refreshTrackLayout\(\)/)
 assert.match(view,/iosLastHeight=null;iosBaseline=0;iosWidth=0/)
 for(const ev of ['focusin','focusout']){assert.ok(view.includes(`addEventListener('${ev}',scheduleTrackLayout)`));assert.ok(view.includes(`removeEventListener('${ev}',scheduleTrackLayout)`))}
 assert.match(view,/removeEventListener\('scroll',iosViewportScroll\)/)
 assert.match(css,/html:has\(\.app\.lf-ios-standalone-track\)/)
 assert.doesNotMatch(css.slice(css.indexOf('/* E.8.7:')),/overflow:hidden|touch-action:none|position:fixed/)
})
