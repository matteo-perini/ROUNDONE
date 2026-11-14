import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
const modules={
 '@capacitor/core':'export const Capacitor={isNativePlatform:()=>globalThis.__lfMock.native,getPlatform:()=>globalThis.__lfMock.platform}',
 '@capacitor/app':'export const App={getInfo:async()=>({version:globalThis.__lfMock.installed}),addListener:async(name,cb)=>{globalThis.__lfMock.nativeListener=cb;return {remove:async()=>{}}}}',
 '@capacitor/app-launcher':'export const AppLauncher={openUrl:async({url})=>{globalThis.__lfMock.opened.push(url);return {completed:true}}}',
}
const hooks=registerHooks({resolve(specifier,context,next){
 if(modules[specifier])return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}
 if(specifier==='./nativeUpdatePolicy')return next('./nativeUpdatePolicy.ts',context)
 return next(specifier,context)
}})
let seq=0
const tag='v0.31.3',url=`https://github.com/matteo-perini/ROUNDONE/releases/download/${tag}/LionFit.apk`
const release={tag_name:tag,draft:false,prerelease:false,assets:[{name:'LionFit.apk',state:'uploaded',browser_download_url:url}]}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve))}
async function setup({native=true,platform='android',installed='0.31.2',status=200,paused=false}={}){
 const saved={fetch:globalThis.fetch,document:globalThis.document,localStorage:globalThis.localStorage,now:Date.now}
 const s={native,platform,installed,status,opened:[],requests:0,now:100000000,events:{},nativeListener:null,waiting:[],paused,storage:new Map(),nodes:new Map()}
 function element(name){return {name,id:'',dataset:{},children:[],events:{},textContent:'',disabled:false,append(...xs){this.children.push(...xs)},appendChild(x){this.children.push(x);if(x.id)s.nodes.set(x.id,x)},setAttribute(){},addEventListener(n,cb){this.events[n]=cb},remove(){s.nodes.delete(this.id)}}}
 globalThis.__lfMock=s
 globalThis.document={hidden:false,head:element('head'),body:element('body'),getElementById:id=>s.nodes.get(id)||null,createElement:element,addEventListener:(n,fn)=>s.events[n]=fn}
 globalThis.localStorage={getItem:k=>s.storage.get(k)??null,setItem:(k,v)=>s.storage.set(k,v)}
 Date.now=()=>s.now
 globalThis.fetch=async()=>{s.requests++;if(s.paused)await new Promise(r=>s.waiting.push(r));return {ok:s.status===200,status:s.status,headers:{get:()=>null},json:async()=>[release]}}
 const api=await import(`../src/features/release/nativeUpdates.ts?test=${++seq}`)
 s.api=api;s.panel=()=>s.nodes.get('lf-modern-update');s.resume=()=>s.nativeListener?.({isActive:true});s.release=()=>{s.paused=false;s.waiting.splice(0).forEach(fn=>fn())};s.restore=()=>{s.release();globalThis.fetch=saved.fetch;globalThis.document=saved.document;globalThis.localStorage=saved.localStorage;Date.now=saved.now;delete globalThis.__lfMock};return s
}
test('cold start ignores old persistent eight-hour check; resume and visibility share throttle',async()=>{const s=await setup();try{s.storage.set('lf_modern_android_update_checked_v7',String(s.now-1));s.api.installNativeUpdateChecker();await flush();assert.equal(s.requests,1);assert.equal(s.panel()?.dataset.tag,tag);s.resume();s.events.visibilitychange();await flush();assert.equal(s.requests,1);s.now+=1800000;s.resume();s.events.visibilitychange();await flush();assert.equal(s.requests,2);assert.equal(s.nodes.size,2)}finally{s.restore()}})
test('later hides panel and persists per-release snooze; manual remains available',async()=>{const s=await setup();try{s.api.installNativeUpdateChecker();await flush();s.panel().children.find(b=>b.textContent==='Più tardi').events.click();assert.equal(s.panel(),undefined);s.now+=1800000;s.resume();await flush();assert.equal(s.panel(),undefined);assert.equal((await s.api.checkNativeUpdateNow()).kind,'available');assert.equal(s.panel(),undefined);s.now+=14400000;s.resume();await flush();assert.equal(s.panel()?.dataset.tag,tag)}finally{s.restore()}})
test('concurrent auto and manual checks share request without duplicate popup',async()=>{const s=await setup({paused:true});try{s.api.installNativeUpdateChecker();await flush();const result=s.api.checkNativeUpdateNow();s.resume();s.events.visibilitychange();await flush();assert.equal(s.requests,1);s.release();assert.equal((await result).kind,'available');await flush();assert.equal(s.panel(),undefined)}finally{s.restore()}})
test('GitHub rate limit prevents immediate retries including manual',async()=>{const s=await setup({status:429});try{s.api.installNativeUpdateChecker();await flush();assert.equal(s.requests,1);assert.equal((await s.api.checkNativeUpdateNow()).kind,'error');assert.equal(s.requests,1);s.now+=1800000;s.status=200;s.resume();await flush();assert.equal(s.requests,2);assert.equal(s.panel()?.dataset.tag,tag)}finally{s.restore()}})
test('web is excluded and direct download rejects external URLs',async()=>{const s=await setup({native:false,platform:'web'});try{s.api.installNativeUpdateChecker();assert.equal((await s.api.checkNativeUpdateNow()).kind,'unsupported');assert.equal(s.requests,0);s.native=true;s.platform='android';await assert.rejects(s.api.openAndroidApkDownload('https://evil.example/LionFit.apk'));assert.equal(s.opened.length,0);await s.api.openAndroidApkDownload(url);assert.deepEqual(s.opened,[url])}finally{s.restore()}})
test.after(()=>hooks.deregister())
