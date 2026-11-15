import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse} from '@vue/compiler-sfc'
import {badgeEnabled,setBadgeEnabled} from '../src/features/work/devicePreference.ts'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const settings=read('../src/views/Settings.vue'),work=read('../src/components/WorkConfigSettings.vue'),home=read('../src/components/CoachDashboardRedesign.vue')
test('updated SFC syntax and unit of measure removed from menu only',()=>{
 for(const [name,source] of [['Settings',settings],['WorkConfigSettings',work],['LionIcon',read('../src/components/LionIcon.vue')]])assert.deepEqual(parse(source,{filename:name+'.vue'}).errors,[])
 assert.doesNotMatch(settings,/Unità di misura|lfsettings-static/)
 assert.match(settings,/@media \(max-width: 767px\)/)
 assert.match(settings,/\.lfsettings-categories\{display:block;gap:0/)
})
test('settings preserve operational entries and existing role gates',()=>{
 for(const entry of ['Tema','Lingua','Personalizza palestra','Personalizza dashboard','Timbratura GPS','Competizioni e gare','Notifiche','Google Calendar','Modifica profilo','Sicurezza','Privacy','Termini e condizioni','Informazioni','Assistenza e feedback','Esci dall’account'])assert.ok(settings.includes(entry),entry)
 assert.match(settings,/v-if="stagingSession.role==='titolare'"/)
 assert.match(settings,/v-if="workPilotAllowed"/)
 assert.match(settings,/isLiveMode\(\)&&pilotAvailable\(stagingSession.value\)/)
 assert.match(settings,/v-if="platformAllowed"/)
 assert.match(settings,/v-if="billingSandboxEnabled\(\)&&stagingSession\?\.role==='titolare'"/)
 assert.match(settings,/v-if="canResetPassword"/)
})
test('badge remains mobile-only and site lock controls remain present',()=>{
 assert.match(work,/<template v-if="stored">\s*<label v-if="mobile" class="lf-work-badge-pref">/)
 assert.match(work,/role="switch"[^>]*:checked="showBadge"/)
 assert.match(work,/Confermo e blocco le sedi/)
 assert.match(home,/mayWriteLive\(\)&&mobile&&s&&pilotAvailable\(s\)&&badgeEnabled\(s.uid,s.gymId\)/)
})
test('badge preference isolated by profile and gym, off by default',()=>{
 const values=new Map(); const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}})
 try{
  assert.equal(badgeEnabled('a','g1'),false)
  assert.equal(setBadgeEnabled('a','g1',true),true)
  assert.equal(badgeEnabled('a','g1'),true)
  assert.equal(badgeEnabled('b','g1'),false)
  assert.equal(badgeEnabled('a','g2'),false)
  assert.equal(setBadgeEnabled('a','g1',false),true)
  assert.equal(badgeEnabled('a','g1'),false)
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage}
})
