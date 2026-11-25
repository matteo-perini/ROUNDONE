import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const compiled=ts.transpileModule(read('src/features/motion/quietLoading.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(){let i=0;const timers=new Map(),events=[],mod={exports:{}};vm.runInNewContext(compiled,{exports:mod.exports,module:mod,require:()=>({ref:value=>({value})}),setTimeout:(f,d)=>{assert.equal(d,350);timers.set(++i,f);return i},clearTimeout:id=>timers.delete(id)});return {tracker:mod.exports.createQuietLoadingTracker(v=>events.push(v)),events,timers,flush(){for(const [id,f] of [...timers]){timers.delete(id);f()}}}}
test('fast reads never show a loading indicator',()=>{const h=harness(),key={};h.tracker.begin(key);h.tracker.end(key);h.flush();assert.deepEqual(h.events,[]);assert.equal(h.timers.size,0)})
test('overlapping slow reads share one indicator, last completion removes it immediately',()=>{const h=harness(),a={},b={};h.tracker.begin(a);h.tracker.begin(a);h.tracker.begin(b);assert.equal(h.timers.size,1);h.flush();assert.deepEqual(h.events,[true]);h.tracker.end(a);assert.deepEqual(h.events,[true]);h.tracker.end(b);assert.deepEqual(h.events,[true,false]);assert.equal(h.timers.size,0);h.tracker.begin({});assert.equal(h.timers.size,1)})
test('loading feedback is local and independent of premium rollback',()=>{const css=read('src/styles-quiet-loading.css'),main=read('src/main.ts');assert.match(css,/\.lf-quiet-status\{position:absolute!important/);assert.doesNotMatch(css,/\.lf-quiet-indicator\{/);assert.match(css,/\.lf-quiet-status\[data-lf-local-loading\]\{position:static!important/);assert.match(main,/finally\{clearTimeout\(splashTimer\)\}/);assert.match(main,/app.directive\('lf-quiet-loading',quietLoading\)/);assert.equal((read('src/App.vue').match(/class="lf-quiet-indicator"/g)||[]).length,0);assert.doesNotMatch(read('src/features/motion/premiumMotionTabs.ts'),/getBoundingClientRect/);assert.match(read('src/views/LiveCoachAthletes.vue'),/rosterReady&&!error&&!visibleAthletes.length/)})
test('tab indicator starts in position, slides on selection, snaps only on actual resize',()=>{
 const code=ts.transpileModule(read('src/features/motion/premiumMotionTabs.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 let uid=0,resize,disconnected=false;const frames=new Map(),mod={exports:{}}
 class El{constructor(left=0,width=100){this.offsetLeft=left;this.offsetTop=0;this.offsetWidth=width;this.offsetHeight=40;this.isConnected=true;this.children=[];this.selected=false;this.attrs=new Set();this.vars=new Map();this.style={setProperty:(k,v)=>this.vars.set(k,v)};this.classList={add(){}}}matches(){return this.selected}setAttribute(k){this.attrs.add(k)}removeAttribute(k){this.attrs.delete(k)}hasAttribute(k){return this.attrs.has(k)}toggleAttribute(k,v){v?this.attrs.add(k):this.attrs.delete(k)}}
 class Obs{constructor(fn){resize=fn}observe(){}unobserve(){}disconnect(){disconnected=true}}
 vm.runInNewContext(code,{exports:mod.exports,module:mod,require:()=>({PREMIUM_MOTION_ENABLED:true}),HTMLElement:El,ResizeObserver:Obs,window:{removeEventListener(){}},requestAnimationFrame:f=>{frames.set(++uid,f);return uid},cancelAnimationFrame:id=>frames.delete(id)})
 const el=new El(0,320),a=new El(0,100),b=new El(100,100);el.children=[a,b];a.selected=true;const d=mod.exports.premiumMotionTabs,flush=()=>{for(const [id,f] of [...frames]){frames.delete(id);f()}}
 d.mounted(el);flush();assert.equal(el.vars.get('--lf-tab-x'),'0px');assert.equal(el.hasAttribute('data-lf-tab-slide'),false)
 a.selected=false;b.selected=true;d.updated(el);resize();flush();assert.equal(el.vars.get('--lf-tab-x'),'100px');assert.equal(el.hasAttribute('data-lf-tab-slide'),true)
 resize();flush();assert.equal(el.hasAttribute('data-lf-tab-slide'),true)
 b.offsetLeft=120;resize();flush();assert.equal(el.vars.get('--lf-tab-x'),'120px');assert.equal(el.hasAttribute('data-lf-tab-slide'),false)
 d.beforeUnmount(el);assert.equal(disconnected,true);assert.equal(frames.size,0)
})

test('E.8.2.1 status is local, accessible and never registers a global read timer',()=>{const mod={exports:{}};vm.runInNewContext(compiled,{exports:mod.exports,module:mod,require:()=>({}),setTimeout:()=>{throw Error('unexpected timer')}});const attrs=new Map();const el={setAttribute:(k,v)=>attrs.set(k,v),hasAttribute:k=>attrs.has(k)};mod.exports.quietLoading.mounted(el);assert.equal(attrs.get('data-lf-local-loading'),'true');assert.equal(attrs.get('role'),'status');assert.equal(attrs.has('aria-hidden'),false);assert.equal(mod.exports.quietLoadingVisible,undefined)})
