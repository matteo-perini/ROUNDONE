import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {visibleInvite,emailValid} from '../src/features/invites/visibility.ts'
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8')
const require=createRequire(import.meta.url),ts=require('typescript')
const hub=read('src/components/InviteTeamHub.vue'),live=read('src/views/LiveCoachStaff.vue'),demo=read('src/views/CoachStaff.vue')
function setup(props){
 const script=hub.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
 const out=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const ref=value=>({value}),computed=fn=>({get value(){return fn()}})
 return new Function('defineProps','ref','computed',out+'\nreturn {choice,selected,select}')( ()=>props,ref,computed)
}
test('owner can switch athlete and collaborator with one local selection',()=>{const h=setup({owner:true,busy:false});assert.equal(h.selected.value,'atleta');h.select('coach');assert.equal(h.selected.value,'coach');h.select('atleta');assert.equal(h.selected.value,'atleta')})
test('collaborator cannot select the privileged invitation',()=>{const h=setup({owner:false,busy:false});h.select('coach');assert.equal(h.selected.value,'atleta')})
test('busy submission prevents changing selection',()=>{const props={owner:true,busy:false};const h=setup(props);h.select('coach');props.busy=true;h.select('atleta');assert.equal(h.selected.value,'coach')})
test('loss of owner permission hides coach selection',()=>{const p={owner:true,busy:false};const h=setup(p);h.select('coach');p.owner=false;assert.equal(h.selected.value,'atleta')})
test('live actions remain wired, collaborator gated, demo non transmitting',()=>{for(const fn of ['sendAthleteMail','sendCoachMail','saveEmailSettings','setMemberStatus','revoke'])assert.match(live,new RegExp('@click="'+fn+'(?:\\(|")'));assert.match(live,/<template v-if="owner" #coach>/);assert.match(live,/busy\|\|!mayWriteLive\(\)\|\|!emailValid\(coachEmail\)/);assert.match(hub,/v-if="owner" type="button"/);assert.doesNotMatch(demo,/fetch\(|getStagingClients|runTransaction/);assert.match(demo,/@click="mock"/)})
test('pending filter keeps valid item, hides claimed/revoked/expired',()=>{const now=1000;for(const status of ['claimed','revoked','expired'])assert.equal(visibleInvite({status,expiresAt:{toMillis:()=>2000}},now),false);assert.equal(visibleInvite({status:'pending',expiresAt:{toMillis:()=>1000}},now),false);assert.equal(visibleInvite({status:'pending',expiresAt:{toMillis:()=>1001}},now),true);assert.equal(emailValid('coach@example.org'),true);assert.equal(emailValid('not-an-email'),false)})
test('existing route and mobile navbar unchanged in structure, translated title',()=>{assert.match(read('src/router/index.ts'),/path:'\/coach\/staff',component:CoachStaff,meta:\{title:'Inviti e Team',coachOnly:true\}/);const app=read('src/App.vue');assert.match(app,/const coachNav=\[[^\n]+\]/);assert.doesNotMatch(app.match(/const coachNav=[^\n]+/)[0],/coach\/staff/);const d=JSON.parse(read('src/features/i18n/en.json'));assert.equal(d['Inviti e Team'],'Invites & Team');assert.equal(d['Inviti in attesa'],'Pending invitations')})
test('hub has no networking/extra watchers and uses theme tokens plus compact breakpoints',()=>{assert.doesNotMatch(hub,/firebase|fetch\(|onSnapshot|watch\(/);assert.match(hub,/var\(--mint\)/);assert.match(hub,/@media\(max-width:340px\)/);assert.match(hub,/:aria-pressed=/);assert.match(hub,/<details/);assert.match(live,/v-lf-quiet-loading/)})
let sfc;try{sfc=require('@vue/compiler-sfc')}catch{}
test('compile changed Vue templates with real compiler when installed',{skip:!sfc},()=>{for(const file of ['src/components/InviteTeamHub.vue','src/views/LiveCoachStaff.vue','src/views/CoachStaff.vue','src/App.vue','src/components/ProfileOverview.vue']){const {descriptor,errors}=sfc.parse(read(file),{filename:file});assert.deepEqual(errors,[]);const script=sfc.compileScript(descriptor,{id:file});const result=sfc.compileTemplate({source:descriptor.template.content,filename:file,id:file,compilerOptions:{bindingMetadata:script.bindings}});assert.deepEqual(result.errors,[]);for(const style of descriptor.styles)assert.deepEqual(sfc.compileStyle({source:style.content,filename:file,id:file,scoped:style.scoped}).errors,[])}})
