import assert from 'node:assert/strict'
import {advanceV1Monday,planV1WeekCopies,v1LinkedPersonalIds} from '../src/features/sheets/v1WeekCodec.ts'
import {groupSemanticCopies} from '../src/features/sheets/semanticDedup.ts'
import {romeWeekDayNumber} from '../src/features/athletes/romeWeekProgress.ts'
import {validateConfig} from '../src/features/bookings/bookingPolicy.ts'
let n=0
function check(label,run){run();n++;console.log('PASS',label)}
const week={programTitle:'Preparazione',days:{'lunedì':{activity1:'MMA',activity2:'Boxe',templateId:'id_scheda_1',templateId2:'id_scheda_2'},'martedì':{activity1:'OFF',activity2:'',templateId:'',templateId2:''}}}
check('1 copia preserva attività e collegamenti',()=>{const w=planV1WeekCopies(week,'2026-11-16',1);assert.equal(w.length,1);assert.equal(w[0].days['lunedì'].templateId2,'id_scheda_2');assert.equal(w[0].days['lunedì'].activity1,'MMA')})
check('3 duplicazioni consecutive da lunedì 16 novembre 2026',()=>{const w=planV1WeekCopies(week,'2026-11-16',3);assert.deepEqual(w.map(x=>x.startDate),['2026-11-16','2026-11-23','2026-11-30'])})
check('duplicate: tutte le copie hanno dati giorno separati',()=>{const w=planV1WeekCopies(week,'2026-11-16',3);w[0].days['lunedì'].activity1='Nuovo';assert.equal(w[1].days['lunedì'].activity1,'MMA');assert.equal(week.days['lunedì'].activity1,'MMA')})
check('duplicate: ID schede condivise non cambiano',()=>{const w=planV1WeekCopies(week,'2026-11-16',3);assert.deepEqual(w.map(v=>v1LinkedPersonalIds(v)),Array.from({length:3},()=>['id_scheda_1','id_scheda_2']))})
check('duplicate: limite di 12 copie',()=>{assert.throws(()=>planV1WeekCopies(week,'2026-11-16',13),/Numero/);assert.throws(()=>planV1WeekCopies(week,'2026-11-16',0),/Numero/)})
check('duplicate: data iniziale deve essere lunedì',()=>{assert.throws(()=>planV1WeekCopies(week,'2026-11-17',3),/lunedi/)})
check('duplicate: avanzamento intorno al cambio ora',()=>{assert.equal(advanceV1Monday('2026-10-26',1),'2026-11-02')})
const copies=[{id:'a',title:'Ipertrofia',exercises:[{name:'Panca',sets:3,reps:'8'}]},{id:'b',title:'Ipertrofia',exercises:[{name:'Panca',sets:3,reps:'8'}]},{id:'c',title:'Ipertrofia',exercises:[{name:'Panca',sets:4,reps:'8'}]}]
check('Archivio unisce solo copie identiche',()=>{const v=groupSemanticCopies(copies);assert.equal(v.length,2);assert.equal(v[0].copies.length,2)})
check('Archivio non unisce versioni con differenze vere',()=>{assert.notEqual(groupSemanticCopies(copies)[0].sheet.exercises[0].sets,groupSemanticCopies(copies)[1].sheet.exercises[0].sets)})
check('progressione settimana continua anche senza attività',()=>{assert.equal(romeWeekDayNumber(Date.parse('2026-11-10T12:00:00+01:00')),2)})
check('validazione config Coach mantiene vincoli 60/120',()=>{const base={coachId:'a',active:true,services:{fighter:true,pesi:true},durations:{fighter:60,pesi:120},noticeHours:12,cancelHours:12,maxDays:30,weekly:{},exceptions:{},holidays:[]};assert.equal(validateConfig(base),null);assert.equal(validateConfig({...base,durations:{fighter:90,pesi:120}}),'DURATA_NON_VALIDA')})
console.log(`Totale ${n} regressioni PATCH 05 PASS`)
