import assert from 'node:assert/strict'
import {groupSheets,normalizeDay,DAY_NAMES} from '../src/features/sheets/domain.ts'
import {romeDayIndex,romeWeekDayNumber,isDateInStoredWeek} from '../src/features/athletes/romeWeekProgress.ts'
const athlete='athlete-x'
const personal=(id,planDetached=false)=>({id,title:'Scheda '+id,athleteId:athlete,category:'Pesi',exercises:[{name:'Squat',sets:3,reps:'8'}],planDetached})
const week=(name,links=[],startDate='2026-11-09')=>({id:name,name,athleteId:athlete,startDate,days:DAY_NAMES.map((name,i)=>normalizeDay({name,templateId:links.find(l=>l.day===i)?.id||'',templateId2:''}))})
let cases=0
function check(label,fn){fn();cases++;console.log('PASS',label)}
check('scheda esplicitamente assegnata senza programma resta visibile',()=>{
 const g=groupSheets([personal('A')],[week('w')],athlete);assert.deepEqual(g.unprogrammed.map(x=>x.sheet.id),['A'])
})
check('scheda scollegata e marcata non ricompare senza programma',()=>{
 const g=groupSheets([personal('A',true)],[week('w')],athlete);assert.equal(g.programmed.length,0);assert.equal(g.unprogrammed.length,0)
})
check('scheda marcata ma ancora collegata altrove resta in programma',()=>{
 const g=groupSheets([personal('A',true)],[week('w',[{day:2,id:'A'}])],athlete);assert.deepEqual(g.programmed.map(x=>x.sheet.id),['A']);assert.equal(g.unprogrammed.length,0)
})
check('due schede, scollegata A nascosta, indipendente B visibile',()=>{
 const g=groupSheets([personal('A',true),personal('B')],[week('w')],athlete);assert.deepEqual(g.unprogrammed.map(x=>x.sheet.id),['B'])
})
check('lunedì italiano 9 novembre 2026 è 1/7 anche con programma domenica',()=>{
 const time=Date.parse('2026-11-09T14:51:00+01:00');assert.equal(romeDayIndex(time),0);assert.equal(romeWeekDayNumber(time),1);assert.equal(isDateInStoredWeek('2026-11-08',time),true)
})
check('martedì 2/7 e domenica 7/7 indipendenti da attività',()=>{
 assert.equal(romeWeekDayNumber(Date.parse('2026-11-10T18:00:00+01:00')),2)
 assert.equal(romeWeekDayNumber(Date.parse('2026-11-15T18:00:00+01:00')),7)
})
check('al lunedì successivo torna a 1/7',()=>{
 assert.equal(romeWeekDayNumber(Date.parse('2026-11-16T00:15:00+01:00')),1)
})
check('fuso Rome intorno alla mezzanotte: UTC domenica è già lunedì locale',()=>{
 assert.equal(romeWeekDayNumber(Date.parse('2026-11-08T23:30:00Z')),1)
})
check('settimana selezionata fuori periodo non evidenzia oggi',()=>{
 assert.equal(isDateInStoredWeek('2026-10-26',Date.parse('2026-11-09T14:51:00+01:00')),false)
})
check('fine mese e cambio ora legale: lunedì resta lunedì',()=>{
 assert.equal(romeWeekDayNumber(Date.parse('2026-10-26T00:10:00+01:00')),1)
})
console.log(`TOT ${cases} regressioni PASS`)
