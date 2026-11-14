import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {gymName,safeImage} from '../src/features/platform/platformModel.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const gym='gyms/gym1',brand=gym+'/identity/appearance',logo='data:image/png;base64,AA==',cover='data:image/jpeg;base64,BB=='
const s={uid:'owner1',gymId:'gym1',role:'titolare'},key='owner1|gym1|titolare'
function fixture({denied=[],role='titolare',ownerUid='owner1',storedBrand,commitFailure=false}={}){
 const docs=new Map([[gym,{name:'Leoni di Sa Marco',ownerUid}]]),reads=[],writes=[],listeners=new Map()
 if(storedBrand)docs.set(brand,structuredClone(storedBrand))
 const doc=(_db,...p)=>p.join('/'),snap=p=>({exists:()=>docs.has(p),data:()=>structuredClone(docs.get(p)),metadata:{fromCache:false,hasPendingWrites:false}})
 const authError=()=>Object.assign(Error('denied'),{code:'permission-denied'})
 const sdk={doc,serverTimestamp:()=>42,getDocFromServer:async p=>{reads.push(p);if(denied.includes(p))throw authError();return snap(p)},onSnapshot:(p,_o,next,fail)=>{listeners.set(p,{next,fail});return()=>listeners.delete(p)},runTransaction:async(_db,fn)=>{const pending=[];await fn({get:async p=>{assert.equal(pending.length,0);reads.push(p);if(denied.includes(p))throw authError();return snap(p)},update:(p,d)=>pending.push([p,{...docs.get(p),...d}]),set:(p,d)=>pending.push([p,d])});if(commitFailure)throw authError();for(const [p,d] of pending){docs.set(p,d);writes.push(p)}}}
 const code=ts.transpileModule(read('src/integrations/firestore/platform.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const mod={exports:{}},session={...s,role};const modules={'firebase/firestore':sdk,'../firebase/stagingClient':{getStagingClients:()=>({db:{}})},'../firebase/stagingConfig':{mayWriteLive:()=>true,isStagingMode:()=>true},'../firebase/stagingSession':{readStagingSession:async()=>session},'../firebase/platformAccess':{},'../../features/platform/platformModel':{gymName,safeImage,accountKey:x=>`${x.uid}|${x.gymId}|${x.role}`}}
 new Function('require','module','exports',code)(id=>modules[id],mod,mod.exports)
 return {api:mod.exports,docs,reads,writes,listeners,snap}
}
const settle=()=>new Promise(r=>setImmediate(r))
test('missing appearance is valid; name and empty images load independently',async()=>{const f=fixture(),events=[];const stop=f.api.watchGymIdentity(s,v=>events.push(v));await settle();assert.equal(events.at(-1).appearance.state,'ready');assert.equal(events.at(-1).identity.name,'Leoni di Sa Marco');assert.equal(events.at(-1).identity.logo,'');stop();assert.equal(f.listeners.size,0)})
test('appearance denied: name remains readable and error is explicit',async()=>{const f=fixture({denied:[brand]}),events=[];f.api.watchGymIdentity(s,v=>events.push(v));await settle();assert.equal(events.at(-1).gym.state,'ready');assert.equal(events.at(-1).appearance.message,'permission-denied');assert.equal(events.at(-1).identity.name,'Leoni di Sa Marco')})
test('gym denied: no fabricated name or indefinite loading',async()=>{const f=fixture({denied:[gym]}),events=[];f.api.watchGymIdentity(s,v=>events.push(v));await settle();assert.equal(events.at(-1).gym.state,'error');assert.equal(events.at(-1).identity.name,'')})
test('updates from both authorized listeners propagate; stop prevents updates',async()=>{const f=fixture(),events=[];const stop=f.api.watchGymIdentity(s,v=>events.push(v));await settle();f.docs.set(gym,{name:'Leoni di San Marco',ownerUid:s.uid});f.docs.set(brand,{logo,cover});f.listeners.get(gym).next(f.snap(gym));const late=f.listeners.get(brand).next;late(f.snap(brand));assert.deepEqual(events.at(-1).identity,{name:'Leoni di San Marco',logo,cover});stop();const n=events.length;late(f.snap(brand));assert.equal(events.length,n)})
test('name-only change never reads or overwrites appearance',async()=>{const f=fixture({denied:[brand],storedBrand:{logo,cover}});await f.api.saveGymIdentity({name:'Leoni di San Marco',logo:'',cover:''},key,['name']);assert.equal(f.docs.get(gym).name,'Leoni di San Marco');assert.deepEqual(f.docs.get(brand),{logo,cover});assert.deepEqual(f.reads,[gym]);assert.deepEqual(f.writes,[gym])})
test('first image creates appearance with both required fields',async()=>{const f=fixture();await f.api.saveGymIdentity({name:'',logo,cover:''},key,['logo']);assert.deepEqual(f.docs.get(brand),{logo,cover:'',updatedAt:42});assert.deepEqual(f.writes,[brand])})
test('editing cover preserves current logo, does not rename gym',async()=>{const f=fixture({storedBrand:{logo,cover:''}});await f.api.saveGymIdentity({name:'wrong',logo:'',cover},key,['cover']);assert.deepEqual(f.docs.get(brand),{logo,cover,updatedAt:42});assert.equal(f.docs.get(gym).name,'Leoni di Sa Marco')})
test('wrong owner, collaborator, changed account or failed commit cannot change data',async()=>{for(const [options,k] of [[{ownerUid:'different'},key],[{role:'collaboratore'},'owner1|gym1|collaboratore'],[{},'other|gym1|titolare'],[{commitFailure:true},key]]){const f=fixture(options),before=structuredClone(f.docs);await assert.rejects(f.api.saveGymIdentity({name:'New',logo,cover},k,['name','logo']));assert.deepEqual(f.docs,before);assert.equal(f.writes.length,0)}})
