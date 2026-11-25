import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {roundOneMotionOptions,ROUNDONE_MOTION,ROUNDONE_TITLE_FRAMES,ROUNDONE_PANEL_FRAMES} from '../src/features/motion/roundOneMotion.ts'
import ts from 'typescript'
import vm from 'node:vm'
import {isMobileSectionSlide} from '../src/features/navigation/continuousMotion.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const compiled=ts.transpileModule(read('src/features/motion/roundOneMotion.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(){
 let clock=10,id=0,nav,dir,mediaChange
 const calls=[],ticks=[],frames=new Map(),events=new Map(),winEvents=new Map()
 class El{
  constructor(tag='div',classes=[],children=[]){this.tag=tag;this.classes=classes;this.children=children;this.isConnected=true;this.blocked=false;this.moving=false;this.queries=new Map();for(const e of children)e.parent=this}
  matches(s){return s.split(',').some(x=>x.startsWith('.')?this.classes.includes(x.slice(1)):x===this.tag)}
  closest(s){return (s.includes('[inert]')&&this.blocked||s.includes('[data-lf-motion-dragging]')&&this.moving)?this:this.parent?.closest(s)||null}
  contains(el){return this.children.some(e=>e===el||e.contains(el))}
  querySelector(s){return this.queries.get(s)||null}
  animate(frames,options){const a={el:this,frames,options,cancelled:false,cancel(){this.cancelled=true;this.oncancel?.()}};calls.push(a);return a}
 }
 const doc={hidden:false,querySelector:()=>null,addEventListener:(e,f)=>events.set(e,f)},media={matches:false,addEventListener:(_,f)=>mediaChange=f}
 const router={currentRoute:{value:{path:'/home',fullPath:'/home'}},afterEach:f=>nav=f},app={directive:(_,v)=>dir=v}
 const mod={exports:{}}
 vm.runInNewContext(compiled,{exports:mod.exports,module:mod,require:id=>id==='vue'?{nextTick:f=>{ticks.push(f);return Promise.resolve()}}:id.includes('continuousMotion')?{isMobileSectionSlide}:{PREMIUM_MOTION_ENABLED:true},HTMLElement:El,window:{matchMedia:()=>media,innerWidth:390,addEventListener:(e,f)=>winEvents.set(e,f)},document:doc,CSS:{supports:()=>true},performance:{now:()=>clock},requestAnimationFrame:f=>{frames.set(++id,f);return id},cancelAnimationFrame:i=>frames.delete(i)})
 mod.exports.installRoundOneMotion(router,app)
 const group=(id,ready=true)=>({id,ready,rows:[{match:'.card'}]})
 const list=n=>new El('div',[],Array.from({length:n},()=>new El('article',['card'])))
 return {El,calls,group,list,mount:(el,value)=>dir.mounted(el,{value}),update:(el,oldValue,value)=>dir.updated(el,{oldValue,value}),unmount:el=>dir.beforeUnmount(el),flush(){while(ticks.length)ticks.shift()();for(const [i,f] of [...frames]){frames.delete(i);f(clock)}},nav(path){const from=router.currentRoute.value,to={path,fullPath:path};router.currentRoute.value=to;nav(to,from)},advance:n=>clock+=n,emit:e=>winEvents.get(e)(),input:e=>events.get(e)(),reduce(){media.matches=true;mediaChange()}}
}
test('approved motion parameters: 550ms, 28px, 55ms stagger bounded to 165ms; no scale',()=>{for(const role of ['title','panel','row','page']){assert.equal(roundOneMotionOptions(role,0).duration,550);assert.equal(roundOneMotionOptions(role,1).delay,55);assert.equal(roundOneMotionOptions(role,50).delay,165);assert.equal(roundOneMotionOptions(role,0).easing,'cubic-bezier(.16,1,.3,1)')}assert.equal(ROUNDONE_MOTION.maxPanels,8);for(const frames of [ROUNDONE_TITLE_FRAMES,ROUNDONE_PANEL_FRAMES]){assert.equal(frames[0].translate,'28px 0');assert.equal(frames[0].opacity,.12);assert.equal(frames[0].scale,undefined)}})
test('mobile already mounted data is not animated during a route slide; a cold late data edge after settlement can reveal once',()=>{const h=harness();h.flush();h.nav('/piano');const warm=h.list(3),cold=h.list(3),a=h.group('warm'),b=h.group('cold',false);h.mount(warm,a);h.mount(cold,b);h.flush();assert.equal(h.calls.length,0);h.advance(400);h.update(cold,b,h.group('cold'));h.flush();assert.equal(h.calls.length,3);assert.ok(h.calls.every(a=>a.options.duration===550&&a.frames[0].opacity===.72));h.update(cold,h.group('cold'),h.group('cold'));h.flush();assert.equal(h.calls.length,3)})
test('late data during active slide is displayed directly and is not replayed after the track settles',()=>{const h=harness();h.nav('/piano');const root=h.list(3),g=h.group('cold',false);h.mount(root,g);h.flush();root.moving=true;h.update(root,g,h.group('cold'));h.flush();assert.equal(h.calls.length,0);root.moving=false;h.update(root,h.group('cold'),h.group('cold'));h.flush();assert.equal(h.calls.length,0)})
test('inactive real pane never animates, and a confirmed swipe cancels running content animation',()=>{const h=harness();const a=h.list(2),b=h.list(2);b.blocked=true;h.mount(a,h.group('active'));h.mount(b,h.group('inactive'));h.flush();assert.equal(h.calls.length,2);h.input('pointerdown');assert.ok(h.calls.every(a=>!a.cancelled));h.emit('lionfit:content-gesture-start');assert.ok(h.calls.every(a=>a.cancelled));h.nav('/piano');b.blocked=false;h.flush();assert.equal(h.calls.length,2)})
test('warm returns skip already presented groups, scope invalidation clears the visual history and pending effects',()=>{const h=harness();const a=h.list(2);h.mount(a,h.group('same'));h.flush();assert.equal(h.calls.length,2);h.nav('/piano');h.unmount(a);h.flush();h.nav('/home');const returning=h.list(2);h.mount(returning,h.group('same'));h.flush();assert.equal(h.calls.length,2);h.emit('lionfit:content-scope-invalidated');h.unmount(returning);h.nav('/impostazioni');h.mount(h.list(1),h.group('same'));h.flush();assert.equal(h.calls.length,3);h.reduce();assert.ok(h.calls.every(a=>a.cancelled))})
test('explicit archive row containers and verified chat contacts are targeted; no shell or editor animation',()=>{assert.match(read('src/views/AthleteLiveWorkspace.vue'),/within:'.lf-r15-archive-rows',match:'.lf-archive-v4-item'/);assert.match(read('src/views/LiveCoachTemplates.vue'),/ready:modelsReady,rows:\[\{within:'.lf-mobile-archive-grid'/);assert.match(read('src/views/AthleteChatPreview.vue'),/ready:verified&&!loading&&!hintVisible&&!currentId/);assert.match(read('src/views/Library.vue'),/ready:!selectionMode&&!loading&&!failed/);assert.match(read('src/App.vue'),/lionfit:content-gesture-start/);assert.doesNotMatch(read('src/features/motion/roundOneMotion.ts'),/MutationObserver|getBoundingClientRect|getComputedStyle|offsetWidth|offsetHeight|setTimeout\(/)})

test('a late mounted group can reveal once after a stable mobile route; unmount cancels its effects',()=>{const h=harness();h.flush();h.nav('/piano');h.flush();h.advance(500);const root=h.list(2);h.mount(root,h.group('fresh'));h.flush();assert.equal(h.calls.length,2);h.unmount(root);assert.ok(h.calls.every(a=>a.cancelled))})
test('nested candidate inside a selected panel is not independently animated',()=>{const h=harness();const nested=h.list(2);nested.classes=['card'];const root=new h.El('div',[],[nested]);root.queries.set('.inner',nested);h.mount(root,{id:'nested',rows:[{match:'.card'},{within:'.inner',match:'.card'}]});h.flush();assert.equal(h.calls.length,1);assert.equal(h.calls[0].el,nested)})
