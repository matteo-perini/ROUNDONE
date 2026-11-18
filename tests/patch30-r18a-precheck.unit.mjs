import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {audit,readFlag,WANTED}=require('../R18A_CONTROLLO.cjs');
function fixture(){
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'lf-r18a-'));
 const root=path.join(top,'project');fs.mkdirSync(root);
 const put=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
 put('package.json','{}');
 put('src/components/AgendaCompetitions.vue','<template><div>ciao</div></template>');
 put('src/integrations/firebase/competitionInvites.ts','export const hello=true;');
 put('competitions-backend/firebase.json',JSON.stringify({functions:{source:'functions',codebase:'competitions'}}));
 put('competitions-backend/functions/package.json','{}');
 put('competitions-backend/functions/index.mjs','export const lfInvite=1;\nexport const lfRespond=2;');
 put('competitions-backend/functions/inviteModel.mjs','export const model=1;');
 put('competitions-backend/functions/inviteModel.test.mjs',"import {test} from 'node:test'; import assert from 'node:assert/strict'; test('sample',()=>assert.equal(1,1));");
 put('competitions-backend/functions/.env.app-palestra-b0b9d','SECRET_SHOULD_NOT_COPY=hello');
 put('.env.production.local','VITE_LIONFIT_COMPETITION_INVITES_ENABLED=false\nPRIVATE_KEY=dontcopy');
 return {top,root};
}
test('R18A detects R8B files and tests the unchanged backend',()=>{
 const {top,root}=fixture();
 try{
  const r=audit(root,{noZip:true,date:new Date(2026,10,18,9,1,2)});
  assert.equal(r.requiredMissing.length,0);
  assert.equal(r.codebase,'competitions');
  assert.ok(r.exports.includes('lfInvite'));
  assert.ok(r.checks.every(x=>x.state==='OK'));
  const bundle=path.join(r.out,'SORGENTI_VERIFICA_R18A');
  assert.equal(fs.existsSync(path.join(bundle,'competitions-backend/functions/.env.app-palestra-b0b9d')),false);
  assert.equal(fs.existsSync(path.join(bundle,'.env.production.local')),false);
  assert.equal(fs.readFileSync(path.join(r.out,'R18A_RAPPORTO.json'),'utf8').includes('SECRET_SHOULD_NOT_COPY'),false);
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});
test('R18A filters Vite flag and never copies env files',()=>{
 const {top,root}=fixture();
 try{
  assert.equal(readFlag(root,'.env.production.local'),'false');
  assert.equal(WANTED.some(x=>x.includes('.env')),false);
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});
