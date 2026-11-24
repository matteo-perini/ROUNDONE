import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {chatViewportGeometry,attachChatViewport} from '../src/features/chat/chatViewport.ts'
import {createMotionCue} from '../src/features/navigation/universalMotion.ts'
const base={width:390,layoutHeight:844,visibleHeight:844,offsetTop:0,scale:1,pageTop:138,dockTop:776,focused:false,baselineHeight:844,mobile:true}
test('bad or exhausted geometry returns fallback, never a collapsed chat',()=>{
 for(const change of [{pageTop:900},{dockTop:0},{pageTop:NaN},{visibleHeight:0},{offsetTop:Infinity},{pageTop:700}])assert.equal(chatViewportGeometry({...base,...change}).height,null)
 assert.deepEqual(chatViewportGeometry(base),{keyboard:false,height:632})
 assert.deepEqual(chatViewportGeometry({...base,focused:true,visibleHeight:490}),{keyboard:true,height:346})
})
test('invalid first rect automatically retries, recovers without resize, then cleans up',()=>{
 const names=['window','document','HTMLElement','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];const saved=Object.fromEntries(names.map(n=>[n,globalThis[n]]));let frames=new Map(),timers=new Map(),seq=0,top=900,height='',layouts=0
 class E{constructor(){this.isConnected=true;this.style={setProperty:(_,v)=>height=v,removeProperty:()=>height=''};this.classList={toggle(){}};this.handlers=new Map()}contains(){return false}addEventListener(n,f){this.handlers.set(n,f)}removeEventListener(n){this.handlers.delete(n)}getBoundingClientRect(){return {top}}}
 const root=new E(),vv={height:844,scale:1,offsetTop:0,addEventListener(){},removeEventListener(){}},win={innerWidth:390,innerHeight:844,visualViewport:vv,addEventListener(){},removeEventListener(){}}
 Object.assign(globalThis,{window:win,document:{activeElement:null,body:{setAttribute(){},removeAttribute(){}},querySelector:()=>({getClientRects:()=>[{}],getBoundingClientRect:()=>({top:776})})},HTMLElement:E,requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id)})
 const flush=map=>{const queued=[...map.values()];map.clear();queued.forEach(f=>f())}
 try{const viewport=attachChatViewport(root,{active:()=>true,mobile:()=>true,onLayout:()=>layouts++});flush(frames);assert.equal(height,'');assert.equal(timers.size,1);top=138;flush(timers);flush(frames);assert.equal(height,'632px');assert.equal(layouts,1);assert.equal(timers.size,0);top=900;viewport.schedule();flush(frames);assert.equal(height,'');assert.equal(timers.size,1);viewport.dispose();assert.equal(timers.size,0);assert.equal(frames.size,0);assert.equal(root.handlers.size,0)}finally{Object.assign(globalThis,saved)}
})
test('retries are bounded even if layout is permanently invalid',()=>{
 const names=['window','document','HTMLElement','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];const saved=Object.fromEntries(names.map(n=>[n,globalThis[n]]));let frames=[],timers=[],calls=0
 class E{isConnected=true;style={setProperty(){throw Error('invalid height must not be set')},removeProperty(){}};classList={toggle(){}};addEventListener(){}removeEventListener(){}getBoundingClientRect(){calls++;return {top:900}}}
 const vv={height:844,scale:1,offsetTop:0,addEventListener(){},removeEventListener(){}}
 Object.assign(globalThis,{window:{innerWidth:390,innerHeight:844,visualViewport:vv,addEventListener(){},removeEventListener(){}},document:{activeElement:null,body:{setAttribute(){},removeAttribute(){}},querySelector:()=>null},HTMLElement:E,requestAnimationFrame:fn=>{frames.push(fn);return 1},cancelAnimationFrame:()=>{},setTimeout:fn=>{timers.push(fn);return 2},clearTimeout:()=>{}})
 try{const v=attachChatViewport(new E(),{active:()=>true,mobile:()=>true,onLayout(){}});frames.shift()();while(timers.length){timers.shift()();frames.shift()();assert.ok(calls<=7)}assert.equal(calls,7);v.dispose()}finally{Object.assign(globalThis,saved)}
})
test('cue uses full viewport span and visible vertical position, not narrow root bounds',()=>{
 const old={document:globalThis.document,window:globalThis.window};class E{style={};children=[];append(...a){this.children.push(...a)}setAttribute(){}replaceChildren(){this.children=[]}remove(){this.removed=true}}
 const stage=Object.assign(new E(),{clientWidth:390,clientHeight:1000,clientTop:0,clientLeft:0,scrollLeft:0,scrollTop:70,getBoundingClientRect:()=>({left:0,top:-40})});const root={getBoundingClientRect:()=>({left:12,top:-100,width:366,height:900})}
 Object.assign(globalThis,{window:{innerHeight:760,visualViewport:{height:700,offsetTop:10}},document:{createElement:()=>new E()}})
 try{const cue=createMotionCue(stage,root);cue.paint(-120,-1,'Piano',{heading:'Programma reale',lines:['Settimana'],sections:[{heading:'Calendario',lines:['Lunedì']}]});const panel=stage.children[0];assert.equal(panel.style.left,'0px');assert.equal(panel.style.width,'390px');assert.equal(panel.style.height,'700px');assert.equal(panel.style.top,'120px');assert.equal(panel.style.transform,'translate3d(270px,0,0)');assert.equal(panel.children[1].children.length,2);assert.equal(panel.inert,true);cue.dispose();assert.equal(panel.removed,true)}finally{Object.assign(globalThis,old)}
})
test('chat fallback CSS and motion handoff retain a usable surface and clean up on reset',()=>{const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const chat=read('src/views/AthleteChatPreview.vue'),app=read('src/App.vue'),css=read('src/styles-continuous-motion.css');assert.equal((chat.match(/height:var\(--lf-chat-visible-height,max\(220px,calc\(100dvh - 180px\)\)\);min-height:112px/g)||[]).length,2);assert.match(app,/restoreDrag\(false,retainCue\)/);assert.match(app,/handoffCue=cue;handoffFrame=requestAnimationFrame/);assert.match(app,/function restoreDrag\(animateBack:boolean,retainCue=false\)\{\s*clearHandoffCue\(\)/);assert.match(css,/contain:layout paint/);assert.match(css,/pointer-events:none/)})
