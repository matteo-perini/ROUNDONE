import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const shell=read('src/views/PlatformAdmin.vue'),overview=read('src/components/PlatformExecutiveOverview.vue')
test('Eight control tabs remain and four roadmap-only tabs are visibly marked',()=>{
 for(const key of ['Panoramica','Palestre & CRM','Abbonamenti','Assistenza','Stato servizi','Utilizzo app','Sicurezza','Configurazione'])assert.ok(shell.includes(key))
 assert.equal((shell.match(/phase:'operational'/g)||[]).length,5) // typed phase union + four operational objects
 assert.equal((shell.match(/phase:'planned'/g)||[]).length,4)
 assert.match(shell,/item.phase==='planned'/)
 assert.match(shell,/4 aree operative/)
})
test('Overview can refresh server data through existing guarded load',()=>{
 assert.match(overview,/emit\('refresh'\)/)
 assert.match(shell,/@refresh="load\(\)"/)
 assert.match(shell,/async function load\(append=false\)/)
 assert.match(shell,/listPlatformGyms\(append\?cursor:undefined\)/)
 assert.match(shell,/platformCounts\(\)/)
})
test('Pagination states search and commercial counts only cover loaded gyms',()=>{
 assert.match(shell,/Elenco parziale: carica le pagine successive/)
 assert.match(shell,/I filtri non cercano nelle palestre non ancora caricate/)
 assert.match(shell,/Carica altre palestre/)
 assert.match(overview,/elenco incompleto/)
})
test('Auth controls and commercial writes unchanged',()=>{
 for(const key of ['verifyPlatformAccess()','verifyPlatformAccess(false)','onIdTokenChanged','setBillingExemption(gym.id,exemptionValue(mode))','getGymCommercialMode(gym.id)','window.confirm','!mayWriteLive()'])assert.ok(shell.includes(key))
 assert.doesNotMatch(shell,/\b(setDoc|deleteDoc|updateDoc|addDoc)\s*\(/)
 assert.match(overview,/Incassi reali: —/)
})
