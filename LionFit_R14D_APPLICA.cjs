/* PATCH 30 R14D — Surgical, safe navigation fix; no remote operations. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const root = __dirname;
const rel = path.join('src','components','AthleteHomeContent.vue');
const source = path.join(root, rel);
const backupDir = path.join(os.homedir(), 'Desktop', 'LionFit_R14D_Backup');
const receipt = path.join(backupDir, 'r14d-receipt.json');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const pattern = /<RouterLink\b(?=[^>]*\bclass="lf15-quick-tile")(?=[^>]*:to="planLink")[^>]*>\s*<LionIcon\b[^>]*\/>\s*<span>\s*Le mie schede\s*<\/span>\s*<\/RouterLink>/g;
const already = /<RouterLink\b(?=[^>]*\bclass="lf15-quick-tile")(?=[^>]*:to="archiveLink")[^>]*>\s*<LionIcon\b[^>]*\/>\s*<span>\s*Le mie schede\s*<\/span>\s*<\/RouterLink>/g;
function fail(message) { console.error('R14D BLOCCATA: ' + message); process.exit(1); }
if (!fs.existsSync(source)) fail(`File non trovato: ${rel}. Estrai il kit nella RADICE di LionFit-Modern-Git.`);
const before = fs.readFileSync(source);
const text = before.toString('utf8');
if (!text.includes('archiveLink') || !text.includes('lf15-quick-tile')) fail('Non riconosco la versione della Home R14C: nessun file modificato.');
const matches = [...text.matchAll(pattern)];
if (matches.length === 0 && [...text.matchAll(already)].length === 1) {
 console.log('OK: Le mie schede apre gia Archivio. Nessuna modifica necessaria.');
 process.exit(0);
}
if (matches.length !== 1) fail(`Trovati ${matches.length} pulsanti compatibili, atteso esattamente 1. Nessun file modificato.`);
const updated = text.replace(pattern, tag => tag.replace(':to="planLink"', ':to="archiveLink"'));
if (updated === text || !updated.includes(':to="archiveLink"') || [...updated.matchAll(already)].length !== 1) fail('Il controllo di sicurezza della sostituzione non e riuscito.');
// File byte integrity: a single, uniquely identified link is changed; all remaining code is untouched.
fs.mkdirSync(backupDir, {recursive:true});
const backupName = 'AthleteHomeContent_R14C_ORIGINALE_' + sha(before).slice(0,12) + '.vue';
const backup = path.join(backupDir, backupName);
if (!fs.existsSync(backup)) fs.writeFileSync(backup, before, {flag:'wx'});
const after = Buffer.from(updated,'utf8');
const tmp = source + '.r14d-temp';
try {
 fs.writeFileSync(tmp, after);
 fs.renameSync(tmp, source);
 fs.writeFileSync(receipt, JSON.stringify({source,backup,beforeSha:sha(before),afterSha:sha(after)},null,2),'utf8');
 console.log('OK R14D: Home > Le mie schede ora apre Archivio > Schede.');
 console.log('Backup originale sul Desktop: ' + backup);
 console.log('Non sono stati modificati altri file del progetto.');
} catch(err) {
 try{fs.unlinkSync(tmp)}catch{}
 fail('Errore di scrittura: '+ err.message);
}
