#!/usr/bin/env node
'use strict';
// Focus Mobile R19A: additive, reversible, structure-gated source modification.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(process.argv[3]||process.cwd());
const REL='src/components/ProgressWorkspace.vue';
const DEST=path.join(ROOT,REL);
const PATCH_MARK='LIONFIT_R19A_FOCUS_MOBILE_2026';
const BACKUP_PREFIX='LionFit_R19A_BACKUP_';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function fail(s){throw Error(s)}
function exactly(text,token,description){const i=text.indexOf(token);if(i<0)fail('Struttura non riconosciuta ('+description+'). Nessun file modificato: invia il file attuale ProgressWorkspace.vue.');if(text.indexOf(token,i+token.length)>=0)fail('Ancoraggio non univoco ('+description+'). Nessun file modificato.');return i}
function inject(base,style){
  if(base.includes(PATCH_MARK))return {body:base,already:true};
  const htmlOpen='<section v-for="{exercise,i} in displayEditorRows"';
  const timerOpen='<div v-if="!guided||!showSummary" ref="timerAnchor">';
  const summaryOpen='<section v-if="!guided||showSummary"';
  const rootEnd='     </div>\n     </Teleport>';
  for(const [s,label] of [[htmlOpen,'schede esercizi'],[timerOpen,'timer'],[summaryOpen,'riepilogo'],[rootEnd,'chiusura Focus']]) exactly(base,s,label);
  if(!(base.indexOf(htmlOpen)<base.indexOf(timerOpen)&&base.indexOf(timerOpen)<base.indexOf(summaryOpen)&&base.indexOf(summaryOpen)<base.indexOf(rootEnd)))fail('Ordine markup non riconosciuto. Nessun file modificato.');
  if(!base.includes('lf-r5-focus')||!base.includes('function enterFocus')||!base.includes('nativeFullscreenAvailable'))fail('Versione di Focus Mode non compatibile. Nessun file modificato.');
  const needle='const nativeFullscreenAvailable=';
  let start=exactly(base,needle,'fullscreen mobile');
  let end=base.indexOf('\n',start);
  if(end<0)fail('Dichiarazione fullscreen non valida.');
  const line=base.slice(start,end);
  if(!/^const nativeFullscreenAvailable=[^\n]*$/.test(line))fail('Dichiarazione fullscreen inattesa.');
  // Native fullscreen is retained for desktop mouse/keyboard but disabled for touch devices.
  base=base.slice(0,start)+"const nativeFullscreenAvailable=typeof document!=='undefined'&&document.fullscreenEnabled===true&&typeof window!=='undefined'&&window.matchMedia('(hover: hover) and (pointer: fine)').matches"+base.slice(end);
  // Wrap only exercise panels so vertical overflow stays in the middle region.
  base=base.replace(htmlOpen,'<div class="lf-r19a-main" aria-label="Esercizi e serie" ref="focusScroll">\n     '+htmlOpen);
  base=base.replace(timerOpen,'</div>\n     <div class="lf-r19a-footer">\n     '+timerOpen);
  base=base.replace(summaryOpen,'</div>\n     '+summaryOpen);
  // Attach a ref that lets each step scroll the middle area to the top.
  const declaration='const focusMode=ref(false),';
  exactly(base,declaration,'riferimenti Focus');
  base=base.replace(declaration,'const focusScroll=ref<HTMLElement|null>(null),focusMode=ref(false),');
  const after='const focusCatalogIndex=computed(';
  exactly(base,after,'watch step esercizio');
  base=base.replace(after,"watch(stepIndex,()=>{if(focusMode.value)void nextTick(()=>focusScroll.value?.scrollTo({top:0}))})\n"+after);
  // A standalone scoped style block overrides previous styles without deleting earlier work.
  if(!base.includes('</template>')||!base.includes('</style>'))fail('File Vue incompleto. Nessun file modificato.');
  base+=`\n<!-- ${PATCH_MARK} -->\n<style scoped>\n${style}\n</style>\n`;
  return {body:base,already:false};
}
function identifyBackup(){
 const sibling=path.dirname(ROOT),base=path.basename(ROOT);
 return fs.readdirSync(sibling).filter(n=>n.startsWith(BACKUP_PREFIX+base+'_')).sort().reverse().map(n=>path.join(sibling,n));
}
function install(){
 if(!fs.existsSync(DEST))fail('File non trovato: '+DEST+' — estrai lo ZIP nella radice LionFit-Modern-Git.');
 const original=fs.readFileSync(DEST,'utf8');
 const style=fs.readFileSync(path.join(__dirname,'R19A_FOCUS_MOBILE.css'),'utf8');
 const result=inject(original,style);
 if(result.already){console.log('R19A già installata; nessuna modifica.');return;}
 const sibling=path.dirname(ROOT),base=path.basename(ROOT),now=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=path.join(sibling,`${BACKUP_PREFIX}${base}_${now}`);
 const backupFile=path.join(backup,REL);
 fs.mkdirSync(path.dirname(backupFile),{recursive:true});
 fs.writeFileSync(backupFile,original,'utf8');
 fs.writeFileSync(path.join(backup,'R19A_BACKUP.json'),JSON.stringify({projectRoot:ROOT,relativePath:REL,originalSha256:sha(original),patchedSha256:sha(result.body),createdAt:new Date().toISOString()},null,2));
 const temp=DEST+'.r19a.tmp';fs.writeFileSync(temp,result.body,'utf8');fs.renameSync(temp,DEST);
 console.log('R19A installata in '+REL+'\nBackup fuori dal progetto: '+backup+'\nSHA originale: '+sha(original)+'\nSHA nuovo: '+sha(result.body));
}
function rollback(){
 if(!fs.existsSync(DEST))fail('File non trovato: '+DEST);
 const backups=identifyBackup();if(!backups.length)fail('Backup R19A non trovato accanto alla cartella progetto.');
 const choice=backups.find(p=>{try{return JSON.parse(fs.readFileSync(path.join(p,'R19A_BACKUP.json'),'utf8')).projectRoot===ROOT}catch{return false}});
 if(!choice)fail('Backup non corrispondente a questa cartella progetto.');
 const meta=JSON.parse(fs.readFileSync(path.join(choice,'R19A_BACKUP.json'),'utf8'));
 const current=fs.readFileSync(DEST,'utf8');
 if(sha(current)!==meta.patchedSha256)fail('ProgressWorkspace.vue è stato modificato dopo la R19A: rollback automatico bloccato per proteggere le nuove modifiche.');
 const copy=fs.readFileSync(path.join(choice,REL),'utf8');
 if(sha(copy)!==meta.originalSha256)fail('Backup alterato: rollback bloccato.');
 fs.writeFileSync(DEST,copy,'utf8');
 console.log('Rollback R19A riuscito. Ripristinato '+REL);
}
try{
 const mode=process.argv[2]||'install';if(mode==='install')install();else if(mode==='rollback')rollback();else fail('Uso: node R19A_INSTALLA.cjs install|rollback');
}catch(e){console.error('R19A SAFE:',e.message);process.exitCode=1}
