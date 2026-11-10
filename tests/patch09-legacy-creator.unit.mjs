import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {unassignedLegacyModels,hasRecordedCreator,availableLegacyCoaches,checkLegacyAttribution} from '../src/features/coach/legacyTemplateAttribution.ts'
import {creatorFilterMatches,creatorFilterChoices} from '../src/features/coach/archiveCreatorFilters.ts'
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const coachA={id:'coachA',name:'Marco',active:true}
const coachB={id:'coachB',name:'Andrea',active:true}
const revoked={id:'coachC',name:'Revocato',active:false}
const legacy=[{id:'old-1',createdBy:''},{id:'old-2'},{id:'new-3',createdBy:'coachA'},{id:'oldTrash',createdBy:'   ',deletedAt:'2026-10-15'}]
test('solo schede con autore mancante; include cestino legacy come da inventario',()=>{
 assert.deepEqual(unassignedLegacyModels(legacy).map(x=>x.id),['old-1','old-2','oldTrash'])
 assert.equal(hasRecordedCreator('   '),false)
 assert.equal(hasRecordedCreator('coachA'),true)
})
test('non modifica i documenti passati, neppure gli ID',()=>{
 const before=JSON.stringify(legacy)
 void unassignedLegacyModels(legacy)
 assert.equal(JSON.stringify(legacy),before)
})
test('Coach revocati esclusi dalla scelta',()=>{
 assert.deepEqual(availableLegacyCoaches([coachA,coachB,revoked]).map(x=>x.id),['coachA','coachB'])
})
test('rifiuta assignees non validi, ID malevoli e schede gia attribuite',()=>{
 assert.throws(()=>checkLegacyAttribution({id:'foo',createdBy:'coachB'},'coachA',[coachA]))
 assert.throws(()=>checkLegacyAttribution({id:'bad/id',createdBy:''},'coachA',[coachA]))
 assert.throws(()=>checkLegacyAttribution({id:'foo',createdBy:''},'coachC',[coachA,revoked]))
 assert.doesNotThrow(()=>checkLegacyAttribution({id:'foo',createdBy:''},'coachA',[coachA]))
})
test('filtro Le mie schede/Marco/Andrea segue createdBy senza ripartizionare Firestore',()=>{
 assert.equal(creatorFilterMatches('coachA','mine','coachA'),true)
 assert.equal(creatorFilterMatches('coachB','coach:coachB','coachA'),true)
 assert.equal(creatorFilterMatches('','legacy','coachA'),true)
 assert.equal(creatorFilterMatches('coachB','legacy','coachA'),false)
 const assigned=[{createdBy:'coachA'},{createdBy:'coachB'}]
 assert.equal(creatorFilterChoices(assigned,[coachA,coachB],'coachA').some(x=>x.value==='legacy'),false)
})
test('il pannello compare solo per titolare e scompare senza schede da attribuire',()=>{
 const c=read('src/views/LiveCoachTemplates.vue')
 assert.match(c,/session\?\.role==='titolare' && !editing && legacyUnassigned\.length/)
 assert.match(c,/if\(!legacyUnassigned\.value\.length\)legacyPanelOpen\.value=false/)
 assert.match(c,/v-for="s in legacyUnassigned"/)
 assert.match(c,/Scheda storica attribuita a/)
 assert.match(c,/legacyCreatorSelections\[s\.id\]/)
})
test('la transazione aggiorna SOLTANTO creator e audit, senza toccare revision e contenuto',()=>{
 const s=read('src/integrations/firestore/legacyTemplateAttribution.ts')
 assert.match(s,/runTransaction\(db,async tx/)
 assert.match(s,/tx\.get\(gymRef\)/)
 assert.match(s,/tx\.get\(coachRef\)/)
 assert.match(s,/tx\.get\(modelRef\)/)
 assert.match(s,/modelSnap\.data\(\)/)
 assert.match(s,/if\(hasRecordedCreator\(model\.createdBy\)\)/)
 assert.match(s,/tx\.update\(modelRef,\{\s*createdBy:coachUid,\s*legacyCreatorAssignedBy:ownerUid,\s*legacyCreatorAssignedAt:serverTimestamp\(\)/)
 assert.doesNotMatch(s,/tx\.delete|tx\.set|revision:|updatedAt:|exercises:|title:/)
})
