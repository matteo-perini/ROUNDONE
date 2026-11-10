import assert from 'node:assert/strict'
import {uniqueProgressSheets,emptyEntries,normalizeEntries,exerciseSeries,sheetSummary,progressMetrics,validDate} from '../src/features/progress/progressModel.ts'
const p={id:'aaa',athleteId:'u',title:'Scheda A',category:'pesi',exercises:[{name:'Panca',sets:4,reps:'8'},{name:'Squat',sets:'3',reps:'10'}]}
const arch=[{id:'aaa',sourceTemplateId:'aaa',title:'Vecchia Scheda',exercises:p.exercises},{id:'bbb',sourceTemplateId:'bbb',title:'Scheda B',exercises:[{name:'Alzate',sets:3,reps:'12'}]}]
const sheets=uniqueProgressSheets([p],arch)
assert.equal(sheets.length,2);assert.equal(sheets.find(x=>x.id==='aaa').title,'Scheda A')
const entries=emptyEntries(sheets.find(x=>x.id==='aaa'))
assert.equal(entries[0].sets.length,4)
entries[0].sets[0]={kg:60,reps:8};entries[0].sets[1]={kg:65,reps:8}
entries[1].skipped=true;entries[1].sets[0]={kg:120,reps:4}
const normalized=normalizeEntries(entries)
assert.equal(normalized[1].sets.length,0)
assert.equal(progressMetrics(normalized).completed,1)
assert.equal(progressMetrics(normalized).volume,1000)
const session={id:'session1',athleteId:'u',sheetId:'aaa',sheetTitle:'Scheda A',performedOn:'2026-11-10',createdBy:'u',exercises:normalized}
assert.equal(exerciseSeries([session],'aaa','position:0',8)[0].kg,65)
assert.equal(exerciseSeries([session],'aaa','position:0',3).length,0)
assert.equal(sheetSummary([session],'aaa')[0].completed,1)
assert.equal(validDate('2026-02-31'),false);assert.equal(validDate('2026-02-28'),true)
assert.throws(()=>normalizeEntries([{...entries[0],sets:[{kg:3000,reps:4}]}]),/Carico/)
console.log('Progressi 360 — 11 test completati PASS')
