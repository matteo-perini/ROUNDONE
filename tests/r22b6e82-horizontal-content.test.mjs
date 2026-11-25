import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DATA_REVEAL_MS,installRoundOneMotion,entranceTargets} from '../src/features/motion/roundOneMotion.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
function harness(){
 const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement}
 const calls=[],events=new Map(),winEvents=new Map();let dir,nav,change,moving=false
 class El{
  constructor(classes=[],children=[]){this.classes=classes;this.children=children;this.isConnected=true;this.blocked=false;this.queries=new Map();for(const e of children)e.parent=this}
  matches(s){return s.split(',').some(x=>x.startsWith('.')&&this.classes.includes(x.slice(1)))}
  closest(s){return s.includes('[inert]')&&this.blocked?this:this.parent?.closest(s)||null}
  contains(el){return this.children.some(e=>e===el||e.contains(el))}
  querySelector(s){return this.queries.get(s)||null}
  animate(frames,options){const a={el:this,frames,options,cancelled:false,cancel(){this.cancelled=true;this.oncancel?.()}};calls.push(a);return a}
 }
 const media={matches:false,addEventListener:(_,fn)=>change=fn}
 globalThis.HTMLElement=El;globalThis.window={matchMedia:()=>media,addEventListener:(e,f)=>winEvents.set(e,f)}
 globalThis.document={hidden:false,querySelector:()=>moving?{}:null,addEventListener:(e,f)=>events.set(e,f)}
 const router={afterEach:f=>nav=f},app={directive:(name,v)=>{assert.equal(name,'lf-entrance');dir=v}}
 installRoundOneMotion(router,app)
 const group=(id='g',ready=true)=>({id,ready,rows:[{match:'.card'}]})
 const list=n=>new El([],Array.from({length:n},()=>new El(['card'])))
 const mount=(el,value)=>dir.mounted(el,{value}),update=(el,oldValue,value)=>dir.updated(el,{oldValue,value})
 const add=(root,n)=>{const nodes=list(n).children;for(const e of nodes)e.parent=root;root.children.push(...nodes);return nodes}
 return {calls,group,list,El,mount,update,add,unmount:el=>dir.beforeUnmount(el),stageMoving:v=>moving=v,nav:()=>nav({path:'/piano'},{path:'/home'}),emit:e=>winEvents.get(e)(),reduce(){media.matches=true;change()},hide(){document.hidden=true;events.get('visibilitychange')()},dispose:()=>Object.assign(globalThis,previous)}
}
const run=fn=>{const h=harness();try{fn(h)}finally{h.dispose()}}
test('ready pages, warm returns and ready remounts never replay navigation effects',()=>run(h=>{h.mount(h.list(5),h.group());h.nav();h.mount(h.list(5),h.group());assert.equal(h.calls.length,0)}))
test('only newly inserted children on first explicit ready transition fade immediately, never existing header or updates',()=>run(h=>{const r=h.list(1),a=h.group('g',false),b=h.group();h.mount(r,a);const added=h.add(r,3);h.update(r,a,b);assert.equal(h.calls.length,3);assert.deepEqual(h.calls.map(x=>x.el),added);for(const x of h.calls){assert.equal(x.options.duration,160);assert.equal(x.options.delay,0);assert.deepEqual(x.frames,[{opacity:.94},{opacity:1}])}h.add(r,2);h.update(r,b,b);h.update(r,b,a);h.update(r,a,b);assert.equal(h.calls.length,3)}))
test('moving page permanently skips reveal rather than waiting to settle',()=>run(h=>{const r=h.list(0),a=h.group('g',false),b=h.group();h.mount(r,a);h.add(r,3);h.stageMoving(true);h.update(r,a,b);h.stageMoving(false);h.update(r,b,b);assert.equal(h.calls.length,0)}))
test('inactive, hidden and reduced-motion groups never animate',()=>{for(const block of [h=>h.reduce(),h=>h.hide(),(h,r)=>{r.blocked=true}])run(h=>{const r=h.list(0),a=h.group('g',false);h.mount(r,a);h.add(r,2);block(h,r);h.update(r,a,h.group());assert.equal(h.calls.length,0)})})
test('real data fade is capped to six and cancelled by a new swipe, navigation, or identity reset',()=>{for(const stop of [h=>h.emit('lionfit:content-gesture-start'),h=>h.nav(),h=>h.emit('lionfit:content-scope-invalidated')])run(h=>{const r=h.list(0),a=h.group('g',false);h.mount(r,a);h.add(r,20);h.update(r,a,h.group());assert.equal(h.calls.length,6);stop(h);assert.ok(h.calls.every(a=>a.cancelled))})})
test('nested target excluded; brand and status excluded; no animation of shell',()=>run(h=>{const child=h.list(1);child.classes=['card'];const brand=new h.El(['card','lf14-gym-identity']);const r=new h.El([],[child,brand]);r.queries.set('.inner',child);assert.deepEqual(entranceTargets(r,{id:'nested',rows:[{match:'.card'},{within:'.inner',match:'.card'}]}),[child])}))
test('a group first mounted ready then refetched does not animate',()=>run(h=>{const r=h.list(1),b=h.group(),a=h.group('g',false);h.mount(r,b);h.update(r,b,a);h.add(r,3);h.update(r,a,b);assert.equal(h.calls.length,0)}))
test('identity change or missing explicit ready flag cannot trigger a reveal',()=>run(h=>{for(const next of [{id:'other',ready:true,rows:[{match:'.card'}]},{id:'g',rows:[{match:'.card'}]}]){const r=h.list(0),a=h.group('g',false);h.mount(r,a);h.add(r,3);h.update(r,a,next)}assert.equal(h.calls.length,0)}))
test('unmount cancels an active data fade; duration is 160ms',()=>run(h=>{const r=h.list(0),a=h.group('g',false);h.mount(r,a);h.add(r,2);h.update(r,a,h.group());h.unmount(r);assert.equal(DATA_REVEAL_MS,160);assert.ok(h.calls.every(a=>a.cancelled))}))
test('children already present while loading remain visually stable',()=>run(h=>{const r=h.list(0),a=h.group('g',false);h.mount(r,a);h.add(r,2);h.update(r,a,a);h.update(r,a,h.group());assert.equal(h.calls.length,0)}))
test('explicit archive row containers and verified chat contacts are targeted; no shell or editor animation',()=>{assert.match(read('src/views/AthleteLiveWorkspace.vue'),/within:'.lf-r15-archive-rows',match:'.lf-archive-v4-item'/);assert.match(read('src/views/LiveCoachTemplates.vue'),/ready:modelsReady,rows:\[\{within:'.lf-mobile-archive-grid'/);assert.match(read('src/views/AthleteChatPreview.vue'),/ready:verified&&!loading&&!hintVisible&&!currentId/);assert.match(read('src/views/Library.vue'),/ready:!selectionMode&&!loading&&!failed/);assert.match(read('src/App.vue'),/lionfit:content-gesture-start/);assert.doesNotMatch(read('src/features/motion/roundOneMotion.ts'),/MutationObserver|getBoundingClientRect|getComputedStyle|offsetWidth|offsetHeight|setTimeout\(/)})
