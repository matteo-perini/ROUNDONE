import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sectionTransition } from '../src/features/navigation/sectionSwipe.ts'

const app = readFileSync('src/App.vue', 'utf8')
const live = readFileSync('src/views/AthleteLiveWorkspace.vue', 'utf8')
const router = readFileSync('src/router/index.ts', 'utf8')
const order = ['home', 'plan', 'archive']

test('cause: all three athlete routes share one LiveAthlete component', () => {
  for (const path of ['/home', '/piano', '/archivio']) {
    assert.match(router, new RegExp(`path:'${path}',component:isStagingMode\\(\\)\\?LiveAthlete`))
  }
})
test('Home -> Piano and Piano -> Archivio use the same forward direction as other sections', () => {
  assert.equal(sectionTransition('home','plan',order),'lf-section-next')
  assert.equal(sectionTransition('plan','archive',order),'lf-section-next')
  assert.equal(sectionTransition('home','archive',order),'lf-section-next')
})
test('Piano -> Home and Archivio -> Piano reverse direction', () => {
  assert.equal(sectionTransition('plan','home',order),'lf-section-prev')
  assert.equal(sectionTransition('archive','plan',order),'lf-section-prev')
})
test('mobile real panes have stable per-screen keys and inactive panes are inert', () => {
  assert.match(live, /v-for="page in pageScreens" :key="page"/)
  assert.match(live, /:data-lf-screen="page"/)
  assert.match(live, /:inert="page!==props.screen"/)
  assert.match(live, /trackMobile.value\?screenOrder.value:\[props.screen\]/)
  assert.doesNotMatch(live, /<Transition :name="workspaceMotion"/)
})
test('live workspace subscriptions remain at parent instance level', () => {
  const subscription = live.indexOf('=useAthleteLive(')
  const wrapper = live.indexOf('v-for="page in pageScreens"')
  assert.ok(subscription >= 0 && subscription < wrapper)
  assert.equal((live.match(/=useAthleteLive\(/g)||[]).length,1)
  assert.ok(!live.includes('<component :is="Component" :key="route.path"'))
})
test('the shell never stacks a competing RouterView transition for reused live screens', () => {
  assert.match(app, /isNativePagePath\(before\)/)
  assert.match(app, /isNativePagePath\(now\)\) chatMotion.value=''/)
})
test('chat and other navbar transitions remain in App', () => {
  assert.match(app, /lf-chat-open/)
  assert.match(app, /lf-chat-close/)
  assert.match(app, /sectionTransition\(before,now,swipePages.value\)/)
  assert.match(app, /touchstartCapturePassive:chatTouchStart/)
})
