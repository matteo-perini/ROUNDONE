import test from 'node:test'
import assert from 'node:assert/strict'
import {chatSwipeDestination} from '../src/features/chat/chatNavigation.ts'
test('swipe right from Dashboard opens left Chat',()=>assert.equal(chatSwipeDestination('/home',120,8,320),'/messaggi'))
test('swipe left from Chat returns Dashboard',()=>assert.equal(chatSwipeDestination('/messaggi',-130,5,320),'/home'))
test('swipes in opposite direction do not switch views',()=>{
 assert.equal(chatSwipeDestination('/home',-120,4,320),null)
 assert.equal(chatSwipeDestination('/messaggi',120,4,320),null)
})
test('vertical scrolling and small gestures never navigate',()=>{
 assert.equal(chatSwipeDestination('/home',120,130,320),null)
 assert.equal(chatSwipeDestination('/home',42,0,320),null)
})
test('other routes and slow dragging do nothing',()=>{
 assert.equal(chatSwipeDestination('/piano',150,0,300),null)
 assert.equal(chatSwipeDestination('/home',150,0,1600),null)
 assert.equal(chatSwipeDestination('/home',Number.NaN,0,300),null)
})
