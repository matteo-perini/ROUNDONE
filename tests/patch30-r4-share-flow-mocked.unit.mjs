import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {webcrypto} from 'node:crypto'
import {shareToken,shareWhatsappUrl} from '../src/features/invites/shareLinks.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const live=readFileSync(new URL('../src/views/LiveCoachStaff.vue',import.meta.url),'utf8')
const raw=live.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
assert.ok(raw)
const cleaned=raw.replace(/^import .*\n/gm,'').replaceAll('import.meta.env','env')
const compiled=ts.transpileModule(cleaned,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
const returns='\nreturn {prepareShare,shareInOneClick,coachEmail,status,stagingSession,makeInvite};'
function setup(){
 const store=new Map(),copies=[],opened=[],env={};let writes=true,popupBlocked=false
 const stagingSession={value:{uid:'owner123',gymId:'gym_test123',role:'titolare'}}
 const ref=value=>({value}),computed=fn=>({get value(){return fn()}})
 const collection=(_,...p)=>p.join('/'),doc=(_,...p)=>p.join('/')
 const getDocFromServer=async key=>({exists:()=>key==='gyms/gym_test123'||store.has(key),data:()=>key==='gyms/gym_test123'?{name:'Palestra Test',ownerUid:'owner123'}:store.get(key)})
 const getDocs=async coll=>({docs:[...store].filter(([p,d])=>p.startsWith(coll+'/')&&d.status==='pending').map(([p,d])=>({id:p.split('/').at(-1),data:()=>d}))})
 const runTransaction=async (_db,fn)=>fn({get:async key=>({exists:()=>store.has(key)}),set:(key,data)=>store.set(key,data),update:(key,data)=>store.set(key,{...store.get(key),...data})})
 const window={confirm:()=>false,open:()=>popupBlocked?null:{closed:false,opener:{},location:{replace:x=>opened.push(x)},close(){this.closed=true}},location:{assign:x=>opened.push(x)}}
 const ctx={ref,computed,onMounted:()=>{},onUnmounted:()=>{},collection,doc,query:c=>c,where:()=>null,stagingSession,
  readStagingSession:async()=>stagingSession.value,getStagingClients:()=>({db:{}}),getDocs,getDocFromServer,runTransaction,
  serverTimestamp:()=>({toMillis:()=>Date.now()}),Timestamp:{fromMillis:n=>({toMillis:()=>n})},isLiveMode:()=>true,isTestMode:()=>false,mayWriteLive:()=>writes,
  safeImage:x=>x||'',visibleInvite:x=>x.status==='pending',emailValid:x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x),
  coachRevocationEnabled:()=>false,LEGACY_EMAILJS_PUBLIC:{serviceId:'a',publicKey:'b',templateId:'c'},centralizedInvitesEnabled:()=>false,
  shareToken,shareWhatsappUrl,env,crypto:webcrypto,navigator:{clipboard:{writeText:async x=>copies.push(x)}},window,
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}}
 const script=new Function(...Object.keys(ctx),compiled+returns)(...Object.values(ctx))
 return {...script,store,copies,opened,setWrites:v=>writes=v,setPopupBlocked:v=>popupBlocked=v}
}
test('one click: athlete creates exactly one a1 token and copies it without second UI action',async()=>{
 const p=setup();await p.shareInOneClick('atleta','copy')
 assert.equal(p.store.size,1);assert.equal(p.copies.length,1)
 assert.ok(shareToken(p.copies[0],'atleta','gym_test123','https://www.lionfit.it')?.startsWith('a1'))
 assert.equal([...p.store.values()][0].status,'pending')
 await p.shareInOneClick('atleta','copy')
 assert.equal(p.store.size,1);assert.equal(p.copies[1],p.copies[0])
})
test('one click WhatsApp: prepares URL and leaves user to choose and confirm recipient',async()=>{
 const p=setup();await p.shareInOneClick('atleta','whatsapp')
 assert.equal(p.store.size,1);assert.equal(p.opened.length,1)
 const url=new URL(p.opened[0]);assert.equal(url.hostname,'wa.me')
 assert.ok(url.searchParams.get('text').includes('https://www.lionfit.it/www/index.html'))
 assert.match(p.status.value,/conferma tu/)
})
test('popup blocked still opens WhatsApp in the current tab',async()=>{
 const p=setup();p.setPopupBlocked(true);await p.shareInOneClick('atleta','whatsapp')
 assert.equal(p.opened.length,1);assert.match(p.opened[0],/^https:\/\/wa\.me\//)
})
test('collaborator requires exact email and owner privileges, no automatic delivery',async()=>{
 const p=setup();await p.shareInOneClick('coach','copy');assert.equal(p.store.size,0)
 p.coachEmail.value='COLLABORATORE@example.org';await p.shareInOneClick('coach','copy')
 assert.equal(p.store.size,1);assert.equal(p.copies.length,1)
 assert.equal([...p.store.values()][0].email,'collaboratore@example.org')
 p.stagingSession.value={uid:'coach2',gymId:'gym_test123',role:'collaboratore'}
 await p.shareInOneClick('coach','copy');assert.equal(p.copies.length,1)
})
test('pending revocation and cross-gym ownership block sharing existing links',async()=>{
 const p=setup();await p.shareInOneClick('atleta','copy')
 const id=[...p.store.keys()][0].split('/').at(-1),before=p.copies.length
 const pending={id,type:'atleta',status:'pending',createdBy:'owner123'}
 p.store.set([...p.store.keys()][0],{...p.store.get([...p.store.keys()][0]),status:'revoked'})
 await p.shareInOneClick('atleta','copy',pending)
 assert.equal(p.copies.length,before);assert.match(p.status.value,/revocato|usato|scaduto/)
 const q=setup();q.stagingSession.value={uid:'owner123',gymId:'gym_other123',role:'titolare'}
 await q.shareInOneClick('atleta','copy',pending);assert.equal(q.copies.length,0)
})
test('disabled writes never create token, copy, or WhatsApp link',async()=>{
 const p=setup();p.setWrites(false);await p.shareInOneClick('atleta','copy')
 assert.equal(p.store.size,0);assert.equal(p.copies.length,0)
})
