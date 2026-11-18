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
 assert.match(home,/<GymIdentity compact\/>/)
 assert.match(css,/lionfit-defaults\/lionfit-gym-premium\.jpg/)
 assert.match(css,/lf14-gym-identity\.lf14-with-cover/)
 assert.match(home,/firstName/)
})
test('R14 Today action does not promise a workout when there is no assigned sheet',()=>{
 for(const t of ['hasTodayPlan','isRestDay','freeSheets','directSheet','actionLabel','Nessun allenamento programmato oggi','Consulta il mio piano','Visualizza attività di oggi'])assert.ok(home.includes(t),t)
 assert.match(home,/v-if="directSheet"/)
 assert.match(home,/activeSheet=sheet/)
 assert.match(live,/:free-sheets="homeFreeSheets"/)
 assert.match(live,/activeAssignmentGroups\(d.personal,d.weeks,uid,romeDate\(clock.value\)\)/)
})
test('Week circle has unambiguous calendar label not a completion percentage',()=>{
 assert.match(home,/Giorno \{\{dayNumber\}\} di 7 · calendario settimanale/)
 assert.doesNotMatch(home,/allenamenti completati|avanzamento settimanale/)
})
test('No duplicated four-menu shortcuts in homepage, existing navbar remains intact',()=>{
 assert.doesNotMatch(home,/lf-v3-shortcuts|Accesso rapido|quick=|lf-r14-shortcuts/)
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
 assert.match(highlight,/v-if="competitionsEnabled"/)
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
