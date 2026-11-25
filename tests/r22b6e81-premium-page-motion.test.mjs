import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createPremiumSeam,premiumSeamOpacity,premiumSeamX,PREMIUM_SEAM_WIDTH} from '../src/features/navigation/premiumPageSeam.ts'
function fixture(reduced=false){
 const nodes=[];let animations=[]
 const doc={defaultView:{matchMedia:()=>({matches:reduced})},createElement(){return {style:{},setAttribute(k,v){this[k]=v},remove(){this.removed=true},animate(frames,options){const a={frames,options,cancel(){this.cancelled=true}};animations.push(a);return a}}}}
 const host={ownerDocument:doc,append(el){nodes.push(el)}}
 return {host,nodes,animations}
}
test('visual separation is bounded and disappears near both rest edges',()=>{
 assert.equal(PREMIUM_SEAM_WIDTH,14)
 for(const width of [320,390,850])for(const d of [-1,1]){
  assert.equal(premiumSeamOpacity(0,width),0);assert.equal(premiumSeamOpacity(d*7,width),.5);assert.equal(premiumSeamOpacity(d*14,width),1);assert.equal(premiumSeamOpacity(d*(width-7),width),.5);assert.equal(premiumSeamOpacity(d*width,width),0)
 }
 assert.equal(premiumSeamOpacity(NaN,390),0);assert.equal(premiumSeamOpacity(10,0),0)
})
test('both directions keep the same physical seam without altering page travel',()=>{for(const span of [320,390,850])for(const progress of [0,.1,.5,1]){assert.equal(premiumSeamX(-span*progress,span,-1),span*(1-progress));assert.equal(premiumSeamX(span*progress,span,1),span*progress)}})
test('decoration is inert, 14px, has no per-frame DOM allocation, shares timing and cleans up',()=>{
 const f=fixture(),seam=createPremiumSeam(f.host,{left:390,top:12,height:650}),el=f.nodes[0];assert.ok(seam);assert.equal(el.style.left,'383px');assert.equal(el.style.width,'14px');assert.equal(el.style.height,'650px');assert.equal(el.inert,true);assert.equal(el['aria-hidden'],'true')
 for(let i=0;i<200;i++)seam.paint(-i,1);assert.equal(f.nodes.length,1);assert.equal(el.style.transform,'translate3d(-199px,0,0)');seam.settle(-199,1,-390,240,'ease',1000);assert.equal(f.animations[0].startTime,1000);assert.equal(f.animations[0].options.duration,240);assert.equal(f.animations[0].frames.at(-1).opacity,0);assert.equal(f.animations[0].frames.at(-1).transform,'translate3d(-390px,0,0)');seam.dispose();seam.dispose();assert.equal(el.removed,true);assert.equal(f.animations[0].cancelled,true)
})
test('reduced motion, missing document, invalid bounds and WAAPI errors degrade safely',()=>{
 const f=fixture(true);assert.equal(createPremiumSeam(f.host,{left:0,top:0,height:500}),null);assert.equal(f.nodes.length,0);assert.equal(createPremiumSeam({}, {left:0,top:0,height:500}),null)
 const g=fixture();assert.equal(createPremiumSeam(g.host,{left:NaN,top:0,height:500}),null);assert.equal(createPremiumSeam(g.host,{left:0,top:0,height:0}),null);const s=createPremiumSeam(g.host,{left:0,top:0,height:'100%'});g.nodes[0].animate=()=>{throw Error('unsupported')};s.settle(0,1,0,300,'ease');assert.equal(g.nodes[0].style.opacity,'0');s.dispose()
})
test('all three motion paths use visual decoration only; normal navbar and data unchanged',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const track=read('src/features/navigation/nativePageTrack.ts'),outer=read('src/features/navigation/externalPageMotion.ts'),cue=read('src/features/navigation/universalMotion.ts'),css=read('src/styles-continuous-motion.css');assert.match(track,/seam\?\.dispose\(\)/);assert.match(track,/if\(!seamAttempted&&Math\.abs\(next\)>0\)/);assert.match(outer,/if\(p\.plan\.offset!==0\)/);assert.match(outer,/p\.seam\?\.dispose\(\)/);assert.match(cue,/seam\?\.dispose\(\)/);assert.match(css,/\.lf-premium-page-seam\{[\s\S]*?pointer-events:none/);assert.match(css,/prefers-reduced-motion:reduce\)\{\.lf-premium-page-seam\{display:none!important/)
})
