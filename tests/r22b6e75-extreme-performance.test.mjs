import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createNativePageTrack,nativePagePaths} from '../src/features/navigation/nativePageTrack.ts'
import {summarizeFrameCadence} from '../src/features/performance/frameCadence.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
function fixture(){
 const style=()=>({removeProperty(k){delete this[k]}})
 const panes=Object.fromEntries(nativePagePaths.map(p=>[p,{style:style(),dataset:{},isConnected:true}]))
 let queries=0,reads=0;const animations=[]
 const rail={isConnected:true,get clientWidth(){reads++;return 390},style:style(),dataset:{},querySelector(s){queries++;return panes[s.match(/"([^"]+)"/)[1]]},animate(){const a={onfinish:null,oncancel:null,cancel(){this.cancelled=true;this.oncancel?.()}};animations.push(a);return a}}
 return {track:createNativePageTrack(rail,'/home'),rail,panes,animations,counts:()=>({queries,reads})}
}
test('watchdog restores native rail if compositor never emits finish',async()=>{const f=fixture();f.track.paint('/home','/piano',-120);f.track.navigate('/home','/piano',20);assert.ok(f.track.moving());await new Promise(r=>setTimeout(r,180));assert.equal(f.track.moving(),false);assert.equal(f.rail.dataset.lfTrackMoving,undefined);assert.equal(f.panes['/piano'].dataset.lfTrackShown,undefined);assert.ok(f.animations[0].cancelled);f.track.dispose()})
test('old watchdog cannot cancel a newer animation or resurrect removed panes',async()=>{const f=fixture();f.track.navigate('/home','/piano',20);f.track.navigate('/piano','/archivio',300);await new Promise(r=>setTimeout(r,180));assert.equal(f.track.moving(),true);assert.ok(f.animations[0].cancelled);assert.equal(f.animations[1].cancelled,undefined);f.track.dispose();assert.equal(f.animations[1].cancelled,true)})
test('pair preparation reads span once and queries only two panes; zero geometry and detached panes recover',()=>{const f=fixture();f.track.paint('/home','/piano',-100);assert.deepEqual(f.counts(),{queries:2,reads:1});for(let i=0;i<200;i++)f.track.paint('/home','/piano',-i);assert.deepEqual(f.counts(),{queries:2,reads:1});const old=f.panes['/piano'];old.isConnected=false;delete f.panes['/piano'];assert.equal(f.track.paint('/home','/piano',-100),null);assert.equal(old.dataset.lfTrackShown,undefined);assert.equal(f.rail.dataset.lfTrackMoving,undefined);f.track.dispose()})
test('cadence summary measures intervals, not hardware FPS, and ignores invalid samples',()=>{assert.deepEqual(summarizeFrameCadence([0,16,32,48,88,148]),{intervals:5,p50Ms:16,p95Ms:60,maxMs:60,over25Ms:2,over50Ms:1});assert.equal(summarizeFrameCadence([0,NaN,-1]).intervals,0);assert.equal(summarizeFrameCadence(Array.from({length:1000},(_,i)=>i*16)).intervals,119)})
test('snapback has explicit timer and cancellation, cue handles WAAPI failure, diagnostics bounded and DEV-only',()=>{const app=read('src/App.vue'),cue=read('src/features/navigation/universalMotion.ts'),audit=read('src/features/performance/motionAudit.ts');assert.match(app,/snapTimer=setTimeout\(clean,duration\+120\)/);assert.match(app,/catch\{clearSnapBack\(\)\}/);assert.match(app,/snapAnimation.onfinish=null;snapAnimation.oncancel=null/);assert.match(cue,/catch\{dispose\(\)\}/);assert.match(audit,/!import.meta.env.DEV/);assert.match(audit,/generation!==cadenceGeneration/);assert.match(audit,/stamps.length<120/);assert.match(audit,/matched.at\(-1\)\?\.path/);assert.doesNotMatch(audit,/fetch\(|sendBeacon\(/)})
