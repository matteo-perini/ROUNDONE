export const SPORTS = [
 {id:'swim',name:'Nuoto',desc:'Vasche, tempi e stili',color:'#1885bd'},
 {id:'run',name:'Corsa',desc:'Sprint, fondo e ritmo',color:'#d17a36'},
 {id:'cycle',name:'Ciclismo',desc:'Distanze, velocità e watt',color:'#328c70'},
 {id:'fight',name:'Sport da combattimento',desc:'Round, colpi e test',color:'#ad495e'},
 {id:'crossfit',name:'CrossFit',desc:'WOD, tempi e carichi',color:'#8672c7'},
 {id:'custom',name:'Personalizzata',desc:'Crea il tuo test atletico',color:'#308b62'},
] as const
export type Sport=typeof SPORTS[number]['id']
export const TYPES:Record<Sport,string[]>={swim:['Allenamento','Test','Gara'],run:['Sprint','Mezzofondo','Fondo','Test'],cycle:['Allenamento','Cronometro','Gara','Test'],fight:['Sacco','Colpitori','Sparring','Circuito','Test'],crossfit:['For Time','AMRAP','EMOM','Max reps','Custom'],custom:['Allenamento','Test','Gara']}
export const STYLES=['Stile libero','Dorso','Rana','Farfalla','Misti','Altro']
export const NUMBERS=['distanceM','poolM','durationSec','rounds','roundSec','restSec','hits','reps','loadKg','elevationM','watts','rpe','customValue'] as const
export type NumberField=typeof NUMBERS[number]
export type ResultData={sport:Sport;testName:string;disciplineName:string;kind:string;style:string;performedOn:string;notes:string;customUnit:string;direction:'higher'|'lower'|''; archived:boolean}&Record<NumberField,number|null>
export type Result=ResultData&{id:string;athleteId:string;createdBy:string;updatedBy:string;createdAt?:unknown;updatedAt?:unknown}
export const FIELDS:Record<NumberField,{label:string;min:number;max:number;step:number;unit:string}>={
 distanceM:{label:'Distanza',min:.01,max:2000000,step:.01,unit:'m'},poolM:{label:'Lunghezza piscina',min:1,max:200,step:.01,unit:'m'},durationSec:{label:'Tempo',min:.01,max:604800,step:.01,unit:'s'},rounds:{label:'Round',min:0,max:10000,step:1,unit:''},roundSec:{label:'Durata round',min:1,max:3600,step:1,unit:'s'},restSec:{label:'Recupero',min:0,max:3600,step:1,unit:'s'},hits:{label:'Colpi',min:0,max:1000000,step:1,unit:''},reps:{label:'Ripetizioni',min:0,max:1000000,step:1,unit:''},loadKg:{label:'Carico',min:0,max:2000,step:.01,unit:'kg'},elevationM:{label:'Dislivello positivo',min:0,max:30000,step:1,unit:'m'},watts:{label:'Potenza media',min:0,max:5000,step:1,unit:'W'},rpe:{label:'Sforzo percepito (RPE)',min:1,max:10,step:1,unit:'/10'},customValue:{label:'Risultato',min:-100000000,max:100000000,step:.01,unit:''}}
