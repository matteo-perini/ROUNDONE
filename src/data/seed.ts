import type { LabData,Sheet,Exercise } from '../model'
import {normalizeDay} from '../features/sheets/domain'
const ex=(id:string,name:string,sets=3,reps='20',rest='60 sec'):Exercise=>({id,name,sets,reps,rest})
const template=(id:string,title:string,category:string,exercises:Exercise[]):Sheet=>({id,title,category,exercises})
const days=['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica']
const activities=[['MMA G&P','Mobilità'],['MMA ST','Grappling','Mobilità'],['Crossfit','MMA WE','Mobilità'],['MMA','Grappling','Mobilità'],['MMA G&P','Mobilità'],['Ipertrofia'],['Riposo']]
const mobility=[ex('m1','Voltabraccia'),ex('m2','Intra rotazione e extra rotazione'),ex('m3','YTWL'),ex('m4','Pain free shoulders'),ex('m5','Anche con palla'),ex('m6','Copenhagen plank',3,'30 sec'),ex('m7','Knee to wall'),ex('m8','Rullata',3,'20 mt')]
const ipertrofia=[ex('i1','Distensioni su panca piana con bilanciere a presa larga',4,'10','90 sec')]
export const seed:LabData={
 athletes:[{id:'marco',name:'TEST33',email:'atleta1@esempio.test'},{id:'luca',name:'Mario Rossi',email:'atleta2@esempio.test'}],
 weeks:['marco','luca'].flatMap(athleteId=>[1,2,3,4].map(n=>({id:`${athleteId}-w${n}`,name:'Settimana '+n,athleteId,startDate:`2026-11-${String(1+7*(n-1)).padStart(2,'0')}`,days:days.map((name,i)=>normalizeDay({name,activities:[...activities[i]],templateId:athleteId==='marco'&&n===1&&i<4?'a1':athleteId==='marco'&&n===1&&i===5?'a2':''}))}))),
 templates:[template('mob','MOBILITÀ','Mobilità',mobility),template('iper','IPERTROFIA (copia)','Ipertrofia',ipertrofia),template('pot','POTENZA','Potenza',[ex('p1','Squat con bilanciere',4,'5','120 sec')])],
 assignments:[{id:'a1',title:'MOBILITÀ',category:'Mobilità',sourceId:'mob',athleteId:'marco',exercises:mobility},{id:'a2',title:'IPERTROFIA (copia)',category:'Ipertrofia',sourceId:'iper',athleteId:'marco',exercises:ipertrofia}],
 protectedArchives:[
  {id:'a1',athleteId:'marco',sourceTemplateId:'a1',title:'MOBILITÀ',exercises:JSON.parse(JSON.stringify(mobility)) as Exercise[],archiveVersion:1,archivedAt:'2026-11-01',archivedBy:'coach'},
  {id:'a2',athleteId:'marco',sourceTemplateId:'a2',title:'IPERTROFIA (copia)',exercises:JSON.parse(JSON.stringify(ipertrofia)) as Exercise[],archiveVersion:1,archivedAt:'2026-11-01',archivedBy:'coach'}
 ],archiveExclusions:[],bookings:[],history:[]
}
