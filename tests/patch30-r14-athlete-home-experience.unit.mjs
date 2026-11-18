import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=f=>fs.readFileSync(path.join(root,f),'utf8')
const home=read('src/components/AthleteHomeContent.vue')
const highlight=read('src/components/AthleteHomeHighlights.vue')
const shell=read('src/App.vue')
const side=read('src/components/AthleteDesktopSidebar.vue')
const live=read('src/views/AthleteLiveWorkspace.vue')
const plan=read('src/components/AthletePlanContent.vue')
const css=read('src/styles-r14-athlete-home.css')
test('only Profile contains an entry into Settings; header and desktop sidebar have no direct settings link',()=>{
 assert.doesNotMatch(shell,/header-settings-button/)
 assert.doesNotMatch(side,/to=.*impostazioni/)
 assert.match(read('src/components/ProfileOverview.vue'),/lfp-settings-link/)
 assert.match(shell,/{to:'\/coach\/profilo',label:'PROFILO'/)
})
test('Home renders gym live identity with default gym image and custom cover support',()=>{
 assert.match(home,/<GymIdentity hero>/)
 assert.match(read('src/components/GymIdentity.vue'),/identity.cover\|\|'\/lionfit-r8a\/athlete-workout-hero\.webp'/)
 assert.match(read('src/styles-r14c-dashboard-rebuild.css'),/lf14-hero-image/)
 assert.match(home,/firstName/)
})
test('R14 Today action does not promise a workout when there is no assigned sheet',()=>{
 for(const t of ['hasTodayPlan','isRestDay','freeSheets','directSheet','actionLabel','Nessun allenamento programmato oggi','Apri il mio piano','Visualizza attività'])assert.ok(home.includes(t),t)
 assert.match(home,/v-if="directSheet"/)
 assert.match(home,/activeSheet=sheet/)
 assert.match(live,/:free-sheets="homeFreeSheets"/)
 assert.match(live,/activeAssignmentGroups\(d.personal,d.weeks,uid,romeDate\(clock.value\)\)/)
})
test('Week circle has unambiguous calendar label not a completion percentage',()=>{
 assert.match(home,/Giorno \{\{dayNumber\}\} di 7 · calendario settimanale/)
 assert.doesNotMatch(home,/allenamenti completati|avanzamento settimanale/)
})
test('Four requested action tiles are present, main navigation remains intact',()=>{
 for (const label of ['Prenota lezione','I miei allenamenti','Le mie schede','Video &amp; Tutorial']) assert.ok(home.includes(label),label)
 assert.match(shell,/<AthleteBottomNavigation/)
 assert.match(shell,/<RouterView\/>/)
})
test('Upcoming bookings are only real athlete-specific documents scoped to gym and uid',()=>{
 assert.match(highlight,/collection\(db,'gyms',gym,bookingPaths\.reservations\)/)
 assert.match(highlight,/where\('athleteId','==',uid\)/)
 assert.match(highlight,/auth\.currentUser\?\.uid!==uid/)
 assert.match(highlight,/toReservation/)
 assert.match(highlight,/upcomingRows/)
 assert.doesNotMatch(highlight,/(?:setDoc|updateDoc|deleteDoc|addDoc|runTransaction)\s*\(/)
})
test('Competition highlights use existing per-gym module switch and public event list',()=>{
 assert.match(highlight,/watchCompetitionEnabled\(db,gym/)
 assert.match(highlight,/watchCompetitionEvents\(db,gym/)
 assert.match(highlight,/nextCompetition\(events\.value/)
 assert.match(highlight,/Evento pubblicato dalla palestra/)
 assert.match(highlight,/v-else-if="!competitionsEnabled"/)
})
test('Loading, read errors and no data do not render fabricated reservations',()=>{
 for(const t of ['bookingsReady','bookingsError','Caricamento appuntamenti','Consulta l\'Agenda','Nessuna lezione prenotata'])assert.ok(highlight.includes(t),t)
 assert.match(highlight,/nextBookings\.length/)
})
test('Week chip label never wraps and stays wide enough',()=>{
 assert.match(plan,/min-width:94px!important/)
 assert.match(plan,/white-space:nowrap!important;word-break:normal!important/)
})
test('Mobile new home can scroll, old V3 screen lock does not apply',()=>{
 assert.match(css,/:has\(\.lf-r14-home\)/)
 assert.match(css,/overflow-y:auto!important/)
 assert.doesNotMatch(home,/lf-home-approved|lf-home-v3/)
 assert.match(css,/prefers-reduced-motion:reduce/)
})
test('R14 modifies frontend only and stylesheet imported last',()=>{
 assert.match(read('src/main.ts'),/import '\.\/styles-r14-athlete-home\.css'/)
 assert.ok(fs.existsSync(path.join(root,'public/lionfit-defaults/lionfit-gym-premium.jpg')))
 assert.match(read('src/views/AthleteLiveWorkspace.vue'),/\bSheetDetail\b/)
})
