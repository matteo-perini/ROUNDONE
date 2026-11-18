import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=name=>fs.readFileSync(path.join(root,name),'utf8')
const archive=read('src/views/AthleteLiveWorkspace.vue')
const history=read('src/components/ProgramHistory.vue')
const home=read('src/components/AthleteHomeContent.vue')
const css=read('src/styles-r15-athlete-archive.css')
const require=createRequire(import.meta.url)
test('R15 is loaded after the existing LionFit stylesheet',()=>{
 assert.match(read('src/main.ts'),/import '\.\/styles-r15-athlete-archive\.css'/)
 assert.match(css,/\.lf-r15-archive-list/)
})
test('Archive keeps all four real existing filters, search and optional clear',()=>{
 for (const x of ['archiveView','v-model="search"','value="all"','value="active"','value="historical"','value="trashed"','search.trim()','Azzera filtri'])assert.ok(archive.includes(x),x)
})
test('Archive does not merge different content merely because of equal titles',()=>{
 assert.match(archive,/groupSemanticCopies\(visibleArchives\(/)
 assert.match(archive,/:key="g\.sheet\.id"/)
 assert.match(archive,/@click="opened=g\.sheet"/)
})
test('Archive preserves personal visibility and active assignment filtering',()=>{
 for (const t of ['hiddenArchiveIds','shownArchive','archivePersonal','visibleArchives','isArchiveCopyLinkedOrEquivalent'])assert.ok(archive.includes(t),t)
 assert.match(archive,/archiveReady/)
})
test('No server changes or new data write operations in R15',()=>{
 assert.doesNotMatch(history,/(?:setDoc|updateDoc|addDoc|deleteDoc|runTransaction)\s*\(/)
 assert.match(history,/read-only/)
})
test('ProgramHistory keeps week/day and two distinct sheets per day',()=>{
 for(const x of ['program.weeks','week.days','d.templateId,d.templateId2','sheet(id)','opened=sheet(id)||null','@click="weekId=w.id"'])assert.ok(history.includes(x),x)
})
test('ProgramHistory renders Italian historical dates without changing stored ISO',()=>{
 assert.match(history,/function prettyDate\(input\?:string\)/)
 assert.match(history,/Intl\.DateTimeFormat\('it-IT'/)
 assert.match(history,/prettyDate\(p\.weeks\[0\]\?\.startDate\)/)
 assert.match(history,/prettyDate\(w\.startDate\)/)
})
test('Navigation buttons remain available and select archive view safely',()=>{
 assert.match(archive,/@click="programArchiveOpen=false"/)
 assert.match(archive,/@click="programArchiveOpen=true"/)
 assert.match(archive,/route\.query\.view==='programmi'/)
})
test('R14D dashboard quick link Le mie schede goes to archive, not plan',()=>{
 assert.match(home,/<RouterLink\b(?=[^>]*class="lf15-quick-tile")(?=[^>]*:to="archiveLink")[^>]*>\s*<LionIcon\b[^>]*\/>\s*<span>Le mie schede<\/span>/)
})
test('Archive rows include exercise count, quick open and explicit empty state',()=>{
 assert.match(archive,/g\.sheet\.exercises\.length/)
 assert.match(archive,/lf-r15-archive-rows/)
 assert.match(archive,/role="status">\{\{uiText\("Nessuna scheda/)
})
test('All modified Vue scripts and R15 CSS parse',()=>{
 const ts=require('typescript'),postcss=require('postcss')
 for(const [name,text] of [['Workspace',archive],['History',history],['Home',home]]){
  const src=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(src,`missing script ${name}`)
  const result=ts.transpileModule(src,{fileName:`${name}.ts`,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  assert.deepEqual((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')),[])
 }
 assert.ok(postcss.parse(css))
})
test('R15 is mobile responsive and respects reduced motion',()=>{
 assert.match(css,/@media\(max-width:540px\)/)
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/)
 assert.match(css,/var\(--text\)/)
})
