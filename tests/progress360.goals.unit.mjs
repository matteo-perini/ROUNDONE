import assert from 'node:assert/strict'
import {normalizeGoal,shownGoals,validGoalDate,statusLabel} from '../src/features/progress/goalsModel.ts'
assert.deepEqual(normalizeGoal({title:'  Panca 80 kg  ',notes:'  Arrivare a cinque ripetizioni  ',dueDate:''}),{title:'Panca 80 kg',notes:'Arrivare a cinque ripetizioni',dueDate:''})
assert.equal(validGoalDate('2026-02-30'),false)
assert.equal(validGoalDate('2026-02-28'),true)
assert.equal(validGoalDate(''),true)
assert.throws(()=>normalizeGoal({title:' ',notes:'xx',dueDate:''}),/titolo/)
assert.throws(()=>normalizeGoal({title:'Forza',notes:' ',dueDate:''}),/nota/)
assert.throws(()=>normalizeGoal({title:'Forza',notes:'x',dueDate:'2026-02-30'}),/scadenza/)
const base={athleteId:'athlete-A',notes:'ciao',dueDate:'',createdBy:'coach'}
const goals=[{...base,id:'one',title:'A',status:'archived'},{...base,id:'two',title:'B',status:'reached'},{...base,id:'three',title:'C',status:'active'}]
assert.deepEqual(shownGoals(goals).map(x=>x.id),['three','two'])
assert.deepEqual(shownGoals(goals,true).map(x=>x.id),['three','two','one'])
assert.equal(statusLabel('reached'),'Raggiunto')
console.log('Progressi 360 — 11 test Obiettivi PASS')
