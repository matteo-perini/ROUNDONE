/** PATCH 30 R15 — Safe in-place Archive Experience 3.0, no Firebase operations. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const root=__dirname;
const rel={archive:'src/views/AthleteLiveWorkspace.vue',history:'src/components/ProgramHistory.vue',main:'src/main.ts',home:'src/components/AthleteHomeContent.vue',css:'src/styles-r15-athlete-archive.css',test:'tests/patch30-r15-archive-experience.unit.mjs'};
const assetCss='R15_ARCHIVIO.css';
const assetTest='R15_ARCHIVIO_TEST.mjs';
const backupDir=path.join(os.homedir(),'Desktop','LionFit_R15_BACKUP');
const receipt=path.join(backupDir,'r15-receipt.json');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function stop(message){console.error('R15 NON APPLICATA: '+message);process.exit(1)}
function replaceOnce(src,oldVal,newVal,label){const count=src.split(oldVal).length-1;if(count!==1)throw new Error(`${label}: trovate ${count} corrispondenze, attesa 1. Il file non e compatibile: nessuna modifica.`);return src.replace(oldVal,newVal)}
function patchHome(s){
 const before=/<RouterLink\b(?=[^>]*\bclass="lf15-quick-tile")(?=[^>]*:to="planLink")[^>]*>\s*<LionIcon\b[^>]*\/>\s*<span>\s*Le mie schede\s*<\/span>\s*<\/RouterLink>/g;
 const after=/<RouterLink\b(?=[^>]*\bclass="lf15-quick-tile")(?=[^>]*:to="archiveLink")[^>]*>\s*<LionIcon\b[^>]*\/>\s*<span>\s*Le mie schede\s*<\/span>\s*<\/RouterLink>/g;
 if([...s.matchAll(after)].length===1)return s;
 const hits=[...s.matchAll(before)];
 if(hits.length!==1)throw new Error('R14C: non riesco a identificare il pulsante Le mie schede; aggiorna prima la Home R14C/R14D.');
 const updated=s.replace(before,m=>m.replace(':to="planLink"',':to="archiveLink"'));
 if([...updated.matchAll(after)].length!==1)throw new Error('Collegamento Home: controllo finale fallito');
 return updated;
}
function patchArchive(s){
 s=replaceOnce(s,
`    <section class="panel athlete-archive-hero"><div class="row between"><h2 class="card-heading">{{uiText("ARCHIVIO")}}</h2><span class="pill pill-neutral">{{archiveReady?archiveDistinctCount:'—'}} {{uiText("SCHEDE")}}</span></div></section>`,
`    <header class="lf-r15-archive-header"><div><span class="lf-r15-eyebrow">IL TUO STORICO</span><h1>Archivio</h1><p>Ritrova le tue schede e le programmazioni concluse.</p></div><span class="lf-r15-count">{{programArchiveOpen?pastPrograms.length:(archiveReady?archiveDistinctCount:'—')}} {{programArchiveOpen?'programmi':'schede'}}</span></header>`,
'Intestazione archivio');
 s=replaceOnce(s,
`    <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" :class="!programArchiveOpen?'primary':'secondary'" @click="programArchiveOpen=false">Schede</button><button type="button" :class="programArchiveOpen?'primary':'secondary'" @click="programArchiveOpen=true">Programmazioni</button></div>`,
`    <div class="lf-r15-archive-tabs" role="group" aria-label="Seleziona sezione archivio"><button type="button" :class="!programArchiveOpen?'is-active':''" :aria-pressed="!programArchiveOpen" @click="programArchiveOpen=false">Schede</button><button type="button" :class="programArchiveOpen?'is-active':''" :aria-pressed="programArchiveOpen" @click="programArchiveOpen=true">Programmazioni</button></div>`,
'Tab Schede/Programmazioni');
 s=replaceOnce(s,
`    <section v-else v-lf-entrance="{id:'athlete-archive',ready:archiveReady,rows:[{match:'.lf-archive-v4-item'}]}" class="panel athlete-archive-list"><div class="row between"><h3>{{uiText("Le mie schede di allenamento")}}</h3><span class="muted">{{archiveReady?archiveGroups.length:'—'}} {{uiText("schede visualizzate")}}</span></div>`,
`    <section v-else v-lf-entrance="{id:'athlete-archive',ready:archiveReady,rows:[{match:'.lf-archive-v4-item'}]}" class="panel athlete-archive-list lf-r15-archive-list"><div class="lf-r15-archive-list-head"><h2>Le mie schede</h2><span>{{archiveReady?archiveGroups.length:'—'}} visualizzate</span></div>`,
'Elenco schede');
 s=replaceOnce(s,
`     <div class="grid2"><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca nell'Archivio..."/>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="all">Tutte le schede</option><option value="active">Schede assegnate</option><option value="historical">Schede storiche</option><option value="trashed">Schede ritirate</option></select>
     </div>`,
`     <div class="lf-r15-archive-tools"><label class="lf-r15-search"><span class="lf-r15-glass" aria-hidden="true">⌕</span><input v-model="search" type="search" aria-label="Cerca archivio personale" placeholder="Cerca una scheda..."/></label>
      <select v-model="archiveView" aria-label="Filtra archivio personale"><option value="all">Tutte le schede</option><option value="active">Schede assegnate</option><option value="historical">Schede storiche</option><option value="trashed">Schede ritirate</option></select>
     </div><button v-if="search.trim()||archiveView!=='all'" type="button" class="lf-r15-clear" @click="search='';archiveView='all'">Azzera filtri</button>`,
'Ricerca e filtri');
 s=replaceOnce(s,
`     <p v-else-if="!archiveGroups.length" class="notice">{{uiText("Nessuna scheda corrisponde al filtro selezionato.")}}</p>`,
`     <p v-else-if="!archiveGroups.length" class="notice lf-r15-empty" role="status">{{uiText("Nessuna scheda corrisponde al filtro selezionato.")}}</p>`,
'Stato vuoto');
 s=replaceOnce(s,
`     <template v-if="archiveReady"><div v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item lf-archive-v4-item"><button class="wide athlete-archive-open" type="button" @click="opened=g.sheet"><span class="lf-archive-v4-icon" aria-hidden="true">▣</span><b>{{g.sheet.title}}</b><span class="lf-archive-v4-action">Apri scheda ›</span></button></div></template>`,
`     <div v-if="archiveReady" class="lf-r15-archive-rows"><article v-for="g in archiveGroups" :key="g.sheet.id" class="line-card athlete-archive-item lf-archive-v4-item lf-r15-archive-item"><button class="wide athlete-archive-open" type="button" @click="opened=g.sheet" :aria-label="'Apri scheda '+g.sheet.title"><span class="lf-archive-v4-icon" aria-hidden="true">▤</span><span class="lf-r15-archive-item-main"><b>{{g.sheet.title}}</b><small>{{g.sheet.exercises.length}} {{g.sheet.exercises.length===1?'esercizio':'esercizi'}}</small></span><span class="lf-archive-v4-action" aria-hidden="true">Apri <span>›</span></span></button></article></div>`,
'Card schede');
 return s;
}
function patchHistory(s){
 s=replaceOnce(s,
`function sheet(id:string){return props.archive.find(a=>a.id===id)||props.personal.find(p=>p.id===id)}`,
`function sheet(id:string){return props.archive.find(a=>a.id===id)||props.personal.find(p=>p.id===id)}
function prettyDate(input?:string){
 if(!input||!/^\\d{4}-\\d{2}-\\d{2}$/.test(input))return input||'—'
 const date=new Date(input+'T12:00:00Z')
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date):input
}`,
'Formato date italiane');
 s=replaceOnce(s,` <section class="panel lf-r3-history">`,` <section class="panel lf-r3-history lf-r15-history">`,'Sezione ProgramHistory');
 s=replaceOnce(s,
`  <div class="row between"><h3>Archivio programmazioni</h3><button v-if="program" type="button" class="secondary" @click="choose('')">Tutti i programmi</button></div>`,
`  <div class="lf-r15-history-head"><div><h2>Programmazioni concluse</h2><p>Consulta le settimane e le schede del tuo storico.</p></div><button v-if="program" type="button" class="secondary lf-r15-history-back" @click="choose('')">‹ Tutti i programmi</button></div>`,
'Intestazione storico');
 s=replaceOnce(s,
`  <template v-else-if="!program"><button v-for="p in [...programs].reverse()" :key="p.id" class="secondary lf-r3-history-row" @click="choose(p.id)"><b>{{p.title}}</b><small>{{p.weeks.length}} settimane concluse · {{p.weeks[0]?.startDate}} – {{weekEnd(p.weeks.at(-1)?.startDate)}}</small><span aria-hidden="true">›</span></button><p v-if="!programs.length" class="muted">Nessuna settimana conclusa.</p></template>`,
`  <template v-else-if="!program"><button v-for="p in [...programs].reverse()" :key="p.id" class="secondary lf-r3-history-row lf-r15-history-program" type="button" @click="choose(p.id)"><span class="lf-r15-history-symbol" aria-hidden="true">▦</span><b>{{p.title}}</b><small>{{p.weeks.length}} {{p.weeks.length===1?'settimana conclusa':'settimane concluse'}} · {{prettyDate(p.weeks[0]?.startDate)}} – {{prettyDate(weekEnd(p.weeks.at(-1)?.startDate))}}</small><span class="lf-r15-history-arrow" aria-hidden="true">›</span></button><p v-if="!programs.length" class="lf-r15-history-empty muted">Nessuna programmazione conclusa.</p></template>`,
'Elenco storico');
 s=replaceOnce(s,
`  <template v-else><h4>{{program.title}}</h4><div class="lf-r3-history-weeks"><button v-for="w in program.weeks" :key="w.id" type="button" :class="weekId===w.id?'primary':'secondary'" :aria-pressed="weekId===w.id" @click="weekId=w.id"><b>Settimana {{w.weekIndex}}</b><small>{{w.startDate}} – {{weekEnd(w.startDate)}}</small></button></div>`,
`  <template v-else><h3 class="lf-r15-history-selected">{{program.title}}</h3><div class="lf-r3-history-weeks lf-r15-history-weeks"><button v-for="w in program.weeks" :key="w.id" type="button" :class="weekId===w.id?'primary':'secondary'" :aria-pressed="weekId===w.id" @click="weekId=w.id"><b>Settimana {{w.weekIndex}}</b><small>{{prettyDate(w.startDate)}} – {{prettyDate(weekEnd(w.startDate))}}</small></button></div>`,
'Settimane storico');
 s=replaceOnce(s,`  <div v-if="week" class="lf-r3-history-days">`,`  <div v-if="week" class="lf-r3-history-days lf-r15-history-days">`,'Dettaglio giorni');
 return s;
}
function apply(){
 for(const f of Object.values(rel).slice(0,4)){if(!fs.existsSync(path.join(root,f)))stop(`Manca ${f}. Devi estrarre il kit direttamente nella cartella principale LionFit-Modern-Git.`)}
 if(!fs.existsSync(path.join(root,assetCss))||!fs.existsSync(path.join(root,assetTest)))stop('Mancano file del kit; estrai lo ZIP completo nella root.');
 const paths=[rel.archive,rel.history,rel.main,rel.home];
 const old=Object.fromEntries(paths.map(f=>[f,fs.readFileSync(path.join(root,f))]));
 const prev=Object.fromEntries(paths.map(f=>[f,old[f].toString('utf8')]));
 if(prev[rel.main].includes("import './styles-r15-athlete-archive.css'")){
  if(fs.existsSync(path.join(root,rel.css))&&fs.existsSync(path.join(root,rel.test)))console.log('R15 gia applicata. Nessun file modificato.');
  else stop('Import R15 esistente ma file CSS o test assente. Stato parziale: non sovrascrivo nulla.');
  return;
 }
 for(const f of [rel.css,rel.test])if(fs.existsSync(path.join(root,f)))stop(`Esiste gia ${f} ma manca import R15: nessun file modificato.`);
 let updated;
 try{
  updated={
   [rel.archive]:patchArchive(prev[rel.archive]),
   [rel.history]:patchHistory(prev[rel.history]),
   [rel.main]:prev[rel.main].trimEnd()+"\n// PATCH 30 R15: archivio atleta Experience 3.0.\nimport './styles-r15-athlete-archive.css'\n",
   [rel.home]:patchHome(prev[rel.home]),
   [rel.css]:fs.readFileSync(path.join(root,assetCss),'utf8'),
   [rel.test]:fs.readFileSync(path.join(root,assetTest),'utf8')
  };
  if(!updated[rel.main].includes('styles-r14c-dashboard-rebuild.css'))throw new Error('La tua app non ha l\'import R14C in main.ts. Serve una base R14C funzionante: non applico R15.');
  if(!updated[rel.archive].includes('groupSemanticCopies(')||!updated[rel.history].includes('read-only'))throw new Error('Mancano gli elementi di sicurezza dello storico: nessuna modifica.');
 }catch(e){stop(e.message)}
 const changed=[...paths.filter(f=>updated[f]!==prev[f]),rel.css,rel.test];
 const toWrite=Object.fromEntries(changed.map(f=>[f,Buffer.from(updated[f],'utf8')]));
 const manifest={version:'R15',created:new Date().toISOString(),root,files:[],newFiles:[rel.css,rel.test],notes:'Solo interfaccia. Nessun deploy Firebase.'};
 try{
  fs.mkdirSync(backupDir,{recursive:true});
  if(fs.existsSync(receipt))throw new Error('Un backup R15 precedente esiste gia: '+receipt+'; salva il precedente altrove prima di un nuovo tentativo.');
  for(const f of changed){
   if(!Object.hasOwn(old,f))continue;
   const orig=old[f], bName='R15_'+f.replace(/[\\/]/g,'_')+'_'+hash(orig).slice(0,12)+'.backup';
   const bFile=path.join(backupDir,bName);
   if(!fs.existsSync(bFile))fs.writeFileSync(bFile,orig,{flag:'wx'});
   manifest.files.push({file:f,backup:bFile,beforeHash:hash(orig),afterHash:hash(toWrite[f])});
  }
  for(const f of [rel.css,rel.test])manifest.files.push({file:f,backup:null,beforeHash:null,afterHash:hash(toWrite[f])});
  const written=[];
  try{
   for(const f of changed){const destination=path.join(root,f);fs.mkdirSync(path.dirname(destination),{recursive:true});const temp=destination+'.r15tmp';fs.writeFileSync(temp,toWrite[f]);fs.renameSync(temp,destination);written.push(f)}
   fs.writeFileSync(receipt,JSON.stringify(manifest,null,2),'utf8');
  }catch(e){for(const f of written.reverse()){const dst=path.join(root,f);try{if(old[f])fs.writeFileSync(dst,old[f]);else fs.unlinkSync(dst)}catch(e2){console.error('ATTENZIONE: ripristino non riuscito',f,e2.message)}}throw e}
  console.log('R15 APPLICATA: '+changed.join(', '));
  console.log('Backup automatico: '+backupDir);
  console.log('Nessuna modifica ai dati, a Firebase, ai ruoli o alle funzioni di salvataggio.');
  console.log('ORA esegui node --test tests/patch30-r15-archive-experience.unit.mjs, poi typecheck e build web.');
 }catch(e){stop(e.message)}
}
apply();
