import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createWarmSessionStream} from '../src/features/performance/warmSessionStream.ts'
import {createMotionCue} from '../src/features/navigation/universalMotion.ts'
import {attachChatViewport} from '../src/features/chat/chatViewport.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const subscriber=(next=()=>{},reset=()=>{})=>({next,reset})

test('reset re-entrancy cannot join a different identity during lease replacement',()=>{
 const lease=createWarmSessionStream();let publishB,receivedC=[],resetC=0,stopA=0
 lease.acquire('A',()=>true,()=>()=>{stopA++},subscriber(()=>{},()=>{lease.acquire('B',()=>true,p=>{publishB=p;return()=>{}},subscriber())}))
 lease.acquire('C',()=>true,()=>{throw Error('must not replace nested scope')},subscriber(v=>receivedC.push(v),()=>resetC++))
 publishB('private B');assert.deepEqual(receivedC,[]);assert.equal(stopA,1);assert.equal(resetC,1);lease.invalidate()
})
test('validity is checked between subscribers when a callback synchronously changes scope',()=>{
 const lease=createWarmSessionStream();let publish,valid=true,seen=[],resets=0,stopped=0
 lease.acquire('A',()=>valid,p=>{publish=p;return()=>stopped++},subscriber(()=>{valid=false},()=>resets++))
 lease.acquire('A',()=>valid,()=>{throw Error('duplicate')},subscriber(v=>seen.push(v),()=>resets++))
 publish('private');assert.deepEqual(seen,[]);assert.equal(resets,2);assert.equal(stopped,1)
})
test('scope invalidated by a reset is not used to open a fresh source',()=>{
 const lease=createWarmSessionStream();let valid=true,started=0,resets=0
 lease.acquire('A',()=>true,()=>()=>{},subscriber(()=>{},()=>{valid=false}))
 lease.acquire('B',()=>valid,()=>{started++;return()=>{}},subscriber(()=>{},()=>resets++))
 assert.equal(started,0);assert.equal(resets,1);lease.invalidate()
})
test('stale idle callback cannot close a newer warm lease',()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let tasks=[],now=0,stops=0,publish
 globalThis.setTimeout=fn=>{tasks.push(fn);return tasks.length};globalThis.clearTimeout=()=>{}
 try{const lease=createWarmSessionStream(100,()=>now);const a=lease.acquire('A',()=>true,p=>{publish=p;return()=>stops++},subscriber());publish('data');a();now=50;const b=lease.acquire('A',()=>true,()=>{throw Error('duplicate')},subscriber());b();now=100;tasks[0]();assert.equal(stops,0);now=150;tasks[1]();assert.equal(stops,1)}finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear}
})
// Small DOM substitute: observe actual projection render operations, not strings in source.
test('cue rebuilds only on changed content, not on repeated movement frames',()=>{
 const old=globalThis.document;let nodes=0,clears=0
 class Element{constructor(){this.style={};this.children=[];this.hidden=false;this.inert=false;nodes++}setAttribute(){}append(...n){this.children.push(...n)}replaceChildren(){clears++;this.children=[]}remove(){this.removed=true}getBoundingClientRect(){return {left:0,top:0,width:390}}}
 globalThis.document={createElement:()=>new Element()}
 try{const stage=Object.assign(new Element(),{clientWidth:390,clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0}),root=new Element();const cue=createMotionCue(stage,root),summary={heading:'Plan',lines:['Week']};cue.paint(10,1,'Piano',summary);const baseline={nodes,clears};for(let x=11;x<100;x++)cue.paint(x,1,'Piano',summary);assert.deepEqual({nodes,clears},baseline);cue.paint(0,0,'',null);const hiddenClears=clears;cue.paint(0,0,'',null);assert.equal(clears,hiddenClears);cue.paint(-20,-1,'Archivio',null);assert.equal(stage.children[0].hidden,false);assert.equal(stage.children[0].inert,true);cue.dispose();assert.equal(stage.children[0].removed,true)}finally{globalThis.document=old}
})
test('unfocused viewport establishes a fresh baseline, avoiding keyboard false positive after height-only resize',()=>{
 const saved={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};let frames=[],attrs=new Set()
 class E{constructor(){this.isConnected=true;this.style={setProperty(){},removeProperty(){}};this.classList={toggle(){}}}contains(el){return el===field}matches(){return true}addEventListener(){}removeEventListener(){}getBoundingClientRect(){return {top:100}}}
 const root=new E(),field=new E(),vv={height:900,scale:1,offsetTop:0,addEventListener(){},removeEventListener(){}},win={innerWidth:390,innerHeight:900,visualViewport:vv,addEventListener(){},removeEventListener(){}}
 Object.assign(globalThis,{window:win,document:{activeElement:null,body:{setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k)},querySelector:()=>null},HTMLElement:E,requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame:()=>{}})
 const flush=()=>{for(const f of frames.splice(0))f()}
 try{const v=attachChatViewport(root,{active:()=>true,mobile:()=>true,onLayout:()=>{}});flush();win.innerHeight=700;vv.height=700;v.schedule();flush();document.activeElement=field;v.schedule();flush();assert.equal(attrs.has('data-lf-chat-keyboard'),false);vv.height=400;v.schedule();flush();assert.equal(attrs.has('data-lf-chat-keyboard'),true);document.activeElement=null;v.dispose();assert.equal(attrs.size,0)}finally{Object.assign(globalThis,saved)}
})
test('route audit keys by route object, drops stale frames and removes callbacks on teardown',()=>{const s=read('src/features/performance/motionAudit.ts');assert.match(s,/WeakMap<RouteLocationNormalized/);assert.match(s,/router.currentRoute.value!==to/);assert.match(s,/cancelAnimationFrame\(id\)/);assert.doesNotMatch(s,/fetch\(|sendBeacon\(/)})
test('chat contact lookup uses one index and memoized query; normal authorization checks remain',()=>{const s=read('src/views/AthleteChatPreview.vue');assert.match(s,/threadPeers=computed\(\(\)=>new Set/);assert.match(s,/!threadPeers.value.has\(c.uid\)/);assert.match(s,/v-for="t in filteredThreads"/);assert.match(s,/!verified.value\|\|!active\(generation\)/)})
test('rail observer excludes cue-only insertion, removal and text edits',()=>{const s=read('src/features/navigation/swipeRails.ts');assert.match(s,/changed.every\(insideCue\)/);assert.match(s,/node.parentElement/);assert.match(s,/ResizeObserver/)})
