import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url)
const ts=require('typescript')
const {parse,compileScript,compileTemplate,compileStyle}=require('@vue/compiler-sfc')
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
const queue=read('src/features/progress/checkPhotoQueue.ts')
const progress=read('src/components/ProgressWorkspace.vue')
const api=read('src/integrations/firestore/progress.ts')
const layout=read('src/App.vue')
const local=read('src/integrations/firebase/stagingSession.ts')
const compression=read('src/features/progress/checkPhotoCompression.ts')
const notice=read('src/components/CheckUploadNotice.vue')
function loadPureTypescript(code,mocks){
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const exports={};const module={exports}
 const context={exports,module,require:(id)=>mocks[id]??{},Date,Intl,RegExp,Set,Math,Number,Error,Promise}
 vm.runInNewContext(js,context)
 return module.exports
}
test('Queue scopes and complete-check calculations are strict and isolated',()=>{
 const m=loadPureTypescript(queue,{'vue':{shallowRef:v=>({value:v})}})
 const a={projectId:'app-palestra-b0b9d',gymId:'gym_test_1',uid:'athlete_a'}
 assert.equal(m.samePhotoScope(a,{...a}),true)
 assert.equal(m.samePhotoScope(a,{...a,uid:'athlete_b'}),false)
 assert.equal(m.samePhotoScope(a,{...a,gymId:'gym_test_2'}),false)
 assert.equal(m.samePhotoScope(a,{...a,projectId:'other'}),false)
 assert.equal(m.queueKey(a,'check_abc'),'app-palestra-b0b9d:gym_test_1:athlete_a:check_abc')
 assert.equal(m.isCompleteCheck([{side:'front'},{side:'back'}],[{side:'front'},{side:'back'}]),true)
 assert.equal(m.isCompleteCheck([{side:'front'},{side:'front'}],[{side:'front'},{side:'back'}]),false)
 assert.equal(m.isCompleteCheck([{side:'front'}],[{side:'front'},{side:'back'}]),false)
})
test('Four original Files are stored atomically, separately from update metadata',()=>{
 assert.match(queue,/db\.transaction\(\[STORE,FILES\],'readwrite'\)/)
 assert.match(queue,/tx\.objectStore\(STORE\)\.add\(job\)/)
 assert.match(queue,/store\.add\(\{key:`\$\{job\.key\}:\$\{row\.side\}`,blob:row\.file\}\)/)
 assert.match(queue,/tx\.oncomplete=\(\)=>\{announce\('updated',job\.key\);resolve\(\)\}/)
 assert.match(queue,/async function writeJob\([\s\S]+?db\.transaction\(STORE,'readwrite'\)/)
 assert.match(queue,/await acquireJob\(job,input\.files\)/)
 assert.match(queue,/await deleteJob\(job\.key\)/)
})
test('Server-verified success, idempotency and explicit discard safety',()=>{
 assert.match(queue,/await getDocFromServer\(target\)/)
 assert.match(queue,/if\(!verified\.exists\(\)\|\|!matchesRemoteCheck\(job,verified\.data\(\)\)\)/)
 assert.ok(queue.indexOf('await commitOnce(job)')<queue.indexOf('await deleteJob(job.key)'))
 assert.ok(queue.indexOf('await deleteJob(job.key)')<queue.indexOf('lastCheckUploaded.value={key:job.key'))
 assert.match(queue,/const live=await getDocFromServer\(target\)/)
 assert.match(queue,/if\(live\.exists\(\)\)/)
 assert.match(queue,/for\(const photo of job\.uploaded\)await removeStagedPhotoStrict/)
})
test('Reopen and recovery are scoped, resumable and never silently delete failed originals',()=>{
 for(const s of ["'online',requestCheckQueuePump",'visibilitychange',"onAuthStateChanged(auth",'navigator.locks','await readPhotoFile(job,item)','await compressCheckPhoto(original)',"j.state!=='error'",'await persistProgress(next)','requestCheckQueuePump()'])assert.ok(queue.includes(s),s)
 assert.match(queue,/if\(!navigator\.onLine\)return/)
 assert.match(queue,/if\(!userMatches\(job\)\|\|abort\.signal\.aborted\)/)
 assert.match(api,/uploadBytesResumable\(/)
 assert.match(api,/signal\?\.addEventListener\('abort',cancel/)
})
test('Supported common images include uppercase extensions and JFIF; no RAW promise',()=>{
 const m=loadPureTypescript(compression,{})
 const f=(name,type,size)=>({name,type,size})
 assert.equal(m.supportedCheckPhoto(f('foto.HEIC','',1000)),true)
 assert.equal(m.supportedCheckPhoto(f('foto.JFIF','',1000)),true)
 assert.equal(m.supportedCheckPhoto(f('foto.TiFf','image/tiff',1000)),true)
 assert.equal(m.supportedCheckPhoto(f('foto.JPG','image/jpeg',1000)),true)
 assert.equal(m.supportedCheckPhoto(f('foto.CR3','',1000)),false)
 assert.equal(m.supportedCheckPhoto(f('foto.JPG','image/jpeg',42*1024*1024)),false)
 assert.match(compression,/const TARGET_BYTES = 940_000/)
 assert.match(compression,/canvas\.toBlob/)
})
test('Global banner stays in App and logout warns about unuploaded personal photos',()=>{
 assert.match(layout,/<CheckUploadNotice v-if="shownRole==='atleta'&&stagingSession\?\.role==='atleta'"/)
 assert.match(notice,/Check Zone: caricamento in corso/)
 assert.match(notice,/Foto archiviate correttamente/)
 assert.match(notice,/Riprova invio/)
 assert.match(notice,/Scarta check/)
 assert.match(local,/await pendingChecksFor\(/)
 assert.match(progress,/await enqueueCheckPhotos\(/)
 assert.doesNotMatch(progress,/uploaded\.push\(await uploadCheckPhoto/)
})
test('All edited Vue SFC scripts, templates and CSS compile',()=>{
 for(const name of ['src/components/ProgressWorkspace.vue','src/components/CheckUploadNotice.vue','src/App.vue']){
  const parsed=parse(read(name),{filename:name});assert.deepEqual(parsed.errors,[],name)
  const descriptor=parsed.descriptor,script=compileScript(descriptor,{id:'r21e'})
  const result=compileTemplate({id:'r21e',filename:name,source:descriptor.template.content,compilerOptions:{bindingMetadata:script.bindings}})
  assert.deepEqual(result.errors,[],name)
  for(const style of descriptor.styles){const compiled=compileStyle({filename:name,id:'data-v-r21e',source:style.content,scoped:style.scoped});assert.deepEqual(compiled.errors,[],name)}
 }
})
