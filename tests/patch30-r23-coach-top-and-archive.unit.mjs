import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read = (p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.vue')
const live=read('src/views/LiveCoachTemplates.vue')
const demo=read('src/views/CoachSheets.vue')
const emulator=read('src/views/DevCoachTemplates.vue')

test('Coach inbox appears only on dashboard route; Athlete scope unaffected',()=>{
 assert.match(app,/const inboxVisibleOnRoute=computed\(\(\)=>shownRole\.value!=='coach'\|\|route\.path==='\/coach'\)/)
 assert.match(app,/<InboxBell v-if="inboxInHeader&&inboxVisibleOnRoute&&coachInboxEnabled\(\)&&stagingSession"/)
 assert.match(app,/<InboxBell v-if="!inboxInHeader&&inboxVisibleOnRoute"/)
 assert.match(app,/const inboxInHeader=computed\(\(\)=>shownRole\.value==='atleta'\?athleteHeaderVisible\.value:coachHeaderVisible\.value\)/)
})

test('Notification push listeners and support integration retained',()=>{
 assert.match(app,/<PushWelcome :key="stagingSession\.uid"/)
 assert.match(app,/function openPushSupport\(/)
 assert.match(app,/connectPushSession\(/)
 assert.equal((app.match(/<InboxBell /g)||[]).length,2)
})

test('Desktop dashboard bell positioned off layout flow with search clearance',()=>{
 assert.match(app,/\.app\.as-coach \.main-layout\.coach-container > \.lf17-bell-wrap\{\s*position:absolute/)
 assert.match(app,/\.app\.as-coach \.lf-coach-dashboard \.lf-coach-greeting\{padding-right:54px;min-height:44px\}/)
 assert.match(app,/@media \(min-width:901px\)/)
})

test('Live Coach archive has one archive title and one top right create action',()=>{
 assert.equal((live.match(/uiText\("ARCHIVIO SCHEDE"\)/g)||[]).length,1)
 assert.match(live, /<section v-else-if="!loading && session" class="panel lf-mobile-archive">/)
 assert.match(live,/class="lf30-archive-head"/)
 assert.match(live,/class="lf30-archive-actions"/)
 assert.match(live,/@click="beginModel">\{\{uiText\("\+ Crea nuova scheda dall'archivio"\)\}\}/)
 assert.doesNotMatch(live,/class="notice coach-archive-guide"/)
})

test('Personal sheet and contextual navigation preserved for live Coach',()=>{
 assert.match(live,/@click="beginPersonal">\{\{uiText\("\+ Crea scheda personale"\)\}\}/)
 assert.match(live,/v-if="typeof route.query.athleteId==='string'\|\|typeof route.query.weekId==='string'"/)
 assert.match(live,/canManageCoachModel\(s.id,session.role\)/)
 assert.match(live,/personalTemplateInTrash\(s.id,personal,currentAthlete.id\)/)
 for(const method of ['openAssign(s)','trash(s)','restore(s)','duplicate(s)','edit(s)']) assert.ok(live.includes(method),method)
})

test('Demo archive retains personal create, archive create, archive search and trash route',()=>{
 assert.equal((demo.match(/uiText\("ARCHIVIO SCHEDE"\)/g)||[]).length,1)
 assert.match(demo,/@click="create\('personal'\)"/)
 assert.match(demo,/@click="create\('archive'\)"/)
 assert.match(demo,/to="\/coach\/cestino"/)
 assert.match(demo,/class="coach-archive-toolbar"/)
})

test('Emulator archive keeps safety notice, creates, restoration and permissions',()=>{
 assert.equal((emulator.match(/<h2 class="card-heading">ARCHIVIO SCHEDE<\/h2>/g)||[]).length,1)
 assert.match(emulator,/COACH OPERATIVO · FIREBASE EMULATOR/)
 assert.match(emulator,/@click="beginModel">\+ Crea nuova scheda dall'archivio/)
 assert.match(emulator,/@click="beginPersonal">\+ Crea scheda personale/)
 assert.match(emulator,/restore\(s\)/)
 assert.match(emulator,/editableModel\(s.id,s.createdBy,session.uid\)/)
})

test('Coach back remains mobile-only; Athlete stays separate',()=>{
 assert.match(app,/route\.path!=='\/home' && route\.path!=='\/coach' && \(shownRole!=='coach' \|\| coachHeaderVisible\)/)
 assert.match(app,/<AthleteBottomNavigation v-if="shownRole==='atleta'"/)
 assert.match(app,/class="bottom-nav coach-bottom"/)
})
