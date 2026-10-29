'use strict';
// Lion Fit V12 — preparazione locale dei nomi italiani, NON modifica gli ID o gli SVG.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname);
const base=path.join(root,'www','exercise-library','data');
const origPath=path.join(base,'exercises.json');
const itPath=path.join(base,'exercises-it.json');
if(!fs.existsSync(origPath)||!fs.existsSync(itPath)){
 console.error('ERRORE: mancano exercises.json o exercises-it.json in www/exercise-library/data.'); process.exit(1);
}
const original=JSON.parse(fs.readFileSync(origPath,'utf8'));
const target=JSON.parse(fs.readFileSync(itPath,'utf8'));
const entries=target.entries;
if(!Array.isArray(original)||original.length!==1324||!entries||typeof entries!=='object'){
 console.error('ERRORE: catalogo inatteso, nessuna modifica eseguita.');process.exit(1);
}
if(original.some(e=>!entries[e.id]||entries[e.id].name_en!==e.name)){
 console.error('ERRORE: ID o nomi inglesi non corrispondono. Nessuna modifica eseguita.');process.exit(1);
}
const phrase=[
 ['barbell','con bilanciere'],['dumbbell','con manubrio'],['dumbbells','con manubri'],['kettlebell','con kettlebell'],['cable','ai cavi'],['smith','alla smith machine'],['band','con elastico'],['resistance band','con elastico'],['bodyweight','a corpo libero'],['body weight','a corpo libero'],['medicine ball','con palla medica'],['stability ball','con fitball'],['exercise ball','con fitball'],['ez barbell','con bilanciere EZ'],['ez bar','con bilanciere EZ'],['lever','alla macchina'],['weighted','con sovraccarico'],['assisted','assistito'],['incline','inclinato'],['decline','declinato'],['seated','da seduto'],['standing','in piedi'],['lying','da sdraiato'],['side lying','sdraiato sul fianco'],['one arm','a un braccio'],['single arm','a un braccio'],['one leg','a una gamba'],['single leg','a una gamba'],['alternating','alternato'],['alternate','alternato'],['reverse grip','presa inversa'],['underhand','presa supina'],['overhand','presa prona'],['neutral grip','presa neutra'],['close grip','presa stretta'],['wide grip','presa larga'],['narrow grip','presa stretta'],['hammer grip','presa a martello'],['behind neck','dietro la nuca'],['front','frontale'],['rear','posteriore'],['back','posteriore'],['lateral','laterale'],['side','laterale'],['bent over','a busto flesso'],['bent-over','a busto flesso'],['hip','anca'],['chest','petto'],['shoulder','spalle'],['triceps','tricipiti'],['biceps','bicipiti'],['calf','polpaccio'],['calves','polpacci'],['hamstring','femorali'],['quadriceps','quadricipiti'],['glute','gluteo'],['glutes','glutei'],['abdominal','addominale'],['abs','addominali'],['wrist','polso'],['forearm','avambraccio'],['leg','gamba'],['legs','gambe'],['arm','braccio'],['arms','braccia'],['knee','ginocchio'],['knees','ginocchia'],['neck','collo'],['lower','inferiore'],['upper','superiore'],['inner','interno'],['outer','esterno'],['single','singolo'],['double','doppio'],['parallel','parallelo'],['hanging','in sospensione'],['floor','a terra'],['bench','su panca'],['machine','alla macchina'],['ball','con palla'],['rope','con corda'],['plate','con disco'],['step','su step']
];
const movements=[
 ['bench press','distensioni su panca'],['chest press','spinte per il petto'],['shoulder press','spinte per le spalle'],['military press','military press'],['overhead press','spinte sopra la testa'],['push up','piegamenti sulle braccia'],['push-up','piegamenti sulle braccia'],['pull up','trazioni alla sbarra'],['pull-up','trazioni alla sbarra'],['chin up','trazioni presa supina'],['chin-up','trazioni presa supina'],['lat pulldown','lat machine'],['pulldown','trazioni al cavo alto'],['pushdown','spinte al cavo alto'],['deadlift','stacco da terra'],['romanian deadlift','stacco rumeno'],['squat','squat'],['lunge','affondo'],['lunges','affondi'],['leg press','pressa per le gambe'],['leg extension','estensioni delle gambe'],['leg curl','leg curl'],['biceps curl','curl per i bicipiti'],['curl','curl'],['triceps extension','estensione dei tricipiti'],['extension','estensione'],['raise','alzata'],['raises','alzate'],['lateral raise','alzata laterale'],['front raise','alzata frontale'],['fly','croce'],['flyes','croci'],['row','rematore'],['rowing','rematore'],['shrug','scrollata'],['shrugs','scrollate'],['crunch','crunch'],['sit-up','sit-up'],['sit up','sit-up'],['plank','plank'],['bridge','ponte'],['hip thrust','spinta d’anca'],['hip extension','estensione dell’anca'],['hip abduction','abduzione dell’anca'],['hip adduction','adduzione dell’anca'],['stretch','allungamento'],['stretching','allungamento'],['rotation','rotazione'],['twist','torsione'],['jump','salto'],['jumps','salti'],['jumping','con salto'],['dip','dip'],['dips','dip'],['kickback','estensione all’indietro'],['press','spinta'],['pressdown','spinta verso il basso'],['pull','trazione'],['push','spinta'],['hold','tenuta'],['walk','camminata'],['walking','in camminata'],['run','corsa'],['running','corsa'],['rollout','rotolamento in avanti'],['ab wheel','ruota per addominali'],['handstand','verticale'],['wall sit','sedia al muro'],['good morning','good morning']
];
const all=[...movements,...phrase].sort((a,b)=>b[0].length-a[0].length);
const unitWords=new Set('the with and or on of in to from for at by using supported support exercise exercises male female left right dynamic static slight slightly hold fixed straight bent full half internal external 45 90 180 degree degrees'.split(' '));
function draftName(name){
 let rest=name.toLowerCase().replace(/\(male\)|\(female\)/g,'').replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
 let parts=[];
 // Atomic longest-phrase scan, fail if any unrecognized word remains.
 while(rest){
   rest=rest.replace(/^[\s,;:\-/]+/,'');if(!rest)break;
   let found=false;
   for(const [en,it] of all){
     if(rest===en||rest.startsWith(en+' ')||rest.startsWith(en+'-')){
       parts.push(it);rest=rest.slice(en.length);found=true;break;
     }
   }
   if(found)continue;
   const match=rest.match(/^([a-z]+|\d+(?:\/\d+)?|\d+°)/);
   if(!match)return null;
   const w=match[1];
   if(!unitWords.has(w))return null;
   if(!['the','and','or','of','using','male','female','exercise','exercises'].includes(w))parts.push(({with:'con',on:'su',in:'in',to:'a',from:'da',for:'per',at:'a',by:'con',left:'sinistro',right:'destro',straight:'teso',bent:'flesso',full:'completo',half:'mezzo',degree:'gradi',degrees:'gradi',supported:'supportato',support:'supporto',dynamic:'dinamico',static:'statico',slight:'leggero',slightly:'leggermente',hold:'tenuta',fixed:'fisso',internal:'interno',external:'esterno'})[w]||w);
   rest=rest.slice(w.length);
 }
 const translated=parts.join(' ').replace(/\s+/g,' ').trim();
 if(!translated || translated.length<5)return null;
 return translated[0].toUpperCase()+translated.slice(1);
}
const backup=itPath+'.backup-v11-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.json';
if(!fs.existsSync(backup))fs.copyFileSync(itPath,backup);
let added=0,kept=0,notTranslated=[];
for(const ex of original){
 const item=entries[ex.id];
 if(item.name_it){kept++;continue;}
 const name=draftName(ex.name);
 if(name && name.toLowerCase()!==ex.name.toLowerCase()){
   item.name_it=name;
   item.translationStatus='generated_unreviewed';
   item.aliases_it=Array.isArray(item.aliases_it)?item.aliases_it:[];
   added++;
 }else notTranslated.push({id:ex.id,name_en:ex.name});
}
target.schemaVersion='1.2.0';target.exerciseCount=original.length;
target.generatedUnreviewedNameCount=Object.values(entries).filter(x=>x.translationStatus==='generated_unreviewed').length;
target.approvedNameCount=Object.values(entries).filter(x=>x.translationStatus==='name_seed'||x.translationStatus==='approved').length;
const temp=itPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(target,null,2),'utf8');fs.renameSync(temp,itPath);
const csv='id;nome_inglese\n'+notTranslated.map(x=>`${x.id};"${x.name_en.replace(/"/g,'""')}"`).join('\n');
fs.writeFileSync(path.join(base,'nomi_da_revisionare_v12.csv'),'\ufeff'+csv,'utf8');
console.log('LION FIT V12 - NOMI ITALIANI OFFLINE');
console.log('ID controllati:',original.length);
console.log('Nomi preesistenti preservati:',kept);
console.log('Nuovi nomi generati (DA REVISIONARE):',added);
console.log('Nomi inglesi mantenuti:',notTranslated.length);
console.log('Istruzioni italiane preservate (se presenti nel tuo JSON).');
console.log('Backup:',path.basename(backup));
console.log('I nomi generati sono BOZZE: controlla sempre che descrivano il movimento corretto.');
console.log('COMPLETATO. Premi un tasto per chiudere.');
