import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {invitationCounts,isPendingCoachInvite,participantEntryLabel} from '../src/features/bookings/competitionModel.ts'
import {participantCount,groupLabel,validParticipantCount} from '../src/features/bookings/groupBooking.ts'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const competitionUI=read('src/components/AgendaCompetitions.vue')
const competitionDB=read('src/integrations/firestore/competitions.ts')
const groupApi=read('src/integrations/firestore/liveBookings.ts')
const groupUI=read('src/views/LiveBookingWorkspace.vue')
const library=read('src/views/Library.vue')
const settings=read('src/views/Settings.vue')
test('private lesson group is metadata only: 1–6, one athleteId and one reservation',()=>{
 for(let i=1;i<=6;i++)assert.equal(validParticipantCount(i),true)
 for(const x of [-1,0,7,1.5,'4',null])assert.equal(validParticipantCount(x),false)
 assert.equal(participantCount(undefined),1)
 assert.equal(groupLabel(1),'1 persona')
 assert.equal(groupLabel(5),'5 persone')
 assert.match(groupApi,/participantCount:participantCount\(raw\.participantCount\)/)
 assert.match(groupApi,/\.\.\.\(participants>1\?\{participantCount:participants\}:\{\}\)/)
 assert.match(groupApi,/\.\.\.\(old\.participantCount>1\?\{participantCount:old\.participantCount\}:\{\}\)/)
 assert.match(groupApi,/athleteId:caller\.uid,coachId:cfg\.coachId/)
 assert.doesNotMatch(groupApi,/participantUids|otherAthleteIds|additionalAthletes/)
 assert.match(groupUI,/v-for="n in MAX_PRIVATE_PARTICIPANTS"/)
 assert.match(groupUI,/groupLabel\(b\.participantCount\)/)
 assert.match(groupUI,/!groupBookingEnabled\(\)/)
})
test('group writes gated while existing single booking stays backwards compatible',()=>{
 assert.match(read('src/features/bookings/groupBooking.ts'),/VITE_LIONFIT_GROUP_BOOKING_ENABLED/)
 assert.match(groupApi,/if\(participants>1&&import\.meta\.env\.VITE_LIONFIT_GROUP_BOOKING_ENABLED!=='true'\)/)
 assert.match(read('security/PATCH30-R8B-GROUP-BOOKING-RULES-ADDENDUM-NON-PUBBLICARE.txt'),/NON PUBBLICARE/)
})
test('SVG heart is immediately left of Select only in the assignment picker',()=>{
 const a=library.indexOf('class="lf-r8b-picker-heart"')
 const b=library.indexOf('class="lf-library-select"')
 assert.ok(a>0&&b>a)
 assert.match(library,/<button v-if="selectionMode&&favoriteScope"/)
 assert.match(library,/<button v-if="favoriteScope&&!selectionMode"/)
 assert.match(library,/onlyFavorites/)
 assert.match(library,/markFavorite\(e\.id\)/)
})
test('competition settings now show real, labeled accessible switch with original toggle logic',()=>{
 assert.match(settings,/role="switch" :aria-checked="competitionEnabled"/)
 assert.match(settings,/@click="toggleCompetition"/)
 assert.match(settings,/setCompetitionEnabled/)
})
test('competition invitations distinguish Coach invitation from voluntary request',()=>{
 const invited={id:'x',eventId:'e',athleteId:'a',updatedBy:'c',status:'pending',result:''}
 const own={...invited,updatedBy:'a'}
 assert.equal(isPendingCoachInvite(invited),true)
 assert.equal(isPendingCoachInvite(own),false)
 assert.equal(participantEntryLabel(invited),'Invitato · in attesa')
 assert.equal(participantEntryLabel(own),'Da valutare')
 assert.deepEqual(invitationCounts([{...invited,status:'pending'},{...invited,status:'approved',updatedBy:'a'},{...invited,status:'rejected',updatedBy:'a'},own]),{invited:3,waiting:1,accepted:1,declined:1})
 assert.match(competitionDB,/updatedBy:String\(x\.updatedBy\|\|''\)/)
 assert.match(competitionUI,/@click="answerInvite\(chosen,'yes'\)"/)
 assert.match(competitionUI,/@click="answerInvite\(chosen,'no'\)"/)
 assert.match(competitionUI,/!isPendingCoachInvite\(r\)/)
 assert.match(competitionUI,/@click="join\(chosen\)"/)
 assert.match(competitionUI,/invitedCounts\.accepted/)
})
test('competition notification backend never fires on simple publication',()=>{
 const code=read('competitions-backend/functions/index.mjs')
 assert.match(code,/export const lfCompetitionInvite=onCall/)
 assert.match(code,/export const lfCompetitionRespond=onCall/)
 assert.doesNotMatch(code,/onDocumentCreated|onDocumentWritten|onSchedule/)
 assert.match(code,/LF_COMPETITION_INVITES_ENABLED/)
 assert.match(code,/LF_COMPETITION_PROJECT_ID/)
 assert.match(code,/existing voluntary request or invitation never overwritten/)
 assert.match(code,/\.where\('uid','==',uid\)/)
 assert.match(code,/x\?\.gym===gym&&x\.role===role/)
 assert.match(code,/push:'best-effort'/)
 assert.ok(existsSync(new URL('../competitions-backend/firebase.json',import.meta.url)))
})
test('deep-link routes through verified login, optional push and selected event',()=>{
 assert.match(read('src/views/StagingAccess.vue'),/route\.query\.open==='competition'/)
 assert.match(read('src/router/index.ts'),/to\.query\.open==='competition'/)
 assert.match(read('src/App.vue'),/function openPushCompetition/)
 assert.match(read('src/integrations/firebase/pushNotifications.ts'),/openCompetition\?:\(eventId:string\)=>void/)
 assert.match(read('public/lf-push-worker.js'),/kind==='competition'/)
 assert.match(groupUI,/route\.query\.competitionId/)
})
test('modified TypeScript and Vue scripts transpile, CSS parses',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const p of ['src/features/bookings/competitionModel.ts','src/features/bookings/groupBooking.ts','src/integrations/firestore/liveBookings.ts','src/integrations/firestore/competitions.ts','src/integrations/firebase/competitionInvites.ts','src/integrations/firebase/pushNotifications.ts','src/router/index.ts']){
  const out=ts.transpileModule(read(p),{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(out.diagnostics||[],[],p)
 }
 for(const p of ['src/views/Library.vue','src/views/Settings.vue','src/views/LiveBookingWorkspace.vue','src/components/AgendaCompetitions.vue','src/views/StagingAccess.vue','src/App.vue']){
  const s=read(p),script=s.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script,p+' missing TS')
  const out=ts.transpileModule(script,{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual(out.diagnostics||[],[],p)
  for(const style of s.matchAll(/<style(?: scoped)?>([\s\S]*?)<\/style>/g))postcss.parse(style[1],{from:p})
 }
})