export const ALLOWED:Record<Sport,NumberField[]>={swim:['distanceM','poolM','durationSec','rpe'],run:['distanceM','durationSec','rpe'],cycle:['distanceM','durationSec','elevationM','watts','rpe'],fight:['rounds','roundSec','restSec','hits','reps','durationSec','rpe'],crossfit:['rounds','reps','durationSec','loadKg','rpe'],custom:['customValue','distanceM','durationSec','reps','loadKg','rpe']}
export const REQUIRED:Record<Sport,NumberField[]>={swim:['distanceM','poolM','durationSec'],run:['distanceM','durationSec'],cycle:['distanceM','durationSec'],fight:['rounds','roundSec'],crossfit:[],custom:['customValue']}
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export function blank(sport:Sport):ResultData{return {sport,testName:'',disciplineName:'',kind:TYPES[sport][0],style:sport==='swim'?STYLES[0]:'',performedOn:today(),notes:'',customUnit:'',direction:sport==='custom'?'higher':'',archived:false,...Object.fromEntries(NUMBERS.map(k=>[k,null]))} as ResultData}
export function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s&&s<=today()}
export function validate(r:ResultData):ResultData{
 if(!SPORTS.some(x=>x.id===r.sport)||!validDate(r.performedOn)||!r.testName.trim()||r.testName.trim().length>100||r.notes.length>1000||!TYPES[r.sport].includes(r.kind)||typeof r.archived!=='boolean')throw Error('Controlla nome, data e tipo di test.')
 if(r.sport==='swim'?!STYLES.includes(r.style):r.style!=='')throw Error('Stile non valido.')
 if(r.sport==='custom'?(!r.disciplineName.trim()||r.disciplineName.trim().length>60||!r.customUnit.trim()||r.customUnit.trim().length>24||!['higher','lower'].includes(r.direction)):(r.disciplineName!==''||r.customUnit!==''||r.direction!==''))throw Error('Indica disciplina, unità e direzione del miglioramento.')
 for(const k of NUMBERS){const n=r[k],f=FIELDS[k];if(n===null){if(REQUIRED[r.sport].includes(k))throw Error(`${f.label}: campo obbligatorio.`);continue}if(!ALLOWED[r.sport].includes(k)||typeof n!=='number'||!Number.isFinite(n)||n<f.min||n>f.max||(f.step===1&&!Number.isInteger(n)))throw Error(`${f.label}: valore non valido.`)}
 if(r.sport==='fight'&&r.rounds===0)throw Error('Inserisci almeno un round.')
 if(r.sport==='crossfit'&&((r.kind==='For Time'&&r.durationSec===null)||(r.kind==='AMRAP'&&(r.durationSec===null||(r.rounds===null&&r.reps===null)))||(r.kind==='EMOM'&&(r.durationSec===null||(r.rounds===null&&r.reps===null)))||(r.kind==='Max reps'&&r.reps===null)||(r.kind==='Custom'&&r.durationSec===null&&r.rounds===null&&r.reps===null&&r.loadKg===null)))throw Error('Inserisci il risultato richiesto dal tipo di WOD.')
 return {...r,testName:r.testName.trim(),disciplineName:r.disciplineName.trim(),customUnit:r.customUnit.trim()}
}
export function seconds(h:string,m:string,s:string,c:string){if([h,m,s,c].every(x=>x===''))return null;const ns=[h,m,s,c].map(x=>x===''?0:Number(x));if(ns.some(x=>!Number.isInteger(x)||x<0)||ns[0]>168||ns[1]>59||ns[2]>59||ns[3]>99)throw Error('Tempo non valido: usa ore, minuti, secondi e centesimi.');return ns[0]*3600+ns[1]*60+ns[2]+ns[3]/100}
export function timeLabel(n:number){const v=Math.round(n*100),h=Math.floor(v/360000),m=Math.floor(v/6000)%60,s=Math.floor(v/100)%60,c=v%100;return `${h?h+':'+String(m).padStart(2,'0'):m}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`}
export const numberLabel=(n:number)=>n.toLocaleString('it-IT',{maximumFractionDigits:2})
export function valueLabel(r:ResultData,k:NumberField){const n=r[k];if(n===null)return '—';return k==='durationSec'||k==='roundSec'||k==='restSec'?timeLabel(n):`${numberLabel(n)}${k==='customValue'?' '+r.customUnit:FIELDS[k].unit?' '+FIELDS[k].unit:''}`}
export type Metric=NumberField|'pace'|'speed'
export const metrics=(sport:Sport):Metric[]=>sport==='swim'||sport==='run'?['durationSec','pace','speed']:sport==='cycle'?['durationSec','speed','watts']:sport==='fight'?['rounds','hits','reps','durationSec']:sport==='crossfit'?['durationSec','rounds','reps','loadKg']:['customValue','durationSec','reps','loadKg']
export function metricValue(r:ResultData,m:Metric):number|null{if(m==='pace')return r.distanceM&&r.durationSec?r.durationSec*(r.sport==='swim'?100:1000)/r.distanceM:null;if(m==='speed')return r.distanceM&&r.durationSec?r.distanceM/r.durationSec*3.6:null;return r[m]}
export function metricLabel(m:Metric){return m==='pace'?'Passo medio':m==='speed'?'Velocità media':FIELDS[m].label}
export function metricText(r:ResultData,m:Metric,v:number){if(m==='pace')return timeLabel(v)+(r.sport==='swim'?' /100 m':' /km');if(m==='speed')return numberLabel(v)+' km/h';if(m==='durationSec')return timeLabel(v);return numberLabel(v)+(m==='customValue'?' '+r.customUnit:FIELDS[m].unit?' '+FIELDS[m].unit:'')}
export function lower(r:ResultData,m:Metric){return m==='durationSec'||m==='pace'||(m==='customValue'&&r.direction==='lower')}
const norm=(v:string)=>v.trim().toLocaleLowerCase('it')
export function seriesKey(r:ResultData,m:Metric){return JSON.stringify([r.sport,norm(r.testName),norm(r.disciplineName),r.kind,r.style,r.distanceM,r.poolM,r.sport==='cycle'?r.elevationM:null,r.sport==='fight'?r.roundSec:null,r.sport==='fight'?r.restSec:null,r.sport==='crossfit'&&m!=='loadKg'?r.loadKg:null,r.sport==='crossfit'&&(r.kind==='AMRAP'||r.kind==='EMOM')?r.durationSec:null,r.customUnit,r.direction])}
export function comparable(rows:Result[],example:Result,m:Metric){return rows.filter(r=>!r.archived&&seriesKey(r,m)===seriesKey(example,m)&&metricValue(r,m)!==null).sort((a,b)=>a.performedOn.localeCompare(b.performedOn)||a.id.localeCompare(b.id))}
