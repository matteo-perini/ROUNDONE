import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {groupActivePrograms,programForWeek,firstVacantMonday,activeWeekOn} from '../src/features/sheets/programFamilies.ts'
import {advanceV1Monday,initialV1WeekDocument,planV1WeekCopies,duplicateV1WeekDocument} from '../src/features/sheets/v1WeekCodec.ts'
import {programOverview} from '../src/features/athletes/programOverview.ts'

const source=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const a={id:'w1',name:'Preparazione · Settimana 1',programTitle:'Preparazione',startDate:'2026-11-16',days:[]}
const b={id:'w2',name:'Preparazione · Settimana 2',programTitle:'Preparazione',startDate:'2026-11-30',days:[]}
const c={id:'w3',programId:'second',name:'Preparazione · Settimana 1',programTitle:'Preparazione',startDate:'2026-12-07',days:[]}
const d={id:'w4',programId:'second',name:'Preparazione · Settimana 2',programTitle:'Preparazione',startDate:'2026-12-14',days:[]}

test('Duplica settimana: titolo e ID programma restano identici; nuovo lunedì',()=>{
 const origin={...initialV1WeekDocument('Preparazione',1,2,'2026-11-16'),programId:'legacy-id'}
 const firstDay=Object.keys(origin.days)[0]
 origin.days[firstDay].templateId='scheda-1'
 const [first,second]=planV1WeekCopies(origin,'2026-12-21',2)
 assert.equal(first.programId,'legacy-id')
 assert.equal(first.programTitle,'Preparazione')
 assert.equal(first.startDate,'2026-12-21')
 assert.equal(second.startDate,'2026-12-28')
 assert.equal(first.days[firstDay].templateId,'scheda-1')
 assert.notEqual(first.days,origin.days)
 first.days[firstDay].templateId='modificata'
 assert.equal(origin.days[firstDay].templateId,'scheda-1')
 assert.ok(!first.programTitle.includes('Copia'))
})
test('Legacy con (Copia) non genera nuove diciture (Copia)',()=>{
 const original=initialV1WeekDocument('Preparazione (Copia)',1,1,'2026-11-16')
 assert.equal(duplicateV1WeekDocument(original,'2026-11-23').programTitle,'Preparazione')
})
test('Programmi separati anche se hanno lo stesso nome; settimane riavviate a 1',()=>{
 const result=groupActivePrograms([a,c,d,b])
 assert.equal(result.length,2)
 assert.equal(result[0].weeks.length,2)
 assert.equal(result[1].weeks.length,2)
 assert.equal(result[0].startDate,'2026-11-16')
 assert.equal(result[0].endDate,'2026-12-06')
 assert.equal(result[1].endDate,'2026-12-20')
 assert.equal(programForWeek(result,'w4').id,'id:second')
 assert.deepEqual(result[1].weeks.map(w=>w.id),['w3','w4'])
})
test('Settimana di ferie lasciata libera, stessa identità del programma',()=>{
 const groups=groupActivePrograms([a,b])
 assert.equal(groups.length,1)
 assert.equal(groups[0].weeks.length,2)
 assert.equal(activeWeekOn(groups[0].weeks,'2026-11-23'),undefined)
 assert.equal(activeWeekOn(groups[0].weeks,'2026-11-30').id,'w2')
 assert.equal(firstVacantMonday([a,b],'2026-11-16',advanceV1Monday),'2026-11-23')
})
test('Lunedì obbligatorio, duplicazioni sequenziali anche al cambio anno',()=>{
 assert.equal(advanceV1Monday('2026-12-28',1),'2027-01-04')
 assert.throws(()=>advanceV1Monday('2026-11-17',1),/lunedi/i)
 assert.throws(()=>initialV1WeekDocument('X',1,1,'2026-11-17'),/lunedì/i)
 assert.throws(()=>planV1WeekCopies(initialV1WeekDocument('X',1,1,'2026-11-16'),'2026-11-23',13),/1–12/)
})
test('Riepilogo programma con pausa non crea cicli fantasma',()=>{
 const duringBreak=programOverview([a,b],new Date('2026-11-25T12:00:00Z'))
 assert.equal(duringBreak.title,'Preparazione')
 assert.equal(duringBreak.phase,'active')
 assert.equal(duringBreak.remainingLabel,'Settimana di pausa')
 const future=programOverview([a,b,c,d],new Date('2026-11-13T12:00:00Z'))
 assert.equal(future.title,'Preparazione')
 assert.equal(future.phase,'future')
 const activeSecond=programOverview([a,b,c,d],new Date('2026-12-11T12:00:00Z'))
 assert.equal(activeSecond.totalWeeks,2)
})
test('Contratti UI e backend: duplicazione scelta da Coach, data lunedì, ogni programma con ID',()=>{
 const coach=source('src/views/LiveCoachAthletes.vue')
 const athlete=source('src/components/AthletePlanContent.vue')
 const store=source('src/integrations/firestore/programs.ts')
 assert.match(coach,/v-model="duplicateTargetMonday" type="date"/)
 assert.match(coach,/validProgramMonday\(target\)/)
 assert.match(coach,/copyDates\.some\(date=>occupied\.has\(date\)\)/)
 assert.match(coach,/v-for="\(program,programIndex\) in programs"/)
 assert.match(athlete,/SELEZIONA PROGRAMMA/)
 assert.match(athlete,/v-for="\(p,i\) in programs"/)
 assert.match(store,/programId:targets\[0\]\.id/)
 assert.match(store,/startMonday<=lastDate/)
 assert.match(store,/activeWeekDateConflict/)
 assert.match(coach,/color-scheme:dark/)
 assert.match(coach,/color-scheme:light/)
})
