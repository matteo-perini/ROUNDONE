import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
export function assertCurrentRulesPreservePatch24(){
 const original=read('security/LIONFIT-FIRESTORE-PATCH24-CANDIDATA.rules');
 const binding=read('security/LionFit_PATCH_29_Rules_COMPLETE_DA_TESTARE.txt');
 const actual=read('test-patch24-emulator/firestore.rules');
 assert.equal(actual,binding);
 const block=original.indexOf('    match /support_tickets/{ticketId} {');assert.ok(block>=0);
 const before=original.slice(0,block),after=original.slice(block);
 const changed=after.replace("affectedKeys().hasOnly(['status','updatedAt'])\n        && request.resource.data.status in ['open','working','resolved']", "affectedKeys().hasOnly(['status','updatedAt','priority'])\n        && request.resource.data.status in ['open','working','resolved','closed']\n        && (!('priority' in request.resource.data) || request.resource.data.priority in ['low','normal','high'])").replace("parentTicket().status != 'resolved'", "!(parentTicket().status in ['resolved','closed'])");
 assert.notEqual(after,changed);assert.equal(actual,before+changed);
}
