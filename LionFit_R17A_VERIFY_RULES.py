from pathlib import Path
import difflib, sys
base=Path(__file__).resolve().parent
before=(base/'LionFit_R17A_RULES_RICEVUTE_ORIGINALI_BACKUP.rules').read_text(encoding='utf-8-sig')
after=(base/'LionFit_R17A_MULTISPORT_SOLO_FIX_CANDIDATO.rules').read_text(encoding='utf-8-sig')
old="return verified() && !lfControlUid()"
new="return signed() && !lfControlUid()"
anchor="match /multisport_results/{resultId} {"
assert before.count(anchor)==after.count(anchor)==1
assert before.count(('function allowedPerson() {'+chr(10)+'            '+old))==1
assert after.count(('function allowedPerson() {'+chr(10)+'            '+new))==1
assert after == before.replace(('function allowedPerson() {'+chr(10)+'            '+old),('function allowedPerson() {'+chr(10)+'            '+new),1),'ERRORE: modifiche ulteriori rispetto al controllo MultiSport!'
for fragment in ['request.resource.data.createdBy == uid()','resource.data.createdBy == uid()','allow delete: if false;','activeTarget()','uid() == athleteId && inGym(gymId)','coach(gymId)']:
 assert fragment in after,fragment
print('OK - una sola sostituzione nelle regole, isolamento per palestra e autore conservato.')
print('NON equivale a test Firebase Emulator o pubblicazione in PROD.')
