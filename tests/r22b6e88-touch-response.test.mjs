import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileStyle} from '@vue/compiler-sfc'
import {createNativePageTrack,nativePagePaths,nativeTrackOffset} from '../src/features/navigation/nativePageTrack.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
function fixture(){
 const style=()=>({removeProperty(k){delete this[k]}}),panes=Object.fromEntries(nativePagePaths.map(p=>[p,{isConnected:true,style:style(),dataset:{}}])),animations=[];let reads=0
 const rail={isConnected:true,get clientWidth(){reads++;return 390},style:style(),dataset:{},querySelector(s){return panes[s.match(/"([^"]+)"/)[1]]},animate(frames,options){const a={frames,options,onfinish:null,oncancel:null,cancel(){this.cancelled=true;this.oncancel?.()}};animations.push(a);return a}}
 return {rail,track:createNativePageTrack(rail,'/home'),animations,reads:()=>reads,panes}
}
test('touch feedback accelerates existing visual press and release, excludes disabled controls',()=>{
 const css=read('src/styles-premium-motion.css'),home=read('src/styles-r14c-dashboard-rebuild.css')
 assert.match(css,/transition:scale 153ms[^;]+opacity 144ms/);assert.match(css,/:active:not\(:disabled\):not\(\[aria-disabled="true"\]\)\{scale:\.98;transition-duration:90ms,90ms\}/)
 assert.match(css,/transition:transform 414ms[^;]+width 414ms/)
 assert.match(home,/transition:transform 360ms[^;]+opacity 144ms/);assert.match(home,/:active:not\(:disabled\):not\(\[aria-disabled="true"\]\)\{opacity:\.94;transition-duration:360ms,315ms,315ms,90ms\}/)
 assert.match(home,/prefers-reduced-motion:reduce/)
})
test('dock CSS compiles, highlight 234ms and press changes only opacity of its contents',()=>{
 const {descriptor}=parse(read('src/components/AthleteBottomNavigation.vue')),style=descriptor.styles[0]
 const result=compileStyle({source:style.content,id:'data-v-e88',scoped:true});assert.deepEqual(result.errors,[])
 assert.match(result.code,/transition:transform 234ms[^;]+width 162ms[^;]+opacity 108ms/)
 assert.match(result.code,/\.lionfit-dock-item\[data-v-e88\]:active:not\(\[aria-disabled="true"\]\) svg\{opacity:\.82;transition-duration:90ms\}/)
 assert.match(result.code,/prefers-reduced-motion:reduce/);assert.match(result.code,/pointer-events:none/)
})
test('real rail stays 1:1 during drag, with the same geometry and no additional layout reads',()=>{
 const f=fixture();for(const x of [-1,-20,-130,-250,-350])assert.equal(f.track.paint('/home','/piano',x),nativeTrackOffset(x,390,1));assert.equal(f.reads(),1);assert.equal(f.rail.style.transform,`translate3d(${nativeTrackOffset(-350,390,1)}px,0,0)`);f.track.dispose()
})
test('tap, swipe release and cancel settle 10 percent faster with unchanged endpoints',()=>{
 const f=fixture();assert.ok(f.track.navigate('/home','/piano',340));let a=f.animations.at(-1);assert.equal(a.options.duration,306);assert.deepEqual(a.frames,[{transform:'translate3d(0px,0,0)'},{transform:'translate3d(-390px,0,0)'}]);a.onfinish()
 f.track.paint('/piano','/home',140);f.track.navigate('/piano','/home',250);a=f.animations.at(-1);assert.equal(a.options.duration,225);assert.deepEqual(a.frames,[{transform:'translate3d(140px,0,0)'},{transform:'translate3d(390px,0,0)'}]);a.onfinish()
 f.track.paint('/home','/messaggi',100);f.track.cancel(true);a=f.animations.at(-1);assert.equal(a.options.duration,122);assert.deepEqual(a.frames,[{transform:'translate3d(100px,0,0)'},{transform:'translate3d(0px,0,0)'}]);a.onfinish();assert.equal(f.track.moving(),false);assert.equal(f.rail.dataset.lfTrackMoving,undefined);f.track.dispose()
})
test('zero duration remains instantaneous; rapid navigation invalidates earlier settlement',()=>{
 const f=fixture();assert.ok(f.track.navigate('/home','/piano',0));assert.equal(f.animations.length,0);assert.ok(f.track.navigate('/piano','/archivio',340));const old=f.animations.at(-1);assert.ok(f.track.navigate('/archivio','/progressi',340));assert.equal(old.cancelled,true);assert.equal(old.onfinish,null);f.animations.at(-1).onfinish();assert.equal(f.track.moving(),false);f.track.dispose()
})
