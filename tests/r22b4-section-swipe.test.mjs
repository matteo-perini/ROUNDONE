import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sectionSwipeDestination as move,sectionTransition as motion} from '../src/features/navigation/sectionSwipe.ts'
const athlete=['/messaggi','/home','/piano','/archivio','/progressi','/prenotazioni','/profilo']
const coach=['/coach/messaggi','/coach','/coach/atleti','/coach/archivio','/coach/prenotazioni','/coach/progressi','/coach/profilo']
test('athlete: swipe right from Home opens LEFT Chat',()=>assert.equal(move('/home',145,4,300,athlete),'/messaggi'))
test('athlete: swipe left from Chat returns Home',()=>assert.equal(move('/messaggi',-130,5,300,athlete),'/home'))
test('athlete: swipe left from Home opens next navbar section',()=>assert.equal(move('/home',-145,5,300,athlete),'/piano'))
test('athlete: every pair of navbar destinations is bidirectional',()=>{
 for(let i=1;i<athlete.length-1;i++){
  assert.equal(move(athlete[i],-180,0,250,athlete),athlete[i+1]);assert.equal(move(athlete[i+1],150,0,250,athlete),athlete[i])
 }
})
test('coach: Chat is left of Dashboard, other sections follow mobile navbar order',()=>{
 assert.equal(move('/coach',140,0,300,coach),'/coach/messaggi')
 assert.equal(move('/coach/messaggi',-140,0,300,coach),'/coach')
 assert.equal(move('/coach/atleti',-140,0,300,coach),'/coach/archivio')
 assert.equal(move('/coach/progressi',140,0,300,coach),'/coach/prenotazioni')
})
test('no looping beyond either end',()=>{
 assert.equal(move('/messaggi',140,0,300,athlete),null)
 assert.equal(move('/profilo',-140,0,300,athlete),null)
 assert.equal(move('/coach/profilo',-140,0,300,coach),null)
})
test('no navigation on unlisted subroutes',()=>{
 for(const route of ['/coach/atleti/123','/allenamento/abc','/assistenza','/impostazioni','/lionfit-control'])assert.equal(move(route,-200,0,300,athlete),null)
})
test('no navigation for short, vertical or invalid gesture',()=>{
 for(const x of [0,85,109])assert.equal(move('/home',x,0,200,athlete),null)
 assert.equal(move('/home',220,160,300,athlete),null)
 assert.equal(move('/home',180,4,990,athlete),null)
 assert.equal(move('/home',180,4,35,athlete),null)
 assert.equal(move('/home',Number.NaN,0,200,athlete),null)
})
test('motion mirrors the spatial relationship',()=>{
 assert.equal(motion('/home','/messaggi',athlete),'lf-section-prev')
 assert.equal(motion('/messaggi','/home',athlete),'lf-section-next')
 assert.equal(motion('/home','/piano',athlete),'lf-section-next')
 assert.equal(motion('/piano','/home',athlete),'lf-section-prev')
 assert.equal(motion('/home','/assistenza',athlete),'')
})
const app=readFileSync('src/App.vue','utf8')
test('Coach desktop no longer renders Chat inside sidebar foot',()=>{
 const foot=app.match(/<div class="sidebar-foot">([\s\S]*?)<\/div>/)?.[1]??''
 assert.doesNotMatch(foot,/lf-chat-coach-shortcut|Messaggi/)
 assert.match(app,/<DesktopShellActions v-if="shownRole!=='coach'\|\|route.path!=='\/coach'" class="lf-desktop-page-actions"\/>/)
 assert.match(app,/visible:!!shownRole.value&&!inboxInHeader.value/)
})
test('both roles keep chat unread badge and header icon',()=>{
 assert.match(app,/class="lf-chat-header-link"/)
 assert.match(app,/chatUnreadCount>0/)
 assert.match(app,/chatPilotStatus\(uid\)/)
})
test('swipe only on main content, handles edge, nested controls and reduced motion',()=>{
 assert.match(app,/touchstartCapturePassive:chatTouchStart/)
 assert.match(app,/insideSystemEdge\(point.clientX,window.innerWidth\)/)
 assert.match(readFileSync('src/features/navigation/swipeIntent.ts','utf8'),/\[data-lf-no-section-swipe\]/)
 assert.match(app,/@media\(prefers-reduced-motion:reduce\)/)
})
