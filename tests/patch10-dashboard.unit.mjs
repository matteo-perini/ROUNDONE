import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {summarizeAthletePrograms,upcomingDashboardBookings,buildDashboardActivity,romeDay} from '../src/features/coach/dashboardLiveModel.ts'
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const now=Date.parse('2026-11-13T12:00:00Z')
const date=(iso)=>Date.parse(iso)
const rows=[{athleteId:'ath1',weeks:[
 {id:'w1',name:'Forza - Settimana 1',programTitle:'Forza',days:{lunedi:{templateId:'p1',templateId2:'p2'},martedi:{templateId:'p1',templateId2:''}},createdMs:date('2026-11-12T10:00:00Z')},
 {id:'w2',name:'Forza - Settimana 2',programTitle:'Forza',days:{lunedi:{templateId:'p2'}}},
 {id:'trash',name:'Cestino',programTitle:'Cestino',deletedAt:'2026-11-01',days:{lunedi:{templateId:'p3'}}}
],personal:[{id:'p1'},{id:'p2'},{id:'p3',deletedAt:'2026-11-01'},{id:'p4'}]},
 {athleteId:'ath2',weeks:[],personal:[{id:'p2'}]}]
test('Distribuzione reale per Atleta, programmi deduplicati per titolo, Cestino escluso',()=>{
 const stats=summarizeAthletePrograms(rows)
 assert.equal(stats.programs,1)
 assert.equal(stats.athletesWithProgram,1)
 assert.equal(stats.activeWeeks,2)
 assert.equal(stats.assigned,2)
 assert.equal(stats.unassigned,2)
 assert.equal(stats.weeksForActivity.length,1)
})
test('Casi vuoti: conteggi veri zero, non valori simulati',()=>{
 assert.deepEqual({...summarizeAthletePrograms([]),weeksForActivity:[]},{programs:0,athletesWithProgram:0,activeWeeks:0,assigned:0,unassigned:0,weeksForActivity:[]})
})
test('Eventi del programma con giorni in formato mappa Firestore',()=>{
 const d=summarizeAthletePrograms([{athleteId:'a',weeks:[{id:'w',name:'N',days:{lun:{templateId:'one',templateId2:'one'},mar:{templateId:'other'}}}],personal:[{id:'one'},{id:'other'}]}])
 assert.equal(d.assigned,2)
})
test('Prenotazioni confermate ordinate e relative a un solo periodo futuro',()=>{
 const b=[{id:'future',athleteId:'ath1',coachId:'c2',startMs:now+3600000,discipline:'MMA',service:'fighter',status:'confirmed'},
 {id:'cancel',athleteId:'ath1',coachId:'c2',startMs:now+1800000,discipline:'MMA',service:'fighter',status:'cancelled'},
 {id:'past',athleteId:'ath1',coachId:'c2',startMs:now-1000,discipline:'MMA',service:'fighter',status:'confirmed'},
 {id:'out',athleteId:'ath1',coachId:'c2',startMs:now+61*86400000,discipline:'MMA',service:'fighter',status:'confirmed'}]
 const found=upcomingDashboardBookings(b,now,{ath1:'Elena'},'c1')
 assert.deepEqual(found.map(x=>x.id),['future'])
 assert.equal(found[0].athleteName,'Elena')
 assert.equal(found[0].coachName,'Coach della palestra')
})
test('Grafico 30 giorni: eventi reali, senza contare cancellati o schede nel cestino',()=>{
 const b=[{id:'b1',athleteId:'ath1',coachId:'c1',startMs:now-1000,createdMs:now-3000,discipline:'Boxe',service:'fighter',status:'confirmed'},
 {id:'b2',athleteId:'ath1',coachId:'c1',startMs:now-2000,createdMs:now-4000,discipline:'Boxe',service:'fighter',status:'cancelled'}]
 const t=[{id:'t1',title:'Scheda nuova',createdMs:now-1000},{id:'t2',title:'Cestinata',createdMs:now-1000,deletedAt:'yesterday'},{id:'t3',title:'Storica senza data'}]
 const {days,recent}=buildDashboardActivity(b,t,summarizeAthletePrograms(rows).weeksForActivity,now)
 assert.equal(days.length,30)
 assert.equal(days.reduce((n,d)=>n+d.booking,0),1)
 assert.equal(days.reduce((n,d)=>n+d.template,0),1)
 assert.equal(days.reduce((n,d)=>n+d.week,0),1)
 assert.equal(recent.length,3)
 assert.equal(days.at(-1).date,romeDay(now))
})
test('UI: pannelli realmente popolati, funzioni nel menu mobile preservate via scorciatoie',()=>{
 const c=read('src/components/CoachDashboardRedesign.vue')
 assert.match(c,/v-for="booking in upcoming"/)
 assert.match(c,/v-for="day in days"/)
 assert.match(c,/v-for="event in recent"/)
 assert.match(c,/Coach e Staff/)
 assert.match(c,/Cestino/)
 assert.match(c,/emit\('refresh-programs'\)/)
})
test('Mobile: spariti hamburger e drawer Coach ma navbar inferiore e sidebar desktop presenti',()=>{
 const c=read('src/App.vue'),css=read('src/styles.css')
 assert.doesNotMatch(c,/mobile-coach-menu-btn|coachMenuOpen|coach-mobile-shade|mobile-sidebar-open/)
 assert.match(c,/class="desktop-sidebar"/)
 assert.match(c,/class="bottom-nav coach-bottom"/)
 assert.match(css,/@media\(max-width:900px\)\{\.as-coach \.desktop-sidebar\{display:none!important/)
})
test('Schede cestinate: filtro visivo e regola transazionale già presenti (non modificate)',()=>{
 const c=read('src/views/LiveCoachAthletes.vue'),server=read('src/integrations/firestore/sheets.ts')
 assert.match(c,/snap\.docs\.filter\(d=>!d\.data\(\)\.deletedAt\)/)
 assert.match(server,/if\(!model\.exists\(\)\|\|model\.data\(\)\.deletedAt\)throw/)
})
