"use strict";
// Lion Fit V12 fase 2: traduzioni manuali di termini frequenti + report di revisione.
// Si appoggia al JSON IT che hai già sul tuo computer e NON tocca gli SVG.
const fs=require('fs'), path=require('path');
const dir=path.join(__dirname,'www','exercise-library','data');
const enPath=path.join(dir,'exercises.json'), itPath=path.join(dir,'exercises-it.json');
if(!fs.existsSync(enPath)||!fs.existsSync(itPath)){
 console.error('ERRORE: file originali mancanti in www/exercise-library/data.');process.exit(1);
}
let en,it;
try{en=JSON.parse(fs.readFileSync(enPath,'utf8'));it=JSON.parse(fs.readFileSync(itPath,'utf8'));}
catch(e){console.error('ERRORE lettura JSON:',e.message);process.exit(1);}
if(!Array.isArray(en)||en.length!==1324||!it.entries||Object.keys(it.entries).length!==1324||en.some(x=>!it.entries[x.id]||it.entries[x.id].name_en!==x.name)){
 console.error('ERRORE: ID e nomi inglesi del catalogo non corrispondono; nessun dato modificato.');process.exit(1);
}
const known={"3/4 sit-up":"Sit-up a tre quarti","45° side bend":"Flessione laterale del busto a 45°","air bike":"Bicicletta a terra","ankle circles":"Circonduzioni delle caviglie","archer pull up":"Trazioni alla sbarra ad arciere","archer push up":"Piegamenti ad arciere","alternate heel touchers":"Tocchi alternati dei talloni","backward jump":"Salto all'indietro","back and forth step":"Passo avanti e indietro","balance board":"Tavola propriocettiva","barbell bent arm pullover":"Pullover con bilanciere a gomiti flessi","barbell clean and press":"Girata e distensione con bilanciere","barbell clean-grip front squat":"Front squat con presa da girata","barbell close-grip bench press":"Distensioni su panca piana con bilanciere a presa stretta","barbell drag curl":"Drag curl con bilanciere","barbell front raise and pullover":"Alzata frontale e pullover con bilanciere","barbell full zercher squat":"Squat Zercher completo con bilanciere","barbell guillotine bench press":"Distensioni alla guillotine su panca con bilanciere","barbell hack squat":"Hack squat con bilanciere","barbell high bar squat":"Back squat con bilanciere alto","barbell jefferson squat":"Squat Jefferson con bilanciere","barbell jm bench press":"JM press con bilanciere su panca","barbell low bar squat":"Back squat con bilanciere basso","barbell lying preacher curl":"Curl su panca Scott da sdraiato con bilanciere","barbell lying triceps extension skull crusher":"Skull crusher con bilanciere da sdraiato","barbell narrow stance squat":"Squat con bilanciere a piedi stretti","barbell one arm snatch":"Strappo a un braccio con bilanciere","barbell pendlay row":"Rematore Pendlay con bilanciere","barbell pin presses":"Distensioni con bilanciere dai fermi","barbell preacher curl":"Curl con bilanciere alla panca Scott","barbell pullover":"Pullover con bilanciere","barbell rack pull":"Stacco dai supporti con bilanciere","barbell rear delt raise":"Alzate per deltoidi posteriori con bilanciere","barbell rear delt row":"Rematore per deltoidi posteriori con bilanciere","barbell reverse preacher curl":"Curl inverso alla panca Scott con bilanciere","barbell reverse wrist curl":"Curl inverso per i polsi con bilanciere","barbell seated behind head military press":"Military press con bilanciere dietro la nuca da seduto","barbell seated bradford rocky press":"Bradford press con bilanciere da seduto","barbell standing concentration curl":"Curl di concentrazione in piedi con bilanciere","barbell standing bradford press":"Bradford press in piedi con bilanciere","barbell standing wide-grip curl":"Curl con bilanciere a presa larga in piedi","barbell step-up":"Step-up con bilanciere","barbell stiff leg good morning":"Good morning con bilanciere a gambe tese","barbell thruster":"Thruster con bilanciere","barbell wide bench press":"Distensioni su panca piana con bilanciere a presa larga","barbell wide squat":"Squat con bilanciere a piedi larghi","barbell wide-grip upright row":"Tirate al mento con bilanciere a presa larga","barbell wrist curl v. 2":"Curl per i polsi con bilanciere, variante 2","barbell zercher squat":"Squat Zercher con bilanciere","basic toe touch (male)":"Tocco delle punte dei piedi","battling ropes":"Onde con corde da allenamento","bear crawl":"Camminata dell'orso","bench pull-ups":"Trazioni alla sbarra con supporto su panca","band bicycle crunch":"Crunch bicicletta con elastico","band concentration curl":"Curl di concentrazione con elastico","band hip lift":"Sollevamento del bacino con elastico","band horizontal pallof press":"Pallof press orizzontale con elastico","band pull through":"Pull-through con elastico","band reverse wrist curl":"Curl inverso per i polsi con elastico","band step-up":"Step-up con elastico","band vertical pallof press":"Pallof press verticale con elastico","band v-up":"V-up con elastico","band y-raise":"Alzate a Y con elastico","band close-grip push-up":"Piegamenti a presa stretta con elastico","band close-grip pulldown":"Lat pulldown a presa stretta con elastico","band twisting overhead press":"Spinta sopra la testa con rotazione ed elastico","band standing twisting crunch":"Crunch in piedi con rotazione ed elastico","band alternating v-up":"V-up alternato con elastico","band one arm standing low row":"Rematore basso in piedi a un braccio con elastico","band one arm twisting chest press":"Spinte per il petto a un braccio con rotazione ed elastico","band one arm twisting seated row":"Rematore da seduto a un braccio con rotazione ed elastico","band single leg split squat":"Split squat su una gamba con elastico","band standing rear delt row":"Rematore in piedi per deltoidi posteriori con elastico","barbell prone incline curl":"Curl con bilanciere prono su panca inclinata","barbell rollerout":"Rollout con bilanciere","barbell rollerout from bench":"Rollout con bilanciere dalla panca","barbell reverse grip skullcrusher":"Skull crusher con presa inversa e bilanciere","barbell reverse close-grip bench press":"Distensioni su panca con bilanciere a presa inversa e stretta","barbell speed squat":"Squat dinamico con bilanciere","barbell skier":"Movimento dello sciatore con bilanciere"};
let added=0, existing=0;
for(const ex of en){
 const item=it.entries[ex.id];
 if(item.name_it){existing++;continue;}
 if(known[ex.name]){
  item.name_it=known[ex.name];
  item.translationStatus='manual_draft_review';
  if(!Array.isArray(item.aliases_it))item.aliases_it=[];
  added++;
 }
}
const remaining=en.filter(ex=>!it.entries[ex.id].name_it);
const dataCSV=[['id','nome_inglese','nome_italiano_da_inserire','stato'],...en.map(ex=>{
 const item=it.entries[ex.id];return [ex.id,ex.name,item.name_it||'',item.translationStatus||'pending'];
})];
const csv=dataCSV.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(';')).join('\r\n');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=itPath+'.backup-before-v12b-'+stamp+'.json';
fs.copyFileSync(itPath,backup);
try{
 it.schemaVersion='1.2.1';
 it.exerciseCount=1324;
 it.generatedUnreviewedNameCount=Object.values(it.entries).filter(x=>x.translationStatus==='generated_unreviewed').length;
 it.reviewPendingNameCount=Object.values(it.entries).filter(x=>['generated_unreviewed','manual_draft_review'].includes(x.translationStatus)).length;
 const tmp=itPath+'.v12b.tmp';fs.writeFileSync(tmp,JSON.stringify(it,null,2),'utf8');fs.renameSync(tmp,itPath);
 fs.writeFileSync(path.join(dir,'revisione_nomi_v12b.csv'),'\uFEFF'+csv,'utf8');
}catch(e){console.error('Errore di scrittura:',e.message);console.error('Backup al percorso:',backup);process.exit(1);}
console.log('LION FIT V12 - FASE 2');
console.log('Catalogo verificato: 1324/1324 ID + nome inglese');
console.log('Nomi gia presenti:',existing);
console.log('Nuovi nomi tecnici inseriti, DA RIVEDERE:',added);
console.log('Ancora senza nome italiano:',remaining.length);
console.log('Istruzioni esistenti e ID SVG preservati.');
console.log('Creato report: www/exercise-library/data/revisione_nomi_v12b.csv');
console.log('Creato backup:',path.basename(backup));
console.log('Operazione completata. Non e necessario reinstallare gli HTML.');
