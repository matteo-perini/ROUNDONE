import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const m=JSON.parse(fs.readFileSync(path.join(root,'R18E_MANIFEST.json'),'utf8'));
const src=rel=>fs.readFileSync(path.join(root,'R18E_PAYLOAD',rel),'utf8');
for(const rel of m.targets)test('payload SHA: '+rel,()=>assert.equal(crypto.createHash('sha256').update(src(rel)).digest('hex'),m.patched[rel]));
const mod=await import(pathToFileURL(path.join(root,'R18E_PAYLOAD','competitions-backend','functions','inviteModel.mjs')).href);
test('pilot default restricted to one specific gym',()=>{
 assert.equal(mod.scopeAllowed('gym_pilot','pilot','gym_pilot'),true);
 assert.equal(mod.scopeAllowed('gym_other','pilot','gym_pilot'),false);
 assert.equal(mod.scopeAllowed('gym_other',undefined,'gym_pilot'),false);
});
test('explicit global scope permits distinct valid gyms only',()=>{
 assert.equal(mod.scopeAllowed('gym_pilot','all','gym_pilot'),true);
 assert.equal(mod.scopeAllowed('gym_other','all','gym_pilot'),true);
 assert.equal(mod.scopeAllowed('../escape','all','gym_pilot'),false);
 assert.equal(mod.scopeAllowed('gym_other','ALL','gym_pilot'),false);
});
test('per-tenant and role membership remains required regardless of scope',()=>{
 assert.equal(mod.activeMember({gymId:'gym_two',role:'athlete'},'gym_one','athlete'),false);
 assert.equal(mod.activeMember({gymId:'gym_one',role:'athlete'},'gym_one','admin'),false);
 assert.equal(mod.activeMember({gymId:'gym_one',role:'admin',membershipStatus:'suspended'},'gym_one','admin'),false);
 assert.equal(mod.activeMember({gymId:'gym_one',role:'admin',membershipStatus:'active'},'gym_one','admin'),true);
});
test('server still requires explicit flag, project, and separate gym isolation checks',()=>{
 const s=src('competitions-backend/functions/index.mjs');
 assert.match(s,/process\.env\.LF_COMPETITION_INVITES_ENABLED!=='true'/);
 assert.match(s,/id!==process\.env\.LF_COMPETITION_PROJECT_ID/);
 assert.match(s,/process\.env\.LF_COMPETITION_SCOPE\|\|'pilot'/);
 assert.match(s,/activeMember\(p,gym,role\)/);
 assert.match(s,/scopeAllowed\(gym,competitionScope\(\),process\.env\.LF_COMPETITION_PILOT_GYM_ID\)/);
 assert.match(s,/eventRef=\(g,e\)=>db\.doc\(`gyms\/\$\{g\}\/competitions\/\$\{e\}`\)/);
 assert.match(s,/entryRef=\(g,e,u\)=>db\.doc\(`gyms\/\$\{g\}\/competition_entries\/\$\{e\}_\$\{u\}`\)/);
});
test('server retains exact invitation-only inbox and push behavior',()=>{
 const s=src('competitions-backend/functions/index.mjs');
 assert.match(s,/tx\.create\(inboxRef\(u\.gym,athleteId,'competition-invite',eventId\)/);
 assert.match(s,/tx\.create\(inboxRef\(u\.gym,inviter,'competition-reply',`\$\{eventId\}_\$\{u\.uid\}`\)/);
 assert.doesNotMatch(s,/sendToTopic|subscribeToTopic|onDocumentCreated|onDocumentWritten/);
 assert.match(s,/x\?\.gym===gym&&x\.role===role/);
});
test('frontend flag for all requires explicit all scope',()=>{
 const s=src('src/integrations/firebase/competitionInvites.ts');
 assert.match(s,/VITE_LIONFIT_COMPETITION_SCOPE\|\|'pilot'/);
 assert.match(s,/if\(scope==='all'\)return true/);
 assert.match(s,/VITE_LIONFIT_COMPETITION_INVITES_ENABLED!=='true'/);
 assert.match(s,/if\(scope!=='pilot'\)return false/);
});
